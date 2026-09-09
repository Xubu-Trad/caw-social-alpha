import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectEthereumStateProof } from '../reference/ethereum-state-proof.mjs';
import { keccak256Hex } from '../reference/keccak256.mjs';

// Historical network observations, replayed offline. No RPC is contacted here.
const captures = ['publicnode', 'drpc'].map(name => JSON.parse(readFileSync(
  new URL(`../reference/fixtures/caw-token-${name}.json`, import.meta.url), 'utf8')));
const token = '0xf3b9569f82b18aef890de263b84189bd33ebe452';
const block = '0x18bc1ea';
const blockHash = '0xf3e3dfad2242562dbed62de90831c39eace7c7c6e88f8c509afccef9a5f73e4d';
const stateRoot = '0x6d530d69c70f41b4b1a57f39751336304ff7c2c5d45e4dcd946869ecce4c0152';
const codeHash = '0x6ee560d3e6b1f881a8711e0be0b30a0e8e0cf8b915ce8f75ea05002126c94256';
const blockTimestamp = '0x6aa0ae57';
const caller = '0x0000000000000000000000000000000000000001';
// Literal ABI words and selectors form a separate request oracle. Do not import
// the capture script or derive these expectations from the saved responses.
const zeroWord = '0000000000000000000000000000000000000000000000000000000000000000';
const oneWord = '0000000000000000000000000000000000000000000000000000000000000001';
const recipientWord = '0000000000000000000000000000000000000000000000000000000000000002';
const deadWord = '000000000000000000000000000000000000000000000000000000000000dead';
const expectedRequests = [
  ['chain', 'eth_chainId', []],
  ['block_before', 'eth_getBlockByNumber', [block, false]],
  ['runtime', 'eth_getCode', [token, block]],
  ['account_proof', 'eth_getProof', [token, [], block]],
  ...[
    ['name', '0x06fdde03'],
    ['symbol', '0x95d89b41'],
    ['decimals', '0x313ce567'],
    ['total_supply', '0x18160ddd'],
    ['caller_balance', '0x70a08231' + oneWord],
    ['caller_self_allowance', '0xdd62ed3e' + oneWord + oneWord],
    ['transfer_zero_to_regular', '0xa9059cbb' + recipientWord + zeroWord],
    ['transfer_zero_to_zero_address', '0xa9059cbb' + zeroWord + zeroWord],
    ['transfer_one_to_zero_address', '0xa9059cbb' + zeroWord + oneWord],
    ['transfer_zero_to_dead', '0xa9059cbb' + deadWord + zeroWord],
    ['transfer_from_zero_to_regular', '0x23b872dd' + oneWord + recipientWord + zeroWord],
    ['transfer_from_zero_to_zero_address', '0x23b872dd' + oneWord + zeroWord + zeroWord],
    ['burn_zero', '0x42966c68' + zeroWord],
  ].map(([label, data]) => [label, 'eth_call', [{ from: caller, to: token, gas: '0x30d40', data }, block]]),
  ['block_after', 'eth_getBlockByNumber', [block, false]],
].map(([label, method, params], index) => ({ label, request: { jsonrpc: '2.0', id: index + 1, method, params } }));
const entry = (capture, label) => {
  const rows = capture.calls.filter(item => item.label === label);
  assert.equal(rows.length, 1, label);
  assert.equal(rows[0].transport_failure, undefined, label);
  return rows[0];
};
const response = (capture, label) => entry(capture, label).response;
const result = (capture, label) => {
  const value = response(capture, label);
  assert.equal(value.error, undefined, label);
  assert.ok(Object.hasOwn(value, 'result'), label);
  return value.result;
};
const trusted = { stateRoot, address: token, storageKeys: [] };
const proof = result(captures[1], 'account_proof');

