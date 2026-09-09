import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { reconstruct } from '../reference/paid-action-reader.mjs';

// Retained local experiment only. These tests never import or execute a runner,
// compiler, Python reader, wallet library or live transport.
const dir = 'experiments/paid-action/';
const read = path => readFileSync(new URL('../' + path, import.meta.url));
const json = path => JSON.parse(read(path).toString('utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const history = json(dir + 'history.json');
const manifest = json(dir + 'manifest.json');
const summary = json(dir + 'execution-summary.json');
const trace = json(dir + 'execution-trace.json');
const python = json(dir + 'reconstruction-python.json');
const build = json(dir + 'paid-build.json');
const F = 5000000000000000000000n;
const A = '0x765d03fe39e2a0a48ac162a15b541c3cd1d63e76';
const B = '0x47ecac8221f18970c48cf48aaa3cbe8167bbbe73';
const D = '0x00000000000000000000000000000000ca180001';
const FUND = '0x000000000000000000000000000000000000dead';
const WALLET = '0xad702df8c76b1fa4f5d6d89da9f756431648a1a3';
const TOKEN = '0xf3b9569f82b18aef890de263b84189bd33ebe452';
const REG = '0xd2e60639eb3432223eb8dc42e3b5c99382609700';
const PROBE = '0x0ea9c71d0826ba32deba626f10a10905b87bb476';
const POST = '0x62f509b3';
const WORD = /^0x[0-9a-f]{64}$/;
const word = value => BigInt(value).toString(16).padStart(64, '0');
const uint = value => '0x' + word(value);
const hex = text => '0x' + Buffer.from(text, 'utf8').toString('hex');
const clone = value => structuredClone(value);
const ERRORS = {
  no_pool: '0xf8c3dd08', underfunded: '0x8ac4bc73', locked_withdraw: '0x8ac4bc73', duplicate_other_relayer: '0x756688fe',
  wrong_chain: '0x8baa579f', wrong_contract: '0x8baa579f', wrong_fee: '0x8baa579f', wrong_profile: '0x8baa579f', wrong_owner: '0x8baa579f',
  changed_text: '0x8baa579f', high_s: '0x8baa579f', expired: '0x392334ed', stale_pool: '0x826243be',
  unicode_421: '0x7a2a029c', overlong: '0x7a2a029c', surrogate: '0x7a2a029c', empty: '0x7a2a029c',
  old_epoch_away: '0x68549ea1', old_epoch_return: '0x68549ea1', wallet_wrong_magic: '0x8baa579f', wallet_revert: '0x8baa579f', wallet_short: '0x8baa579f'
};
const LABELS = [
  'deploy_TestAccountRegistry', 'deploy_CawPaidActionProbe', 'approve_a', 'approve_b', 'deposit_1', 'deposit_2', 'deposit_3',
  'no_pool', 'stake_2', 'stake_3', 'underfunded', 'locked_withdraw', 'first_relayer', 'duplicate_other_relayer', 'payer_stakes',
  'wrong_chain', 'wrong_contract', 'wrong_fee', 'wrong_profile', 'wrong_owner', 'changed_text', 'high_s', 'expired', 'stake_change', 'stale_pool', 'unstake_restore',
  'unicode_419', 'unicode_420', 'unicode_421', 'overlong', 'surrogate', 'empty', 'composed', 'decomposed',
  'away', 'old_epoch_away', 'new_owner', 'return', 'old_epoch_return', 'after_return_direct', 'payer_unstakes', 'withdraw_without_stake',
  'deploy_TestSignatureOwner', 'contract_owner_transfer', 'wallet_wrong_magic.mode', 'wallet_wrong_magic', 'wallet_revert.mode', 'wallet_revert',
  'wallet_short.mode', 'wallet_short', 'wallet_valid.mode', 'wallet_valid', 'wallet_trailing.mode', 'wallet_trailing'
];
const POSTS = [
  ['first_relayer', 'CAW. Proof travels with the words.', A, 0],
  ['unicode_419', '\u00e9'.repeat(419), A, 0],
  ['unicode_420', '\u{1f600}'.repeat(420), A, 0],
  ['composed', '\u00e9', A, 0],
  ['decomposed', 'e\u0301', A, 0],
  ['new_owner', 'Authority follows the account.', B, 1],
  ['after_return_direct', 'Current owner. Current epoch.', A, 2],
  ['wallet_valid', 'Contract owner. Exact signed intent.', WALLET, 3],
  ['wallet_trailing', 'Contract owner. Exact signed intent.', WALLET, 3]
];
const INPUTS = {
  'CawPaidActionProbe.sol': 'e48f8f8f816aae21e0e9865a8be0aa2e47204ea04b4c12b4124e5b0452412da1',
  'TestAccountRegistry.sol': 'ab3aecb6b0bc77fa838baf1141d2af96ad8395850b714f35b2f0cdb3b8c826df',
  'TestSignatureOwner.sol': '310ca51c58305113070d06b6e2f7637dde550b0ed5141cdbb3c56bd02a8f3342',
  'paid-build.json': '54f130a1f49e8569cbe7b9a6db54547f8e1e9275d9c0c256b5d916b01a59c54e',
  'compile-standard.json': '72543224575c3c49532cca983863c5eba3429e319765d9864365409cc2d0e1fe',
  'run_paid_action.py': '92b50402f8ad097839ec4e40e7e221647c89c8b9d0b3c915c4ce2400531130bf',
  'paid_node.py': 'ecd540dfd3414b28cbb9d085254cc2be3de42ea7f13033afb40b72c6884a4160',
  '../../reference/fixtures/generate-ethereum-proof-fixtures.py': '5f100b6e1a12d29b0004bcb29f2ba5b23ffefc076646d2b67b1fb8df81c2effa'
};
const byLabel = new Map(summary.transactions.map(row => [row.label, row]));
const rawLabels = new Map(trace.local_calls.map(row => [row.label, row]));
const allTransactions = history.blocks.flatMap(block => block.transactions);
const byHash = new Map(allTransactions.map(row => [row.receipt.transactionHash, row]));
const traceByLabel = new Map(trace.transactions.map(row => [row.label, row]));
function item(label) { const value = byLabel.get(label); assert.ok(value, label); return value; }
function captured(label) { const value = byHash.get(item(label).transactionHash); assert.ok(value, label); return value; }
function rpc(label) { const value = rawLabels.get(label); assert.ok(value, label); return value; }
function rpcResult(label) { const row = rpc(label); assert.equal(row.response.error, undefined, label); return row.response.result; }
function postBytes(label, h = history) {
  const hash = item(label).transactionHash;
  return h.blocks.flatMap(block => block.transactions).find(row => row.receipt.transactionHash === hash).transaction;
}
function eventFor(label, h = history) {
  const row = h.blocks.flatMap(block => block.transactions).find(value => value.receipt.transactionHash === item(label).transactionHash);
  const result = row.receipt.logs.find(log => log.address === PROBE && log.topics.length === 4); assert.ok(result, label); return result;
}
function requestParts(transaction) {
  assert.equal(transaction.data.slice(0, 10), POST);
  const bytes = Buffer.from(transaction.data.slice(10), 'hex');
  const u = offset => BigInt('0x' + bytes.subarray(offset, offset + 32).toString('hex'));
  assert.equal(u(0), 64n); assert.equal(u(256), 224n);
  const textLength = Number(u(288)), signatureOffset = Number(u(32)), signatureLength = Number(u(signatureOffset));
  return { account: u(64), epoch: u(96), nonce: u(128), validAfter: u(160), deadline: u(192),
    text: '0x' + bytes.subarray(320, 320 + textLength).toString('hex'),
    signature: bytes.subarray(signatureOffset + 32, signatureOffset + 32 + signatureLength), signatureOffset, bytes };
}
function checkObservedState(label, state) {
  for (let id = 1; id <= 3; id++) {
    assert.equal(rpcResult(label + '.auth' + id), uint(state.owners[id - 1]) + word(state.epochs[id - 1]));
    for (const field of ['credits', 'stakes', 'nonces']) assert.equal(rpcResult(label + '.' + field + id), uint(state[field][id - 1]));
  }
  for (const field of ['totalCredits', 'poolDust', 'messageCount']) assert.equal(rpcResult(label + '.' + field), uint(state[field]));
  assert.equal(rpcResult(label + '.balance'), uint(state.tokenBalance));
}
function prefix(label, after) {
  const index = history.blocks.findIndex(block => block.transactions.some(tx => tx.receipt.transactionHash === item(label).transactionHash));
  assert.ok(index > 1);
  const h = clone(history); h.blocks = h.blocks.slice(0, index + (after ? 1 : 0)); h.end_block = clone(h.blocks.at(-1).header);
  h.final = clone(item(label)[after ? 'after' : 'before']);
  return reconstruct(h, { ...manifest, end_block_hash: h.end_block.hash });
}
function rejectMutation(mutator, expectedCode) {
  const h = clone(history), m = clone(manifest); mutator(h, m);
  assert.throws(() => reconstruct(h, m), error => expectedCode ? error?.code === expectedCode : /^PAID_HISTORY_/.test(error?.code));
}

test('the second reader agrees with the separately executed Python reconstruction and literal final accounting', () => {
  const actual = reconstruct(history, manifest); assert.deepEqual(actual, python);
  assert.deepEqual(actual.owners, [WALLET, A, B]); assert.deepEqual(actual.epochs, ['3', '0', '0']); assert.deepEqual(actual.stakes, ['0', '1', '2']);
  assert.deepEqual(actual.nonces, ['9', '0', '0']); assert.equal(actual.messageCount, '9'); assert.equal(actual.poolDust, '9');
  assert.deepEqual(actual.credits, [String(16n * F - 1n), String(10n + 9n * (F / 3n)), String(10n + 9n * (2n * F / 3n))]);
  assert.equal(actual.totalCredits, String(25n * F + 10n)); assert.equal(actual.tokenBalance, String(25n * F + 19n));
  assert.equal(actual.credits.reduce((sum, value) => sum + BigInt(value), 0n) + BigInt(actual.poolDust), BigInt(actual.tokenBalance));
  assert.ok(Object.isFrozen(actual) && Object.isFrozen(actual.messages) && actual.messages.every(Object.isFrozen));
});

test('all 54 history transactions match literal outcomes and the retained raw requests and receipts', () => {
  assert.equal(summary.schema, 'caw-paid-execution-summary/1'); assert.equal(summary.complete, true);
  assert.deepEqual(summary.transactions.map(row => row.label), LABELS); assert.equal(byLabel.size, 54); assert.equal(byHash.size, 54);
  assert.equal(allTransactions.length, 54); assert.equal(Object.keys(ERRORS).length, 22);
  assert.deepEqual(allTransactions.map(row => row.receipt.transactionHash), summary.transactions.map(row => row.transactionHash));
  assert.deepEqual(trace.transactions.map(row => row.label), ['fund_a', 'fund_b', ...LABELS]);
  assert.equal(rawLabels.size, trace.local_calls.length);
  for (const row of trace.local_calls) {
    assert.deepEqual(JSON.parse(row.raw_response), row.response); assert.equal(row.response.id, row.request.id); assert.equal(row.response.jsonrpc, '2.0');
  }
  for (const label of LABELS) {
    const row = item(label), recorded = captured(label), raw = traceByLabel.get(label), expectedError = ERRORS[label] ?? null;
    assert.equal(row.status, expectedError === null ? '0x1' : '0x0', label); assert.equal(row.errorData, expectedError, label);
    assert.equal(recorded.receipt.status, row.status); assert.deepEqual(recorded.receipt, raw.receipt);
    assert.deepEqual(recorded.transaction, { ...raw.transaction, to: raw.transaction.to ?? null });
    assert.equal(recorded.transaction.gas, '0x3d0900'); assert.equal(recorded.transaction.gasPrice, '0x174876e800'); assert.equal(recorded.transaction.value, '0x0');
    const dry = rpc(label + '.dry'); assert.deepEqual(dry.response, raw.dry_response); assert.equal(dry.request.method, 'eth_call'); assert.deepEqual(dry.request.params, [raw.transaction, 'latest']);
    const sent = rpc(label + '.send'); assert.equal(sent.request.method, 'eth_sendTransaction'); assert.deepEqual(sent.request.params, [raw.transaction]); assert.equal(sent.response.result, row.transactionHash);
    const receiptPrefix = label + '.receipt';
    const receipts = trace.local_calls.filter(call => call.label.startsWith(receiptPrefix) && /^[0-9]$/.test(call.label.slice(receiptPrefix.length)));
    assert.ok(receipts.length >= 1 && receipts.length <= 10); receipts.forEach((call, i) => {
      assert.equal(call.label, label + '.receipt' + i); assert.equal(call.request.method, 'eth_getTransactionReceipt'); assert.deepEqual(call.request.params, [row.transactionHash]);
    });
    assert.deepEqual(receipts.at(-1).response.result, recorded.receipt);
    if (expectedError !== null) { assert.equal(dry.response.error.code, 3); assert.equal(dry.response.error.data, expectedError); assert.deepEqual(recorded.receipt.logs, []); }
    else assert.equal(dry.response.error, undefined);
    if (row.before) {
      assert.deepEqual(row.before, raw.before); assert.deepEqual(row.after, raw.after);
      checkObservedState(label + '.before', row.before); checkObservedState(label + '.after', row.after);
      // Summary endpoints are claims: reconstruction recomputes each prefix and
      // rejects them if they disagree with its preceding events.
      prefix(label, false); prefix(label, true);
      if (expectedError !== null) assert.deepEqual(row.before, row.after, label + ' rollback');
    }
  }
});

test('nine accepted messages debit the fixed fee once and preserve the exact payer-excluded shares', () => {
  const actual = reconstruct(history, manifest);
  assert.equal(actual.messages.length, POSTS.length);
  for (const [index, [label, text, owner, epoch]] of POSTS.entries()) {
    const message = actual.messages[index], row = item(label);
    assert.equal(message.id, String(index + 1)); assert.equal(message.accountId, '1'); assert.equal(message.owner, owner);
    assert.equal(message.epoch, String(epoch)); assert.equal(message.nonce, String(index)); assert.equal(message.text_hex, hex(text));
    assert.equal(message.fee, String(F)); assert.deepEqual(message.allocations, ['0', String(F / 3n), String(2n * F / 3n)]); assert.equal(message.dust, '1');
    assert.equal(BigInt(row.before.credits[0]) - BigInt(row.after.credits[0]), F);
    assert.equal(BigInt(row.after.credits[1]) - BigInt(row.before.credits[1]), F / 3n);
    assert.equal(BigInt(row.after.credits[2]) - BigInt(row.before.credits[2]), 2n * F / 3n);
    assert.equal(BigInt(row.after.poolDust) - BigInt(row.before.poolDust), 1n); assert.equal(row.after.tokenBalance, row.before.tokenBalance);
    assert.equal(BigInt(row.after.totalCredits), BigInt(row.before.totalCredits) - 1n);
  }
  assert.equal(item('first_relayer').before.stakes[0], '0');
  assert.equal(item('unicode_419').before.stakes[0], '3');
  assert.equal(item('wallet_valid').before.stakes[0], '0');
});

test('the executed binding, replay, expiry and transfer failures leave the recorded state unchanged', () => {
  for (const label of ['wrong_chain', 'wrong_contract', 'wrong_fee', 'wrong_profile']) {
    const signed = trace.intents.find(intent => intent.label === label); assert.ok(signed); assert.notEqual(signed.digest, rpcResult(label + '.contract_digest'));
  }
  assert.equal(trace.intents.find(intent => intent.label === 'wrong_owner').signer, B);
  assert.deepEqual(captured('duplicate_other_relayer').transaction.data, captured('first_relayer').transaction.data);
  assert.equal(captured('first_relayer').transaction.from, D); assert.equal(captured('duplicate_other_relayer').transaction.from, B);
  assert.equal(requestParts(captured('changed_text').transaction).text, hex('Changed bytes'));
  assert.equal(trace.intents.find(intent => intent.label === 'changed_text').request.text, hex('Original bytes'));
  const high = requestParts(captured('high_s').transaction).signature;
  assert.equal(high.length, 65); assert.ok(BigInt('0x' + high.subarray(32, 64).toString('hex')) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n);
  const expired = captured('expired'), request = requestParts(expired.transaction);
  assert.ok(BigInt(history.blocks.find(block => block.header.hash === expired.receipt.blockHash).header.timestamp) >= request.deadline);
  assert.equal(item('stale_pool').before.stakes[2], '3');
  for (const [label, epoch, owner] of [['old_epoch_away', '1', B], ['old_epoch_return', '2', A]]) {
    assert.equal(requestParts(captured(label).transaction).epoch, 0n); assert.equal(item(label).before.epochs[0], epoch); assert.equal(item(label).before.owners[0], owner);
    assert.deepEqual(item(label).after, item(label).before); assert.equal(item(label).errorData, '0x68549ea1');
  }
});

test('UTF-8 limits count scalars while composed and decomposed text retain unequal exact bytes', () => {
  const valid419 = requestParts(captured('unicode_419').transaction).text;
  const valid420 = requestParts(captured('unicode_420').transaction).text;
  assert.equal(valid419, hex('\u00e9'.repeat(419))); assert.equal(valid420, hex('\u{1f600}'.repeat(420)));
  assert.equal([...Buffer.from(valid419.slice(2), 'hex').toString('utf8')].length, 419); assert.equal((valid420.length - 2) / 2, 1680);
  for (const [label, bytes] of [['unicode_421', hex('a'.repeat(421))], ['overlong', '0xc0af'], ['surrogate', '0xeda080'], ['empty', '0x']]) {
    assert.equal(requestParts(captured(label).transaction).text, bytes); assert.equal(item(label).errorData, '0x7a2a029c');
  }
  const composed = POSTS[3][1], decomposed = POSTS[4][1];
  assert.notEqual(hex(composed), hex(decomposed)); assert.equal(composed.normalize('NFC'), decomposed.normalize('NFC'));
  assert.equal(reconstruct(history, manifest).messages[3].text_hex, '0xc3a9'); assert.equal(reconstruct(history, manifest).messages[4].text_hex, '0x65cc81');
});

test('the contract-owner fixture rejects bad ERC1271 returns and accepts the two recorded valid modes', () => {
  const fixture = trace.deployments.find(deployment => deployment.name === 'TestSignatureOwner'); assert.equal(fixture.address, WALLET);
  for (const [label, mode, status] of [['wallet_wrong_magic', 1, '0x0'], ['wallet_revert', 2, '0x0'], ['wallet_short', 3, '0x0'], ['wallet_valid', 0, '0x1'], ['wallet_trailing', 4, '0x1']]) {
    const configured = captured(label + '.mode'); assert.equal(configured.transaction.to, WALLET); assert.equal(configured.transaction.data.slice(-64), word(mode)); assert.deepEqual(configured.receipt.logs, []);
    assert.equal(item(label).status, status); assert.equal(captured(label).transaction.from, D); assert.equal(captured(label).transaction.to, PROBE);
    assert.equal(item(label).before.owners[0], WALLET); assert.equal(item(label).before.epochs[0], '3');
  }
  assert.equal(item('wallet_valid').before.nonces[0], '7'); assert.equal(item('wallet_trailing').after.nonces[0], '9');
});

test('omitted blocks, receipts or logs and mismatched code or endpoint trust are rejected', () => {
  rejectMutation(h => h.blocks.splice(5, 1), 'PAID_HISTORY_CONTINUITY');
  rejectMutation(h => { h.blocks[2].transactions = []; }, 'PAID_HISTORY_TRANSACTIONS');
  rejectMutation(h => { h.blocks.find(block => block.transactions[0].receipt.transactionHash === item('deposit_1').transactionHash).transactions[0].receipt.logs.pop(); });
  rejectMutation((h, m) => { m.end_block_hash = h.start_block.hash; }, 'PAID_HISTORY_ENDPOINT');
  rejectMutation((h, m) => { m.probe_runtime_sha256 = '00'.repeat(32); }, 'PAID_HISTORY_RUNTIME');
  rejectMutation(h => { h.chain_id = 1; }, 'PAID_HISTORY_CONTEXT');
  rejectMutation(h => { h.addresses.probe = D; }, 'PAID_HISTORY_CONTEXT');
  rejectMutation(h => { h.blocks[4].header.parentHash = h.start_block.hash; }, 'PAID_HISTORY_CONTINUITY');
});

test('receipt timestamp forms, approval-clear ordering and constructor tails retain their separate consistency checks', () => {
  const h = clone(history);
  for (const block of h.blocks) for (const row of block.transactions) row.receipt.blockTimestamp = block.header.timestamp;
  assert.deepEqual(reconstruct(h, manifest), reconstruct(history, manifest));
  for (const bad of [-1, -0, 1.5, Number.MAX_SAFE_INTEGER + 1, '0x01', '0x20000000000000']) {
    rejectMutation(value => { value.blocks[0].transactions[0].receipt.blockTimestamp = bad; });
  }
  rejectMutation(value => { value.blocks[0].transactions[0].receipt.blockTimestamp = 0; }, 'PAID_HISTORY_RECEIPT');
  rejectMutation(value => { value.blocks[0].transactions[0].receipt.logs[0].blockTimestamp = Number(BigInt(value.blocks[0].header.timestamp)); }, 'PAID_HISTORY_QUANTITY');
  for (const reorder of [false, true]) rejectMutation(value => {
    const row = value.blocks.flatMap(block => block.transactions).find(tx => tx.receipt.transactionHash === item('away').transactionHash);
    assert.equal(row.receipt.logs.length, 2);
    if (reorder) row.receipt.logs.reverse(); else row.receipt.logs.shift();
    row.receipt.logs.forEach((entry, index) => { entry.logIndex = '0x' + index.toString(16); });
  }, 'PAID_HISTORY_APPROVAL_CLEAR');
  rejectMutation(value => { const tx = postBytes('deploy_TestAccountRegistry', value); tx.data = tx.data.slice(0, -128) + word(B) + tx.data.slice(-64); }, 'PAID_HISTORY_CONSTRUCTOR');
  rejectMutation(value => { const tx = postBytes('deploy_CawPaidActionProbe', value); tx.data = tx.data.slice(0, -128) + word(D) + tx.data.slice(-64); }, 'PAID_HISTORY_CONSTRUCTOR');
  rejectMutation(value => { const tx = postBytes('deploy_CawPaidActionProbe', value); tx.data = tx.data.slice(0, -64) + word(0); }, 'PAID_HISTORY_CONSTRUCTOR');
});

test('changed message bytes, event allocations, nonces and claimed final balances are rejected', () => {
  rejectMutation(h => { const e = eventFor('first_relayer', h); e.data = e.data.slice(0, 642) + '44' + e.data.slice(644); }, 'PAID_HISTORY_CALLDATA');
  rejectMutation(h => { const e = eventFor('first_relayer', h); const start = 2 + 160 * 2; e.data = e.data.slice(0, start) + word(1) + e.data.slice(start + 64); }, 'PAID_HISTORY_ALLOCATION');
  rejectMutation(h => { const tx = postBytes('first_relayer', h); const start = 10 + 128 * 2; tx.data = tx.data.slice(0, start) + word(1) + tx.data.slice(start + 64); }, 'PAID_HISTORY_CALLDATA');
  rejectMutation(h => { h.final.credits[0] = String(BigInt(h.final.credits[0]) + 1n); }, 'PAID_HISTORY_FINAL');
  rejectMutation(h => { const e = eventFor('first_relayer', h); e.removed = true; }, 'PAID_HISTORY_LOG_POSITION');
  let called = false; const h = clone(history);
  Object.defineProperty(h.final, 'credits', { enumerable: true, get() { called = true; return []; } });
  assert.throws(() => reconstruct(h, manifest), error => error.code === 'PAID_HISTORY_SCHEMA'); assert.equal(called, false);
});

test('signature-only edits remain outside this reader rather than being misrepresented as authenticated', () => {
  const h = clone(history), tx = postBytes('wallet_valid', h), parsed = requestParts(tx);
  parsed.bytes[parsed.signatureOffset + 32] ^= 1;
  tx.data = POST + parsed.bytes.toString('hex');
  // This accepted reconstruction is not contract acceptance. The reader does
  // not verify signatures or recompute transaction hashes/receipt-trie roots.
  assert.deepEqual(reconstruct(h, manifest), reconstruct(history, manifest));
});

test('retained sources and raw evidence agree with the reviewed execution pins and local-only scope', () => {
  assert.deepEqual(json(dir + 'experiment-inputs.json').files, INPUTS); assert.deepEqual(trace.inputs, INPUTS);
  for (const [name, digest] of Object.entries(INPUTS)) assert.equal(sha(read(dir + name)), digest, name);
  assert.equal(summary.history_sha256, sha(read(dir + 'history.json'))); assert.equal(summary.trace_sha256, sha(read(dir + 'execution-trace.json')));
  assert.deepEqual(trace.manifest, manifest); assert.deepEqual(trace.history.final, history.final);
  assert.equal(build.compiler, '0.8.10+commit.fc410830');
  const compiler = json(dir + 'compile-standard.json');
  for (const name of ['CawPaidActionProbe.sol', 'TestAccountRegistry.sol', 'TestSignatureOwner.sol']) assert.equal(compiler.sources[name].content, read(dir + name).toString('utf8'));
  assert.equal(trace.complete, true); assert.equal(trace.real_wallet_used, false); assert.equal(trace.public_transaction_broadcast, false); assert.equal(trace.registration_implemented, false);
  assert.equal(summary.registration_implemented, false); assert.equal(summary.external_peer_review, false); assert.equal(trace.funding_authority_is_impersonated, true);
  assert.deepEqual(summary.node, trace.node); assert.equal(trace.node.stop_reason, null); assert.equal(trace.node.mode, 'fork'); assert.equal(trace.node.local_chain_id, 31337);
  assert.equal(trace.node.token_code_replaced, false); assert.equal(trace.node.token_storage_overridden, false); assert.equal(trace.node.local_transaction_attempts, 56);
  assert.equal(trace.node.local_request_count, trace.local_calls.length); assert.equal(trace.node.upstream_forwarded_count, trace.upstream_calls.filter(row => row.forwarded).length);
  assert.deepEqual(summary.funding.map(row => row.label), ['fund_a', 'fund_b']);
  for (const [i, label] of ['fund_a', 'fund_b'].entries()) {
    const funding = traceByLabel.get(label); assert.equal(funding.transaction.from, FUND); assert.equal(funding.transaction.to, TOKEN); assert.equal(funding.receipt.status, '0x1');
    assert.equal(funding.transaction.data, '0xa9059cbb' + word(i === 0 ? A : B) + word(40n * F)); assert.equal(byHash.has(funding.receipt.transactionHash), false);
  }
  for (const actor of [A, B]) assert.equal(rpcResult('empty_signer.' + actor), '0x');
  assert.ok(trace.node.overrides.every(row => ['anvil_setBalance', 'anvil_impersonateAccount'].includes(row.method)));
});

test('the earlier known-key code failure remains a failed observation, not an EOA or delegation success', () => {
  const earlier = json(dir + 'known-account-failure.json');
  assert.equal(earlier.schema, 'caw-paid-known-account-failure/1'); assert.equal(earlier.complete_paid_action, false);
  const code = earlier.historical_code_read;
  assert.equal(code.request.method, 'eth_getCode'); assert.equal(code.request.params[0], '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf');
  assert.deepEqual(code.request.params[1], { blockHash: '0xf3e3dfad2242562dbed62de90831c39eace7c7c6e88f8c509afccef9a5f73e4d', requireCanonical: false });
  assert.equal(code.response.result, '0xef01008a67b5020ee254ef48e3b6a04927f39baf7e408a');
  assert.deepEqual(JSON.parse(code.raw_response), code.response); assert.deepEqual(JSON.parse(earlier.rejection.raw_response), earlier.rejection.response);
  assert.equal(earlier.contract_digest_read.response.result, earlier.intent.digest); assert.equal(earlier.rejection.response.error.data, '0x8baa579f');
  assert.equal(earlier.rejection.request.method, 'eth_call'); assert.notEqual(earlier.intent.signer, A);
});
