// Original bounded offline Ethereum MPT/RLP state-proof inspection.
// A supplied root is an assumption: this verifies no block, consensus or owner.
// https://eips.ethereum.org/EIPS/eip-1186
// https://ethereum.org/developers/docs/data-structures-and-encoding/patricia-merkle-trie/
// https://ethereum.org/developers/docs/data-structures-and-encoding/rlp/
import { Buffer } from 'node:buffer';
import { keccak256Hex } from './keccak256.mjs';

const MAX_NODES = 65, MAX_NODE_BYTES = 1024, MAX_TOTAL_BYTES = 65536;
const EMPTY_TRIE = keccak256Hex('0x80');
const EMPTY_CODE = keccak256Hex('0x');
const ZERO_HASH = '0x' + '00'.repeat(32);

function fail(reason) {
  const error = new Error(`Ethereum state proof rejected: ${reason}.`);
  error.code = `ETH_PROOF_${reason}`;
  throw error;
}

function record(input, keys) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('SCHEMA');
  let names, prototype;
  try {
    prototype = Object.getPrototypeOf(input);
    names = Reflect.ownKeys(input);
  } catch { fail('SCHEMA'); }
  if (prototype !== null && prototype !== Object.prototype) fail('SCHEMA');
  if (names.length !== keys.length || names.some(name => !keys.includes(name))) fail('SCHEMA');
  const copy = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('SCHEMA');
    copy[key] = descriptor.value;
  }
  return copy;
}

function list(input, maximum) {
  if (!Array.isArray(input)) fail('SCHEMA');
  let lengthDescriptor, prototype;
  try {
    prototype = Object.getPrototypeOf(input);
    lengthDescriptor = Object.getOwnPropertyDescriptor(input, 'length');
  } catch { fail('SCHEMA'); }
  if (prototype !== Array.prototype) fail('SCHEMA');
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum) fail('LIMIT');
  if (Reflect.ownKeys(input).length !== length + 1) fail('SCHEMA');
  const copy = [];
  for (let index = 0; index < length; index += 1) {
    const entry = Object.getOwnPropertyDescriptor(input, String(index));
    if (!entry || !entry.enumerable || !Object.hasOwn(entry, 'value')) fail('SCHEMA');
    copy.push(entry.value);
  }
  return copy;
}

function dataHex(value, minimum, maximum = minimum) {
  if (typeof value !== 'string' || !value.startsWith('0x') || value.length % 2 !== 0 ||
      value.length < 2 + minimum * 2 || value.length > 2 + maximum * 2 || /[^0-9a-f]/.test(value.slice(2))) fail('HEX');
  return value;
}

function quantity(value) {
  if (typeof value !== 'string' || value.length < 3 || value.length > 66 || !value.startsWith('0x') ||
      /[^0-9a-f]/.test(value.slice(2)) || (value.length > 3 && value[2] === '0')) fail('QUANTITY');
  return value;
}

function slotKey(value) {
  if (typeof value === 'string' && value.length === 66) return dataHex(value, 32);
  quantity(value);
  return '0x' + value.slice(2).padStart(64, '0');
}

function captureNodes(input, size) {
  return list(input, MAX_NODES).map(value => {
    dataHex(value, 1, MAX_NODE_BYTES);
    size.bytes += (value.length - 2) / 2;
    if (size.bytes > MAX_TOTAL_BYTES) fail('LIMIT');
    return value;
  });
}

function bytes(hex) { return Buffer.from(hex.slice(2), 'hex'); }
function toHex(raw) { return '0x' + raw.toString('hex'); }
function isBytes(item) { return Object.hasOwn(item, 'bytes'); }

// Each private item retains its complete canonical encoding for embedded-node
// size checks. No decoder view or mutable byte array is returned to callers.
function rlp(raw, budget = { items: 0 }) {
  function item(start, end, depth) {
    budget.items += 1;
    if (depth > 32 || budget.items > 2048) fail('LIMIT');
    if (start >= end) fail('RLP');
    const prefix = raw[start];
    if (prefix < 0x80) return { value: { bytes: raw.subarray(start, start + 1), raw: raw.subarray(start, start + 1) }, next: start + 1 };
    const nested = prefix >= 0xc0;
    const shortLimit = nested ? 0xf7 : 0xb7;
    const base = nested ? 0xc0 : 0x80;
    let payloadStart = start + 1, length;
    if (prefix <= shortLimit) length = prefix - base;
    else {
      const lengthBytes = prefix - shortLimit;
      if (payloadStart + lengthBytes > end || raw[payloadStart] === 0) fail('RLP');
      length = 0;
      for (let index = 0; index < lengthBytes; index += 1) {
        length = length * 256 + raw[payloadStart + index];
        if (length > raw.length) fail('RLP');
      }
      if (length <= 55) fail('RLP');
      payloadStart += lengthBytes;
    }
    const stop = payloadStart + length;
    if (stop > end) fail('RLP');
    if (!nested) {
      if (length === 1 && raw[payloadStart] < 0x80) fail('RLP');
      return { value: { bytes: raw.subarray(payloadStart, stop), raw: raw.subarray(start, stop) }, next: stop };
    }
    const children = [];
    let cursor = payloadStart;
    while (cursor < stop) {
      const child = item(cursor, stop, depth + 1);
      children.push(child.value);
      cursor = child.next;
    }
    if (cursor !== stop) fail('RLP');
    return { value: { list: children, raw: raw.subarray(start, stop) }, next: stop };
  }
  const decoded = item(0, raw.length, 0);
  if (decoded.next !== raw.length) fail('RLP');
  return decoded.value;
}

