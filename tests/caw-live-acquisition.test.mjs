import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual as equal } from 'node:util';
import { reconstruct } from '../reference/paid-action-reader.mjs';
import { keccak256Hex } from '../reference/keccak256.mjs';

// Offline checks of a retained local run. No node, Python, RPC, wallet or
// controller is executed here. Consistent recorded evidence is not consensus
// authentication, proof of a new execution, or independent-provider agreement.
const root = new URL('../', import.meta.url);
const dir = 'experiments/paid-live-acquisition/';
const need = (condition, code) => { if (!condition) throw new Error('Live acquisition evidence rejected: ' + code); };
const same = (a, b, code) => need(equal(a, b), code);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const traceDigest = 'c34445ecbec280a5144cbff064c39e7d7816407755ae81384f30e7bdd2499555';
function read(path) {
  if (path !== dir + 'execution-trace.json') return readFileSync(new URL(path, root));
  const compressed = readFileSync(new URL(path + '.gz', root));
  need(compressed.length > 0 && compressed.length <= 4 * 1024 * 1024, 'GZIP_INPUT_BOUND');
  const decoded = gunzipSync(compressed, { maxOutputLength: 4 * 1024 * 1024 });
  need(sha(decoded) === traceDigest, 'DECODED_TRACE_PIN');
  return decoded;
}
function json(path, maximum = 8 * 1024 * 1024) {
  const raw = read(path); need(raw.length <= maximum, 'FILE_BOUND'); return JSON.parse(raw.toString('utf8'));
}
const trace = json(dir + 'execution-trace.json');
const summary = json(dir + 'execution-summary.json', 16384);
const inputs = json(dir + 'experiment-inputs.json', 16384);
const oldOracle = Object.fromEntries(['left', 'right'].map(branch => [branch,
  json('experiments/paid-reorg/reconstruction-python-' + branch + '-number.json', 16384)]));
const oldChecks = json('experiments/paid-reorg/reconstruction-checks.json', 32768);
const fields = ['owners', 'epochs', 'credits', 'stakes', 'nonces', 'totalCredits', 'poolDust', 'messageCount', 'tokenBalance'];
const manifestFields = ['chain_id', 'addresses', 'registry_runtime_sha256', 'probe_runtime_sha256', 'start_block_hash', 'end_block_hash'];
const logFields = ['address', 'topics', 'data', 'blockHash', 'blockNumber', 'transactionHash', 'transactionIndex', 'logIndex', 'removed'];
const pick = (obj, keys) => Object.fromEntries(keys.map(key => [key, obj[key]]));
const quantity = n => '0x' + BigInt(n).toString(16);
const word = n => BigInt(n).toString(16).padStart(64, '0');
const selector = signature => keccak256Hex('0x' + Buffer.from(signature, 'ascii').toString('hex')).slice(0, 10);
const observer = '0x00000000000000000000000000000000ca180001';
const integer = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const profile = [
  { name: 'stable-left', branch: 'left', counts: [60, 87], calls: 147, error: null, ready: true },
  { name: 'interrupted-left', branch: 'left', counts: [60, 84], calls: 144, error: 'ACQUISITION_SESSION_FINAL_BOUNDARY', ready: false },
  { name: 'fresh-right', branch: 'right', counts: [60, 87], calls: 147, error: null, ready: true }
];
const scope = {
  replay_only: false, controlled_local_request_boundary: true, concurrent_inflight_rpc: false,
  independent_providers: false, authenticates_consensus: false
};

