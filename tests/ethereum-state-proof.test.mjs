import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { inspectEthereumStateProof, inspectTrieProof } from '../reference/ethereum-state-proof.mjs';
import { keccak256Hex } from '../reference/keccak256.mjs';

// Fixed expected roots, RLP nodes and values come from the separately authored
// Python fixture generator. No JavaScript trie or hash implementation generated
// these expected fixtures. They are synthetic, not a capture from a live chain.
const f = JSON.parse(readFileSync(new URL('../reference/fixtures/ethereum-state-proof-v1.json', import.meta.url), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const code = expected => error => error instanceof Error && (expected ? error.code === expected : /^ETH_PROOF_/.test(error.code));
const trie = name => { const value = f.trie_cases.find(item => item.name === name); assert.ok(value, name); return value; };
const state = name => { const value = f.state_cases.find(item => item.name === name); assert.ok(value, name); return value; };
const full = state('account-and-three-slots-plus-absence');
const zeroHash = '0x' + '00'.repeat(32);
const emptyRoot = '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421';
const emptyCode = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';
const falseFlags = ['rootAuthenticated', 'blockBindingProven', 'finalityProven', 'freshnessProven', 'ownershipProven', 'livePermissionRestored'];
const flip = hex => hex.slice(0, -1) + (hex.at(-1) === '0' ? '1' : '0');
function check(value) {
  const result = inspectEthereumStateProof(value.proof, value.trusted);
  assert.equal(result.stateRoot, value.trusted.stateRoot, value.name);
  assert.equal(result.address, value.trusted.address, value.name);
  for (const [field, expected] of Object.entries(value.expected)) assert.deepEqual(result[field], expected, value.name + ':' + field);
  assert.equal(result.proofVerified, true);
  for (const flag of falseFlags) assert.equal(result[flag], false, flag);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.storage));
  for (const item of result.storage) assert.ok(Object.isFrozen(item));
  return result;
}
function rejects(proof, trusted = full.trusted, expected) {
  assert.throws(() => inspectEthereumStateProof(proof, trusted), code(expected));
}