function compact(encoded) {
  if (!isBytes(encoded) || encoded.bytes.length === 0 || encoded.bytes.length > 33) fail('PATH');
  const first = encoded.bytes[0], flag = first >> 4;
  if (flag > 3 || ((flag & 1) === 0 && (first & 15) !== 0)) fail('PATH');
  const path = [];
  if (flag & 1) path.push(first & 15);
  for (let at = 1; at < encoded.bytes.length; at += 1) path.push(encoded.bytes[at] >> 4, encoded.bytes[at] & 15);
  const leaf = Boolean(flag & 2);
  if (path.length > 64 || (!leaf && path.length === 0)) fail('PATH');
  return { leaf, path };
}

function validateNode(node) {
  if (isBytes(node) || (node.list.length !== 2 && node.list.length !== 17)) fail('NODE');
  function reference(child, allowEmpty) {
    if (isBytes(child)) {
      if (child.bytes.length !== 32 && !(allowEmpty && child.bytes.length === 0)) fail('NODE');
    } else {
      if (child.raw.length >= 32) fail('NODE');
      validateNode(child);
    }
  }
  if (node.list.length === 17) {
    for (let index = 0; index < 16; index += 1) reference(node.list[index], true);
    if (!isBytes(node.list[16])) fail('NODE');
  } else {
    const { leaf } = compact(node.list[0]);
    if (leaf) {
      if (!isBytes(node.list[1]) || node.list[1].bytes.length === 0) fail('NODE');
    } else reference(node.list[1], false);
  }
}

function trie(root, key, nodes) {
  if (root === EMPTY_TRIE) {
    if (nodes.length === 0 || (nodes.length === 1 && nodes[0] === '0x80')) return { exists: false, value: null };
    fail('UNUSED');
  }
  const witnesses = new Map(), used = new Set(), budget = { items: 0 };
  for (const nodeHex of nodes) {
    const commitment = keccak256Hex(nodeHex);
    if (witnesses.has(commitment)) fail('DUPLICATE');
    const raw = bytes(nodeHex), decoded = rlp(raw, budget);
    validateNode(decoded);
    witnesses.set(commitment, decoded);
  }
  const path = [];
  for (const byte of bytes(key)) path.push(byte >> 4, byte & 15);
  let cursor = 0;
  function hashed(commitment, rootReference) {
    const decoded = witnesses.get(commitment);
    if (!decoded) fail('MISSING_NODE');
    if (!rootReference && decoded.raw.length < 32) fail('NODE');
    used.add(commitment);
    return decoded;
  }
  function follow(reference) {
    return isBytes(reference) ? hashed(toHex(reference.bytes), false) : reference;
  }
  function finish(value) {
    if (used.size !== witnesses.size) fail('UNUSED');
    return value === null ? { exists: false, value: null } : { exists: true, value: toHex(value) };
  }
  let node = hashed(root, true);
  for (let steps = 0; steps < 66; steps += 1) {
    if (node.list.length === 17) {
      if (cursor === path.length) return finish(node.list[16].bytes.length ? node.list[16].bytes : null);
      const child = node.list[path[cursor]];
      cursor += 1;
      if (isBytes(child) && child.bytes.length === 0) return finish(null);
      node = follow(child);
    } else {
      const part = compact(node.list[0]);
      const matches = part.path.length <= path.length - cursor && part.path.every((nibble, offset) => path[cursor + offset] === nibble);
      if (!matches) return finish(null);
      cursor += part.path.length;
      if (part.leaf) return finish(cursor === path.length ? node.list[1].bytes : null);
      node = follow(node.list[1]);
    }
  }
  fail('PATH');
}

