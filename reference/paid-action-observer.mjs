// Offline observation of one exact signed-call candidate in selected history.
// This does not submit, authenticate signatures/consensus, choose finality, or
// decide whether resubmission is safe. Historical contracts/readers are unchanged.
import { Buffer } from 'node:buffer';
import { isDeepStrictEqual as equal } from 'node:util';
import { createPaidReorgReader } from './paid-reorg-reader.mjs';

// The bounded plain-data capture/manifest checks below are adapted from the
// existing recovery reader. Shared validation is not an independent verifier.
const LIMIT = Object.freeze({ bytes: 8 * 1024 * 1024, nodes: 100000, depth: 20,
  array: 2048, blocks: 512, branches: 8, pending: 4, selections: 1024,
  calldataBytes: 8192, observations: 256 });
const MANIFEST = ['chain_id', 'addresses', 'registry_runtime_sha256', 'probe_runtime_sha256', 'start_block_hash', 'end_block_hash'];
const ENVELOPE = ['schema', 'chain_id', 'addresses', 'registry_runtime', 'probe_runtime', 'start_block', 'end_block', 'final'];
const TOKEN = '0xf3b9569f82b18aef890de263b84189bd33ebe452';
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/;
function fail(code) { const error = new Error('Paid action observation rejected: ' + code + '.'); error.code = 'PAID_OBSERVER_' + code; throw error; }
function need(condition, code) { if (!condition) fail(code); }
function fields(value, required, optional = []) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value), 'SCHEMA');
  const keys = Object.keys(value), allowed = new Set([...required, ...optional]);
  need(keys.every(key => allowed.has(key)) && required.every(key => Object.hasOwn(value, key)), 'SCHEMA');
}

