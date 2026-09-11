// Offline composition of execution-header integrity and paid-history recovery.
// The explicit profile and selected endpoint remain caller-supplied assumptions.
// Historical readers are unchanged; no transport, consensus or body proof is added.
import { Buffer } from 'node:buffer';
import { isDeepStrictEqual as equal } from 'node:util';
import { createPaidReorgReader } from './paid-reorg-reader.mjs';
import { inspectExecutionHeaderChain } from './ethereum-execution-header.mjs';

// Bounded capture is adapted from the existing observer/recovery reader.
// Reusing capture, manifest validation and reconstruction is not an independent
// implementation of those checks. Hostile Proxy traps or replaced native
// built-ins are outside this same-process plain-data boundary.
const LIMIT = Object.freeze({ bytes: 8 * 1024 * 1024, nodes: 100000, depth: 20,
  array: 2048, blocks: 128, branches: 8, pending: 4 });
const PROFILES = Object.freeze(['london-16', 'shanghai-17', 'cancun-20', 'prague-21']);
const ENVELOPE = ['schema', 'chain_id', 'addresses', 'registry_runtime', 'probe_runtime',
  'start_block', 'end_block', 'blocks', 'final'];
function fail(code) { const e = new Error('Paid header recovery rejected: ' + code + '.'); e.code = 'PAID_HEADER_' + code; throw e; }
function need(condition, code) { if (!condition) fail(code); }
function fields(value, required, optional = []) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value), 'SCHEMA');
  const keys = Object.keys(value), allowed = new Set([...required, ...optional]);
  need(keys.every(key => allowed.has(key)) && required.every(key => Object.hasOwn(value, key)), 'SCHEMA');
}
function profile(value) {
  need(typeof value === 'string' && PROFILES.includes(value), 'PROFILE'); return value;
}
function capture(input) {
  const budget = { bytes: 0, nodes: 0 }, active = new WeakSet();
  function copy(value, depth) {
    budget.bytes += 8;
    need(++budget.nodes <= LIMIT.nodes && depth <= LIMIT.depth && budget.bytes <= LIMIT.bytes, 'LIMIT');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') { need(Number.isSafeInteger(value) && !Object.is(value, -0), 'INTEGER'); return value; }
    if (typeof value === 'string') {
      need(value.length <= 262144 && value.isWellFormed(), 'STRING');
      budget.bytes += Buffer.byteLength(value, 'utf8'); need(budget.bytes <= LIMIT.bytes, 'LIMIT'); return value;
    }
    need(value !== null && typeof value === 'object', 'SCHEMA');
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    need(array ? prototype === Array.prototype : prototype === Object.prototype || prototype === null, 'PROTOTYPE');
    need(!active.has(value), 'CYCLE'); active.add(value);
    const keys = Reflect.ownKeys(value);
    let result;
    if (array) {
      const length = Object.getOwnPropertyDescriptor(value, 'length');
      need(length && Object.hasOwn(length, 'value') && Number.isSafeInteger(length.value)
        && length.value >= 0 && length.value <= LIMIT.array, 'LIMIT');
      need(keys.length === length.value + 1, 'SCHEMA'); result = [];
      for (let index = 0; index < length.value; index++) {
        const entry = Object.getOwnPropertyDescriptor(value, String(index));
        need(entry && entry.enumerable && Object.hasOwn(entry, 'value'), 'DESCRIPTOR');
        result.push(copy(entry.value, depth + 1));
      }
    } else {
      need(keys.length <= 64 && keys.every(key => typeof key === 'string' && key.length <= 96), 'SCHEMA');
      result = Object.create(null);
      for (const key of keys) {
        budget.bytes += Buffer.byteLength(key, 'utf8'); need(budget.bytes <= LIMIT.bytes, 'LIMIT');
        const entry = Object.getOwnPropertyDescriptor(value, key);
        need(entry && entry.enumerable && Object.hasOwn(entry, 'value'), 'DESCRIPTOR');
        result[key] = copy(entry.value, depth + 1);
      }
    }
    active.delete(value); return result;
  }
  return copy(input, 0);
}
function freeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
// Call only on a manifest already validated and captured by the base reader.
function key(m) {
  return ['caw-paid', m.chain_id, m.addresses.registry, m.addresses.probe, m.addresses.token,
    m.registry_runtime_sha256, m.probe_runtime_sha256, m.start_block_hash, m.end_block_hash].join(':');
}
function retained(name, recovery) {
  return { schema: 'caw-paid-header-recovery-retained/1', profile: name, recovery };
}
function make(name) {
  const base = createPaidReorgReader(), pending = new Map();
  let active = null, current = null;
  function snapshot(integrity) {
    return freeze({ schema: 'caw-paid-header-recovery-state/1', profile: name,
      status: integrity === null ? 'unresolved' : 'ready', recovery: base.state(), header_integrity: integrity });
  }
  current = snapshot(null);
  function select(input) {
    // Forward even malformed arity to the base operation: it also clears its
    // ready result before checking arguments, generation or manifest contents.
    // This keeps both published layers unresolved when selection is rejected.
    current = null; active = null; pending.clear();
    try {
      active = Reflect.apply(base.select, undefined, arguments);
      return active;
    } finally {
      current = snapshot(null);
    }
  }
  function prepare(selectionToken, input) {
    need(arguments.length === 2 && active !== null && selectionToken === active, 'STALE_SELECTION');
    need(pending.size < LIMIT.pending, 'PENDING_LIMIT');
    const history = capture(input), baseState = base.state(), selected = baseState.selected;
    fields(history, ENVELOPE);
    need(Array.isArray(history.blocks) && history.blocks.length >= 1 && history.blocks.length <= LIMIT.blocks, 'RANGE');
    for (const block of history.blocks) fields(block, ['header', 'transactions']);
    const integrity = inspectExecutionHeaderChain([history.start_block, ...history.blocks.map(block => block.header)], {
      schema: 'caw-execution-header-chain-selection/1', profile: name,
      startHash: selected.start_block_hash, endHash: selected.end_block_hash
    });
    // Check the complete prospective saved wrapper before base.prepare can
    // admit a token. Individual-history limits alone do not ensure reloadability.
    const branches = base.exportRetained().branches.filter(entry => key(entry.manifest) !== key(selected));
    branches.push({ manifest: selected, history });
    need(branches.length <= LIMIT.branches, 'RETENTION_LIMIT');
    capture(retained(name, { schema: 'caw-paid-reorg-retained/1', branches }));
    const token = freeze({ schema: 'caw-paid-header-prepared/1', generation: baseState.generation });
    // Both checks consume exactly this captured history. The base independently
    // requires full endpoint-field equality, accounting and retained consistency.
    const basePrepared = base.prepare(selectionToken, history);
    pending.set(token, { basePrepared, selection: active, generation: baseState.generation, integrity });
    return token;
  }
  function commit(token) {
    const prepared = pending.get(token);
    need(arguments.length === 1 && prepared && active !== null && prepared.selection === active
      && prepared.generation === base.state().generation, 'STALE_PREPARED');
    base.commit(prepared.basePrepared);
    // Only internal validated/frozen objects are read after the base commit.
    // No caller property access, parsing or new admission check follows it.
    active = null; pending.clear(); current = snapshot(prepared.integrity); return current;
  }
  function state() { need(arguments.length === 0, 'SCHEMA'); return current ?? snapshot(null); }
  function exportRetained() {
    need(arguments.length === 0, 'SCHEMA'); return freeze(retained(name, base.exportRetained()));
  }
  return Object.freeze({ select, prepare, commit, state, exportRetained });
}