function abiText(data) {
  assert.match(data, /^0x(?:[0-9a-f]{64}){3,}$/);
  const bytes = Buffer.from(data.slice(2), 'hex');
  assert.equal(BigInt('0x' + bytes.subarray(0, 32).toString('hex')), 32n);
  const length = Number(BigInt('0x' + bytes.subarray(32, 64).toString('hex')));
  assert.equal(bytes.length, 64 + Math.ceil(length / 32) * 32);
  assert.ok(bytes.subarray(64 + length).every(value => value === 0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(64, 64 + length));
}

test('captured CAW observations use one exact chain/block and only read methods', () => {
  assert.deepEqual(captures.map(item => item.provider), ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org']);
  assert.equal(expectedRequests.length, 18);
  for (const capture of captures) {
    assert.equal(capture.schema, 'caw-token-rpc-capture/1');
    assert.equal(capture.transaction_sent, false);
    assert.equal(capture.state_overrides_used, false);
    assert.equal(capture.token, token);
    assert.equal(capture.block_number, block);
    assert.equal(capture.expected_block_hash, blockHash);
    assert.equal(capture.calls.length, 18);
    assert.deepEqual(capture.calls.map(({ label, request }) => ({ label, request })), expectedRequests);
    assert.equal(result(capture, 'chain'), '0x1');
    for (const label of ['block_before', 'block_after']) {
      const header = result(capture, label);
      assert.equal(header.number, block);
      assert.equal(header.hash, blockHash);
      assert.equal(header.stateRoot, stateRoot);
      assert.equal(header.timestamp, blockTimestamp);
      for (const otherCapture of captures) {
        const otherHeader = result(otherCapture, label);
        for (const key of ['number', 'hash', 'stateRoot', 'timestamp']) assert.equal(header[key], otherHeader[key], key);
      }
    }
    for (const item of capture.calls) {
      const { method, params, id } = item.request;
      assert.ok(['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getProof', 'eth_call'].includes(method));
      assert.equal(item.response.id, id);
      assert.equal(item.response.jsonrpc, '2.0');
      if (method === 'eth_call') {
        assert.equal(params.length, 2);
        assert.equal(params[0].to, token);
        assert.equal(params[1], block);
        assert.deepEqual(Object.keys(params[0]).sort(), ['data', 'from', 'gas', 'to']);
      }
    }
  }
});

test('two provider captures agree on runtime and observed ERC20 metadata and controls', () => {
  for (const label of ['runtime', 'name', 'symbol', 'decimals', 'total_supply', 'caller_balance',
    'caller_self_allowance', 'transfer_zero_to_regular', 'transfer_zero_to_dead', 'transfer_from_zero_to_regular']) {
    assert.deepEqual(result(captures[0], label), result(captures[1], label), label);
  }
  assert.equal(abiText(result(captures[0], 'name')), 'A Hunters Dream');
  assert.equal(abiText(result(captures[0], 'symbol')), 'CAW');
  assert.equal(BigInt(result(captures[0], 'decimals')), 18n);
  assert.ok(BigInt(result(captures[0], 'caller_balance')) >= 1n);
  assert.equal(BigInt(result(captures[0], 'caller_self_allowance')), 0n);
});

test('captured live account witness verifies and commits to the exact runtime bytes', () => {
  const checked = inspectEthereumStateProof(proof, trusted);
  assert.equal(checked.proofVerified, true);
  assert.equal(checked.accountExists, true);
  assert.equal(checked.codeHash, codeHash);
  for (const capture of captures) assert.equal(keccak256Hex(result(capture, 'runtime')), codeHash);
  assert.deepEqual(checked.storage, []); // No token metadata/storage-layout proof was requested.
  for (const key of ['rootAuthenticated', 'blockBindingProven', 'finalityProven', 'freshnessProven', 'ownershipProven', 'livePermissionRestored']) {
    assert.equal(checked[key], false, key);
  }
});

test('changed account claim and wrong root fail against the captured live witness', () => {
  const proofFailure = error => typeof error?.code === 'string' && error.code.startsWith('ETH_PROOF_');
  assert.throws(() => inspectEthereumStateProof({ ...proof, nonce: '0x2' }, trusted), proofFailure);
  assert.throws(() => inspectEthereumStateProof(proof, { ...trusted, stateRoot: '0x' + '00'.repeat(32) }), proofFailure);
  assert.throws(() => inspectEthereumStateProof({ ...proof, accountProof: proof.accountProof.slice(1) }, trusted), proofFailure);
});

test('captured zero-destination failures preserve ABI reasons and successful zero-amount controls', () => {
  for (const capture of captures) {
    for (const label of ['transfer_zero_to_regular', 'transfer_zero_to_dead', 'transfer_from_zero_to_regular']) {
      assert.equal(result(capture, label), '0x' + '0'.repeat(63) + '1');
    }
    for (const label of ['transfer_zero_to_zero_address', 'transfer_one_to_zero_address', 'transfer_from_zero_to_zero_address']) {
      const observed = response(capture, label);
      assert.equal(observed.result, undefined);
      assert.equal(observed.error.code, 3);
      assert.equal(observed.error.data.slice(0, 10), '0x08c379a0');
      assert.equal(abiText('0x' + observed.error.data.slice(10)), 'ERC20: transfer to the zero address');
    }
  }
});

test('failed proof acquisition and burn selector probe stay explicit failures', () => {
  assert.equal(response(captures[0], 'account_proof').result, undefined);
  assert.match(response(captures[0], 'account_proof').error.message, /proof window/);
  for (const capture of captures) {
    assert.equal(response(capture, 'burn_zero').result, undefined);
    assert.equal(response(capture, 'burn_zero').error.code, 3);
  }
  // Reverting this selector does not establish that every possible burn path is absent.
});
