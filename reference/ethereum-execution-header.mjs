// Execution-header encoding and hash integrity under an explicitly selected
// profile and endpoint. No consensus, fork schedule, execution or body proofs.
// Sources: EIP-1559, EIP-4895, EIP-4844, EIP-4788 and EIP-7685;
// https://ethereum.org/developers/docs/data-structures-and-encoding/rlp/
import { Buffer } from 'node:buffer';
import { keccak256Hex } from './keccak256.mjs';

// Plain-data capture is adapted from the existing recovery/observer code.
// Header encoding is new; the shared capture and Keccak are not independent
// implementations of those primitives.
const LIMIT = Object.freeze({ nodes: 100000, depth: 20, array: 2048 });
function fail(code) { const e = new Error('Execution header rejected: ' + code + '.'); e.code = 'EXEC_HEADER_' + code; throw e; }
function need(condition, code) { if (!condition) fail(code); }
function fields(value, required, optional = []) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value), 'SCHEMA');
  const keys = Object.keys(value), allowed = new Set([...required, ...optional]);
  need(keys.every(key => allowed.has(key)) && required.every(key => Object.hasOwn(value, key)), 'SCHEMA');
}

// Capture own data descriptors without invoking getters, toJSON or iterators.
// Hostile Proxy traps and replacement native built-ins are outside this same-
// process plain-data boundary. Cycles, exotic prototypes and sparse arrays fail.
function capture(input, maximum) {
  const budget = { bytes: 0, nodes: 0 };
  const active = new WeakSet();
  function copy(value, depth) {
    budget.bytes += 8;
    need(++budget.nodes <= LIMIT.nodes && depth <= LIMIT.depth && budget.bytes <= maximum, 'LIMIT');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') { need(Number.isSafeInteger(value) && !Object.is(value, -0), 'INTEGER'); return value; }
    if (typeof value === 'string') {
      need(value.length <= 262144 && value.isWellFormed(), 'STRING');
      budget.bytes += Buffer.byteLength(value, 'utf8'); need(budget.bytes <= maximum, 'LIMIT'); return value;
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
        budget.bytes += Buffer.byteLength(key, 'utf8'); need(budget.bytes <= maximum, 'LIMIT');
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

const BASE = [
  ['parentHash', 32], ['sha3Uncles', 32], ['miner', 20], ['stateRoot', 32],
  ['transactionsRoot', 32], ['receiptsRoot', 32], ['logsBloom', 256],
  ['difficulty', 'uint256'], ['number', 'uint256'], ['gasLimit', 'uint256'],
  ['gasUsed', 'uint256'], ['timestamp', 'uint256'], ['extraData', 'extra'],
  ['mixHash', 32], ['nonce', 8], ['baseFeePerGas', 'uint256']
];
const SHANGHAI = [...BASE, ['withdrawalsRoot', 32]];
const CANCUN = [...SHANGHAI, ['blobGasUsed', 'uint64'], ['excessBlobGas', 'uint64'], ['parentBeaconBlockRoot', 32]];
const PROFILES = Object.freeze({ 'london-16': BASE, 'shanghai-17': SHANGHAI,
  'cancun-20': CANCUN, 'prague-21': [...CANCUN, ['requestsHash', 32]] });
// RPC summaries/body fields are bounded but do not enter header RLP. Their
// contents are not validated against roots here. Unknown fields fail closed.
const METADATA = ['totalDifficulty', 'size', 'uncles', 'transactions', 'withdrawals'];
const FLAGS = Object.freeze({ endpointAuthenticated: false, consensusVerified: false,
  bodyCommitmentsVerified: false, executionVerified: false, finalityVerified: false, freshnessVerified: false });
function data(value, minimum, maximum = minimum) {
  need(typeof value === 'string' && value.length >= 2 + minimum * 2
    && value.length <= 2 + maximum * 2 && /^0x(?:[0-9a-f]{2})*$/.test(value), 'DATA');
  return Buffer.from(value.slice(2), 'hex');
}
function unsigned(value, bits) {
  need(typeof value === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value)
    && value.length <= 2 + bits / 4, 'QUANTITY');
  // RLP integers are minimal big-endian bytes; zero is the empty byte string.
  const digits = value.slice(2);
  return value === '0x0' ? Buffer.alloc(0) : Buffer.from(digits.padStart(digits.length + digits.length % 2, '0'), 'hex');
}
function lengthBytes(length) {
  const hex = length.toString(16); return Buffer.from(hex.padStart(hex.length + hex.length % 2, '0'), 'hex');
}
function wrap(payload, list = false) {
  if (!list && payload.length === 1 && payload[0] < 128) return payload;
  const base = list ? 192 : 128;
  if (payload.length < 56) return Buffer.concat([Buffer.from([base + payload.length]), payload]);
  const length = lengthBytes(payload.length);
  return Buffer.concat([Buffer.from([base + 55 + length.length]), length, payload]);
}
function profile(value) {
  need(typeof value === 'string' && Object.hasOwn(PROFILES, value), 'PROFILE'); return PROFILES[value];
}
function inspectCaptured(header, name, expectedHash) {
  const layout = profile(name);
  fields(header, ['hash', ...layout.map(([key]) => key)], METADATA);
  data(header.hash, 32); data(expectedHash, 32);
  const encoded = layout.map(([key, kind]) => {
    const value = header[key];
    const bytes = kind === 'uint256' ? unsigned(value, 256) : kind === 'uint64' ? unsigned(value, 64)
      : kind === 'extra' ? data(value, 0, 32) : data(value, kind);
    return wrap(bytes);
  });
  const raw = wrap(Buffer.concat(encoded), true);
  need(raw.length <= 2048, 'RLP_LIMIT');
  const rlp = '0x' + raw.toString('hex'), computed = keccak256Hex(rlp);
  need(computed === header.hash, 'HASH_MISMATCH');
  need(computed === expectedHash, 'SELECTED_HASH_MISMATCH');
  return freeze({ schema: 'caw-execution-header-integrity/1', profile: name,
    hash: computed, parentHash: header.parentHash, number: header.number,
    stateRoot: header.stateRoot, transactionsRoot: header.transactionsRoot, receiptsRoot: header.receiptsRoot,
    rlp, headerHashVerified: true, selectedHashMatched: true, ...FLAGS });
}

/** Recompute Keccak(RLP(header)) for one explicitly named layout. Supporting a
 * layout does not validate that its fork is active on any chain or timestamp.
 * The expected hash is a caller-supplied assumption, not authenticated trust. */
export function inspectExecutionHeader(headerInput, selectionInput) {
  need(arguments.length === 2, 'SCHEMA');
  const selected = capture(selectionInput, 4096);
  fields(selected, ['schema', 'profile', 'hash']);
  need(selected.schema === 'caw-execution-header-selection/1', 'SCHEMA');
  profile(selected.profile); data(selected.hash, 32);
  return inspectCaptured(capture(headerInput, 65536), selected.profile, selected.hash);
}

/** headers include the exclusive action checkpoint and every included header
 * through the endpoint, in ascending order. One fixed profile per interval;
 * fork transitions require a separate reviewed policy and are not inferred. */
export function inspectExecutionHeaderChain(headersInput, selectionInput) {
  need(arguments.length === 2, 'SCHEMA');
  const selected = capture(selectionInput, 4096);
  fields(selected, ['schema', 'profile', 'startHash', 'endHash']);
  need(selected.schema === 'caw-execution-header-chain-selection/1', 'SCHEMA');
  profile(selected.profile); data(selected.startHash, 32); data(selected.endHash, 32);
  const supplied = capture(headersInput, 8 * 1024 * 1024);
  need(Array.isArray(supplied) && supplied.length >= 2 && supplied.length <= 129, 'CHAIN_LIMIT');
  const checked = supplied.map((header, index) => {
    const h = capture(header, 65536);
    const expected = index === 0 ? selected.startHash : index === supplied.length - 1 ? selected.endHash : h.hash;
    return inspectCaptured(h, selected.profile, expected);
  });
  for (let index = 1; index < checked.length; index++) {
    need(checked[index].parentHash === checked[index - 1].hash, 'PARENT_LINK');
    need(BigInt(checked[index].number) === BigInt(checked[index - 1].number) + 1n, 'NUMBER_SEQUENCE');
  }
  return freeze({ schema: 'caw-execution-header-chain-integrity/1', profile: selected.profile,
    startHash: selected.startHash, endHash: selected.endHash, headerCount: checked.length,
    headers: checked, parentLinksVerified: true, numberSequenceVerified: true, ...FLAGS });
}
