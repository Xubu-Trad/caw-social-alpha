// Offline consistency checks for plain JSON retained from two local collectors.
// This does not make a network request, execute either collector or authenticate
// a chain. A consistent fabricated capture can pass: runtime/checkpoint pins and
// the shared process, transport and synthetic node remain supplied trust.
import { isDeepStrictEqual as equal } from 'node:util';
import { keccak256Hex } from './keccak256.mjs';
import { reconstruct } from './paid-action-reader.mjs';

const OBSERVER = '0x00000000000000000000000000000000ca180001';
const need = (condition, message) => { if (!condition) throw new Error('Acquisition evidence rejected: ' + message); };
const word = value => BigInt(value).toString(16).padStart(64, '0');
const selector = signature => keccak256Hex('0x' + Buffer.from(signature, 'ascii').toString('hex')).slice(0, 10);
const LOG_FIELDS = ['address', 'topics', 'data', 'blockHash', 'blockNumber', 'transactionHash', 'transactionIndex', 'logIndex', 'removed'];
const MANIFEST_FIELDS = ['chain_id', 'addresses', 'registry_runtime_sha256', 'probe_runtime_sha256', 'start_block_hash', 'end_block_hash'];
const pick = (value, fields) => Object.fromEntries(fields.map(field => [field, value[field]]));
const logProjection = log => pick(log, LOG_FIELDS);
const txProjection = tx => ({ from: tx.from, to: tx.to, data: tx.input, gas: tx.gas, gasPrice: tx.gasPrice, value: tx.value });
const fullHeader = block => ({ ...block, transactions: block.transactions.map(tx => tx.hash) });