// All retained RPC results in this synthetic profile are ASCII JSON with safe
// integers. Sorted compact JSON gives the coordinator's response byte count;
// rejecting a different profile avoids silently approximating Python encoding.
function encoded(value) {
  let count = 0;
  function visit(item, depth) {
    need(++count <= 50000 && depth <= 20, 'RESULT_TREE_BOUND');
    if (item === null || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') { need(Number.isSafeInteger(item), 'RESULT_INTEGER'); return String(item); }
    if (typeof item === 'string') { need(item.length <= 131072 && /^[\x00-\x7e]*$/.test(item), 'RESULT_ASCII'); return JSON.stringify(item); }
    if (Array.isArray(item)) { need(item.length <= 4096, 'RESULT_ARRAY'); return '[' + item.map(v => visit(v, depth + 1)).join(',') + ']'; }
    need(item && Object.getPrototypeOf(item) === Object.prototype, 'RESULT_OBJECT');
    const keys = Object.keys(item).sort(); need(keys.length <= 128, 'RESULT_KEYS');
    return '{' + keys.map(k => visit(k, depth + 1) + ':' + visit(item[k], depth + 1)).join(',') + '}';
  }
  return visit(value, 0);
}

function getterSpecs(addresses, state, tag) {
  const found = [];
  function add(suffix, target, signature, args, values) {
    found.push({ suffix, method: 'eth_call', params: [{ from: observer, to: target,
      data: selector(signature) + args.map(word).join(''), gas: '0x3d0900', gasPrice: '0x174876e800', value: '0x0' }, tag],
    result: '0x' + values.map(word).join('') });
  }
  for (let i = 0; i < 3; i++) {
    add('auth' + (i + 1), addresses.registry, 'authority(uint256)', [i + 1], [state.owners[i], state.epochs[i]]);
    for (const field of ['credits', 'stakes', 'nonces']) add(field + (i + 1), addresses.probe, field + '(uint256)', [i + 1], [state[field][i]]);
  }
  for (const field of ['totalCredits', 'poolDust', 'messageCount']) add(field, addresses.probe, field + '()', [], [state[field]]);
  add('balance', addresses.token, 'balanceOf(address)', [addresses.probe], [state.tokenBalance]);
  return found;
}

// Consume every contributed request by its global ID. A reused descriptive
// label cannot supply a missing read or substitute a prior attempt's response.
function checkCollector(calls, history, strategy) {
  let at = 0;
  function take(method, params) {
    const row = calls[at++]; need(row && row.request.method === method, 'COLLECTOR_METHOD');
    same(row.request.params, params, 'COLLECTOR_PARAMETERS');
    need(Object.hasOwn(row.response, 'result') && !Object.hasOwn(row.response, 'error'), 'COLLECTOR_RESPONSE');
    return row.response.result;
  }
  function expect(method, params, result) { same(take(method, params), result, 'COLLECTOR_RESULT'); }
  function boundaries(chain) {
    if (chain) expect('eth_chainId', [], quantity(history.chain_id));
    for (const h of [history.start_block, history.end_block]) expect('eth_getBlockByNumber', [h.number, false], h);
  }
  function normalized(tx, header, index) {
    need(tx.hash === header.transactions[index] && tx.blockHash === header.hash
      && tx.blockNumber === header.number && BigInt(tx.transactionIndex) === BigInt(index), 'TRANSACTION_INCLUSION');
    return { from: tx.from, to: tx.to, data: tx.input, gas: tx.gas, gasPrice: tx.gasPrice, value: tx.value };
  }
  function logs(entries, headers) {
    need(Array.isArray(entries) && entries.length <= 1024, 'LOG_BOUND');
    return entries.map(log => {
      const h = headers.find(item => item.hash === log.blockHash);
      need(h && log.blockNumber === h.number && log.removed === false, 'LOG_BLOCK');
      if (Object.hasOwn(log, 'blockTimestamp')) need(BigInt(log.blockTimestamp) === BigInt(h.timestamp), 'LOG_TIMESTAMP');
      return pick(log, logFields);
    });
  }
  function receipts(header, rawTransactions, expected) {
    let cumulative = 0n;
    const entries = header.transactions.map((hash, i) => {
      const tx = normalized(rawTransactions[i], header, i);
      const receipt = take('eth_getTransactionReceipt', [hash]);
      need(receipt.transactionHash === hash && receipt.blockHash === header.hash && receipt.blockNumber === header.number
        && BigInt(receipt.transactionIndex) === BigInt(i), 'RECEIPT_INCLUSION');
      need(receipt.from === tx.from && receipt.to === tx.to, 'RECEIPT_ACTORS');
      const gas = BigInt(receipt.gasUsed); cumulative += gas;
      need(gas > 0n && gas <= BigInt(tx.gas) && gas <= 4000000n
        && BigInt(receipt.cumulativeGasUsed) === cumulative, 'RECEIPT_GAS');
      return { transaction: tx, receipt };
    });
    need(cumulative === BigInt(header.gasUsed), 'COMPLETE_BLOCK_GAS');
    if (expected) same(entries, expected, 'COMPLETE_TRANSACTION_RECEIPT_BYTES');
    return entries.flatMap(entry => entry.receipt.logs);
  }
  boundaries(true);
  const headers = [history.start_block, ...history.blocks.map(block => block.header)];
  if (strategy === 'number') {
    const allLogs = [];
    for (const [i, header] of headers.entries()) {
      const full = take('eth_getBlockByNumber', [header.number, true]);
      need(Array.isArray(full?.transactions) && full.transactions.length <= 128, 'FULL_BLOCK');
      same({ ...full, transactions: full.transactions.map(tx => tx.hash) }, header, 'FULL_HEADER_BYTES');
      allLogs.push(...receipts(header, full.transactions, i ? history.blocks[i - 1].transactions : null));
    }
    const queried = take('eth_getLogs', [{ fromBlock: history.start_block.number, toBlock: history.end_block.number }]);
    same(logs(queried, headers), logs(allLogs, headers), 'UNFILTERED_INTERVAL_LOGS');
  } else {
    for (const header of [...headers].reverse()) expect('eth_getBlockByHash', [header.hash, false], header);
    for (const block of [...history.blocks].reverse()) {
      // This fixed experiment has one transaction per included block, so each
      // independent lookup and receipt pair is consumed in actual RPC order.
      need(block.header.transactions.length === 1, 'FIXTURE_SINGLE_TRANSACTION_BLOCK');
      const tx = take('eth_getTransactionByHash', [block.header.transactions[0]]);
      const receiptLogs = receipts(block.header, [tx], block.transactions);
      const queried = take('eth_getLogs', [{ blockHash: block.header.hash }]);
      need(Array.isArray(queried), 'BLOCK_LOGS');
      const ordered = [...queried].sort((a, b) => Number(BigInt(a.logIndex) - BigInt(b.logIndex)));
      same(logs(ordered, [block.header]), logs(receiptLogs, [block.header]), 'UNFILTERED_BLOCK_LOGS');
    }
  }
  for (const name of ['registry', 'probe']) expect('eth_getCode', [history.addresses[name], history.end_block.number], history[name + '_runtime']);
  for (const getter of getterSpecs(history.addresses, history.final, history.end_block.number)) expect(getter.method, getter.params, getter.result);
  boundaries(strategy === 'number');
  need(at === calls.length, 'COLLECTOR_COMPLETE_NO_EXTRA_CALLS');
}

function validateLive(value) {
  need(value?.schema === 'caw-paid-live-acquisition/1' && value.status === 'pass', 'COMPLETED_RUN');
  same(pick(value, Object.keys(scope)), scope, 'EXPERIMENT_SCOPE');
  need(value.selected_branch === 'right' && value.selection_policy === 'explicit local fixture checkpoint', 'EXPLICIT_SELECTION');
  const node = value.node;
  need(node?.schema === 'caw-local-node/1' && node.mode === 'synthetic' && node.local_chain_id === 31337
    && node.host === '127.0.0.1' && node.port === 18545 && node.hardfork === 'london'
    && node.remote_provider === null && node.proxy_request_count === 0 && node.upstream_forwarded_count === 0
    && node.wallet_used === false && node.transaction_broadcast === false && node.local_impersonation_is_ownership_proof === false, 'LOCAL_SCOPE');
  need(node.stop_reason === null && value.owned_listener_released === true
    && value.source_pins_unchanged_after_run === true && value.closed_right_lease_refused_before_transport === true, 'RUN_CLEANUP');
  need(Array.isArray(value.rpc) && value.rpc.length > 0 && value.rpc.length <= 1800
    && value.rpc.length === node.local_request_count, 'RPC_BOUND');
  const byId = new Map();
  for (const [i, row] of value.rpc.entries()) {
    need(row.request?.jsonrpc === '2.0' && row.request.id === i + 1
      && row.response?.jsonrpc === '2.0' && row.response.id === row.request.id, 'RPC_IDENTITY');
    need(typeof row.raw_response === 'string' && Buffer.byteLength(row.raw_response) <= 1024 * 1024
      && row.transport_error === undefined, 'RAW_RESPONSE_BOUND');
    same(JSON.parse(row.raw_response), row.response, 'RAW_RESPONSE_BINDING');
    byId.set(row.request.id, row);
  }
  const rowFor = id => { need(integer(id, value.rpc.length) && id > 0 && byId.has(id), 'REQUEST_ID'); return byId.get(id); };
  const signatures = row => ({ method: row.request.method, params: row.request.params, result: row.response.result });
  const branches = value.branches;
  same(Object.keys(branches).sort(), ['left', 'right'], 'TWO_PUBLISHED_BRANCHES');
  for (const [branch, capture] of Object.entries(branches)) {
    const h = capture.history;
    need(h?.schema === 'caw-paid-history/1' && Array.isArray(h.blocks) && h.blocks.length === 15, 'FIXED_HISTORY_BOUND');
    same(pick(capture.config, manifestFields), capture.manifest, 'SUPPLIED_MANIFEST');
    need(h.chain_id === capture.config.chain_id && h.start_block.hash === capture.config.start_block_hash
      && h.end_block.hash === capture.config.end_block_hash
      && BigInt(h.start_block.number) === BigInt(capture.config.start_block_number)
      && BigInt(h.end_block.number) === BigInt(capture.config.end_block_number), 'SUPPLIED_ENDPOINTS');
    same(h.addresses, capture.config.addresses, 'DEPLOYMENT');
    same(h.end_block, h.blocks.at(-1).header, 'COMPLETE_END_HEADER');
    for (const name of ['registry', 'probe']) need(sha(Buffer.from(h[name + '_runtime'].slice(2), 'hex')) === capture.manifest[name + '_runtime_sha256'], 'RUNTIME_PIN');
    same(pick(capture.result, fields), h.final, 'PUBLISHED_ACCOUNTING');
    same(capture.result, oldOracle[branch], 'RETAINED_ARITHMETIC_ORACLE');
    need(capture.independent_providers === false && capture.authenticates_consensus === false && capture.request_count === 147, 'PUBLICATION_SCOPE');
  }
  const left = branches.left.history, right = branches.right.history;
  need(left.end_block.number === right.end_block.number && left.end_block.hash !== right.end_block.hash, 'SAME_HEIGHT_DISTINCT_BRANCHES');
  same(left.blocks.slice(0, 10), right.blocks.slice(0, 10), 'COMPLETE_COMMON_PREFIX');
  same(left.blocks[9].header, value.ancestor.header, 'ANCESTOR_AT_BRANCH_POINT');
  for (const h of [left, right]) need(h.blocks.slice(10).every(block => block.transactions.length === 1), 'FIVE_BRANCH_TRANSACTIONS');
  same(value.right_config, branches.right.config, 'RIGHT_SELECTION');
  same(value.right_end, right.end_block, 'RIGHT_TIP');
  same(value.ancestor.state, pick(oldChecks.ancestor_oracle, fields), 'ANCESTOR_ARITHMETIC');

  need(Array.isArray(value.attempts) && value.attempts.length === 3, 'THREE_ATTEMPTS');
  const used = new Set(), groups = [], byteCounts = [];
  let cumulative = 0, responseBytes = 0;
  for (const [i, attempt] of value.attempts.entries()) {
    const spec = profile[i], config = branches[spec.branch].config;
    need(attempt.name === spec.name && attempt.error === spec.error, 'ATTEMPT_OUTCOME');
    same(attempt.selection, config, 'ATTEMPT_SELECTION');
    const before = attempt.before, after = attempt.after;
    for (const state of [before, after]) need(state?.schema === 'caw-paid-acquisition-session/1'
      && state.generation === i + 1 && state.busy === false, 'SERIAL_GENERATION');
    same(before.selected, config, 'BEFORE_SELECTION'); same(after.selected, config, 'AFTER_SELECTION');
    need(before.status === 'unresolved' && before.current === null && before.error === null
      && before.attempts === i && before.calls === cumulative && before.response_bytes === responseBytes, 'SELECT_INVALIDATES_READY');
    same(Object.keys(attempt.request_ids).sort(), ['hash', 'number'], 'STRATEGIES');
    const group = {};
    for (const [j, strategy] of ['number', 'hash'].entries()) {
      const ids = attempt.request_ids[strategy];
      need(Array.isArray(ids) && ids.length === spec.counts[j], 'COMPLETE_ATTEMPT_COUNTS');
      group[strategy] = ids.map((id, at) => {
        need(!used.has(id) && (!at || id > ids[at - 1]), 'UNIQUE_ORDERED_CONTRIBUTION'); used.add(id);
        const row = rowFor(id); need(Object.hasOwn(row.response, 'result') && !Object.hasOwn(row.response, 'error'), 'ACQUIRED_RESPONSE');
        return row;
      });
    }
    // Serial collectors finish before coordinator final boundaries. Interleave
    // those final reads by their global IDs, not by concatenating strategy lists.
    const chronological = [...group.number, ...group.hash].sort((a, b) => a.request.id - b.request.id);
    need(i === 0 || chronological[0].request.id > Math.max(...groups[i - 1].number.map(r => r.request.id), ...groups[i - 1].hash.map(r => r.request.id)), 'ATTEMPT_ORDER');
    const bytes = chronological.reduce((sum, row) => sum + Buffer.byteLength(encoded(row.response.result)), 0);
    byteCounts.push(bytes); responseBytes += bytes; cumulative += spec.calls;
    need(after.calls === cumulative && after.response_bytes === responseBytes && after.attempts === i + 1, 'CUMULATIVE_WORK');
    need(after.status === (spec.ready ? 'ready' : 'unresolved'), 'ATOMIC_STATUS');
    if (spec.ready) {
      same(after.current, pick(branches[spec.branch], ['manifest', 'result']), 'ATOMIC_PUBLICATION');
      need(after.error === null && branches[spec.branch].response_bytes === bytes, 'READY_RECEIPT');
      checkCollector(group.number.slice(0, 57), branches[spec.branch].history, 'number');
      checkCollector(group.hash.slice(0, 84), branches[spec.branch].history, 'hash');
    } else {
      need(after.current === null, 'NO_PARTIAL_PUBLICATION');
      same(after.error, { stage: 'final_boundaries', code: spec.error }, 'FINAL_BOUNDARY_STAGE');
    }
    groups.push(group);
  }
  need(used.size === 438 && cumulative === 438, 'COMPLETE_SESSION_CONTRIBUTIONS');
  // Every read between handoff and switch/resume is attributed. Descriptive
  // collector labels may reset and are deliberately not an identity oracle.
  const phaseNames = ['prefix', 'write-left', 'read-left', 'switch-at-ancestor', 'write-right', 'read-right', 'closed'];
  need(Array.isArray(value.phases) && value.phases.length === 6, 'PHASE_COUNT');
  for (const [i, p] of value.phases.entries()) need(p.from === phaseNames[i] && p.to === phaseNames[i + 1]
    && integer(p.after_request_id, value.rpc.length) && p.after_request_id > 0
    && (!i || p.after_request_id >= value.phases[i - 1].after_request_id), 'PHASE_ORDER');
  const phases = value.phases;
  const observedReadIds = value.rpc.filter(r => (r.request.id > phases[1].after_request_id && r.request.id <= phases[2].after_request_id)
    || (r.request.id > phases[4].after_request_id && r.request.id <= phases[5].after_request_id)).map(r => r.request.id);
  same([...used].sort((a, b) => a - b), observedReadIds, 'NO_UNATTRIBUTED_OR_WRITER_CONTRIBUTIONS');
  need(phases[5].after_request_id === value.rpc.length, 'CLOSED_REQUEST_BOUNDARY');
  for (const strategy of ['number', 'hash']) {
    const count = strategy === 'number' ? 57 : 84;
    same(groups[1][strategy].slice(0, count).map(signatures), groups[0][strategy].slice(0, count).map(signatures), 'INTERRUPTED_COMPLETE_LEFT_ACQUISITION');
  }
  for (const [i, group] of groups.entries()) {
    for (const strategy of ['number', 'hash']) {
      const base = strategy === 'number' ? 57 : 84;
      const expected = i === 1 && strategy === 'hash' ? [] : [
        { method: 'eth_chainId', params: [], result: quantity(left.chain_id) },
        { method: 'eth_getBlockByNumber', params: [left.start_block.number, false], result: left.start_block },
        { method: 'eth_getBlockByNumber', params: [left.end_block.number, false], result: (i ? right : left).end_block }
      ];
      same(group[strategy].slice(base).map(signatures), expected, 'COORDINATOR_FINAL_BOUNDARIES');
      const tipReads = group[strategy].filter(r => r.request.method === 'eth_getBlockByNumber'
        && equal(r.request.params, [left.end_block.number, false]));
      need(tipReads.length === (i === 1 && strategy === 'hash' ? 2 : 3), 'END_OCCURRENCE_COVERAGE');
    }
  }

  const sw = value.switch;
  need(sw?.phase === 'before_request' && sw.method === 'eth_getBlockByNumber' && sw.end_occurrence === 3
    && sw.controller_completed === true && sw.retired_lease_refused_before_transport === true, 'CONTROLLED_SWITCH');
  same(sw.params, [left.end_block.number, false], 'SWITCH_QUERY');
  need(sw.after_request_id === phases[2].after_request_id && sw.restore_request_id === sw.after_request_id + 1
    && sw.restore_request_id === phases[3].after_request_id
    && sw.before_resumed_request_id === phases[4].after_request_id + 1
    && sw.resumed_request_id === sw.before_resumed_request_id
    && sw.resumed_request_id === groups[1].number.at(-1).request.id, 'SWITCH_REQUEST_ORDER');
  const resumed = rowFor(sw.resumed_request_id);
  same(signatures(resumed), { method: sw.method, params: sw.params, result: right.end_block }, 'ACTUAL_RESUMED_RIGHT_HEADER');
  for (const s of [sw.session_before, sw.session_after_controller]) {
    need(s.schema === 'caw-paid-acquisition-session/1' && s.status === 'unresolved' && s.current === null
      && s.busy === true && s.generation === 2 && s.attempts === 2 && s.calls === 291 && s.error === null,
    'PENDING_SELECTION_DURING_CONTROLLER');
    same(s.selected, branches.left.config, 'NO_CONTROLLER_RESELECTION');
    need(s.response_bytes === value.attempts[1].after.response_bytes - Buffer.byteLength(encoded(resumed.response.result)), 'PENDING_RESPONSE_NOT_YET_ACCEPTED');
  }
  same(sw.session_before, sw.session_after_controller, 'CONTROLLER_PRESERVES_PENDING_SESSION');
  const snapshots = value.rpc.filter(row => row.request.method === 'evm_snapshot');
  const restores = value.rpc.filter(row => row.request.method === 'evm_revert');
  need(snapshots.length === 1 && restores.length === 1 && snapshots[0].request.id === phases[0].after_request_id
    && restores[0].request.id === sw.restore_request_id && restores[0].response.result === true
    && snapshots[0].response.result === value.ancestor.snapshot && value.ancestor_restored_exactly === true, 'ACTUAL_SUCCESSFUL_RESTORE');
  same(snapshots[0].request.params, [], 'SNAPSHOT_PARAMETERS');
  same(restores[0].request.params, [value.ancestor.snapshot], 'RESTORE_SNAPSHOT');
  const submissions = value.rpc.filter(row => row.request.method === 'eth_sendTransaction');
  need(submissions.length === node.local_transaction_attempts && submissions.length === 22, 'ACTUAL_TRANSACTION_COUNT');
  const replacements = submissions.filter(row => row.request.id > sw.restore_request_id && row.request.id < sw.resumed_request_id);
  need(replacements.length === 5, 'FIVE_WRITES_BEFORE_RESUMED_READ');
  for (const [i, row] of replacements.entries()) {
    const entry = right.blocks[i + 10].transactions[0];
    same(row.request.params, [entry.transaction], 'REPLACEMENT_TRANSACTION_BYTES');
    need(row.response.result === entry.receipt.transactionHash, 'REPLACEMENT_RECEIPT_HASH');
  }
  function named(label, method, params, expected) {
    const matches = value.rpc.filter(row => row.label === label); need(matches.length === 1, 'UNIQUE_WRITER_OBSERVATION');
    const row = matches[0]; same(signatures(row), { method, params, result: expected }, 'WRITER_OBSERVATION_BYTES'); return row.request.id;
  }
  const beforeAncestor = named('prefix.ancestor', 'eth_getBlockByNumber', ['latest', false], value.ancestor.header);
  const restoredAncestor = named('right.restored_ancestor', 'eth_getBlockByNumber', ['latest', false], value.ancestor.header);
  need(beforeAncestor < snapshots[0].request.id && restoredAncestor > sw.restore_request_id
    && restoredAncestor < replacements[0].request.id, 'RESTORED_HEADER_BEFORE_WRITES');
  for (const [prefix, state, lower, upper] of [
    ['prefix.ancestor_state', value.ancestor.state, beforeAncestor, snapshots[0].request.id],
    ['right.restored_state', value.ancestor.state, restoredAncestor, replacements[0].request.id],
    ['left.end_state', left.final, 0, phases[1].after_request_id + 1],
    ['right.end_state', right.final, replacements.at(-1).request.id, sw.resumed_request_id]
  ]) {
    for (const g of getterSpecs(left.addresses, state, 'latest')) {
      const id = named(prefix + '.' + g.suffix, g.method, g.params, g.result);
      need(id > lower && id < upper && !used.has(id), 'WRITER_STATE_ORDER');
    }
  }
  const rejected = value.orphan_rejection;
  same(rejected.receipt, right.blocks[11].transactions[0].receipt, 'ORPHAN_FAILURE_RETAINED');
  same(rejected.transaction, right.blocks[11].transactions[0].transaction, 'ORPHAN_TRANSACTION_RETAINED');
  need(rejected.receipt.status === '0x0' && rejected.receipt.logs.length === 0, 'ORPHAN_FAILED_WITHOUT_LOGS');
  same(rejected.before, rejected.after, 'ORPHAN_NO_ACCOUNTING_CHANGE');
  same(rejected.transaction, left.blocks[11].transactions[0].transaction, 'EXACT_OLD_SIGNED_REQUEST_RETRIED');
  return { localRequests: value.rpc.length, transactions: submissions.length, acquisitionRequests: used.size,
    outcomes: value.attempts.map(attempt => attempt.after.status), responseBytes, resumedRequestId: sw.resumed_request_id };
}

test('compressed live record restores the exact retained JSON bytes within fixed bounds', () => {
  const compressed = read(dir + 'execution-trace.json.gz');
  need(compressed.length > 18 && compressed.length <= 4 * 1024 * 1024, 'GZIP_FILE_BOUND');
  need(compressed[0] === 0x1f && compressed[1] === 0x8b && compressed[2] === 8, 'GZIP_FORMAT');
  const decoded = read(dir + 'execution-trace.json');
  need(decoded.length === 2585935 && sha(decoded) === traceDigest, 'EXACT_DECOMPRESSED_BYTES');
});

test('live acquisition source inputs are pinned to current reviewed bytes', () => {
  need(inputs.schema === 'caw-paid-live-acquisition-inputs/1', 'INPUT_SCHEMA');
  const paths = ['run_live_acquisition.py', '../paid-reorg/reorg_node.py', '../../reference/paid_acquisition_session.py',
    '../paid-acquisition/acquisition_node.py', '../paid-acquisition/collect_by_number.py', '../paid-acquisition/collect_by_hash.py',
    '../paid-adversarial/synthetic_node.py', '../paid-action/paid_node.py', '../paid-action/run_paid_action.py',
    '../paid-action/paid-build.json', '../paid-action/CawPaidActionProbe.sol', '../paid-action/TestAccountRegistry.sol',
    '../account-authority/account-token-build.json', '../account-authority/AccountAdversarialToken.sol',
    '../../reference/fixtures/generate-ethereum-proof-fixtures.py', '../../reference/paid_action_reader.py',
    '../../reference/paid-action-reader.mjs', '../../reference/keccak256.mjs'];
  same(Object.keys(inputs.files).sort(), paths.sort(), 'COMPLETE_SOURCE_SET');
  for (const path of paths) need(sha(read(dir + path)) === inputs.files[path], 'EXACT_SOURCE_BYTES');
  need(sha(read(dir + 'experiment-inputs.json')) === trace.input_manifest_sha256, 'EXECUTION_INPUT_PIN');
});

test('retained live run binds every acquisition contribution and actual branch switch', () => {
  const checked = validateLive(trace);
  same(checked, { localRequests: 797, transactions: 22, acquisitionRequests: 438,
    outcomes: ['ready', 'unresolved', 'ready'], responseBytes: 833511, resumedRequestId: 650 }, 'RETAINED_RUN_COUNTS');
});

test('live summary is an exact bounded description of the retained raw run', () => {
  need(summary.schema === 'caw-paid-live-acquisition-summary/1' && summary.status === trace.status, 'SUMMARY_SCHEMA');
  need(summary.trace_sha256 === sha(read(dir + 'execution-trace.json'))
    && summary.input_manifest_sha256 === trace.input_manifest_sha256, 'SUMMARY_SOURCE_HASHES');
  same(pick(summary, Object.keys(scope)), scope, 'SUMMARY_SCOPE');
  same(pick(summary, ['local_requests', 'remote_requests', 'local_transactions', 'acquisition_requests', 'seconds', 'peak_node_bytes', 'owned_listener_released']), {
    local_requests: trace.node.local_request_count, remote_requests: trace.node.upstream_forwarded_count,
    local_transactions: trace.node.local_transaction_attempts, acquisition_requests: trace.attempts.at(-1).after.calls,
    seconds: trace.node.wall_seconds, peak_node_bytes: trace.node.peak_node_memory_bytes, owned_listener_released: trace.owned_listener_released
  }, 'SUMMARY_COUNTERS');
  same(summary.attempts, trace.attempts.map(a => ({ name: a.name, outcome: a.after.status, error: a.error,
    requests: { number: a.request_ids.number.length, hash: a.request_ids.hash.length } })), 'SUMMARY_ATTEMPTS');
});

for (const branch of ['left', 'right']) test('live ' + branch + ' history fully reconstructs with the unchanged JS and Python readers', () => {
  const capture = trace.branches[branch], rebuilt = reconstruct(capture.history, capture.manifest);
  same(rebuilt, capture.result, 'COMPLETE_JS_PYTHON_EQUALITY');
  same(rebuilt, oldOracle[branch], 'COMPLETE_RETAINED_ARITHMETIC_EQUALITY');
  const words = branch === 'left' ? ['common-prefix', 'discarded-first', 'discarded-second'] : ['common-prefix', 'selected-first'];
  same(rebuilt.messages.map(m => m.text_hex), words.map(text => '0x' + Buffer.from(text, 'utf8').toString('hex')), 'EXACT_MESSAGE_BYTES');
});

const negativeCases = [
  ['resumed response is changed to the discarded left header', value => {
    const row = value.rpc[value.switch.resumed_request_id - 1]; row.response.result = structuredClone(value.branches.left.history.end_block);
    row.raw_response = JSON.stringify(row.response);
  }],
  ['an earlier response is relabeled as a new attempt contribution', value => {
    value.attempts[1].request_ids.number[0] = value.attempts[0].request_ids.number[0];
  }],
  ['interrupted acquisition omits a hash response', value => { value.attempts[1].request_ids.hash.splice(7, 1); }],
  ['a controller transaction is counted as an acquisition read', value => {
    value.attempts[1].request_ids.number[59] = value.switch.restore_request_id;
  }],
  ['interrupted partial state is published as ready', value => {
    value.attempts[1].after.status = 'ready'; value.attempts[1].after.current = structuredClone(value.attempts[0].after.current);
  }],
  ['controller silently selects the right branch', value => {
    value.switch.session_after_controller.selected = structuredClone(value.branches.right.config);
  }],
  ['snapshot restore reports false', value => {
    const row = value.rpc[value.switch.restore_request_id - 1]; row.response.result = false; row.raw_response = JSON.stringify(row.response);
  }],
  ['interrupted acquisition raw body differs despite unchanged counts', value => {
    const id = value.attempts[1].request_ids.hash.find(id => value.rpc[id - 1].request.method === 'eth_getTransactionByHash');
    const row = value.rpc[id - 1], input = row.response.result.input;
    row.response.result.input = input.slice(0, -2) + (input.endsWith('00') ? '01' : '00');
    row.raw_response = JSON.stringify(row.response);
  }],
  ['final failure is misreported as an earlier collector error', value => { value.attempts[1].after.error.stage = 'hash'; }],
  ['shared local transport is claimed to be independent providers', value => { value.independent_providers = true; }],
  ['request-boundary switch is claimed as concurrent in-flight RPC', value => { value.concurrent_inflight_rpc = true; }]
];
for (const [name, mutate] of negativeCases) test('live evidence rejects ' + name, () => {
  const changed = structuredClone(trace); mutate(changed);
  assert.throws(() => validateLive(changed), /^Error: Live acquisition evidence rejected:/);
});
