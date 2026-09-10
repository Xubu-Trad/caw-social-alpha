import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual as equal } from 'node:util';
import { reconstruct } from '../reference/paid-action-reader.mjs';
import { keccak256Hex } from '../reference/keccak256.mjs';

// Offline verification of one retained synthetic execution. No controller,
// wallet, node, RPC or Python is executed here. Captured EVM acceptance is not
// independent chain authentication or a claim that every orphan can replay.
const root = new URL('../', import.meta.url);
const dir = 'experiments/paid-orphan-replay/';
const traceDigest = 'ebad7bf35c45bc4fcc0ec0d192a8313bbcf2b2d56e572a11ffdd656de86c3e49';
const decodedBytes = 2184365;
const need = (condition, code) => { if (!condition) throw new Error('Orphan replay evidence rejected: ' + code); };
const same = (a, b, code) => need(equal(a, b), code);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function read(path) {
  if (path !== dir + 'execution-trace.json') return readFileSync(new URL(path, root));
  const packed = readFileSync(new URL(path + '.gz', root));
  need(packed.length > 18 && packed.length <= 4 * 1024 * 1024, 'COMPRESSED_BOUND');
  const decoded = gunzipSync(packed, { maxOutputLength: 8 * 1024 * 1024 });
  need(decoded.length === decodedBytes && sha(decoded) === traceDigest, 'EXACT_DECODED_TRACE');
  return decoded;
}
function json(path, maximum = 8 * 1024 * 1024) {
  const raw = read(path); need(raw.length <= maximum, 'FILE_BOUND'); return JSON.parse(raw.toString('utf8'));
}
const trace = json(dir + 'execution-trace.json');
const inputs = json(dir + 'experiment-inputs.json', 32768);
const summary = json(dir + 'execution-summary.json', 32768);
const fields = ['owners', 'epochs', 'credits', 'stakes', 'nonces', 'totalCredits', 'poolDust', 'messageCount', 'tokenBalance'];
const manifestFields = ['chain_id', 'addresses', 'registry_runtime_sha256', 'probe_runtime_sha256', 'start_block_hash', 'end_block_hash'];
const logFields = ['address', 'topics', 'data', 'blockHash', 'blockNumber', 'transactionHash', 'transactionIndex', 'logIndex', 'removed'];
const pick = (obj, keys) => Object.fromEntries(keys.map(key => [key, obj[key]]));
const quantity = n => '0x' + BigInt(n).toString(16);
const word = n => BigInt(n).toString(16).padStart(64, '0');
const utf = text => '0x' + Buffer.from(text, 'utf8').toString('hex');
const selector = signature => keccak256Hex(utf(signature)).slice(0, 10);
const A = '0x765d03fe39e2a0a48ac162a15b541c3cd1d63e76';
const B = '0x47ecac8221f18970c48cf48aaa3cbe8167bbbe73';
const observer = '0x00000000000000000000000000000000ca180001';
const token = '0xf3b9569f82b18aef890de263b84189bd33ebe452';
const F = 5000n * 10n ** 18n, q1 = F / 3n, q2 = 2n * F / 3n;
const pool = keccak256Hex('0x' + [0, 1, 2].map(word).join(''));
const profileText = 'CAW_PAID_ACTION_THREE_ID_POOL_LOCKED_STAKE_UTF8_SCALARS_V1';
const profileHash = keccak256Hex(utf(profileText));
const postType = 'Post(uint256 accountId,uint256 epoch,uint256 nonce,uint256 validAfter,uint256 deadline,bytes32 distributionHash,bytes32 textHash,uint256 fee,bytes32 profile)';
const postSignature = 'post((uint256,uint256,uint256,uint256,uint256,bytes32,bytes),bytes)';
const digestSignature = 'postDigest((uint256,uint256,uint256,uint256,uint256,bytes32,bytes))';
function stateOracle(stage, extra = 0n) {
  const completed = stage === 'after', transferred = stage !== 'ancestor';
  return { owners: [transferred ? B : A, A, B], epochs: [transferred ? '1' : '0', '0', '0'],
    nonces: [completed ? '2' : '1', '0', '0'], stakes: ['0', '1', '2'],
    credits: [(completed ? 18n * F : 19n * F) + extra, 10n + (completed ? 2n : 1n) * q1, 10n + (completed ? 2n : 1n) * q2].map(String),
    totalCredits: String(20n * F + (completed ? 18n : 19n) + extra), poolDust: completed ? '2' : '1',
    tokenBalance: String(20n * F + 20n + extra), messageCount: completed ? '2' : '1' };
}
function messagesOracle() {
  return ['common-prefix', 'orphan-replay'].map((text, i) => ({ id: String(i + 1), accountId: '1', owner: i ? B : A,
    epoch: String(i), nonce: String(i), text_hex: utf(text), fee: String(F), distributionHash: pool,
    allocations: ['0', String(q1), String(q2)], dust: '1' }));
}
function resultOracle(branch) { return { ...stateOracle('after', branch === 'right' ? 1n : 0n), messages: messagesOracle() }; }
function abiBlob(hex) {
  need(typeof hex === 'string' && /^0x(?:[0-9a-f]{2})*$/.test(hex) && hex.length <= 8194, 'ABI_BLOB');
  const n = (hex.length - 2) / 2;
  return word(n) + hex.slice(2) + '00'.repeat((32 - n % 32) % 32);
}
function signedBytes(intent, probe) {
  const r = intent.request;
  same(Object.keys(r).sort(), ['accountId', 'epoch', 'nonce', 'validAfter', 'deadline', 'distributionHash', 'text'].sort(), 'EXACT_INTENT_FIELDS');
  need(r.accountId === '1' && r.epoch === '1' && r.nonce === '1' && r.distributionHash === pool && r.text === utf('orphan-replay'), 'EXACT_INTENT');
  need(BigInt(r.validAfter) >= 0n && BigInt(r.validAfter) < BigInt(r.deadline), 'SIGNED_WINDOW');
  need(intent.signer === B && /^0x[0-9a-f]{130}$/.test(intent.signature), 'ORIGINAL_SIGNATURE');
  const raw = intent.signature.slice(2), s = BigInt('0x' + raw.slice(64, 128));
  need(BigInt('0x' + raw.slice(0, 64)) > 0n && s > 0n
    && s <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n && ['1b', '1c'].includes(raw.slice(128)), 'CANONICAL_SIGNATURE');
  const domain = keccak256Hex('0x' + [keccak256Hex(utf('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
    keccak256Hex(utf('CAW Paid Action Experiment')), keccak256Hex(utf('1'))].map(x => x.slice(2)).join('') + word(31337) + word(probe));
  const ordered = ['accountId', 'epoch', 'nonce', 'validAfter', 'deadline', 'distributionHash'].map(key => word(r[key])).join('');
  const body = keccak256Hex('0x' + keccak256Hex(utf(postType)).slice(2) + ordered + keccak256Hex(r.text).slice(2) + word(F) + profileHash.slice(2));
  const digest = keccak256Hex('0x1901' + domain.slice(2) + body.slice(2));
  same(intent.digest, digest, 'INDEPENDENT_TYPED_DIGEST');
  const tuple = ordered + word(224) + abiBlob(r.text);
  return { domain, digest, digestData: selector(digestSignature) + word(32) + tuple,
    calldata: selector(postSignature) + word(64) + word(64 + tuple.length / 2) + tuple + abiBlob(intent.signature) };
}
function view(target, data, tag = 'latest') {
  return [{ from: observer, to: target, data, gas: '0x3d0900', gasPrice: '0x174876e800', value: '0x0' }, tag];
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


function validateReplay(value) {
  need(value?.schema === 'caw-paid-orphan-replay-run/1' && value.status === 'pass', 'COMPLETED_RUN');
  need(value.independent_providers === false && value.authenticates_consensus === false
    && value.historical_caw_execution === false && value.replay_only === false && value.new_signature_on_right === false
    && value.permanent_orphan_invalidation === false && value.same_branch_duplicate_accepted === false
    && value.selected_branch === 'right' && value.selection_policy === 'explicit local fixture checkpoint', 'CLAIM_BOUNDARY');
  const node = value.node;
  need(node?.mode === 'synthetic' && node.local_chain_id === 31337 && node.hardfork === 'london'
    && node.host === '127.0.0.1' && node.port === 18545 && node.remote_provider === null
    && node.proxy_request_count === 0 && node.upstream_forwarded_count === 0 && node.wallet_used === false
    && node.transaction_broadcast === false && node.local_impersonation_is_ownership_proof === false
    && node.token_storage_overridden === false, 'SYNTHETIC_LOCAL_SCOPE');
  need(node.stop_reason === null && value.owned_listener_released === true
    && value.source_pins_unchanged_after_run === true && value.retired_left_lease_refused_before_transport === true
    && value.closed_right_lease_refused_before_transport === true, 'COMPLETE_CLEANUP');
  need(Array.isArray(value.rpc) && value.rpc.length > 0 && value.rpc.length <= 1800
    && value.rpc.length === node.local_request_count, 'RPC_BOUND');
  const allowed = new Set(['anvil_setBalance', 'anvil_impersonateAccount', 'anvil_setCode', 'eth_call',
    'eth_sendTransaction', 'eth_getTransactionReceipt', 'eth_getBlockByNumber', 'eth_getCode',
    'evm_snapshot', 'evm_revert', 'eth_getBlockByHash', 'eth_getTransactionByHash', 'eth_getLogs', 'eth_chainId']);
  const byId = new Map();
  for (const [i, row] of value.rpc.entries()) {
    need(row.request?.jsonrpc === '2.0' && row.request.id === i + 1 && allowed.has(row.request.method)
      && row.response?.jsonrpc === '2.0' && row.response.id === row.request.id, 'RPC_IDENTITY_SCOPE');
    need(typeof row.raw_response === 'string' && Buffer.byteLength(row.raw_response) <= 1024 * 1024
      && row.transport_error === undefined, 'RAW_BOUND');
    same(JSON.parse(row.raw_response), row.response, 'RAW_RESPONSE_BINDING');
    byId.set(row.request.id, row);
  }
  function rowFor(id) { need(Number.isSafeInteger(id) && id > 0 && byId.has(id), 'REQUEST_ID'); return byId.get(id); }
  function named(label, method, params) {
    const matches = value.rpc.filter(row => row.label === label);
    need(matches.length === 1, 'UNIQUE_NAMED_OBSERVATION');
    const row = matches[0]; need(row.request.method === method, 'OBSERVATION_METHOD');
    same(row.request.params, params, 'OBSERVATION_PARAMETERS'); return row;
  }
  function observed(label, method, params, result) {
    const row = named(label, method, params);
    need(Object.hasOwn(row.response, 'result') && !Object.hasOwn(row.response, 'error'), 'OBSERVATION_RESULT');
    same(row.response.result, result, 'OBSERVATION_BYTES'); return row.request.id;
  }
  const branches = value.branches;
  same(Object.keys(branches).sort(), ['left', 'right'], 'TWO_BRANCHES');
  const histories = {}, used = new Set(), collectorIds = {};
  for (const branch of ['left', 'right']) {
    const record = branches[branch], config = record.config;
    same(Object.keys(record.collectors).sort(), ['hash', 'number'], 'TWO_COLLECTORS');
    const number = record.collectors.number, hashed = record.collectors.hash;
    same(number.history, hashed.history, 'INDEPENDENT_HISTORY_AGREEMENT');
    same(number.manifest, hashed.manifest, 'INDEPENDENT_MANIFEST_AGREEMENT');
    const h = histories[branch] = number.history, expected = resultOracle(branch);
    need(h.schema === 'caw-paid-history/1' && h.chain_id === 31337 && h.addresses.token === token
      && Array.isArray(h.blocks) && h.blocks.length === (branch === 'left' ? 13 : 14), 'FIXED_COMPLETE_HISTORY');
    same(h.addresses, config.addresses, 'DEPLOYMENT_CONTEXT');
    same(pick(config, manifestFields), number.manifest, 'SELECTED_MANIFEST');
    need(BigInt(h.start_block.number) === 2n && config.start_block_number === 2
      && h.start_block.hash === config.start_block_hash && h.end_block.hash === config.end_block_hash
      && BigInt(h.end_block.number) === BigInt(config.end_block_number), 'EXACT_ENDPOINTS');
    same(h.end_block, h.blocks.at(-1).header, 'COMPLETE_END_HEADER');
    for (const target of ['registry', 'probe']) need(sha(Buffer.from(h[target + '_runtime'].slice(2), 'hex'))
      === config[target + '_runtime_sha256'], 'RUNTIME_COMMITMENTS');
    same(h.final, pick(expected, fields), 'INDEPENDENT_FINAL_ARITHMETIC');
    collectorIds[branch] = [];
    for (const strategy of ['number', 'hash']) {
      const c = record.collectors[strategy], count = strategy === 'number' ? (branch === 'left' ? 53 : 55) : (branch === 'left' ? 76 : 80);
      need(Array.isArray(c.request_ids) && c.request_ids.length === count && c.request_count === count
        && c.first_request_id === c.request_ids[0] && c.last_request_id === c.request_ids.at(-1), 'COLLECTOR_ID_RECEIPT');
      const calls = c.request_ids.map((id, at) => {
        need(!used.has(id) && (!at || id === c.request_ids[at - 1] + 1), 'FRESH_CONTIGUOUS_CONTRIBUTIONS');
        used.add(id); collectorIds[branch].push(id); return rowFor(id);
      });
      checkCollector(calls, h, strategy);
      same(c.reconstruction, expected, 'RETAINED_PYTHON_RECONSTRUCTION');
      same(reconstruct(c.history, c.manifest), expected, 'INDEPENDENT_JS_RECONSTRUCTION');
    }
  }
  const left = histories.left, right = histories.right;
  same(left.start_block, right.start_block, 'COMMON_CHECKPOINT');
  same(left.blocks.slice(0, 10), right.blocks.slice(0, 10), 'COMPLETE_SHARED_PREFIX');
  same(left.blocks[9].header, value.ancestor.header, 'COMMON_ANCESTOR_HEADER');
  same(value.ancestor.state, stateOracle('ancestor'), 'COMMON_ANCESTOR_ACCOUNTING');
  need(left.end_block.hash !== right.end_block.hash && BigInt(left.end_block.number) === 15n
    && BigInt(right.end_block.number) === 16n, 'GENUINELY_DIFFERENT_BRANCHES');
  need([...left.blocks.slice(10), ...right.blocks.slice(10)].every(block => block.transactions.length === 1), 'BRANCH_TRANSACTION_COVERAGE');
  const snapshots = value.rpc.filter(row => row.request.method === 'evm_snapshot');
  const restores = value.rpc.filter(row => row.request.method === 'evm_revert');
  need(snapshots.length === 1 && restores.length === 1 && snapshots[0].response.result === value.ancestor.snapshot
    && restores[0].response.result === true && value.ancestor_restored_exactly === true, 'ONE_SUCCESSFUL_ANCESTOR_RESTORE');
  same(snapshots[0].request.params, [], 'SNAPSHOT_PARAMETERS');
  same(restores[0].request.params, [value.ancestor.snapshot], 'RESTORE_PARAMETERS');
  const phases = value.phases, names = ['prefix', 'write-left', 'read-left', 'switch-at-ancestor', 'write-right', 'read-right', 'closed'];
  need(Array.isArray(phases) && phases.length === 6, 'PHASE_COUNT');
  for (const [i, p] of phases.entries()) need(p.from === names[i] && p.to === names[i + 1]
    && Number.isSafeInteger(p.after_request_id) && p.after_request_id > 0
    && (!i || p.after_request_id >= phases[i - 1].after_request_id), 'PHASE_ORDER');
  need(phases[0].after_request_id === snapshots[0].request.id && phases[3].after_request_id === restores[0].request.id
    && phases[5].after_request_id === value.rpc.length, 'CONTROL_PHASE_BINDING');
  for (const [branch, lower, upper] of [['left', phases[1].after_request_id, phases[2].after_request_id],
    ['right', phases[4].after_request_id, phases[5].after_request_id]]) {
    same(collectorIds[branch], value.rpc.filter(row => row.request.id > lower && row.request.id <= upper).map(row => row.request.id), 'NO_WRITER_OR_MISSING_READ_CONTRIBUTIONS');
  }
  need(used.size === 264, 'ALL_COLLECTOR_REQUESTS');
  const submissions = value.rpc.filter(row => row.request.method === 'eth_sendTransaction');
  need(submissions.length === 19 && node.local_transaction_attempts === 19, 'ALL_SYNTHETIC_TRANSACTIONS');
  for (const [branch, blocks, lower, upper] of [['left', left.blocks.slice(10), snapshots[0].request.id, phases[1].after_request_id],
    ['right', right.blocks.slice(10), restores[0].request.id, phases[4].after_request_id]]) {
    const rows = submissions.filter(row => row.request.id > lower && row.request.id <= upper);
    need(rows.length === blocks.length, 'BRANCH_SUBMISSION_COUNT');
    for (const [i, row] of rows.entries()) {
      same(row.request.params, [blocks[i].transactions[0].transaction], 'BRANCH_SUBMISSION_BYTES');
      same(row.response.result, blocks[i].transactions[0].receipt.transactionHash, 'BRANCH_SUBMISSION_RECEIPT');
    }
  }
  const signed = signedBytes(value.orphan_intent, left.addresses.probe);
  function stateObservations(prefix, wanted, lower, upper) {
    const ids = getterSpecs(left.addresses, wanted, 'latest').map(g => observed(prefix + '.' + g.suffix, g.method, g.params, g.result));
    need(ids.every((id, i) => id > lower && id < upper && !used.has(id) && (!i || id === ids[i - 1] + 1)), 'STATE_OBSERVATION_ORDER');
    return ids;
  }
  const ancestorRead = observed('prefix.ancestor', 'eth_getBlockByNumber', ['latest', false], value.ancestor.header);
  const restoredRead = observed('right.restored_ancestor', 'eth_getBlockByNumber', ['latest', false], value.ancestor.header);
  const firstRightWrite = submissions.find(row => row.request.id > restores[0].request.id).request.id;
  need(ancestorRead < snapshots[0].request.id && restoredRead > restores[0].request.id && restoredRead < firstRightWrite, 'RESTORED_HEADER');
  stateObservations('prefix.ancestor_state', stateOracle('ancestor'), ancestorRead, snapshots[0].request.id);
  stateObservations('right.restored_state', stateOracle('ancestor'), restoredRead, firstRightWrite);
  observed('orphan-replay.contract_digest', 'eth_call', view(left.addresses.probe, signed.digestData), signed.digest);
  const signature = value.orphan_intent.signature.slice(2), v = BigInt('0x' + signature.slice(128));
  observed('orphan-replay.recover' + v, 'eth_call', view('0x' + '00'.repeat(19) + '01',
    signed.digest + word(v) + signature.slice(0, 128)), '0x' + word(B));
  same(Object.keys(value.accepted).sort(), ['left', 'right'], 'BOTH_ACCEPTANCES');
  same(Object.keys(value.duplicate_rejections).sort(), ['left', 'right'], 'BOTH_DUPLICATES');
  for (const branch of ['left', 'right']) {
    const h = histories[branch], extra = branch === 'right' ? 1n : 0n;
    const accepted = value.accepted[branch], duplicate = value.duplicate_rejections[branch];
    const offset = branch === 'left' ? 11 : 12, before = stateOracle('before', extra), after = stateOracle('after', extra);
    const condition = value.signing_conditions[branch], conditionPrefix = branch + '.conditions';
    same(condition.state, before, 'RESTORED_SIGNING_PRECONDITIONS');
    same(condition.header, h.blocks[offset - 1].header, 'CURRENT_SIGNING_HEADER');
    need(BigInt(condition.header.timestamp) >= BigInt(value.orphan_intent.request.validAfter)
      && BigInt(condition.header.timestamp) < BigInt(value.orphan_intent.request.deadline), 'OBSERVED_VALID_WINDOW');
    same(condition.domain_separator, signed.domain, 'SAME_SIGNING_DOMAIN');
    same(condition.digest, signed.digest, 'SAME_TYPED_DIGEST');
    same(condition.distribution_hash, pool, 'SAME_POOL');
    need(BigInt(condition.chain_id) === 31337n && BigInt(condition.fee) === F && condition.profile === profileHash, 'FIXED_SIGNING_PROFILE');
    for (const target of ['registry', 'probe']) same(condition[target + '_runtime_sha256'], branches[branch].config[target + '_runtime_sha256'], 'UNCHANGED_SIGNING_RUNTIME');
    const headerId = observed(conditionPrefix + '.header', 'eth_getBlockByNumber', ['latest', false], condition.header);
    observed(conditionPrefix + '.chain_id', 'eth_chainId', [], '0x7a69');
    observed(conditionPrefix + '.domain_separator', 'eth_call', view(h.addresses.probe, selector('domainSeparator()')), signed.domain);
    observed(conditionPrefix + '.digest', 'eth_call', view(h.addresses.probe, signed.digestData), signed.digest);
    observed(conditionPrefix + '.distribution_hash', 'eth_call', view(h.addresses.probe, selector('distributionHash()')), pool);
    observed(conditionPrefix + '.fee', 'eth_call', view(h.addresses.probe, selector('FEE()')), '0x' + word(F));
    observed(conditionPrefix + '.profile', 'eth_call', view(h.addresses.probe, selector('PROFILE()')), profileHash);
    for (const target of ['registry', 'probe']) observed(conditionPrefix + '.' + target + '_runtime', 'eth_getCode',
      [h.addresses[target], 'latest'], h[target + '_runtime']);
    const conditionIds = Array.from({ length: 25 }, (_, i) => headerId + i);
    same(condition.request_ids, conditionIds, 'ALL_SIGNING_CONDITION_IDS');
    const exactConditionLabels = [conditionPrefix + '.header', ...getterSpecs(h.addresses, before, 'latest').map(g => conditionPrefix + '.state.' + g.suffix),
      ...['chain_id', 'domain_separator', 'digest', 'distribution_hash', 'fee', 'profile', 'registry_runtime', 'probe_runtime'].map(suffix => conditionPrefix + '.' + suffix)];
    same(conditionIds.map(id => rowFor(id).label), exactConditionLabels, 'SIGNING_CONDITION_ORDER');
    const acceptedDryId = named(branch + '.accepted.dry', 'eth_call', [accepted.transaction, 'latest']).request.id;
    need(conditionIds.at(-1) < acceptedDryId && conditionIds.every(id => !used.has(id)), 'CONDITIONS_BEFORE_ACCEPTANCE');
    stateObservations(conditionPrefix + '.state', before, headerId, headerId + 17);
    for (const [entry, label, index, ok, expectedBefore] of [[accepted, branch + '.accepted', offset, true, before],
      [duplicate, branch + '.duplicate', offset + 1, false, after]]) {
      need(entry.label === label, 'ACTION_LABEL');
      same(entry.before, expectedBefore, 'ACTION_BEFORE_ARITHMETIC'); same(entry.after, after, 'ACTION_AFTER_ARITHMETIC');
      same(entry.transaction, { from: observer, to: h.addresses.probe, data: signed.calldata,
        gas: '0x3d0900', gasPrice: '0x174876e800', value: '0x0' }, 'EXACT_REUSED_CALLDATA_AND_RELAYER');
      same(h.blocks[index].transactions, [{ transaction: entry.transaction, receipt: entry.receipt }], 'INCLUDED_ACTION_BYTES');
      need(entry.receipt.status === (ok ? '0x1' : '0x0') && (ok || entry.receipt.logs.length === 0), 'ACTUAL_ACTION_OUTCOME');
      const dry = named(label + '.dry', 'eth_call', [entry.transaction, 'latest']);
      same(dry.response, entry.dry_response, 'DRY_RESPONSE_BINDING');
      if (ok) need(dry.response.result === '0x' && !Object.hasOwn(dry.response, 'error'), 'SUCCESSFUL_DRY_CALL');
      else need(!Object.hasOwn(dry.response, 'result') && dry.response.error?.data === selector('InvalidNonce()'), 'DUPLICATE_INVALID_NONCE');
      const sent = named(label + '.send', 'eth_sendTransaction', [entry.transaction]);
      same(sent.response.result, entry.receipt.transactionHash, 'ACTION_SEND_HASH');
      const receipts = value.rpc.filter(row => row.label.startsWith(label + '.receipt') && equal(row.response.result, entry.receipt));
      need(receipts.length === 1, 'ACTUAL_ACTION_RECEIPT');
      const received = receipts[0]; same(received.request.params, [entry.receipt.transactionHash], 'RECEIPT_HASH_QUERY');
      need(received.request.method === 'eth_getTransactionReceipt' && headerId < dry.request.id
        && dry.request.id < sent.request.id && sent.request.id < received.request.id, 'ACTION_ORDER');
      stateObservations(label + '.before', expectedBefore, headerId, dry.request.id);
      stateObservations(label + '.after', after, received.request.id, value.rpc.length + 1);
      if (!ok) same(entry.before, entry.after, 'FAILED_DUPLICATE_NO_STATE_CHANGE');
    }
    stateObservations(branch + '.end_state', after, 0, branch === 'left' ? phases[1].after_request_id + 1 : phases[4].after_request_id + 1);
  }
  same(value.accepted.left.transaction, value.accepted.right.transaction, 'BYTE_IDENTICAL_ORPHAN_AUTHORIZATION');
  same(value.shared_transaction, value.accepted.left.transaction, 'SHARED_TRANSACTION_BYTES');
  need(value.accepted.left.receipt.blockHash !== value.accepted.right.receipt.blockHash
    && value.accepted.left.receipt.transactionHash === value.accepted.right.receipt.transactionHash
    && value.duplicate_rejections.left.receipt.transactionHash === value.duplicate_rejections.right.receipt.transactionHash
    && value.accepted.left.receipt.transactionHash !== value.duplicate_rejections.left.receipt.transactionHash, 'TRANSACTION_HASH_REUSE_WITH_DIFFERENT_INCLUSION');
  // The right deposit changes an unsigned balance by exactly one base unit,
  // while ownership, epoch, nonce and the signed pool/window/domain still match.
  same(right.blocks[10].transactions[0].transaction, { from: A, to: right.addresses.probe,
    data: selector('deposit(uint256,uint256,uint256)') + word(1) + word(0) + word(1),
    gas: '0x3d0900', gasPrice: '0x174876e800', value: '0x0' }, 'RIGHT_ONE_UNIT_DEPOSIT');
  for (const [branch, index] of [['left', 10], ['right', 11]]) same(histories[branch].blocks[index].transactions[0].transaction,
    { from: A, to: histories[branch].addresses.registry, data: selector('transferFrom(address,address,uint256)') + word(A) + word(B) + word(1),
      gas: '0x3d0900', gasPrice: '0x174876e800', value: '0x0' }, 'SAME_OWNER_EPOCH_TRANSITION');
  {
    same(Object.keys(value.oracles).sort(), ['ancestor', 'left', 'right'], 'COMPLETE_RETAINED_ORACLES');
    same(pick(value.oracles.ancestor, fields), stateOracle('ancestor'), 'RETAINED_ANCESTOR_ORACLE');
    for (const branch of ['left', 'right']) same(value.oracles[branch], resultOracle(branch), 'RETAINED_FULL_ORACLE');
  }
  return { transactions: 19, collectorRequests: 264, accepted: 2, rejectedDuplicates: 2,
    leftEnd: 15, rightEnd: 16, localRequests: value.rpc.length };
}

test('orphan replay gzip preserves the exact bounded live record', () => {
  const decoded = read(dir + 'execution-trace.json');
  need(decoded.length === decodedBytes && sha(decoded) === traceDigest, 'EXACT_CAPTURE');
});
test('orphan replay execution inputs match the retained reviewed source bytes', () => {
  need(inputs.schema === 'caw-paid-orphan-replay-inputs/1', 'INPUT_SCHEMA');
  const required = ['run_orphan_replay.py', '../paid-reorg/reorg_node.py', '../paid-acquisition/acquisition_node.py',
    '../paid-acquisition/collect_by_number.py', '../paid-acquisition/collect_by_hash.py', '../paid-adversarial/synthetic_node.py',
    '../paid-action/paid_node.py', '../paid-action/run_paid_action.py', '../paid-action/paid-build.json',
    '../paid-action/CawPaidActionProbe.sol', '../paid-action/TestAccountRegistry.sol',
    '../account-authority/account-token-build.json', '../account-authority/AccountAdversarialToken.sol',
    '../../reference/fixtures/generate-ethereum-proof-fixtures.py', '../../reference/paid_action_reader.py',
    '../../reference/paid-action-reader.mjs', '../../reference/keccak256.mjs'];
  same(Object.keys(inputs.files).sort(), required.sort(), 'COMPLETE_INPUT_PINS');
  for (const [path, expected] of Object.entries(inputs.files)) need(sha(read(dir + path)) === expected, 'UNCHANGED_INPUT_BYTES');
  need(sha(read(dir + 'experiment-inputs.json')) === trace.input_manifest_sha256, 'CAPTURE_INPUT_BINDING');
});
test('exact signed authorization succeeds after rollback and duplicates fail on each branch', () => {
  const checked = validateReplay(trace);
  need(checked.localRequests === 632 && checked.transactions === 19 && checked.collectorRequests === 264 && checked.accepted === 2
    && checked.rejectedDuplicates === 2 && checked.leftEnd === 15 && checked.rightEnd === 16, 'COMPLETE_EXPERIMENT');
});
test('orphan replay summary matches the decoded record and compressed package', () => {
  need(summary.schema === 'caw-paid-orphan-replay-summary/1' && summary.status === trace.status, 'SUMMARY_SCHEMA');
  const compressed = read(dir + 'execution-trace.json.gz');
  need(summary.trace_sha256 === traceDigest && summary.trace_bytes === decodedBytes
    && summary.compressed_sha256 === sha(compressed) && summary.compressed_bytes === compressed.length
    && summary.input_manifest_sha256 === trace.input_manifest_sha256, 'SUMMARY_SOURCE_BYTES');
  same(pick(summary, ['local_requests', 'remote_requests', 'local_transactions', 'node_seconds', 'peak_node_bytes',
    'owned_listener_released', 'independent_providers', 'authenticates_consensus']), {
    local_requests: trace.node.local_request_count, remote_requests: trace.node.upstream_forwarded_count,
    local_transactions: trace.node.local_transaction_attempts, node_seconds: trace.node.wall_seconds,
    peak_node_bytes: trace.node.peak_node_memory_bytes, owned_listener_released: trace.owned_listener_released,
    independent_providers: false, authenticates_consensus: false
  }, 'SUMMARY_OUTCOME_SCOPE');
});
const negativeCases = [
  ['right acceptance substitutes a new signature byte', value => {
    const entry = value.accepted.right; entry.transaction.data = entry.transaction.data.slice(0, -66) + '01' + entry.transaction.data.slice(-64);
  }],
  ['same-branch duplicate is described as accepted', value => { value.duplicate_rejections.right.receipt.status = '0x1'; }],
  ['duplicate error changes from InvalidNonce', value => {
    const r = value.rpc.find(r => r.label === 'right.duplicate.dry');
    r.response.error.data = selector('InvalidSignature()'); r.raw_response = JSON.stringify(r.response);
    value.duplicate_rejections.right.dry_response = structuredClone(r.response);
  }],
  ['restored nonce is changed in both signing snapshots', value => {
    value.signing_conditions.right.state.nonces[0] = '2'; value.accepted.right.before.nonces[0] = '2';
  }],
  ['right balance difference is removed', value => { value.signing_conditions.right.state.credits[0] = String(19n * F); }],
  ['both failure states are changed together', value => {
    value.duplicate_rejections.right.before.credits[0] = '1'; value.duplicate_rejections.right.after.credits[0] = '1';
  }],
  ['condition list omits a runtime observation', value => { value.signing_conditions.right.request_ids.pop(); }],
  ['condition list borrows a left-branch observation', value => {
    value.signing_conditions.right.request_ids[0] = value.signing_conditions.left.request_ids[0];
  }],
  ['condition code response changes despite unchanged claimed hash', value => {
    const r = value.rpc.find(r => r.label === 'right.conditions.probe_runtime');
    r.response.result = r.response.result.slice(0, -2) + '00'; r.raw_response = JSON.stringify(r.response);
  }],
  ['an altered fee getter contradicts the claimed signing conditions', value => {
    const r = value.rpc.find(r => r.label === 'right.conditions.fee');
    r.response.result = '0x' + word(F + 1n); r.raw_response = JSON.stringify(r.response);
  }],
  ['same-branch duplicate acceptance is asserted in metadata', value => { value.same_branch_duplicate_accepted = true; }],
  ['an old RPC response substitutes a new branch contribution', value => {
    value.branches.right.collectors.number.request_ids[0] = value.branches.left.collectors.number.request_ids[0];
  }],
  ['a collector response is omitted', value => { value.branches.right.collectors.hash.request_ids.splice(8, 1); }],
  ['snapshot restoration did not succeed', value => {
    const r = value.rpc.find(r => r.request.method === 'evm_revert'); r.response.result = false; r.raw_response = JSON.stringify(r.response);
  }],
  ['signed digest is changed on both branches', value => {
    value.signing_conditions.left.digest = '0x' + '11'.repeat(32); value.signing_conditions.right.digest = value.signing_conditions.left.digest;
  }],
  ['raw body contradicts the parsed receipt', value => {
    const r = value.rpc.find(r => r.label === 'right.accepted.receipt0'); r.raw_response = JSON.stringify({ ...r.response, result: null });
  }],
  ['shared node is described as independent providers', value => { value.independent_providers = true; }],
  ['remote calls are hidden', value => { value.node.upstream_forwarded_count = 1; }]
];
for (const [name, mutate] of negativeCases) test('orphan replay evidence rejects ' + name, () => {
  const changed = structuredClone(trace); mutate(changed);
  assert.throws(() => validateReplay(changed), /^Error: Orphan replay evidence rejected:/);
});