// Capture own data descriptors without invoking getters, toJSON or iterators.
// Hostile Proxy traps and replacement native built-ins are outside this same-
// process plain-data boundary. Cycles, exotic prototypes and sparse arrays fail.
function capture(input, budget = { bytes: 0, nodes: 0 }) {
  const active = new WeakSet();
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
      need(length && Object.hasOwn(length, 'value') && Number.isSafeInteger(length.value) && length.value >= 0 && length.value <= LIMIT.array, 'LIMIT');
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
function manifest(value) {
  fields(value, MANIFEST); need(value.chain_id === 31337, 'CONTEXT');
  fields(value.addresses, ['registry', 'probe', 'token']);
  const addresses = Object.values(value.addresses);
  need(addresses.every(item => typeof item === 'string' && ADDRESS.test(item) && item !== '0x' + '00'.repeat(20))
    && new Set(addresses).size === 3 && value.addresses.token === TOKEN, 'CONTEXT');
  for (const key of ['registry_runtime_sha256', 'probe_runtime_sha256']) need(typeof value[key] === 'string' && /^[0-9a-f]{64}$/.test(value[key]), 'MANIFEST');
  for (const key of ['start_block_hash', 'end_block_hash']) need(typeof value[key] === 'string' && HASH.test(value[key]), 'MANIFEST');
  return freeze(value);
}
function identity(m) {
  return ['caw-paid', m.chain_id, m.addresses.registry, m.addresses.probe, m.addresses.token,
    m.registry_runtime_sha256, m.probe_runtime_sha256, m.start_block_hash].join(':');
}

const CONTEXT = MANIFEST.filter(key => key !== 'end_block_hash');
const TARGET_SCHEMA = 'caw-paid-action-target/1';
const POST_SELECTOR = '0x62f509b3';
function contextOf(m) {
  const value = Object.create(null);
  for (const key of CONTEXT) value[key] = m[key];
  return value;
}
function target(input) {
  const value = capture(input);
  fields(value, ['schema', 'context', 'calldata']);
  need(value.schema === TARGET_SCHEMA, 'TARGET'); fields(value.context, CONTEXT);
  // Reuse the manifest shape checks. This temporary equal-start/end descriptor
  // validates context fields only; it is never published as acquired coverage.
  manifest(Object.assign(Object.create(null), value.context, { end_block_hash: value.context.start_block_hash }));
  need(typeof value.calldata === 'string' && /^0x(?:[0-9a-f]{2})+$/.test(value.calldata)
    && value.calldata.startsWith(POST_SELECTOR) && (value.calldata.length - 2) / 2 <= LIMIT.calldataBytes, 'CALLDATA');
  return freeze(value);
}
function projection(history, selected, watched) {
  fields(history, [...ENVELOPE, 'blocks']);
  need(Array.isArray(history.blocks) && history.blocks.length > 0 && history.blocks.length <= LIMIT.blocks, 'RANGE');
  const observations = [];
  for (const block of history.blocks) {
    fields(block, ['header', 'transactions']);
    need(block.header !== null && typeof block.header === 'object' && typeof block.header.hash === 'string'
      && HASH.test(block.header.hash) && typeof block.header.number === 'string'
      && QUANTITY.test(block.header.number) && Array.isArray(block.transactions), 'BLOCK');
    for (const entry of block.transactions) {
      fields(entry, ['transaction', 'receipt']);
      need(entry.transaction !== null && typeof entry.transaction === 'object'
        && entry.receipt !== null && typeof entry.receipt === 'object', 'TRANSACTION');
      if (entry.transaction.to !== watched.context.addresses.probe || entry.transaction.data !== watched.calldata) continue;
      const receipt = entry.receipt;
      need(observations.length < LIMIT.observations, 'OBSERVATION_LIMIT');
      need(typeof receipt.transactionHash === 'string' && HASH.test(receipt.transactionHash)
        && typeof receipt.transactionIndex === 'string' && QUANTITY.test(receipt.transactionIndex)
        && ['0x0', '0x1'].includes(receipt.status) && Array.isArray(receipt.logs), 'RECEIPT');
      need(receipt.logs.every(log => log && typeof log === 'object' && typeof log.logIndex === 'string'
        && QUANTITY.test(log.logIndex)), 'LOG');
      observations.push({ block_hash: block.header.hash, block_number: block.header.number,
        transaction_hash: receipt.transactionHash, transaction_index: receipt.transactionIndex,
        receipt_status: receipt.status, outcome: receipt.status === '0x1' ? 'accepted' : 'rejected',
        log_indices: receipt.logs.map(log => log.logIndex) });
    }
  }
  for (const h of [history.start_block, history.end_block]) need(h && typeof h === 'object'
    && typeof h.hash === 'string' && HASH.test(h.hash) && typeof h.number === 'string'
    && QUANTITY.test(h.number), 'COVERAGE');
  return freeze({ manifest: selected,
    coverage: { start_exclusive: { number: history.start_block.number, hash: history.start_block.hash },
      end_inclusive: { number: history.end_block.number, hash: history.end_block.hash } }, observations });
}
function key(m) { return identity(m) + '/tip/' + m.end_block_hash; }
function classify(observations) {
  if (observations.some(item => item.outcome === 'accepted')) return 'observed-accepted';
  return observations.length ? 'rejected-only-in-selected-interval' : 'not-observed-in-covered-interval';
}
function make(watched) {
  const recovery = createPaidReorgReader();
  let generation = 0, selected = null, active = null, current = null, records = new Map();
  const pending = new Map();
  function snapshot(chosen, retained) {
    return freeze({ schema: 'caw-paid-action-observation/1', generation, target: watched,
      status: chosen ? classify(chosen.observations) : 'unresolved', finality: 'not-established',
      retry_safety: 'not-assessed', selected: chosen,
      retained_intervals: [...retained.values()].filter(item => item !== chosen) });
  }
  function select(input) {
    // Clear the public classification before inspecting even malformed input.
    // A prior returned snapshot remains historical and is not a live handle.
    current = null; selected = null; active = null; pending.clear();
    need(arguments.length === 1 && generation < LIMIT.selections, 'SELECTION_LIMIT');
    const admission = ++generation;
    const token = recovery.select(input), m = recovery.state().selected;
    need(equal(contextOf(m), watched.context), 'CONTEXT_MISMATCH');
    need(generation === admission && active === null && current === null, 'STALE_SELECTION');
    selected = m; active = token; return token;
  }
  function prepare(selectionToken, input) {
    need(arguments.length === 2 && active !== null && selectionToken === active, 'STALE_SELECTION');
    need(pending.size < LIMIT.pending, 'PENDING_LIMIT');
    const admission = generation, selection = active, m = selected;
    const history = capture(input), projected = projection(history, m, watched);
    // Budget and allocate all derived output before obtaining a base token.
    // Full history validation below must succeed before this output is exposed.
    const nextRecords = new Map(records); nextRecords.set(key(m), projected);
    need(nextRecords.size <= LIMIT.branches && [...nextRecords.values()]
      .reduce((count, item) => count + item.observations.length, 0) <= LIMIT.observations, 'OBSERVATION_LIMIT');
    // Admit only a complete raw export that this observer can capture again
    // on restart. Per-history limits alone do not bound the aggregate wrapper.
    const retainedBranches = recovery.exportRetained().branches.filter(entry => key(entry.manifest) !== key(m));
    retainedBranches.push({ manifest: m, history });
    capture({ schema: 'caw-paid-action-observer-retained/1', target: watched,
      recovery: { schema: 'caw-paid-reorg-retained/1', branches: retainedBranches } });
    const nextState = snapshot(projected, nextRecords);
    const basePrepared = recovery.prepare(selectionToken, history);
    need(generation === admission && active === selection, 'STALE_SELECTION');
    const prepared = freeze({ schema: 'caw-paid-action-observer-prepared/1', generation });
    pending.set(prepared, { basePrepared, generation: admission, selection, nextRecords, nextState });
    return prepared;
  }
  function commit(preparedToken) {
    const prepared = pending.get(preparedToken);
    need(arguments.length === 1 && prepared && active !== null && prepared.selection === active
      && prepared.generation === generation, 'STALE_PREPARED');
    // The recovery reader checks/commits first. All derived output is already
    // bounded and frozen: no caller code or fallible parsing follows its commit.
    recovery.commit(prepared.basePrepared);
    records = prepared.nextRecords; current = prepared.nextState;
    active = null; pending.clear(); return current;
  }
  function state() { need(arguments.length === 0, 'SCHEMA'); return current ?? snapshot(null, records); }
  function exportRetained() {
    need(arguments.length === 0, 'SCHEMA');
    return freeze({ schema: 'caw-paid-action-observer-retained/1', target: watched, recovery: recovery.exportRetained() });
  }
  return Object.freeze({ select, prepare, commit, state, exportRetained });
}

/** Watch one immutable exact post-call candidate. The target context binds the
 * deployment/runtime/exclusive checkpoint; calldata includes its signature.
 * Watching bytes does not establish signature validity or submit anything. */
export function createPaidActionObserver(targetInput) {
  need(arguments.length === 1, 'SCHEMA'); return make(target(targetInput));
}

/** Rebuild every retained raw interval, then select the separately supplied
 * endpoint. Ignore bounded calculated_cache rather than trusting saved status.
 * No history or target is inferred from the previously displayed result. */
export function restartPaidActionObserver(retainedInput, selectedManifestInput) {
  need(arguments.length === 2, 'SCHEMA');
  const retained = capture(retainedInput), selected = manifest(capture(selectedManifestInput));
  fields(retained, ['schema', 'target', 'recovery'], ['calculated_cache']);
  need(retained.schema === 'caw-paid-action-observer-retained/1', 'SCHEMA');
  fields(retained.recovery, ['schema', 'branches'], ['calculated_cache']);
  need(retained.recovery.schema === 'caw-paid-reorg-retained/1' && Array.isArray(retained.recovery.branches)
    && retained.recovery.branches.length > 0 && retained.recovery.branches.length <= LIMIT.branches, 'RETENTION_LIMIT');
  const observer = make(target(retained.target)), seen = new Set(); let chosen = null;
  for (const entry of retained.recovery.branches) {
    fields(entry, ['manifest', 'history']); const m = manifest(entry.manifest), branchKey = key(m);
    need(!seen.has(branchKey), 'BRANCH_CONFLICT'); seen.add(branchKey);
    const token = observer.select(m); observer.commit(observer.prepare(token, entry.history));
    if (equal(m, selected)) chosen = entry;
  }
  need(chosen, 'SELECTED_HISTORY_MISSING');
  const token = observer.select(selected); observer.commit(observer.prepare(token, chosen.history));
  return observer;
}