function validateCollector(trace, name, history, manifest) {
  const supplied = trace.collectors[name], calls = trace.rpc.filter(row => row.label.startsWith('collector.' + name + '.'));
  need(supplied && equal(supplied.history, history) && equal(supplied.manifest, manifest), name + ': retained history/manifest binding');
  need(calls.length > 0 && calls.length === supplied.request_count && calls.length === supplied.acquisition.rpc_calls, name + ': request count');
  const output = reconstruct(history, manifest);
  const seen = new Set();
  function find(method, params, count = 1) {
    const matches = calls.filter(row => row.request.method === method && equal(row.request.params, params));
    need(matches.length === count, name + ': required RPC coverage: ' + method);
    matches.forEach(row => {
      need(!seen.has(row), name + ': ambiguous RPC coverage');
      seen.add(row);
    });
    return matches;
  }
  function result(method, params) { return find(method, params)[0].response.result; }
  const start = history.start_block, end = history.end_block;
  const tag = end.number;
  const anchors = [start, end];
  const chainCalls = find('eth_chainId', [], name === 'number' ? 2 : 1);
  need(chainCalls.every(row => row.response.result === '0x7a69') && calls[0] === chainCalls[0], name + ': explicit chain identity');
  const before = [], after = [];
  for (const anchor of anchors) {
    const rows = find('eth_getBlockByNumber', [anchor.number, false], 2);
    need(rows.every(row => equal(row.response.result, anchor)), name + ': unchanged canonical boundary observations');
    before.push(rows[0]); after.push(rows[1]);
  }
  need(calls[1] === before[0] && calls[2] === before[1] && calls.at(-2) === after[0] && calls.at(-1) === after[1], name + ': boundary checks surround acquisition');
  if (name === 'number') need(calls.at(-3) === chainCalls[1], name + ': chain identity recheck');

  const expectedHeaders = [start, ...history.blocks.map(block => block.header)];
  const requiredLogs = [];
  let fetchedTransactions = 0;
  function transaction(raw, header, index, expected) {
    need(raw && raw.hash === header.transactions[index] && raw.blockHash === header.hash && raw.blockNumber === header.number && BigInt(raw.transactionIndex) === BigInt(index), name + ': raw transaction identity');
    const normalized = txProjection(raw);
    const receipt = result('eth_getTransactionReceipt', [raw.hash]);
    need(receipt && receipt.transactionHash === raw.hash && receipt.blockHash === header.hash && receipt.blockNumber === header.number && BigInt(receipt.transactionIndex) === BigInt(index), name + ': raw receipt identity');
    need(receipt.from === normalized.from && receipt.to === normalized.to && Array.isArray(receipt.logs), name + ': receipt actors/logs');
    if (expected) need(equal(normalized, expected.transaction) && equal(receipt, expected.receipt), name + ': transaction/receipt bytes bound to history');
    fetchedTransactions++;
    return receipt.logs.map(log => {
      need(log.blockHash === header.hash && log.blockNumber === header.number && log.transactionHash === raw.hash && log.transactionIndex === receipt.transactionIndex && log.removed === false, name + ': receipt log identity');
      return logProjection(log);
    });
  }
  function logsMatch(observed, expected, label) {
    need(Array.isArray(observed) && observed.length === expected.length, name + ': unfiltered log coverage: ' + label);
    const projected = observed.map(log => {
      const header = expectedHeaders.find(value => value.hash === log.blockHash);
      need(header && (log.blockTimestamp === undefined || log.blockTimestamp === header.timestamp), name + ': log block timestamp');
      return logProjection(log);
    });
    // Numeric range responses are ordered; block-hash responses may be reordered
    // by the provider. Preserve receipt order and reject duplicate log positions.
    if (name === 'hash') projected.sort((a, b) => Number(BigInt(a.logIndex) - BigInt(b.logIndex)));
    need(equal(projected, expected), name + ': unfiltered logs disagree with receipt logs: ' + label);
  }
  if (name === 'number') {
    need(supplied.acquisition.strategy === 'forward-number-full-transactions', name + ': strategy');
    const full = calls.filter(row => row.request.method === 'eth_getBlockByNumber' && row.request.params[1] === true);
    need(equal(full.map(row => row.request.params), expectedHeaders.map(header => [header.number, true])), name + ': complete forward numeric traversal');
    for (const [offset, header] of expectedHeaders.entries()) {
      const observed = result('eth_getBlockByNumber', [header.number, true]);
      need(observed && Array.isArray(observed.transactions) && equal(fullHeader(observed), header), name + ': full block bytes bound to header');
      for (const [index, raw] of observed.transactions.entries()) {
        requiredLogs.push(...transaction(raw, header, index, offset === 0 ? null : history.blocks[offset - 1].transactions[index]));
      }
    }
    logsMatch(result('eth_getLogs', [{ fromBlock: start.number, toBlock: end.number }]), requiredLogs, 'numeric interval including checkpoint');
    need(supplied.acquisition.writer_capture_used === false && supplied.acquisition.other_collector_used === false && supplied.acquisition.independent_provider === false && supplied.acquisition.authenticates_consensus === false, name + ': limited independence claim');
  } else {
    need(supplied.acquisition.strategy === 'backward-parent-hash', name + ': strategy');
    const descending = calls.filter(row => row.request.method === 'eth_getBlockByHash');
    const expected = [...expectedHeaders].reverse();
    need(equal(descending.map(row => row.request.params), expected.map(header => [header.hash, false])), name + ': complete backward parent traversal');
    for (const header of expected) need(equal(result('eth_getBlockByHash', [header.hash, false]), header), name + ': hash block bytes bound to header');
    const queriedTransactions = calls.filter(row => row.request.method === 'eth_getTransactionByHash');
    const expectedTransactions = [...history.blocks].reverse().flatMap(block => block.header.transactions);
    need(equal(queriedTransactions.map(row => row.request.params[0]), expectedTransactions), name + ': independent transaction retrieval order');
    for (const block of [...history.blocks].reverse()) {
      const logs = [];
      for (const [index, txHash] of block.header.transactions.entries()) {
        logs.push(...transaction(result('eth_getTransactionByHash', [txHash]), block.header, index, block.transactions[index]));
      }
      requiredLogs.push(...logs);
      logsMatch(result('eth_getLogs', [{ blockHash: block.header.hash }]), logs, block.header.hash);
    }
    need(supplied.acquisition.used_writer_or_saved_capture === false && supplied.acquisition.independent_provider_established === false && supplied.acquisition.authenticates_chain === false, name + ': limited independence claim');
  }
  for (const part of ['registry', 'probe']) need(result('eth_getCode', [history.addresses[part], tag]) === history[part + '_runtime'], name + ': endpoint runtime bytes');
  function getter(target, signature, args, expected) {
    const tx = { from: OBSERVER, to: target, data: selector(signature) + args.map(word).join(''), gas: '0x3d0900', gasPrice: '0x174876e800', value: '0x0' };
    need(result('eth_call', [tx, tag]) === '0x' + expected.map(word).join(''), name + ': explicit endpoint state observation: ' + signature);
  }
  for (let i = 0; i < 3; i++) {
    getter(history.addresses.registry, 'authority(uint256)', [i + 1], [output.owners[i], output.epochs[i]]);
    for (const field of ['credits', 'stakes', 'nonces']) getter(history.addresses.probe, field + '(uint256)', [i + 1], [output[field][i]]);
  }
  for (const field of ['totalCredits', 'poolDust', 'messageCount']) getter(history.addresses.probe, field + '()', [], [output[field]]);
  getter(history.addresses.token, 'balanceOf(address)', [history.addresses.probe], [output.tokenBalance]);
  need(seen.size === calls.length, name + ': unexplained acquisition RPC');
  const methods = {};
  for (const row of calls) methods[row.request.method] = (methods[row.request.method] || 0) + 1;
  need(equal(methods, supplied.acquisition[name === 'number' ? 'rpc_methods' : 'method_counts']), name + ': RPC method counts');
  return { requests: calls.length, fetchedTransactions, receiptLogsCompared: requiredLogs.length, output };
}

