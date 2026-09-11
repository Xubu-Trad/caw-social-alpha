import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inspectExecutionHeader, inspectExecutionHeaderChain } from '../reference/ethereum-execution-header.mjs';
import { createPaidActionObserver } from '../reference/paid-action-observer.mjs';

// Retained headers are historical evidence, not fresh network observations.
// Synthetic vectors and chains are independently encoded by the Python fixture
// generator; their valid hashes do not make them authentic Ethereum blocks.
const root = new URL('../', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const plain = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => assert.deepEqual(plain(a), plain(b));
function json(path, expectedHash) {
  const bytes = readFileSync(new URL(path, root)); assert.ok(bytes.length < 4 * 1024 * 1024);
  if (expectedHash) assert.equal(sha(bytes), expectedHash);
  return JSON.parse(bytes.toString('utf8'));
}
const fixtures = json('reference/fixtures/execution-header-v1.json');
assert.equal(fixtures.schema, 'caw-execution-header-fixtures/1');
const profiles = ['london-16', 'shanghai-17', 'cancun-20', 'prague-21'];
function vector(name) { const value = fixtures.vectors.find(item => item.name === name); assert.ok(value, name); return value; }
function chain(name) { const value = fixtures.chains.find(item => item.name === name); assert.ok(value, name); return value; }
const london = {
  leftNumber: json('experiments/paid-reorg/history-left-number.json', '9c1a69329dab7a232ffde072d658a02f99497348ec640f3419b1cd6a10ac88e4'),
  leftHash: json('experiments/paid-reorg/history-left-hash.json', 'e63c9f608d5c3b81f90e052c2e3defc6f635684fa0bf62cba89025dab8f970d4'),
  rightNumber: json('experiments/paid-reorg/history-right-number.json', 'bb1571c806a80d4866eeb54f61c1269831acca70f4a4efcb1d3ccc7471834cb2'),
  rightHash: json('experiments/paid-reorg/history-right-hash.json', 'd8aa7517ebeb7356bd176e47bb9442fc9e30afd3ab56cf61d470f5429c18da23')
};
const mainnet = {
  publicnode: json('reference/fixtures/caw-token-publicnode.json', '1563f69bc37a657525fe5ac1dfc125a82d37a58bfe6d70df671ebb0cc475e2d4'),
  drpc: json('reference/fixtures/caw-token-drpc.json', '9a0781dc1d692e4f8ba0e9d9da51064a9bfd5a36c9d17bc34910bf8ed4235e04')
};
const select = (profile, hash) => ({ schema: 'caw-execution-header-selection/1', profile, hash });
const selectChain = (profile, headers) => ({ schema: 'caw-execution-header-chain-selection/1', profile,
  startHash: headers[0].hash, endHash: headers.at(-1).hash });
function rejected(fn, code) { assert.throws(fn, error => error instanceof Error && (!code || error.code === code)); }
function untrusted(result) {
  for (const key of ['endpointAuthenticated', 'consensusVerified', 'bodyCommitmentsVerified',
    'executionVerified', 'finalityVerified', 'freshnessVerified']) assert.equal(result[key], false, key);
}
function single(result, header, profile) {
  assert.equal(result.schema, 'caw-execution-header-integrity/1'); assert.equal(result.profile, profile);
  assert.equal(result.hash, header.hash); assert.equal(result.parentHash, header.parentHash);
  assert.equal(result.number, header.number); assert.equal(result.stateRoot, header.stateRoot);
  assert.equal(result.transactionsRoot, header.transactionsRoot); assert.equal(result.receiptsRoot, header.receiptsRoot);
  assert.equal(result.headerHashVerified, true); assert.equal(result.selectedHashMatched, true); untrusted(result);
}

test('independent fixture sources and Keccak primitive retain their recorded file hashes', () => {
  assert.equal(sha(readFileSync(new URL(fixtures.primitive.path, root))), fixtures.primitive.sha256);
  for (const [path, digest] of Object.entries(fixtures.sources)) assert.equal(sha(readFileSync(new URL(path, root))), digest, path);
  assert.equal(new Set(fixtures.vectors.map(item => item.name)).size, fixtures.vectors.length);
});

for (const profile of profiles) test(profile + ' matches independent RLP and hash at integer encoding boundaries', () => {
  for (const suffix of ['quantity-0', 'quantity-1', 'quantity-127', 'quantity-128', 'quantity-255', 'quantity-256', 'uint256-max']) {
    const value = vector(profile + '-' + suffix);
    const result = inspectExecutionHeader(value.header, value.selection);
    single(result, value.header, profile); assert.equal(result.rlp, value.expected.rlp);
    assert.equal(result.hash, value.expected.hash); assert.equal(value.expected.field_count, Number(profile.split('-')[1]));
    assert.equal(value.synthetic, true);
  }
});

test('retained mainnet Prague header agrees with both source captures and independent full RLP', () => {
  const expectedHash = '0xf3e3dfad2242562dbed62de90831c39eace7c7c6e88f8c509afccef9a5f73e4d';
  const outputs = [];
  for (const provider of ['publicnode', 'drpc']) {
    const source = mainnet[provider], header = source.calls.find(item => item.label === 'block_before').response.result;
    const independent = vector('retained-' + provider + '-prague');
    assert.equal(source.expected_block_hash, expectedHash); assert.equal(independent.synthetic, false);
    const result = inspectExecutionHeader(header, select('prague-21', expectedHash));
    single(result, header, 'prague-21'); assert.equal(result.rlp, independent.expected.rlp); outputs.push(result);
  }
  same(outputs[0], outputs[1]);
});

test('all retained London headers verify and number/hash acquisitions preserve identical header integrity', () => {
  const results = {};
  for (const [name, history] of Object.entries(london)) {
    const headers = [history.start_block, ...history.blocks.map(block => block.header)];
    const result = inspectExecutionHeaderChain(headers, selectChain('london-16', headers));
    assert.equal(result.schema, 'caw-execution-header-chain-integrity/1'); assert.equal(result.headerCount, 16);
    assert.equal(result.parentLinksVerified, true); assert.equal(result.numberSequenceVerified, true); untrusted(result);
    result.headers.forEach((item, index) => single(item, headers[index], 'london-16')); results[name] = result;
  }
  same(results.leftNumber, results.leftHash); same(results.rightNumber, results.rightHash);
  assert.equal(results.leftNumber.startHash, results.rightNumber.startHash);
  assert.notEqual(results.leftNumber.endHash, results.rightNumber.endHash);
});

test('all profile chains match independently generated ordered hashes and RLP bytes', () => {
  for (const profile of profiles) {
    const value = chain(profile + '-three-headers');
    const result = inspectExecutionHeaderChain(value.headers, value.selection);
    assert.equal(result.headerCount, value.expected.header_count);
    same(result.headers.map(item => item.hash), value.expected.hashes);
    same(result.headers.map(item => item.rlp), value.expected.rlps);
    assert.equal(result.parentLinksVerified, true); assert.equal(result.numberSequenceVerified, true); untrusted(result);
  }
});

const baseFields = ['parentHash', 'sha3Uncles', 'miner', 'stateRoot', 'transactionsRoot', 'receiptsRoot',
  'logsBloom', 'difficulty', 'number', 'gasLimit', 'gasUsed', 'timestamp', 'extraData', 'mixHash', 'nonce', 'baseFeePerGas'];
const tailFields = {
  'london-16': [], 'shanghai-17': ['withdrawalsRoot'],
  'cancun-20': ['withdrawalsRoot', 'blobGasUsed', 'excessBlobGas', 'parentBeaconBlockRoot'],
  'prague-21': ['withdrawalsRoot', 'blobGasUsed', 'excessBlobGas', 'parentBeaconBlockRoot', 'requestsHash']
};
const integers = new Set(['difficulty', 'number', 'gasLimit', 'gasUsed', 'timestamp', 'baseFeePerGas', 'blobGasUsed', 'excessBlobGas']);
function changed(value) {
  return value === '0x' ? '0x01' : '0x' + (parseInt(value.slice(2, 4), 16) ^ 1).toString(16).padStart(2, '0') + value.slice(4);
}

test('changing any consensus field while retaining its hash fails, including every fork tail', () => {
  for (const profile of profiles) {
    const source = vector(profile + '-quantity-1');
    for (const field of [...baseFields, ...tailFields[profile]]) {
      const header = clone(source.header);
      header[field] = integers.has(field) ? '0x' + (BigInt(header[field]) + 1n).toString(16) : changed(header[field]);
      assert.notEqual(header[field], source.header[field]);
      rejected(() => inspectExecutionHeader(header, source.selection), 'EXEC_HEADER_HASH_MISMATCH');
    }
  }
});

test('header integrity rejects same-hash extraData tampering accepted by the prior accounting-only observer', () => {
  const history = clone(london.leftNumber), manifest = json('experiments/paid-reorg/manifest-left.json');
  const context = clone(manifest); delete context.end_block_hash;
  const observer = createPaidActionObserver({ schema: 'caw-paid-action-target/1', context,
    calldata: history.blocks[11].transactions[0].transaction.data });
  const header = history.blocks[5].header; assert.notEqual(header.extraData, '0x1234'); header.extraData = '0x1234';
  const token = observer.select(manifest); observer.commit(observer.prepare(token, history));
  assert.equal(observer.state().status, 'observed-accepted');
  rejected(() => inspectExecutionHeader(header, select('london-16', header.hash)), 'EXEC_HEADER_HASH_MISMATCH');
});

test('reported hash and caller-selected hash must both match the recomputed header', () => {
  const source = vector('prague-21-quantity-1'), header = clone(source.header);
  header.hash = changed(header.hash);
  rejected(() => inspectExecutionHeader(header, select(source.profile, header.hash)), 'EXEC_HEADER_HASH_MISMATCH');
  rejected(() => inspectExecutionHeader(source.header, select(source.profile, changed(source.header.hash))), 'EXEC_HEADER_SELECTED_HASH_MISMATCH');
});

test('explicit fork profiles reject missing, null, out-of-profile and unknown fields', () => {
  for (const profile of profiles) {
    const value = vector(profile + '-quantity-1');
    for (const field of [...baseFields, ...tailFields[profile]]) {
      const missing = clone(value.header); delete missing[field]; rejected(() => inspectExecutionHeader(missing, value.selection));
      const nulled = clone(value.header); nulled[field] = null; rejected(() => inspectExecutionHeader(nulled, value.selection));
    }
    const extra = clone(value.header); extra.futureForkField = '0x0'; rejected(() => inspectExecutionHeader(extra, value.selection));
    for (const other of profiles.filter(name => name !== profile)) rejected(() => inspectExecutionHeader(value.header, select(other, value.header.hash)));
  }
  const value = vector('london-16-quantity-1');
  rejected(() => inspectExecutionHeader(value.header, select('auto', value.header.hash)));
  rejected(() => inspectExecutionHeader(value.header, { ...value.selection, profile: 'cancun' }));
});

test('canonical quantities reject leading zeros, missing digits, uppercase, numeric values and overflow', () => {
  const value = vector('prague-21-quantity-1');
  for (const invalid of ['0x00', '0x01', '0x', '0X1', '0xA', '1', '-0x1', 1, '0x1' + '0'.repeat(64)]) {
    const header = clone(value.header); header.number = invalid; rejected(() => inspectExecutionHeader(header, value.selection), 'EXEC_HEADER_QUANTITY');
  }
  for (const field of ['blobGasUsed', 'excessBlobGas']) {
    const header = clone(value.header); header[field] = '0x1' + '0'.repeat(16);
    rejected(() => inspectExecutionHeader(header, value.selection), 'EXEC_HEADER_QUANTITY');
  }
});

test('DATA widths and hex spelling remain strict even for all-zero fields', () => {
  const value = vector('prague-21-quantity-1');
  for (const [field, invalid] of [
    ['parentHash', '0x' + '00'.repeat(31)], ['stateRoot', '0x' + '00'.repeat(33)],
    ['miner', '0x' + '00'.repeat(19)], ['logsBloom', '0x' + '00'.repeat(255)],
    ['nonce', '0x0'], ['nonce', '0x' + '00'.repeat(9)],
    ['extraData', '0x' + '00'.repeat(33)], ['extraData', '0x0'], ['extraData', '0xAB'],
    ['receiptsRoot', '0X' + '00'.repeat(32)]
  ]) {
    const header = clone(value.header); header[field] = invalid;
    rejected(() => inspectExecutionHeader(header, value.selection), 'EXEC_HEADER_DATA');
  }
});

test('changing or removing RPC metadata changes no header hash and proves no body commitment', () => {
  const value = vector('prague-21-quantity-1'), bare = clone(value.header);
  for (const field of ['totalDifficulty', 'size', 'uncles', 'transactions', 'withdrawals']) delete bare[field];
  const altered = clone(bare);
  altered.size = 'unverified-summary'; altered.totalDifficulty = null;
  altered.transactions = ['0x' + '12'.repeat(32)]; altered.uncles = ['0x' + '34'.repeat(32)];
  altered.withdrawals = [{ unverified: true }];
  const a = inspectExecutionHeader(bare, value.selection), b = inspectExecutionHeader(altered, value.selection);
  same(a, b); assert.equal(a.rlp, value.expected.rlp); untrusted(b);
});

test('self-consistent fabricated headers still establish neither endpoint trust nor consensus or finality', () => {
  const value = vector('london-16-quantity-128'); assert.equal(value.synthetic, true);
  const result = inspectExecutionHeader(value.header, value.selection);
  assert.equal(result.hash, value.expected.hash); single(result, value.header, value.profile);
  assert.equal(Object.hasOwn(result, 'trusted'), false); assert.equal(Object.hasOwn(result, 'canonical'), false);
});

test('chain rejection covers omitted, repeated, reversed and branch-mixed headers', () => {
  const value = chain('london-16-three-headers');
  const missing = [value.headers[0], value.headers[2]];
  rejected(() => inspectExecutionHeaderChain(missing, selectChain(value.profile, missing)), 'EXEC_HEADER_PARENT_LINK');
  const repeated = [value.headers[0], value.headers[1], value.headers[1]];
  rejected(() => inspectExecutionHeaderChain(repeated, selectChain(value.profile, repeated)), 'EXEC_HEADER_PARENT_LINK');
  const reverse = [...value.headers].reverse();
  rejected(() => inspectExecutionHeaderChain(reverse, selectChain(value.profile, reverse)), 'EXEC_HEADER_PARENT_LINK');
  const mixed = [london.leftNumber.start_block, ...london.leftNumber.blocks.map(block => block.header)];
  mixed[mixed.length - 1] = london.rightNumber.end_block;
  rejected(() => inspectExecutionHeaderChain(mixed, selectChain('london-16', mixed)), 'EXEC_HEADER_PARENT_LINK');
});

test('individually valid and hash-linked headers still require consecutive block numbers', () => {
  const value = fixtures.invalid_chains.find(item => item.name === 'london-16-linked-number-gap'); assert.ok(value);
  value.headers.forEach(header => single(inspectExecutionHeader(header, select(value.profile, header.hash)), header, value.profile));
  for (let i = 1; i < value.headers.length; i++) assert.equal(value.headers[i].parentHash, value.headers[i - 1].hash);
  rejected(() => inspectExecutionHeaderChain(value.headers, value.selection), 'EXEC_HEADER_NUMBER_SEQUENCE');
});

test('chain endpoint assumptions and a single fixed fork profile are explicit', () => {
  const value = chain('prague-21-three-headers');
  rejected(() => inspectExecutionHeaderChain(value.headers, { ...value.selection, startHash: changed(value.selection.startHash) }), 'EXEC_HEADER_SELECTED_HASH_MISMATCH');
  rejected(() => inspectExecutionHeaderChain(value.headers, { ...value.selection, endHash: changed(value.selection.endHash) }), 'EXEC_HEADER_SELECTED_HASH_MISMATCH');
  rejected(() => inspectExecutionHeaderChain(value.headers, { ...value.selection, profile: 'cancun-20' }));
  const headers = [chain('london-16-three-headers').headers[0], value.headers[1]];
  rejected(() => inspectExecutionHeaderChain(headers, selectChain('london-16', headers)));
});

test('chain length accepts 129 linked headers and rejects empty, singleton and 130-header inputs', () => {
  const value = chain('london-16-boundary-129'), result = inspectExecutionHeaderChain(value.headers, value.selection);
  assert.equal(result.headerCount, 129); same(result.headers.map(item => item.hash), value.expected.hashes); untrusted(result);
  rejected(() => inspectExecutionHeaderChain([], value.selection), 'EXEC_HEADER_CHAIN_LIMIT');
  rejected(() => inspectExecutionHeaderChain(value.headers.slice(0, 1), value.selection), 'EXEC_HEADER_CHAIN_LIMIT');
  rejected(() => inspectExecutionHeaderChain([...value.headers, value.headers.at(-1)], value.selection), 'EXEC_HEADER_CHAIN_LIMIT');
});

test('caller mutation cannot alter immutable single-header or chain results', () => {
  const value = clone(chain('shanghai-17-three-headers'));
  const result = inspectExecutionHeaderChain(value.headers, value.selection), before = plain(result);
  value.headers[0].stateRoot = '0x' + '00'.repeat(32); value.selection.endHash = value.selection.startHash;
  same(result, before); assert.ok(Object.isFrozen(result) && Object.isFrozen(result.headers) && Object.isFrozen(result.headers[0]));
  rejected(() => { result.headers[0].headerHashVerified = false; }); rejected(() => { result.endHash = result.startHash; });
});

test('plain-data boundary refuses hooks, cycles, exotic prototypes, sparse arrays and excessive depth', () => {
  const value = vector('london-16-quantity-1'); let invoked = 0;
  const getter = clone(value.header);
  Object.defineProperty(getter, 'number', { enumerable: true, get() { invoked++; return '0x1'; } });
  rejected(() => inspectExecutionHeader(getter, value.selection)); assert.equal(invoked, 0);
  const hook = clone(value.header); hook.toJSON = () => { invoked++; return value.header; };
  rejected(() => inspectExecutionHeader(hook, value.selection)); assert.equal(invoked, 0);
  const cycle = clone(value.header); cycle.withdrawals = [cycle]; rejected(() => inspectExecutionHeader(cycle, value.selection));
  rejected(() => inspectExecutionHeader(new Date(), value.selection));
  const sparse = clone(value.header); sparse.transactions = new Array(2); rejected(() => inspectExecutionHeader(sparse, value.selection));
  const deep = clone(value.header); deep.withdrawals = []; let cursor = deep.withdrawals;
  for (let i = 0; i < 22; i++) { const next = []; cursor.push(next); cursor = next; }
  rejected(() => inspectExecutionHeader(deep, value.selection), 'EXEC_HEADER_LIMIT');
  const selected = clone(value.selection); Object.defineProperty(selected, 'hash', { enumerable: true, get() { invoked++; return value.header.hash; } });
  rejected(() => inspectExecutionHeader(value.header, selected)); assert.equal(invoked, 0);
});

test('per-header weighted limit rejects excessive unverified RPC metadata', () => {
  const value = vector('london-16-quantity-1'), header = clone(value.header);
  header.transactions = Array.from({ length: 1024 }, () => '0x' + '00'.repeat(32));
  rejected(() => inspectExecutionHeader(header, value.selection), 'EXEC_HEADER_LIMIT');
});

test('aggregate chain node budget rejects individually admissible opaque metadata', () => {
  const value = clone(chain('london-16-boundary-129'));
  for (const header of value.headers) header.withdrawals = Array.from({ length: 1000 }, () => null);
  single(inspectExecutionHeader(value.headers[0], select(value.profile, value.headers[0].hash)), value.headers[0], value.profile);
  rejected(() => inspectExecutionHeaderChain(value.headers, value.selection), 'EXEC_HEADER_LIMIT');
});

// The documented weighted budget charges eight bytes per value plus UTF-8
// strings and object keys. This helper sizes an input; it does not encode RLP.
function weight(value) {
  if (typeof value === 'string') return 8 + Buffer.byteLength(value);
  if (value !== null && typeof value === 'object') {
    return 8 + Object.entries(value).reduce((n, [key, item]) => n + weight(item) + (Array.isArray(value) ? 0 : Buffer.byteLength(key)), 0);
  }
  return 8;
}
test('aggregate chain byte budget rejects headers individually below the 64 KiB cap', () => {
  const value = clone(chain('london-16-boundary-129'));
  for (const header of value.headers) {
    header.size = ''; header.size = '0'.repeat(65050 - weight(header)); assert.equal(weight(header), 65050);
  }
  assert.ok(weight(value.headers) > 8 * 1024 * 1024);
  single(inspectExecutionHeader(value.headers[0], select(value.profile, value.headers[0].hash)), value.headers[0], value.profile);
  rejected(() => inspectExecutionHeaderChain(value.headers, value.selection), 'EXEC_HEADER_LIMIT');
});
