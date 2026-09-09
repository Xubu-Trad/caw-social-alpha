// Tests challenge retained synthetic evidence. They do not execute an EVM,
// establish chain authenticity or manufacture a substitute successful capture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateEvidence, EXPECTED_CASES, BASELINE_SOURCE_SHA256 } from '../reference/paid-adversarial-evidence.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const experiment = path.join(root, 'experiments', 'paid-adversarial');
const evidence = JSON.parse(fs.readFileSync(path.join(experiment, 'execution-trace.json'), 'utf8'));
const inputBytes = new Map(Object.keys(evidence.inputs).map(name => {
  const filename = path.resolve(experiment, name);
  assert.ok(filename.startsWith(path.resolve(root) + path.sep), 'input must remain in the repository');
  return [name, fs.readFileSync(filename)];
}));
const copy = () => structuredClone(evidence);
const validate = value => validateEvidence(value, { inputBytes });
const word = value => BigInt(value).toString(16).padStart(64, '0');

// Update the duplicated raw observation too: these mutations test accounting
// checks beyond merely noticing that a summary differs from its source row.
function editSnapshot(trace, label, side, change) {
  const item = trace.cases.find(c => c.label === label);
  change(item[side]);
  const sourceLabel = label === 'final_current_owner_withdraw' ? 'final_withdraw' : label;
  const call = trace.local_calls.find(c => c.label === sourceLabel + '.' + side);
  call.response.result = '0x' + item[side].map(word).join('');
}
function editReceipt(trace, label, change) {
  const row = trace.transactions.find(x => x.label === label);
  change(row.receipt);
  for (const call of trace.local_calls) {
    if (call.request.method === 'eth_getTransactionReceipt' && call.response.result?.transactionHash === row.receipt.transactionHash) call.response.result = structuredClone(row.receipt);
  }
}

test('retained synthetic execution validates all named cases and the final owner withdrawal', () => {
  const result = validate(evidence);
  assert.equal(result.cases, 72);
  assert.equal(result.successfulPosts, 11);
  assert.equal(result.rejectedCases, 47);
  assert.equal(result.syntheticOnly, true);
  assert.equal(result.authenticatesChain, false);
  assert.equal(result.reexecutesContract, false);
  assert.deepEqual(result.finalSnapshot, evidence.final_snapshot);
  assert.equal(evidence.inputs['../paid-action/CawPaidActionProbe.sol'], BASELINE_SOURCE_SHA256);
});

test('a passing count cannot replace exact case coverage or ordering', () => {
  for (const mutate of [
    x => { x.cases.splice(3, 1); },
    x => { x.cases[3] = structuredClone(x.cases[2]); },
    x => { [x.cases[3], x.cases[4]] = [x.cases[4], x.cases[3]]; },
    x => { x.cases[3].label = 'untested_alternative'; }
  ]) {
    const changed = copy(); mutate(changed);
    assert.throws(() => validate(changed), /exact ordered case coverage/);
  }
  assert.equal(new Set(EXPECTED_CASES.map(c => c.label)).size, 72);
});

test('failed calls cannot consume a nonce or message ID even if duplicated snapshots agree', () => {
  const changed = copy();
  editSnapshot(changed, 'duplicate_other_submitter', 'after', s => { s[4] = String(BigInt(s[4]) + 1n); s[20] = String(BigInt(s[20]) + 1n); });
  assert.throws(() => validate(changed), /exact forty-word transition/);
});

test('one unit of an authorized fee cannot be left with the payer', () => {
  const changed = copy();
  editSnapshot(changed, 'initial_post', 'after', s => { s[2] = String(BigInt(s[2]) + 1n); s[14] = String(BigInt(s[14]) - 1n); });
  assert.throws(() => validate(changed), /exact forty-word transition/);
});

test('extra dust is rejected even when aggregate credit and backing remain consistent', () => {
  const changed = copy();
  editSnapshot(changed, 'initial_post', 'after', s => {
    s[19] = String(BigInt(s[19]) + 1n); s[18] = String(BigInt(s[18]) - 1n); s[8] = String(BigInt(s[8]) - 1n);
  });
  assert.throws(() => validate(changed), /exact forty-word transition/);
});