/** Use one explicit immutable execution-header profile for the whole instance.
 * The existing base reader retains its 1,024-selection and accounting limits.
 * A matching header hash does not authenticate the selected endpoint or bodies. */
export function createPaidHeaderRecovery(profileString) {
  need(arguments.length === 1, 'SCHEMA'); return make(profile(profileString));
}

/** Rebuild every retained raw branch, then adopt the separately selected one.
 * Saved computed status is never trusted. Empty saves cannot reconstruct an
 * absent selected interval; profile changes require a separate explicit review. */
export function restartPaidHeaderRecovery(retainedInput, selectedManifestInput, profileString) {
  need(arguments.length === 3, 'SCHEMA'); const name = profile(profileString);
  const saved = capture(retainedInput), selectedValidator = createPaidReorgReader();
  selectedValidator.select(selectedManifestInput); const selected = selectedValidator.state().selected;
  fields(saved, ['schema', 'profile', 'recovery'], ['calculated_cache']);
  need(saved.schema === 'caw-paid-header-recovery-retained/1', 'SCHEMA');
  need(saved.profile === name, 'PROFILE_MISMATCH');
  fields(saved.recovery, ['schema', 'branches'], ['calculated_cache']);
  need(saved.recovery.schema === 'caw-paid-reorg-retained/1' && Array.isArray(saved.recovery.branches)
    && saved.recovery.branches.length >= 1 && saved.recovery.branches.length <= LIMIT.branches, 'RETENTION_LIMIT');
  const reader = make(name), seen = new Set(); let chosen = null;
  for (const entry of saved.recovery.branches) {
    fields(entry, ['manifest', 'history']);
    const token = reader.select(entry.manifest), m = reader.state().recovery.selected, branchKey = key(m);
    need(!seen.has(branchKey), 'BRANCH_CONFLICT'); seen.add(branchKey);
    reader.commit(reader.prepare(token, entry.history));
    if (equal(m, selected)) chosen = entry;
  }
  need(chosen !== null, 'SELECTED_HISTORY_MISSING');
  const token = reader.select(selected); reader.commit(reader.prepare(token, chosen.history));
  return reader;
}