/** Low-level bounded MPT lookup. keyHex is the path; it is NOT hashed here. */
export function inspectTrieProof(root, keyHex, proofNodes) {
  if (arguments.length !== 3) fail('SCHEMA');
  dataHex(root, 32); dataHex(keyHex, 0, 32);
  const nodes = captureNodes(proofNodes, { bytes: 0 });
  return Object.freeze(trie(root, keyHex, nodes));
}

function unsigned(item, positive, reason) {
  if (!isBytes(item) || item.bytes.length > 32 || (item.bytes.length !== 0 && item.bytes[0] === 0) ||
      (positive && item.bytes.length === 0)) fail(reason);
  return item.bytes.length ? '0x' + BigInt(toHex(item.bytes)).toString(16) : '0x0';
}

function accountLeaf(value) {
  const item = rlp(bytes(value));
  if (isBytes(item) || item.list.length !== 4) fail('ACCOUNT');
  const [nonce, balance, storage, code] = item.list;
  if (!isBytes(storage) || storage.bytes.length !== 32 || !isBytes(code) || code.bytes.length !== 32) fail('ACCOUNT');
  return { nonce: unsigned(nonce, false, 'ACCOUNT'), balance: unsigned(balance, false, 'ACCOUNT'),
    storageHash: toHex(storage.bytes), codeHash: toHex(code.bytes) };
}

/** Inspect an exact data-only eth_getProof result under separately retained trust.
 * No RPC requests, block/header checks, storage layout or ownership inference.
 */
export function inspectEthereumStateProof(proof, trusted) {
  if (arguments.length !== 2) fail('SCHEMA');
  const requested = record(trusted, ['stateRoot', 'address', 'storageKeys']);
  dataHex(requested.stateRoot, 32); dataHex(requested.address, 20);
  const keys = list(requested.storageKeys, 16).map(key => dataHex(key, 32));
  if (new Set(keys).size !== keys.length) fail('DUPLICATE');
  const response = record(proof, ['address', 'balance', 'codeHash', 'nonce', 'storageHash', 'accountProof', 'storageProof']);
  dataHex(response.address, 20); quantity(response.balance); quantity(response.nonce);
  dataHex(response.codeHash, 32); dataHex(response.storageHash, 32);
  if (response.address !== requested.address) fail('REQUEST');
  const size = { bytes: 0 }, accountProof = captureNodes(response.accountProof, size);
  const slots = new Map();
  for (const input of list(response.storageProof, 16)) {
    const entry = record(input, ['key', 'value', 'proof']);
    const key = slotKey(entry.key);
    quantity(entry.value);
    const nodes = captureNodes(entry.proof, size);
    if (slots.has(key)) fail('DUPLICATE');
    slots.set(key, { value: entry.value, nodes });
  }
  if (slots.size !== keys.length || keys.some(key => !slots.has(key))) fail('REQUEST');
  // All ordinary data inputs are now captured before any witness processing.
  const account = trie(requested.stateRoot, keccak256Hex(requested.address), accountProof);
  let fields;
  if (account.exists) {
    fields = accountLeaf(account.value);
    for (const key of ['nonce', 'balance', 'storageHash', 'codeHash']) if (fields[key] !== response[key]) fail('CLAIM');
  } else {
    const zeros = response.storageHash === ZERO_HASH && response.codeHash === ZERO_HASH;
    const empties = response.storageHash === EMPTY_TRIE && response.codeHash === EMPTY_CODE;
    if (response.nonce !== '0x0' || response.balance !== '0x0' || (!zeros && !empties)) fail('CLAIM');
    fields = { nonce: '0x0', balance: '0x0', storageHash: null, codeHash: null };
  }
  const storage = keys.map(key => {
    const supplied = slots.get(key);
    if (!account.exists) {
      if (supplied.nodes.length !== 0 || supplied.value !== '0x0') fail('STORAGE');
      return Object.freeze({ key, value: '0x0', exists: false });
    }
    const found = trie(fields.storageHash, keccak256Hex(key), supplied.nodes);
    const value = found.exists ? unsigned(rlp(bytes(found.value)), true, 'STORAGE') : '0x0';
    if (value !== supplied.value) fail('CLAIM');
    return Object.freeze({ key, value, exists: found.exists });
  });
  return Object.freeze({ stateRoot: requested.stateRoot, address: requested.address, accountExists: account.exists,
    nonce: fields.nonce, balance: fields.balance, storageHash: fields.storageHash, codeHash: fields.codeHash,
    storage: Object.freeze(storage), proofVerified: true, rootAuthenticated: false, blockBindingProven: false,
    finalityProven: false, freshnessProven: false, ownershipProven: false, livePermissionRestored: false });
}
