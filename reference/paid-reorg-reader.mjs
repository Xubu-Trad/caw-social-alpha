// Bounded offline branch replacement for the fixed paid-action experiment.
// The caller selects a manifest; height, timestamps and collector agreement do
// not select consensus. No transport, signature verification or trie proof.
// The unchanged reader supplies the accounting; every adoption is a full rebuild.
import { Buffer } from 'node:buffer';
import { isDeepStrictEqual as equal } from 'node:util';
import { reconstruct } from './paid-action-reader.mjs';

const LIMIT = Object.freeze({ bytes: 8 * 1024 * 1024, nodes: 100000, depth: 20,
  array: 2048, blocks: 512, rangeItems: 1024, ranges: 8, branches: 8, pending: 4, selections: 1024 });
const MANIFEST = ['chain_id', 'addresses', 'registry_runtime_sha256', 'probe_runtime_sha256', 'start_block_hash', 'end_block_hash'];
const ENVELOPE = ['schema', 'chain_id', 'addresses', 'registry_runtime', 'probe_runtime', 'start_block', 'end_block', 'final'];
const TOKEN = '0xf3b9569f82b18aef890de263b84189bd33ebe452';
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/;
function fail(code) { const error = new Error('Paid reorg rejected: ' + code + '.'); error.code = 'PAID_REORG_' + code; throw error; }
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
function indexFor(h, namespace) {
  const anchor = namespace + '/block/' + h.start_block.hash;
  const blocks = [], transactions = [], logs = [], seen = new Set([anchor]);
  function unique(key) { need(!seen.has(key), 'CACHE_COLLISION'); seen.add(key); return key; }
  for (const [blockIndex, block] of h.blocks.entries()) {
    const blockKey = unique(namespace + '/block/' + block.header.hash);
    blocks.push({ key: blockKey, block_index: blockIndex });
    for (const [transactionIndex, tx] of block.transactions.entries()) {
      const transactionKey = unique(blockKey + '/tx/' + tx.receipt.transactionHash);
      transactions.push({ key: transactionKey, block_index: blockIndex, transaction_index: transactionIndex });
      for (const [eventIndex, log] of tx.receipt.logs.entries()) {
        logs.push({ key: unique(transactionKey + '/log/' + log.logIndex),
          block_index: blockIndex, transaction_index: transactionIndex, event_index: eventIndex });
      }
    }
  }
  return freeze({ identity: namespace, anchor, blocks, transactions, logs });
}
function inspect(h, m, weight) {
  fields(h, [...ENVELOPE, 'blocks']); manifest(m);
  need(Array.isArray(h.blocks) && h.blocks.length > 0 && h.blocks.length <= LIMIT.blocks, 'RANGE');
  need(equal(h.end_block, h.blocks.at(-1)?.header), 'ENDPOINT_FIELDS');
  const result = reconstruct(h, m), namespace = identity(m);
  return freeze({ key: namespace + '/tip/' + m.end_block_hash, identity: namespace, manifest: m,
    history: h, result, index: indexFor(h, namespace), weight });
}
function consistentBranches(a, b) {
  if (a.identity !== b.identity) return;
  need(equal(a.history.start_block, b.history.start_block), 'ANCHOR_CONFLICT');
  const prior = new Map(a.history.blocks.map(block => [block.header.hash, block]));
  for (const block of b.history.blocks) if (prior.has(block.header.hash)) need(equal(prior.get(block.header.hash), block), 'HASH_CONFLICT');
}
function transition(a, b) {
  if (!a) return freeze({ from_tip: null, to_tip: b.manifest.end_block_hash, common_ancestor: null,
    discarded_blocks: [], adopted_blocks: b.history.blocks.map(block => block.header.hash) });
  let shared = 0, ancestor = null;
  if (a.identity === b.identity) {
    consistentBranches(a, b); ancestor = a.history.start_block;
    while (shared < a.history.blocks.length && shared < b.history.blocks.length
      && equal(a.history.blocks[shared], b.history.blocks[shared])) ancestor = a.history.blocks[shared++].header;
  }
  return freeze({ from_tip: a.manifest.end_block_hash, to_tip: b.manifest.end_block_hash,
    common_ancestor: ancestor ? { number: ancestor.number, hash: ancestor.hash } : null,
    discarded_blocks: a.history.blocks.slice(shared).map(block => block.header.hash),
    adopted_blocks: b.history.blocks.slice(shared).map(block => block.header.hash) });
}
function retainable(records, branch) {
  const prior = records.get(branch.key);
  if (prior) { need(equal(prior.history, branch.history) && equal(prior.manifest, branch.manifest), 'BRANCH_CONFLICT'); return; }
  need(records.size < LIMIT.branches && [...records.values()].reduce((sum, item) => sum + item.weight, branch.weight) <= LIMIT.bytes, 'RETENTION_LIMIT');
  for (const item of records.values()) consistentBranches(item, branch);
}
function makeReader(seed = []) {
  const records = new Map();
  for (const branch of seed) { retainable(records, branch); records.set(branch.key, branch); }
  let generation = 0, selected = null, active = null, current = null, previous = null;
  const pending = new Map();
  function select(input) {
    // Fail closed even if the newly supplied selection is malformed. Historical
    // records survive; no failed/stale prepare or commit modifies this status.
    current = null; selected = null; active = null; pending.clear();
    need(arguments.length === 1 && generation < LIMIT.selections, 'SELECTION_LIMIT');
    const selectionGeneration = ++generation, supplied = manifest(capture(input));
    need(generation === selectionGeneration && active === null && current === null, 'STALE_SELECTION');
    selected = supplied;
    active = freeze({ schema: 'caw-paid-reorg-selection/1', generation });
    return active;
  }
  function prepare(token, input) {
    need(arguments.length === 2 && token === active && active !== null, 'STALE_SELECTION');
    need(pending.size < LIMIT.pending, 'PENDING_LIMIT');
    const selection = active, preparationGeneration = generation, selectedManifest = selected;
    const budget = { bytes: 0, nodes: 0 }, h = capture(input, budget);
    const branch = inspect(h, selectedManifest, budget.bytes);
    need(active === selection && generation === preparationGeneration, 'STALE_SELECTION');
    retainable(records, branch);
    const replacement = freeze({ branch_key: branch.key, manifest: branch.manifest, result: branch.result,
      index: branch.index, transition: transition(previous, branch) });
    const prepared = freeze({ schema: 'caw-paid-reorg-prepared/1', generation });
    pending.set(prepared, { generation: preparationGeneration, selection, branch, replacement });
    return prepared;
  }
  function commit(token) {
    const prepared = pending.get(token);
    need(arguments.length === 1 && prepared && prepared.generation === generation
      && prepared.selection === active && active !== null, 'STALE_PREPARED');
    // All potentially failing checks happen before the single authoritative
    // pointer replacement. The caller cannot alter the captured prepared data.
    retainable(records, prepared.branch);
    records.set(prepared.branch.key, prepared.branch);
    previous = prepared.branch; current = prepared.replacement;
    active = null; pending.clear();
    return current;
  }
  function state() {
    need(arguments.length === 0, 'SCHEMA');
    return freeze({ schema: 'caw-paid-reorg-state/1', generation, status: current ? 'ready' : 'unresolved',
      selected, current, historical: [...records.values()].filter(branch => branch.key !== current?.branch_key)
        .map(branch => ({ branch_key: branch.key, manifest: branch.manifest })) });
  }
  function exportRetained() {
    need(arguments.length === 0, 'SCHEMA');
    return freeze({ schema: 'caw-paid-reorg-retained/1',
      branches: [...records.values()].map(branch => ({ manifest: branch.manifest, history: branch.history })) });
  }
  return Object.freeze({ select, prepare, commit, state, exportRetained });
}

