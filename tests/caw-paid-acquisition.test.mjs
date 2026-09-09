import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { reconstruct } from '../reference/paid-action-reader.mjs';
import { validateAcquisitionEvidence } from '../reference/paid-acquisition-evidence.mjs';

// Retained data only. No writer, collector, EVM, Python process or transport is
// imported/executed here. Python outputs were produced separately after stop.
const dir = 'experiments/paid-acquisition/';
const read = name => readFileSync(new URL('../' + dir + name, import.meta.url));
const json = name => JSON.parse(read(name).toString('utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const histories = Object.fromEntries(['number', 'hash'].map(name => [name, json('history-' + name + '.json')]));
const python = Object.fromEntries(['number', 'hash'].map(name => [name, json('reconstruction-python-' + name + '.json')]));
const manifest = json('manifest.json');
const trace = json('execution-trace.json');
const summary = json('execution-summary.json');
const pythonChecks = json('reconstruction-checks.json');
const validate = value => validateAcquisitionEvidence(value, { histories, manifest });
const clone = value => structuredClone(value);
const POST_SELECTOR = '0x62f509b3';
const isPost = envelope => envelope.transaction.data.startsWith(POST_SELECTOR) && envelope.receipt.status === '0x1';
const allTx = history => history.blocks.flatMap(block => block.transactions);

// Synchronize redundant counters/envelopes when corrupting a trace: the desired
// failure must come from missing acquisition evidence, not a stale summary.
function recount(value) {
  value.node.local_request_count = value.rpc.length;
  value.handoff.first_read_only_request_id = value.rpc.findIndex(row => row.label.startsWith('collector.')) + 1;
  const counters = { number: 0, hash: 0 }, methods = { number: {}, hash: {} };
  value.rpc.forEach((row, index) => {
    row.request.id = index + 1; row.response.id = index + 1;
    row.raw_response = JSON.stringify(row.response);
    const match = /^collector\.(number|hash)\./.exec(row.label);
    if (match) {
      const name = match[1], method = row.request.method;
      row.label = 'collector.' + name + '.' + counters[name]++;
      methods[name][method] = (methods[name][method] || 0) + 1;
    }
  });
  for (const name of ['number', 'hash']) {
    value.collectors[name].request_count = counters[name];
    value.collectors[name].acquisition.rpc_calls = counters[name];
    value.collectors[name].acquisition[name === 'number' ? 'rpc_methods' : 'method_counts'] = methods[name];
  }
}
function collectorCalls(value, name) { return value.rpc.filter(row => row.label.startsWith('collector.' + name + '.')); }
function changeResult(row, mutate) { mutate(row.response.result); row.raw_response = JSON.stringify(row.response); }

test('both acquisitions reconstruct identically through the unchanged JavaScript and separately executed Python readers', () => {
  const actual = Object.fromEntries(['number', 'hash'].map(name => [name, reconstruct(histories[name], manifest)]));
  for (const name of ['number', 'hash']) assert.deepEqual(actual[name], python[name]);
  assert.deepEqual(actual.number, actual.hash);
  // The collectors may serialize object keys in different orders. Compare all
  // retained fields, then exact message bytes; JSON key order is not evidence.
  assert.deepEqual(histories.number, histories.hash, 'equal complete history data');
  assert.equal(sha(read('reconstruction-python-number.json')), sha(read('reconstruction-python-hash.json')), 'equal Python output bytes');
  const messages = actual.number.messages;
  assert.deepEqual(messages.map(message => Buffer.from(message.text_hex.slice(2), 'hex').toString('utf8')), [
    'CAW. The record survives the writer.', '\u00e9', 'e\u0301', 'Current owner. Same history.'
  ]);
  assert.equal(messages[1].text_hex, '0xc3a9'); assert.equal(messages[2].text_hex, '0x65cc81');
  assert.notEqual(messages[1].text_hex, messages[2].text_hex);
  assert.deepEqual(actual.number.epochs, ['2', '0', '0']);
  assert.deepEqual(actual.number.nonces, ['4', '0', '0']);
  assert.deepEqual(actual.number.stakes, ['0', '1', '1']);
  assert.deepEqual(actual.number.credits, ['79999999999999999999999', '6666666666666666666674', '13333333333333333333342']);
  assert.equal(actual.number.totalCredits, '100000000000000000000015');
  assert.equal(actual.number.poolDust, '4');
  assert.equal(actual.number.tokenBalance, '100000000000000000000019');
});

test('raw fresh-collector requests bind headers, transactions, receipts, logs, runtimes and endpoint state', () => {
  const result = validate(trace);
  assert.equal(result.number.requests, 67); assert.equal(result.hash.requests, 104);
  assert.equal(result.number.fetchedTransactions, 21); assert.equal(result.hash.fetchedTransactions, 20);
  assert.equal(result.sharedNode, true); assert.equal(result.sharedTransport, true);
  assert.equal(result.independentProviders, false); assert.equal(result.authenticatesChain, false);
  assert.equal(result.reexecutesCollectors, false);
});

test('the publication summary reports exact captured work and leaves provider, consensus and reorg gates open', () => {
  assert.equal(summary.schema, 'caw-paid-acquisition-summary/1'); assert.equal(summary.status, 'pass');
  assert.equal(summary.trace_sha256, sha(read('execution-trace.json')));
  assert.equal(summary.history_blocks, histories.number.blocks.length);
  assert.equal(summary.history_transactions, allTx(histories.number).length);
  assert.equal(summary.reverted_transactions, allTx(histories.number).filter(row => row.receipt.status === '0x0').length);
  assert.equal(summary.accepted_posts, allTx(histories.number).filter(isPost).length);
  assert.equal(summary.local_requests, trace.rpc.length);
  assert.equal(summary.local_transactions, trace.rpc.filter(row => row.request.method === 'eth_sendTransaction').length);
  assert.equal(summary.remote_requests, 0); assert.equal(summary.synthetic_only, true);
  assert.deepEqual(summary.collector_requests, { number: trace.collectors.number.request_count, hash: trace.collectors.hash.request_count });
  assert.deepEqual(summary.config, trace.config); assert.deepEqual(summary.handoff, trace.handoff); assert.deepEqual(summary.final, histories.number.final);
  assert.equal(summary.owned_listener_released, true); assert.equal(summary.same_node, true); assert.equal(summary.shared_transport, true);
  for (const field of ['independent_public_providers', 'consensus_authenticated', 'reorg_recovery_tested', 'paid_action_contract_changed']) assert.equal(summary[field], false);
});

test('the execution pins the original contract and both separately authored acquisition implementations', () => {
  const input = json('experiment-inputs.json');
  assert.equal(input.schema, 'caw-paid-acquisition-inputs/1');
  assert.equal(trace.input_manifest_sha256, sha(read('experiment-inputs.json')));
  for (const [name, expected] of Object.entries(input.files)) assert.equal(sha(read(name)), expected, name);
  assert.equal(input.files['../paid-action/CawPaidActionProbe.sol'], 'e48f8f8f816aae21e0e9865a8be0aa2e47204ea04b4c12b4124e5b0452412da1');
  assert.equal(input.files['../paid-action/TestAccountRegistry.sol'], 'ab3aecb6b0bc77fa838baf1141d2af96ad8395850b714f35b2f0cdb3b8c826df');
  assert.notEqual(input.files['collect_by_number.py'], input.files['collect_by_hash.py']);
});

test('the separately retained Python check reports both positives and the same eight rejected mutations', () => {
  assert.equal(pythonChecks.schema, 'caw-paid-python-reconstruction/1');
  assert.equal(pythonChecks.network_requests, 0);
  assert.equal(pythonChecks.reader_sha256, sha(read('../../reference/paid_action_reader.py')));
  assert.equal(pythonChecks.checker_sha256, sha(read('check_reconstruction.py')));
  const expected = ['complete_history', 'omitted_block', 'missing_post_log', 'duplicate_transaction', 'conflicting_endpoint'];
  assert.equal(pythonChecks.checks.length, 10);
  for (const name of ['number', 'hash']) {
    const rows = pythonChecks.checks.filter(row => row.dataset === name);
    assert.deepEqual(rows.map(row => row.case), expected);
    assert.equal(rows[0].result, 'pass'); assert.equal(rows[0].messages, 4);
    assert.ok(rows.slice(1).every(row => row.result === 'rejected' && typeof row.reason === 'string' && row.reason.length > 0));
  }
});

for (const name of ['number', 'hash']) {
  test(name + ' history rejects an omitted block even when the remaining blocks look valid', () => {
    const h = clone(histories[name]); h.blocks.splice(5, 1);
    assert.throws(() => reconstruct(h, manifest), error => error.code === 'PAID_HISTORY_CONTINUITY');
  });
  test(name + ' history rejects removal of an accepted post log', () => {
    const h = clone(histories[name]); allTx(h).find(isPost).receipt.logs.pop();
    assert.throws(() => reconstruct(h, manifest), error => error.code === 'PAID_HISTORY_MISSING_EVENT');
  });
  test(name + ' history rejects a duplicated transaction', () => {
    const h = clone(histories[name]); h.blocks[0].transactions.push(clone(h.blocks[0].transactions[0]));
    assert.throws(() => reconstruct(h, manifest), error => error.code === 'PAID_HISTORY_TRANSACTIONS');
  });
  test(name + ' history rejects a conflicting endpoint hash', () => {
    const h = clone(histories[name]), m = clone(manifest); m.end_block_hash = '0x' + '11'.repeat(32);
    assert.throws(() => reconstruct(h, m), error => error.code === 'PAID_HISTORY_ENDPOINT');
  });
}

test('two matching history files cannot substitute for a second collection stream', () => {
  const value = clone(trace); value.rpc = value.rpc.filter(row => !row.label.startsWith('collector.hash.')); recount(value);
  assert.throws(() => validate(value), /separate sequential collector phases/);
});

test('missing live receipt reads fail even if IDs and acquisition counters are repaired', () => {
  for (const name of ['number', 'hash']) {
    const value = clone(trace), victim = collectorCalls(value, name).find(row => row.request.method === 'eth_getTransactionReceipt');
    value.rpc = value.rpc.filter(row => row !== victim); recount(value);
    assert.throws(() => validate(value), /required RPC coverage: eth_getTransactionReceipt/);
  }
});

test('hash traversal requires separately fetched transaction bodies', () => {
  const value = clone(trace), victim = collectorCalls(value, 'hash').find(row => row.request.method === 'eth_getTransactionByHash');
  value.rpc = value.rpc.filter(row => row !== victim); recount(value);
  assert.throws(() => validate(value), /independent transaction retrieval order/);
});

test('raw transaction body changes cannot hide behind unchanged receipts and matching saved histories', () => {
  for (const name of ['number', 'hash']) {
    const value = clone(trace), txHash = allTx(histories[name]).find(isPost).receipt.transactionHash;
    const calls = collectorCalls(value, name);
    const row = calls.find(item => name === 'number'
      ? item.request.method === 'eth_getBlockByNumber' && item.request.params[1] === true && item.response.result.transactions.some(tx => tx.hash === txHash)
      : item.request.method === 'eth_getTransactionByHash' && item.request.params[0] === txHash);
    changeResult(row, result => {
      const tx = name === 'number' ? result.transactions.find(tx => tx.hash === txHash) : result;
      tx.input = tx.input.slice(0, -2) + (tx.input.endsWith('00') ? '01' : '00');
    });
    assert.throws(() => validate(value), /transaction\/receipt bytes bound to history/);
  }
});

test('unfiltered getLogs evidence cannot omit an event that its receipt reports', () => {
  for (const name of ['number', 'hash']) {
    const value = clone(trace), row = collectorCalls(value, name).find(item => item.request.method === 'eth_getLogs' && item.response.result.length > 0);
    changeResult(row, logs => { logs.pop(); });
    assert.throws(() => validate(value), /unfiltered log coverage/);
  }
});

test('duplicated logs and conflicting endpoint getter results remain visible in raw evidence', () => {
  const duplicate = clone(trace), logs = collectorCalls(duplicate, 'hash').find(row => row.request.method === 'eth_getLogs' && row.response.result.length > 1);
  changeResult(logs, result => { result[1] = clone(result[0]); });
  assert.throws(() => validate(duplicate), /unfiltered logs disagree/);
  for (const name of ['number', 'hash']) {
    const value = clone(trace), row = collectorCalls(value, name).find(item => item.request.method === 'eth_call');
    row.response.result = row.response.result.slice(0, -2) + 'ff'; row.raw_response = JSON.stringify(row.response);
    assert.throws(() => validate(value), /explicit endpoint state observation/);
  }
});

test('a changed endpoint at the final recheck rejects the acquisition', () => {
  for (const name of ['number', 'hash']) {
    const value = clone(trace), row = collectorCalls(value, name).at(-1);
    changeResult(row, header => { header.hash = '0x' + 'ff'.repeat(32); });
    assert.throws(() => validate(value), /unchanged canonical boundary observations/);
  }
});

test('a post-handoff write or a mismatched raw JSON response is rejected', () => {
  const write = clone(trace), row = collectorCalls(write, 'number').find(item => item.request.method === 'eth_call');
  row.request.method = 'anvil_setBalance'; row.request.params = ['0x00000000000000000000000000000000ca180001', '0x1']; recount(write);
  assert.throws(() => validate(write), /required RPC coverage: eth_call/);
  const raw = clone(trace); raw.rpc.at(-1).raw_response = '{"jsonrpc":"2.0","id":999999,"result":null}';
  assert.throws(() => validate(raw), /raw RPC response binding/);
});