test('failed ownership callback cannot preserve an NFT transfer or approval consumption', () => {
  const ownership = copy();
  editSnapshot(ownership, 'deposit_ownership_3', 'after', s => {
    s[0] = s[12]; s[1] = '1'; s[35] = '1'; s[36] = '2';
  });
  assert.throws(() => validate(ownership), /exact forty-word transition/);
  const approval = copy();
  editSnapshot(approval, 'deposit_ownership_4', 'after', s => { s[5] = '0'; });
  assert.throws(() => validate(approval), /exact forty-word transition/);
});

test('a rejected synthetic transfer cannot consume token allowance', () => {
  const changed = copy();
  editSnapshot(changed, 'deposit_token_mode_1', 'after', s => { s[26] = String(BigInt(s[26]) - 1n); });
  assert.throws(() => validate(changed), /exact forty-word transition/);
});

test('caught nested calls must record the guard rejection instead of a successful callback', () => {
  const changed = copy();
  editSnapshot(changed, 'deposit_nested_5_caught', 'after', s => { s[32] = '1'; s[33] = '0'; s[34] = '0'; });
  assert.throws(() => validate(changed), /exact forty-word transition/);
});

test('receipt status and failed logs must agree with observed execution', () => {
  const status = copy();
  editReceipt(status, 'deposit_token_mode_1', r => { r.status = '0x1'; });
  assert.throws(() => validate(status), /dry and execution status|case receipt/);
  const logs = copy();
  editReceipt(logs, 'deposit_token_mode_1', r => { r.logs = [structuredClone(evidence.transactions.find(x => x.label === 'initial_post').receipt.logs[0])]; });
  assert.throws(() => validate(logs), /receipt gas\/failed effects/);
});

test('post receipts must retain the exact charge and canonical text', () => {
  const fee = copy();
  editReceipt(fee, 'initial_post', r => {
    const data = r.logs[0].data;
    r.logs[0].data = data.slice(0, 2 + 3 * 64) + word(1) + data.slice(2 + 4 * 64);
  });
  assert.throws(() => validate(fee), /post event signed terms/);
  const text = copy();
  editReceipt(text, 'initial_post', r => {
    const data = r.logs[0].data;
    r.logs[0].data = data.slice(0, 2 + 10 * 64) + '00' + data.slice(2 + 10 * 64 + 2);
  });
  assert.throws(() => validate(text), /post event exact text/);
});

test('unexplained changes between cases cannot be hidden in valid-looking snapshots', () => {
  const changed = copy();
  for (const side of ['before', 'after']) editSnapshot(changed, 'duplicate_other_submitter', side, s => { s[26] = String(BigInt(s[26]) - 1n); });
  assert.throws(() => validate(changed), /state continuity/);
});

test('external acquisition, fork provenance and unauthorized override methods reject', () => {
  for (const mutate of [
    x => { x.upstream_calls.push({ forwarded: true }); },
    x => { x.node.remote_provider = 'https://example.invalid/rpc'; },
    x => { x.node.upstream_forwarded_count = 1; },
    x => { x.historical_caw_execution = true; },
    x => { x.node.token_storage_overridden = true; },
    x => { x.local_calls.find(c => c.request.method === 'anvil_setCode').request.method = 'anvil_setStorageAt'; }
  ]) {
    const changed = copy(); mutate(changed);
    assert.throws(() => validate(changed), /upstream|fork|provenance|local call identity\/scope/);
  }
});

test('a changed baseline contract fails even with a freshly computed self-consistent pin', () => {
  const changed = copy(), bytes = new Map(inputBytes);
  const name = '../paid-action/CawPaidActionProbe.sol';
  bytes.set(name, Buffer.concat([bytes.get(name), Buffer.from('\n// changed\n')]));
  changed.inputs[name] = createHash('sha256').update(bytes.get(name)).digest('hex');
  assert.throws(() => validateEvidence(changed, { inputBytes: bytes }), /unchanged alpha\.20 contract/);
});

test('unmatched raw snapshots and altered evidence input bytes fail closed', () => {
  const changed = copy();
  changed.local_calls.find(c => c.label === 'initial_post.after').response.result = '0x' + '00'.repeat(1280);
  assert.throws(() => validate(changed), /captured snapshot binding/);
  const bytes = new Map(inputBytes);
  bytes.set('../paid-action/CawPaidActionProbe.sol', Buffer.from('different source'));
  assert.throws(() => validateEvidence(evidence, { inputBytes: bytes }), /input pin/);
  const missing = copy();
  delete missing.inputs['PaidAttackFixtures.sol'];
  assert.throws(() => validate(missing), /complete source-input coverage/);
});