/** Tokens are opaque by object identity. Preparing is synchronous and performs
 * no I/O; applications may delay commit, but must supply a fresh selection token
 * after any branch change. Selecting is the only operation that invalidates a
 * ready state; malformed selections also leave it unresolved. */
export function createPaidReorgReader() { need(arguments.length === 0, 'SCHEMA'); return makeReader(); }

/** Retained manifests describe historical observations. Only the separately
 * supplied selected manifest nominates current state. Rebuild every retained
 * interval; calculated_cache, if supplied as bounded plain data, is ignored. */
export function restartPaidReorgReader(retainedInput, selectedManifestInput) {
  need(arguments.length === 2, 'SCHEMA');
  const budget = { bytes: 0, nodes: 0 }, retained = capture(retainedInput, budget), selected = manifest(capture(selectedManifestInput));
  fields(retained, ['schema', 'branches'], ['calculated_cache']);
  need(retained.schema === 'caw-paid-reorg-retained/1' && Array.isArray(retained.branches)
    && retained.branches.length > 0 && retained.branches.length <= LIMIT.branches, 'RETENTION_LIMIT');
  const records = [], keys = new Set();
  for (const entry of retained.branches) {
    fields(entry, ['manifest', 'history']);
    const weightBudget = { bytes: 0, nodes: 0 }, history = capture(entry.history, weightBudget);
    const branch = inspect(history, manifest(entry.manifest), weightBudget.bytes);
    need(!keys.has(branch.key), 'BRANCH_CONFLICT'); keys.add(branch.key); records.push(branch);
  }
  const chosen = records.find(branch => equal(branch.manifest, selected)); need(chosen, 'SELECTED_HISTORY_MISSING');
  const reader = makeReader(records), token = reader.select(selected);
  reader.commit(reader.prepare(token, chosen.history));
  return reader;
}