/** Validate supplied plain JSON evidence only. Neither labels nor matching
 * hashes establish that requests were sent or results came from honest nodes. */
export function validateAcquisitionEvidence(trace, { histories, manifest }) {
  need(trace && trace.schema === 'caw-paid-acquisition-run/1' && trace.status === 'pass', 'completed run schema');
  need(trace.node?.schema === 'caw-local-node/1' && trace.node.mode === 'synthetic' && trace.node.host === '127.0.0.1' && trace.node.port === 18545 && trace.node.local_chain_id === 31337, 'one local synthetic node');
  need(trace.node.remote_provider === null && trace.node.fork_block === null && trace.node.proxy_request_count === 0 && trace.node.upstream_forwarded_count === 0 && trace.node.transaction_broadcast === false && trace.node.wallet_used === false, 'no remote provider or real wallet');
  need(trace.owned_listener_released === true && trace.node.stop_reason === null, 'owned listener cleanup');
  need(trace.handoff?.writer_deleted === true && trace.handoff.writer_trace_read_by_collectors === false && trace.handoff.frontend_started === false && trace.handoff.indexer_started === false && trace.handoff.writes_sealed === true && trace.handoff.write_refused === true, 'declared write/read handoff');
  need(equal(pick(trace.config, MANIFEST_FIELDS), manifest), 'supplied checkpoint/runtime manifest');
  need(Number.isSafeInteger(trace.config.start_block_number) && Number.isSafeInteger(trace.config.end_block_number) && trace.config.start_block_number >= 0 && trace.config.end_block_number > trace.config.start_block_number && trace.config.end_block_number - trace.config.start_block_number <= 128, 'bounded interval');
  for (const name of ['number', 'hash']) {
    need(BigInt(histories[name].start_block.number) === BigInt(trace.config.start_block_number) && BigInt(histories[name].end_block.number) === BigInt(trace.config.end_block_number), name + ': checkpoint numbers');
  }
  need(Array.isArray(trace.rpc) && trace.rpc.length <= 1800 && trace.rpc.length === trace.node.local_request_count, 'bounded complete RPC trace');
  const first = trace.handoff.first_read_only_request_id;
  need(Number.isSafeInteger(first) && first > 1 && first <= trace.rpc.length, 'handoff request boundary');
  const readPhases = [];
  for (const [index, row] of trace.rpc.entries()) {
    need(row.request?.jsonrpc === '2.0' && row.request.id === index + 1 && row.response?.jsonrpc === '2.0' && row.response.id === row.request.id, 'RPC request/response identity');
    need(typeof row.raw_response === 'string' && Buffer.byteLength(row.raw_response, 'utf8') <= 1024 * 1024 && equal(JSON.parse(row.raw_response), row.response) && row.transport_error === undefined, 'raw RPC response binding');
    const collector = /^collector\.(number|hash)\.([0-9]+)$/.exec(row.label);
    if (row.request.id < first) need(!collector, 'collector cannot borrow writer observations');
    else {
      need(collector && Object.hasOwn(row.response, 'result') && !Object.hasOwn(row.response, 'error'), 'post-handoff read-only collector response');
      readPhases.push(collector[1]);
    }
  }
  need(readPhases.includes('number') && readPhases.includes('hash') && !readPhases.slice(readPhases.indexOf('hash')).includes('number'), 'separate sequential collector phases');
  const number = validateCollector(trace, 'number', histories.number, manifest);
  const hash = validateCollector(trace, 'hash', histories.hash, manifest);
  need(equal(histories.number, histories.hash) && equal(number.output, hash.output), 'collector agreement');
  return { number, hash, sharedNode: true, sharedTransport: true, independentProviders: false, authenticatesChain: false, reexecutesCollectors: false };
}