test('Ethereum Keccak matches independent fixed vectors across rate and encoding boundaries', () => {
  assert.equal(f.synthetic, true); assert.match(f.notice, /not observations/i);
  for (const value of f.hash_vectors) assert.equal(keccak256Hex(value.input), value.expected, 'bytes=' + (value.input.length - 2) / 2);
  assert.equal(keccak256Hex('0x'), emptyCode);
  assert.equal(keccak256Hex('0x616263'), '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
  assert.notEqual(keccak256Hex('0x'), '0xa7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a','Ethereum Keccak is not SHA3-256');
});

test('hash helper accepts exact DATA and rejects coercion, odd hex and oversized input', () => {
  for (const value of [undefined, null, 1, {}, Buffer.from([0]), '', '00', '0X00', '0x0', '0xAB', '0xgg', '0x00\n', '0x' + '00'.repeat(65537)]) {
    assert.throws(() => keccak256Hex(value), error => error instanceof Error && error.code === 'KECCAK_INPUT');
  }
  assert.throws(() => keccak256Hex('0x', 'extra'), error => error instanceof Error && error.code === 'KECCAK_INPUT');
});

test('proof implementation imports no application model, signing, network or storage client', () => {
  const source = readFileSync(new URL('../reference/ethereum-state-proof.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.ok(imports.every(name => ['node:buffer', './keccak256.mjs'].includes(name)), imports.join(', '));
  assert.doesNotMatch(source, /\bimport\s*\(|\brequire\s*\(|\bfetch\s*\(/);
  const hashSource = readFileSync(new URL('../reference/keccak256.mjs', import.meta.url), 'utf8');
  const hashImports = [...hashSource.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.ok(hashImports.every(name => name === 'node:buffer'), hashImports.join(', '));
  assert.doesNotMatch(hashSource, /\bimport\s*\(|\brequire\s*\(|\bfetch\s*\(/);
});

test('independent trie fixtures cover branch, extension, leaf, branch value and absence paths', () => {
  for (const value of f.trie_cases) {
    const result = inspectTrieProof(value.root, value.key, value.proof);
    assert.deepEqual(result, value.expected, value.name); assert.ok(Object.isFrozen(result));
  }
  assert.equal(trie('empty-key-branch-value').key, '0x');
  assert.equal(inspectTrieProof(emptyRoot, '0x00', []).exists, false);
  assert.deepEqual(inspectTrieProof(emptyRoot, '0x00', ['0x80']), { exists: false, value: null });
});

test('31-byte children are embedded while 32- and 33-byte children require hashed witnesses', () => {
  const embedded = trie('child-rlp-31'), exact = trie('child-rlp-32'), larger = trie('child-rlp-33');
  assert.equal(embedded.proof.length, 2); assert.equal(exact.proof.length, 3); assert.equal(larger.proof.length, 3);
  assert.equal((exact.proof.at(-1).length - 2) / 2, 32); assert.equal((larger.proof.at(-1).length - 2) / 2, 33);
  for (const value of [embedded, exact, larger]) assert.deepEqual(inspectTrieProof(value.root, value.key, value.proof), value.expected);
  const embeddedNode = '0xde209c' + '76'.repeat(28);
  assert.equal((embeddedNode.length - 2) / 2, 31);
  assert.throws(() => inspectTrieProof(embedded.root, embedded.key, [...embedded.proof, embeddedNode]), code('ETH_PROOF_UNUSED'));
});

test('content-addressed witness sets allow reordering but reject duplicate, missing and unused nodes', () => {
  const value = trie('words-dog');
  assert.deepEqual(inspectTrieProof(value.root, value.key, [...value.proof].reverse()), value.expected);
  assert.throws(() => inspectTrieProof(value.root, value.key, [...value.proof, value.proof[0]]), code('ETH_PROOF_DUPLICATE'));
  for (let index = 0; index < value.proof.length; index += 1) {
    assert.throws(() => inspectTrieProof(value.root, value.key, value.proof.filter((_, at) => at !== index)), code('ETH_PROOF_MISSING_NODE'));
  }
  assert.throws(() => inspectTrieProof(value.root, value.key, [...value.proof, trie('short-root-leaf').proof[0]]), code('ETH_PROOF_UNUSED'));
  assert.throws(() => inspectTrieProof(value.root, value.key, []), code('ETH_PROOF_MISSING_NODE'));
});

test('independently rooted malformed RLP and compact paths fail after matching their supplied root', () => {
  for (const value of f.invalid_trie_cases) {
    assert.equal(keccak256Hex(value.proof[0]), value.root, value.name + ':root matches malformed bytes');
    assert.throws(() => inspectTrieProof(value.root, value.key, value.proof), code(), value.name);
  }
});

test('independently rooted malformed account fields and storage integers are rejected', () => {
  for (const value of f.invalid_state_cases) {
    assert.equal(keccak256Hex(value.proof.accountProof[0]), value.trusted.stateRoot, value.name + ':root matches malformed bytes');
    assert.throws(() => inspectEthereumStateProof(value.proof, value.trusted), code(), value.name);
  }
});

test('account and storage inclusion or absence match all independently supplied fixture expectations', () => {
  for (const value of f.state_cases) check(value);
  const result = check(full);
  assert.equal(result.nonce, '0x1'); assert.equal(result.balance, '0x400');
  assert.deepEqual(result.storage.map(item => item.value), ['0x1', '0x80', '0x' + 'ff'.repeat(32), '0x0']);
  assert.deepEqual(result.storage.map(item => item.exists), [true, true, true, false]);
});

test('response and witness ordering cannot replace caller slot order or change proven values', () => {
  const value = clone(full); value.proof.accountProof.reverse(); value.proof.storageProof.reverse();
  for (const item of value.proof.storageProof) item.proof.reverse();
  assert.deepEqual(check(value).storage, full.expected.storage);
  value.trusted.storageKeys.reverse(); value.expected.storage.reverse();
  assert.deepEqual(check(value).storage.map(item => item.key), value.trusted.storageKeys);
});

test('separately supplied root and address cannot be silently taken from the response', () => {
  rejects(full.proof, { ...full.trusted, stateRoot: flip(full.trusted.stateRoot) }, 'ETH_PROOF_MISSING_NODE');
  rejects(full.proof, { ...full.trusted, address: flip(full.trusted.address) }, 'ETH_PROOF_REQUEST');
  const changed = clone(full.proof); changed.address = flip(changed.address); rejects(changed, full.trusted, 'ETH_PROOF_REQUEST');
  const other = '0x' + '00'.repeat(19) + '09'; changed.address = other;
  rejects(changed, { ...full.trusted, address: other });
  const nominated = { ...full.proof, stateRoot: full.trusted.stateRoot }; rejects(nominated, full.trusted, 'ETH_PROOF_SCHEMA');
});

test('exact requested slot set rejects missing, added, replaced or duplicate normalized keys', () => {
  const missing = clone(full.proof); missing.storageProof.pop(); rejects(missing, full.trusted, 'ETH_PROOF_REQUEST');
  const duplicate = clone(full.proof); duplicate.storageProof[1].key = '0x0'; rejects(duplicate);
  const aliasDuplicate = clone(full.proof); aliasDuplicate.storageProof.push({ ...aliasDuplicate.storageProof[0], key: full.trusted.storageKeys[0] }); rejects(aliasDuplicate);
  const replaced = clone(full.proof); replaced.storageProof[0].key = '0x9'; rejects(replaced, full.trusted, 'ETH_PROOF_REQUEST');
  rejects(full.proof, { ...full.trusted, storageKeys: [...full.trusted.storageKeys, full.trusted.storageKeys[0]] });
  const keys = [...full.trusted.storageKeys]; keys[0] = '0x' + '00'.repeat(31) + '09'; rejects(full.proof, { ...full.trusted, storageKeys: keys }, 'ETH_PROOF_REQUEST');
  const allData = clone(full); allData.proof.storageProof.forEach((item, index) => { item.key = full.trusted.storageKeys[index]; }); check(allData);
  const allQuantity = clone(full); allQuantity.proof.storageProof.forEach((item, index) => { item.key = '0x' + index.toString(16); }); check(allQuantity);
});

test('claimed account fields and storage quantities must equal the authenticated leaf values', () => {
  for (const patch of [{ nonce: '0x2' }, { balance: '0x401' }, { codeHash: zeroHash }, { storageHash: emptyRoot }]) rejects({ ...full.proof, ...patch }, full.trusted, 'ETH_PROOF_CLAIM');
  for (const [index, value] of [[0, '0x2'], [1, '0x0'], [2, '0x1'], [3, '0x1']]) {
    const altered = clone(full.proof); altered.storageProof[index].value = value; rejects(altered, full.trusted, 'ETH_PROOF_CLAIM');
  }
});

test('account absence accepts recognized metadata pairs but never fabricates an account storage root', () => {
  const value = state('absent-account-zero-hash-defaults');
  const result = check(value); assert.equal(result.codeHash, null); assert.equal(result.storageHash, null);
  for (const patch of [{ balance: '0x1' }, { nonce: '0x1' }, { codeHash: emptyCode }, { storageHash: emptyRoot }, { codeHash: flip(zeroHash), storageHash: flip(zeroHash) }]) rejects({ ...value.proof, ...patch }, value.trusted, 'ETH_PROOF_CLAIM');
  const nonzeroSlot = clone(value.proof); nonzeroSlot.storageProof[0].value = '0x1'; rejects(nonzeroSlot, value.trusted, 'ETH_PROOF_STORAGE');
  const inventedTrie = clone(value.proof); inventedTrie.storageProof[0].proof = ['0x80']; rejects(inventedTrie, value.trusted);
  check(state('absent-account-empty-hash-defaults'));
});

test('empty trie proof conventions differ between present empty storage and absent accounts', () => {
  const present = clone(state('present-empty-storage'));
  present.proof.storageProof[0].proof = ['0x80']; check(present);
  present.proof.storageProof[0].proof = []; check(present);
  const emptyState = clone(state('empty-state')); emptyState.proof.accountProof = ['0x80']; check(emptyState);
  emptyState.proof.accountProof = []; check(emptyState);
  emptyState.proof.accountProof = ['0x80', '0x80']; rejects(emptyState.proof, emptyState.trusted);
  const absent = clone(state('absent-account-empty-hash-defaults')); absent.proof.accountProof = []; rejects(absent.proof, absent.trusted, 'ETH_PROOF_MISSING_NODE');
});

test('quantity encoding rejects leading zeros, empty values, nonhex, negatives and overflow', () => {
  const bad = ['0x', '0x00', '0x01', '0x0400', '0x-1', '-0x1', '1', '0X1', '0xA', '0x1\n', '0xg', 1, null, '0x1' + '00'.repeat(32)];
  for (const number of bad) {
    for (const field of ['nonce', 'balance']) rejects({ ...full.proof, [field]: number });
    const altered = clone(full.proof); altered.storageProof[0].value = number; rejects(altered);
  }
  for (const key of ['0x00', '0x01', '0x', '0xA', '0x1\n', '0x' + '00'.repeat(33)]) {
    const altered = clone(full.proof); altered.storageProof[0].key = key; rejects(altered);
  }
});

test('strict DATA lengths and types reject ambiguous roots, addresses, paths and proof bytes', () => {
  for (const root of ['', '0x', '0x0', zeroHash.toUpperCase(), '0x' + '00'.repeat(31), zeroHash + '00', zeroHash + '\n', null]) rejects(full.proof, { ...full.trusted, stateRoot: root });
  for (const address of ['0x', '0x1', '0X' + '00'.repeat(20), '0x' + '00'.repeat(19), '0x' + '00'.repeat(21), full.trusted.address + '\n']) rejects(full.proof, { ...full.trusted, address });
  for (const key of ['0x0', '0x', '0x' + '00'.repeat(31), full.trusted.storageKeys[0] + '\n']) rejects(full.proof, { ...full.trusted, storageKeys: [key] });
  for (const node of ['0x0', '0xGG', full.proof.accountProof[0] + '\n', 0, null]) { const altered = clone(full.proof); altered.accountProof[0] = node; rejects(altered); }
  for (const path of ['0x0', '0X12', '0xAB', '0x' + '00'.repeat(33), null]) assert.throws(() => inspectTrieProof(trie('short-root-leaf').root, path, trie('short-root-leaf').proof), code());
});

test('proof records reject accessors, hidden or inherited fields and symbols without invoking getters', () => {
  let calls = 0;
  const cases = [
    ['proof', full.proof], ['trusted', full.trusted], ['storage', full.proof.storageProof[0]]
  ];
  for (const [which, original] of cases) {
    const bad = [];
    for (const field of Object.keys(original)) { const value = { ...original }; Object.defineProperty(value, field, { enumerable: true, get() { calls += 1; return original[field]; } }); bad.push(value); }
    const hidden = { ...original }; Object.defineProperty(hidden, Object.keys(original)[0], { enumerable: false });
    const missing = { ...original }; delete missing[Object.keys(original)[0]];
    bad.push(hidden, missing, Object.create(original), { ...original, extra: true }, { ...original, [Symbol('extra')]: true }, { ...original, toJSON() { calls += 1; return original; } });
    for (const value of bad) {
      const proof = clone(full.proof), trusted = clone(full.trusted);
      if (which === 'proof') rejects(value, trusted, 'ETH_PROOF_SCHEMA');
      else if (which === 'trusted') rejects(proof, value, 'ETH_PROOF_SCHEMA');
      else { proof.storageProof[0] = value; rejects(proof, trusted, 'ETH_PROOF_SCHEMA'); }
    }
  }
  assert.equal(calls, 0);
});

test('all proof arrays require dense ordinary data entries with no extra properties or getters', () => {
  let calls = 0;
  for (const which of ['account', 'storage', 'nodes', 'keys']) {
    for (const kind of ['hole', 'extra', 'symbol', 'getter']) {
      const proof = clone(full.proof), trusted = clone(full.trusted);
      const array = which === 'account' ? proof.accountProof : which === 'storage' ? proof.storageProof : which === 'nodes' ? proof.storageProof[0].proof : trusted.storageKeys;
      if (kind === 'hole') delete array[0];
      if (kind === 'extra') array.extra = true;
      if (kind === 'symbol') array[Symbol('extra')] = true;
      if (kind === 'getter') Object.defineProperty(array, 0, { enumerable: true, get() { calls += 1; return null; } });
      rejects(proof, trusted, 'ETH_PROOF_SCHEMA');
    }
  }
  assert.equal(calls, 0);
});

test('accepted input can be frozen or null-prototype and output is immutable without changing caller data', () => {
  const value = clone(full);
  value.proof = Object.assign(Object.create(null), value.proof);
  value.trusted = Object.assign(Object.create(null), value.trusted);
  value.proof.storageProof = value.proof.storageProof.map(item => Object.assign(Object.create(null), item));
  function freeze(item) { if (item && typeof item === 'object') { for (const child of Object.values(item)) freeze(child); Object.freeze(item); } return item; }
  freeze(value.proof); freeze(value.trusted); const before = JSON.stringify([value.proof, value.trusted]);
  const result = check(value); assert.equal(JSON.stringify([value.proof, value.trusted]), before);
  assert.deepEqual(check(value), result);
  assert.throws(() => { result.balance = '0x0'; }, TypeError);
  assert.throws(() => { result.storage[0].value = '0x0'; }, TypeError);
  assert.throws(() => result.storage.push({}), TypeError);
});

test('exact API arity and schemas reject serialized text, extra trust claims and unrequested response fields', () => {
  for (const proof of [undefined, null, [], JSON.stringify(full.proof), Buffer.from(JSON.stringify(full.proof))]) rejects(proof, full.trusted, 'ETH_PROOF_SCHEMA');
  assert.throws(() => inspectEthereumStateProof(full.proof), code('ETH_PROOF_SCHEMA'));
  assert.throws(() => inspectEthereumStateProof(full.proof, full.trusted, { latest: true }), code('ETH_PROOF_SCHEMA'));
  assert.throws(() => inspectTrieProof(emptyRoot, '0x'), code('ETH_PROOF_SCHEMA'));
  assert.throws(() => inspectTrieProof(emptyRoot, '0x', [], true), code('ETH_PROOF_SCHEMA'));
  rejects({ ...full.proof, blockHash: zeroHash }, full.trusted, 'ETH_PROOF_SCHEMA');
  rejects(full.proof, { ...full.trusted, finalized: true }, 'ETH_PROOF_SCHEMA');
  const nested = clone(full.proof); nested.storageProof[0].stateRoot = full.trusted.stateRoot; rejects(nested, full.trusted, 'ETH_PROOF_SCHEMA');
});

test('16 requested absent slots are valid while a 17th and oversized witness sets are bounded', () => {
  const value = clone(state('empty-state'));
  value.trusted.storageKeys = Array.from({ length: 16 }, (_, n) => '0x' + n.toString(16).padStart(64, '0'));
  value.proof.storageProof = value.trusted.storageKeys.map(key => ({ key, value: '0x0', proof: [] }));
  value.expected.storage = value.trusted.storageKeys.map(key => ({ key, value: '0x0', exists: false })); check(value);
  const extraKey = '0x' + (16).toString(16).padStart(64, '0'); value.trusted.storageKeys.push(extraKey); value.proof.storageProof.push({ key: extraKey, value: '0x0', proof: [] }); rejects(value.proof, value.trusted, 'ETH_PROOF_LIMIT');
  const many = clone(full.proof); many.accountProof = Array(66).fill('0x80'); rejects(many, full.trusted, 'ETH_PROOF_LIMIT');
  const big = clone(full.proof); big.accountProof = ['0x' + '00'.repeat(1025)]; rejects(big, full.trusted, 'ETH_PROOF_HEX');
  const aggregate = clone(full.proof);
  aggregate.accountProof = Array.from({ length: 65 }, (_, n) => '0xb903fd' + '00'.repeat(1020) + n.toString(16).padStart(2, '0'));
  assert.equal((aggregate.accountProof[0].length - 2) / 2, 1024);
  rejects(aggregate, full.trusted, 'ETH_PROOF_LIMIT');
});

test('deep RLP nesting is rejected before an unbounded structural walk', () => {
  let bytes = '80';
  for (let depth = 0; depth < 34; depth += 1) bytes = (0xc0 + bytes.length / 2).toString(16) + bytes;
  const node = '0x' + bytes;
  // A dynamically calculated root is used only to reach this resource guard.
  // All validity/canonicality expected roots are independent fixed fixtures.
  assert.throws(() => inspectTrieProof(keccak256Hex(node), '0x', [node]), code('ETH_PROOF_LIMIT'));
});

test('RLP item count is bounded across one witness set before path or unused-node checks', () => {
  // Each canonical branch is 50 bytes and contains 50 RLP items: its list,
  // sixteen three-item embedded leaves, and one branch value. Distinct final
  // bytes avoid duplicate witnesses. 41 nodes total 2,050 items and bytes.
  const nodes = Array.from({ length: 41 }, (_, n) => '0xf1' + 'c22001'.repeat(16) + n.toString(16).padStart(2, '0'));
  assert.equal((nodes[0].length - 2) / 2, 50);
  // The dynamic root is only for reaching this resource guard, not an oracle.
  assert.throws(() => inspectTrieProof(keccak256Hex(nodes[0]), '0x', nodes), code('ETH_PROOF_LIMIT'));
});

test('changed proof nodes cannot survive the separately supplied root even when claims stay unchanged', () => {
  for (let index = 0; index < full.proof.accountProof.length; index += 1) {
    const altered = clone(full.proof); altered.accountProof[index] = flip(altered.accountProof[index]); rejects(altered);
  }
  for (const slot of [0, 1, 2, 3]) {
    const altered = clone(full.proof); altered.storageProof[slot].proof[0] = flip(altered.storageProof[slot].proof[0]); rejects(altered);
  }
  const duplicated = clone(full.proof); duplicated.storageProof[0].proof.push(duplicated.storageProof[0].proof[0]); rejects(duplicated, full.trusted, 'ETH_PROOF_DUPLICATE');
  const unused = clone(full.proof); unused.accountProof.push(trie('short-root-leaf').proof[0]); rejects(unused, full.trusted, 'ETH_PROOF_UNUSED');
});

test('matching synthetic roots remain unauthenticated and prove no latest block, NFT owner or live permission', () => {
  const first = check(full), second = check(state('empty-state'));
  assert.notEqual(first.stateRoot, second.stateRoot);
  assert.equal(first.proofVerified, true); assert.equal(second.proofVerified, true);
  for (const result of [first, second]) for (const flag of falseFlags) assert.equal(result[flag], false);
  assert.deepEqual(check(full), first, 'read-only inspection does not consume or establish durable authority');
});