/** envelope has the ordinary history fields except blocks. Each range is an
 * array of complete block/transaction/receipt envelopes. Overlap is allowed
 * only for identical whole blocks; a same-height different hash is a conflict.
 * A complete interval and the external manifest are still mandatory. */
export function mergePaidHistoryRanges(envelopeInput, rangesInput, selectedManifestInput) {
  need(arguments.length === 3, 'SCHEMA');
  const budget = { bytes: 0, nodes: 0 }, envelope = capture(envelopeInput, budget), ranges = capture(rangesInput, budget),
    selected = manifest(capture(selectedManifestInput));
  fields(envelope, ENVELOPE);
  need(Array.isArray(ranges) && ranges.length > 0 && ranges.length <= LIMIT.ranges, 'RANGE');
  const byHash = new Map(), byHeight = new Map(); let items = 0;
  for (const range of ranges) {
    need(Array.isArray(range) && range.length > 0 && range.length <= LIMIT.blocks, 'RANGE');
    for (const block of range) {
      need(++items <= LIMIT.rangeItems, 'LIMIT'); fields(block, ['header', 'transactions']);
      need(block.header && typeof block.header.hash === 'string' && HASH.test(block.header.hash)
        && typeof block.header.number === 'string' && QUANTITY.test(block.header.number), 'HEADER');
      const priorHash = byHash.get(block.header.hash), priorHeight = byHeight.get(block.header.number);
      if (priorHash) need(equal(priorHash, block), 'HASH_CONFLICT');
      if (priorHeight) need(priorHeight.header.hash === block.header.hash, 'HEIGHT_CONFLICT');
      if (!priorHash) {
        need(byHash.size < LIMIT.blocks, 'LIMIT'); byHash.set(block.header.hash, block); byHeight.set(block.header.number, block);
      }
    }
  }
  const blocks = [...byHash.values()].sort((a, b) => BigInt(a.header.number) < BigInt(b.header.number) ? -1 : 1);
  const h = Object.assign(Object.create(null), envelope, { blocks });
  return inspect(h, selected, budget.bytes).history;
}
