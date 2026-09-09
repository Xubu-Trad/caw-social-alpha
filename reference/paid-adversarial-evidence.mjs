// Original offline consistency checker for a finite SYNTHETIC execution record.
// It imports no runner or application accounting. Retained captures, fixture
// reports and source pins remain supplied evidence, not authenticated consensus,
// a fresh execution, an independent acquisition or a production security audit.
import { createHash } from 'node:crypto';
import { keccak256Hex } from './keccak256.mjs';

export const BASELINE_COMMIT = '91479b6dc8c9a264411d75177d43029e0266c354';
export const BASELINE_SOURCE_SHA256 = 'e48f8f8f816aae21e0e9865a8be0aa2e47204ea04b4c12b4124e5b0452412da1';
const SYNTHETIC_RUNTIME_SHA256 = '82ce425aec55509ecb5c3ebb083a9254cc503ad209a531f57ff92ee873e68e14';
const TOKEN = '0xf3b9569f82b18aef890de263b84189bd33ebe452';
const A = '0x765d03fe39e2a0a48ac162a15b541c3cd1d63e76';
const B = '0x47ecac8221f18970c48cf48aaa3cbe8167bbbe73';
const D = '0x00000000000000000000000000000000ca180001';
const FEE = 5000000000000000000000n;
const MAX = (1n << 256n) - 1n;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const keccakText = value => keccak256Hex('0x' + Buffer.from(value).toString('hex'));
const selector = value => keccakText(value).slice(0, 10);
const word = value => BigInt(value).toString(16).padStart(64, '0');
const REENTRANT = BigInt(selector('Reentrant()'));
const POST_EVENT = keccakText('Posted(uint256,uint256,address,uint256,uint256,bytes,uint256,bytes32,uint256,uint256,uint256,uint256)');
const POST_CALL = selector('post((uint256,uint256,uint256,uint256,uint256,bytes32,bytes),bytes)');
const REQUIRED_INPUTS = ['PaidAttackFixtures.sol', 'PaidStateSnapshot.sol', 'compile-standard.json', 'attack-build.json', 'synthetic_node.py', 'run_paid_adversarial.py', '../paid-action/CawPaidActionProbe.sol', '../paid-action/TestAccountRegistry.sol', '../paid-action/paid-build.json', '../paid-action/run_paid_action.py', '../paid-action/paid_node.py', '../account-authority/AccountHookFixture.sol', '../account-authority/AccountAdversarialToken.sol', '../account-authority/account-token-build.json', '../account-authority/authority-build.json', '../../reference/fixtures/generate-ethereum-proof-fixtures.py'];
const need = (condition, message) => { if (!condition) throw new Error('Adversarial evidence rejected: ' + message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/.test(value);
const hex = value => typeof value === 'string' && /^0x(?:[0-9a-f]{2})*$/.test(value);
const quantity = value => typeof value === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value);
const hash32 = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value);

function casePlan() {
  const result = [];
  const add = (label, success = false, effect = 'rollback', error = null, extra = {}) =>
    result.push(Object.freeze({ label, success, effect, error, ...extra }));
  add('initial_post', true, 'post');
  add('duplicate_other_submitter', false, 'rollback', 'InvalidNonce()');
  for (const direction of ['deposit', 'withdraw']) {
    const modes = direction === 'deposit' ? [1, 2, 3, 4, 5, 7, 10, 6] : [1, 2, 3, 4, 5, 8, 9, 6];
    for (const mode of modes) {
      const error = mode === 1 ? 'TokenRejected()' : mode === 2 ? 'FixtureTransferReverted()' : [7, 8, 9, 10].includes(mode) ? 'UnexpectedTokenDelta()' : null;
      add(`${direction}_token_mode_${mode}`, mode === 6, mode === 6 ? 'move' : 'rollback', error);
    }
  }
  for (const direction of ['deposit', 'withdraw']) for (let action = 1; action <= 5; action++) {
    add(`${direction}_nested_${action}_caught`, true, 'move', null, { callback: true });
    add(`${direction}_nested_${action}_propagate`, false, 'rollback', 'Reentrant()');
  }
  for (const direction of ['deposit', 'withdraw']) for (const mode of [3, 4]) add(`${direction}_ownership_${mode}`, false, 'rollback', 'AuthorityChanged()');
  for (const action of ['deposit', 'withdraw', 'stake', 'unstake', 'post']) add('underbacked_' + action, false, 'rollback', 'Underbacked()', { underbacked: true });
  add('withdraw_after_deficit', true, 'move');
  add('old_epoch_after_wallet_transfer', false, 'rollback', 'StaleEpoch()');
  for (const mode of [1, 2, 3, 5, 0, 4]) {
    const ok = [0, 4].includes(mode);
    add('wallet_mode_' + mode, ok, ok ? 'post' : 'rollback', ok ? null : 'InvalidSignature()');
  }
  for (const length of [0, 4096, 4097]) add('wallet_signature_bytes_' + length, length <= 4096, length <= 4096 ? 'post' : 'rollback', length <= 4096 ? null : 'InvalidSignature()');
  for (const suffix of ['caught', 'propagate']) for (let action = 1; action <= 5; action++) {
    add(`wallet_nested_${action}_${suffix}`, suffix === 'caught', suffix === 'caught' ? 'post' : 'rollback', suffix === 'caught' ? null : 'InvalidSignature()');
  }
  add('wallet_registry_caught', true, 'post');
  add('wallet_registry_propagate', false, 'rollback', 'InvalidSignature()');
  add('stale_epoch_direct_owner', false, 'rollback', 'StaleEpoch()');
  add('final_current_owner_withdraw', true, 'withdraw_after_transfer');
  return Object.freeze(result);
}

export const EXPECTED_CASES = casePlan();

function state(values, label, owners, short) {
  need(Array.isArray(values) && values.length === 40, label + ': forty state words');
  const s = values.map(value => {
    need(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), label + ': integer encoding');
    const parsed = BigInt(value); need(parsed <= MAX, label + ': uint256 bound'); return parsed;
  });
  need(s[2] + s[8] + s[14] === s[18], label + ': credit conservation');
  for (const index of [2, 8, 14]) need(s[index + 1] <= s[index], label + ': stake is locked credit');
  need(s[21] + s[22] + s[23] + s[24] + s[25] === s[30], label + ': synthetic supply');
  need(s[9] === 1n && s[15] === 2n, label + ': recipient weights');
  need(s[10] === 0n && s[16] === 0n && s[4] === s[20], label + ': nonce/message conservation');
  need(short ? s[21] + 1n === s[18] + s[19] : s[21] >= s[18] + s[19], label + ': backing');
  for (let i = 0; i < owners.length; i++) need(s[35 + i] === BigInt([s[0], s[6], s[12]].filter(owner => owner === owners[i]).length), label + ': NFT balances');
  need(s[35] + s[36] + s[37] + s[38] === 3n && s[39] === 0n, label + ': account population/operator');
  return s;
}

function readWord(bytes, offset) {
  need(Number.isSafeInteger(offset) && offset >= 0 && offset + 32 <= bytes.length, 'ABI word bound');
  return BigInt('0x' + bytes.subarray(offset, offset + 32).toString('hex'));
}
function offsetWord(bytes, at) { const n = readWord(bytes, at); need(n <= BigInt(bytes.length), 'ABI offset bound'); return Number(n); }
function dynamicBytes(bytes, at) {
  const length = offsetWord(bytes, at); need(at + 32 + length <= bytes.length, 'ABI bytes bound');
  return bytes.subarray(at + 32, at + 32 + length);
}

function verifyPost(row, before, after, probe) {
  need(row.transaction.to === probe && row.transaction.data.startsWith(POST_CALL), 'post target/calldata');
  const calldata = Buffer.from(row.transaction.data.slice(10), 'hex');
  const tupleAt = offsetWord(calldata, 0);
  const request = Array.from({ length: 7 }, (_, i) => readWord(calldata, tupleAt + i * 32));
  need(request[0] === 1n && request[1] === before[1] && request[2] === before[4], 'accepted request authority/nonce');
  const distribution = keccak256Hex('0x' + [before[3], before[9], before[15]].map(word).join(''));
  need(request[5] === BigInt(distribution), 'accepted distribution commitment');
  need(request[6] <= BigInt(calldata.length), 'text offset bound');
  const text = dynamicBytes(calldata, tupleAt + Number(request[6]));
  need(row.receipt.logs.length === 1, 'one post log');
  const log = row.receipt.logs[0];
  need(log.address === probe && same(log.topics, [POST_EVENT, '0x' + word(after[20]), '0x' + word(1), '0x' + word(before[0])]), 'post event identity');
  need(hex(log.data), 'post event data encoding');
  const data = Buffer.from(log.data.slice(2), 'hex');
  const fields = Array.from({ length: 9 }, (_, i) => readWord(data, i * 32));
  const eligible = before[9] + before[15];
  const share2 = FEE * before[9] / eligible, share3 = FEE * before[15] / eligible;
  need(fields[0] === before[1] && fields[1] === before[4] && fields[3] === FEE && fields[4] === BigInt(distribution), 'post event signed terms');
  need(fields[5] === 0n && fields[6] === share2 && fields[7] === share3 && fields[8] === FEE - share2 - share3, 'post event allocations');
  need(fields[2] <= BigInt(data.length) && dynamicBytes(data, Number(fields[2])).equals(text), 'post event exact text');
}

/** Validate the retained trace against supplied, locally read source bytes.
 * inputBytes is a Map of capture.inputs relative filenames to Uint8Array values.
 * No filesystem, network, service startup, signature recovery or wallet action.
 */
export function validateEvidence(evidence, { inputBytes } = {}) {
  need(evidence && evidence.schema === 'caw-paid-adversarial/1' && evidence.complete === true && !evidence.failure, 'completed schema');
  need(evidence.baseline_commit === BASELINE_COMMIT, 'baseline commit');
  need(evidence.synthetic_only === true && evidence.historical_caw_execution === false && evidence.real_wallet_used === false && evidence.public_transaction_broadcast === false, 'synthetic provenance');
  need(Array.isArray(evidence.upstream_calls) && evidence.upstream_calls.length === 0, 'no upstream calls');
  need(evidence.inputs && inputBytes instanceof Map && Object.keys(evidence.inputs).length > 0, 'source inputs');
  need(same(Object.keys(evidence.inputs).sort(), [...REQUIRED_INPUTS].sort()), 'complete source-input coverage');
  for (const [name, pin] of Object.entries(evidence.inputs)) {
    need(typeof pin === 'string' && /^[0-9a-f]{64}$/.test(pin) && inputBytes.get(name) instanceof Uint8Array && hash(inputBytes.get(name)) === pin, 'input pin: ' + name);
  }
  need(evidence.inputs['../paid-action/CawPaidActionProbe.sol'] === BASELINE_SOURCE_SHA256, 'unchanged alpha.20 contract');
  const n = evidence.node;
  need(n && n.schema === 'caw-local-node/1' && n.mode === 'synthetic' && n.local_chain_id === 31337 && n.hardfork === 'london' && n.host === '127.0.0.1' && n.port === 18545, 'local node scope');
  need(n.remote_provider === null && n.fork_block === null && n.expected_fork_hash === null && n.expected_state_root === null && n.proxy_request_count === 0 && n.upstream_forwarded_count === 0, 'no fork or remote provider');
  need(n.wallet_used === false && n.transaction_broadcast === false && n.generated_accounts === 0 && n.local_impersonation_is_ownership_proof === false && n.token_storage_overridden === false && n.token_code_replaced === true && n.stop_reason === null, 'node provenance');
  const calls = evidence.local_calls;
  need(Array.isArray(calls) && calls.length > 0 && calls.length <= 1800 && n.local_request_count === calls.length, 'bounded local calls');
  const byCall = new Map(), overrides = [], sends = [];
  const allowed = new Set(['eth_chainId', 'eth_blockNumber', 'eth_gasPrice', 'anvil_nodeInfo', 'eth_getTransactionReceipt', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getCode', 'eth_getBalance', 'eth_getTransactionCount', 'eth_sendTransaction', 'eth_call', 'anvil_setCode', 'anvil_setBalance', 'anvil_impersonateAccount', 'anvil_stopImpersonatingAccount']);
  for (const call of calls) {
    need(call && !byCall.has(call.label) && call.request?.jsonrpc === '2.0' && allowed.has(call.request.method) && Array.isArray(call.request.params) && call.response && !call.transport_error, 'local call identity/scope');
    byCall.set(call.label, call);
    const { method, params } = call.request;
    if (method === 'eth_chainId') need(call.response.result === '0x7a69', 'synthetic chain ID');
    if (method.startsWith('anvil_') && method !== 'anvil_nodeInfo') {
      need(call.response.result === true || call.response.result === null, 'override response');
      if (method === 'anvil_setCode') need(params.length === 2 && params[0] === TOKEN && hex(params[1]) && hash(Buffer.from(params[1].slice(2), 'hex')) === SYNTHETIC_RUNTIME_SHA256, 'synthetic code installation');
      else need([A, B, D].includes(params[0]) && (method === 'anvil_setBalance' ? params.length === 2 && params[1] === '0xde0b6b3a7640000' : params.length === 1), 'test actor override');
      overrides.push({ method, params, local_only: true });
    }
    if (method === 'eth_sendTransaction' || method === 'eth_call') {
      const tx = params[0];
      need(tx && [A, B, D].includes(tx.from) && tx.value === '0x0' && quantity(tx.gas) && BigInt(tx.gas) > 0n && BigInt(tx.gas) <= 4000000n && tx.gasPrice === '0x174876e800' && hex(tx.data), 'local transaction bounds');
      if (method === 'eth_sendTransaction') sends.push(call);
    }
  }
  need(overrides.filter(x => x.method === 'anvil_setCode').length === 1 && same(overrides, n.overrides), 'recorded override agreement');
  need(sends.length === n.local_transaction_attempts && sends.length <= 250, 'transaction attempt count');
  const deployed = new Map();
  for (const deployment of evidence.deployments ?? []) {
    need(!deployed.has(deployment.name) && address(deployment.address) && hex(deployment.runtime) && deployment.runtime.length > 2, 'deployment identity');
    deployed.set(deployment.name, deployment.address);
  }
  const probe = deployed.get('CawPaidActionProbe'), hook = deployed.get('AccountHookFixture'), wallet = deployed.get('PaidSignatureAttackOwner');
  need(address(probe) && address(hook) && address(wallet) && address(deployed.get('PaidStateSnapshot')), 'required deployments');
  const rows = new Map(), hashes = new Set();
  need(Array.isArray(evidence.transactions) && evidence.transactions.length === sends.length, 'transaction capture coverage');
  for (const row of evidence.transactions) {
    const receipt = row.receipt;
    need(row && !rows.has(row.label) && receipt && hash32(receipt.transactionHash) && !hashes.has(receipt.transactionHash) && ['0x0', '0x1'].includes(receipt.status) && Array.isArray(receipt.logs), 'transaction/receipt identity');
    need(quantity(receipt.gasUsed) && BigInt(receipt.gasUsed) <= 4000000n && (receipt.status === '0x1' || receipt.logs.length === 0), 'receipt gas/failed effects');
    need(row.transaction.to === undefined || [TOKEN, ...deployed.values()].includes(row.transaction.to), 'transaction destination');
    const sent = byCall.get(row.label + '.send'), dry = byCall.get(row.label + '.dry');
    need(sent?.request.method === 'eth_sendTransaction' && same(sent.request.params, [row.transaction]) && sent.response.result === receipt.transactionHash, 'submitted transaction binding');
    need(dry?.request.method === 'eth_call' && same(dry.request.params, [row.transaction, 'latest']) && same(dry.response, row.dry_response), 'dry response binding');
    const receiptCall = calls.find(call => call.label.startsWith(row.label + '.receipt') && call.request.method === 'eth_getTransactionReceipt' && same(call.request.params, [receipt.transactionHash]) && same(call.response.result, receipt));
    need(receiptCall, 'receipt binding');
    need(receipt.status === '0x1' ? Object.hasOwn(row.dry_response, 'result') && !Object.hasOwn(row.dry_response, 'error') : Object.hasOwn(row.dry_response, 'error') && !Object.hasOwn(row.dry_response, 'result'), 'dry and execution status');
    rows.set(row.label, row); hashes.add(receipt.transactionHash);
  }
  need(Array.isArray(evidence.cases) && same(evidence.cases.map(c => c.label), EXPECTED_CASES.map(c => c.label)), 'exact ordered case coverage');
  const owners = [A, B, wallet, hook].map(BigInt);
  const initial = Array(40).fill(0n);
  for (const [at, owner, credit, stake] of [[0, A, FEE * 30n, 3n], [6, A, 10n, 1n], [12, B, 10n, 2n]]) {
    initial[at] = BigInt(owner); initial[at + 2] = credit; initial[at + 3] = stake;
  }
  initial[18] = initial[21] = FEE * 30n + 20n;
  initial[22] = initial[26] = FEE * 30n - 10n;
  initial[23] = initial[27] = FEE * 60n - 10n;
  initial[30] = FEE * 120n; initial[35] = 2n; initial[36] = 1n;
  let previous = initial, successfulPosts = 0, rejected = 0;
  for (let i = 0; i < EXPECTED_CASES.length; i++) {
    const plan = EXPECTED_CASES[i], c = evidence.cases[i], row = rows.get(plan.label);
    need(c.pass === true && c.expected_success === plan.success && c.effect === plan.effect && (c.expected_error ?? null) === plan.error && (c.backing_intentionally_short ?? false) === Boolean(plan.underbacked) && (c.token_callback_caught ?? false) === Boolean(plan.callback), plan.label + ': case policy');
    need(row && c.transaction_hash === row.receipt.transactionHash && row.receipt.status === (plan.success ? '0x1' : '0x0'), plan.label + ': case receipt');
    if (plan.error) need(row.dry_response.error?.data === selector(plan.error), plan.label + ': exact revert selector');
    const before = state(c.before, plan.label + '.before', owners, plan.underbacked), after = state(c.after, plan.label + '.after', owners, plan.underbacked);
    for (const [suffix, values] of [['before', c.before], ['after', c.after]]) {
      const snapshotLabel = plan.label === 'final_current_owner_withdraw' ? 'final_withdraw.' + suffix : plan.label + '.' + suffix;
      const observed = byCall.get(snapshotLabel);
      const readData = selector('read(address[7])') + [deployed.get('TestAccountRegistry'), probe, TOKEN, A, B, hook, wallet].map(word).join('');
      need(observed?.request.method === 'eth_call' && observed.request.params[0].to === deployed.get('PaidStateSnapshot') && observed.request.params[0].data === readData && observed.response.result === '0x' + values.map(word).join(''), plan.label + ': captured snapshot binding');
    }
    const expectedBefore = [...previous];
    if (/^(deposit|withdraw)_(nested|ownership)_/.test(plan.label)) for (let at = 31; at <= 34; at++) expectedBefore[at] = 0n;
    if (plan.label === 'deposit_ownership_3') expectedBefore[5] = BigInt(hook);
    if (plan.label === 'underbacked_deposit') { expectedBefore[5] = 0n; expectedBefore[21]--; expectedBefore[30]--; }
    if (plan.label === 'withdraw_after_deficit') { expectedBefore[21]++; expectedBefore[30]++; }
    if (plan.label === 'old_epoch_after_wallet_transfer') { expectedBefore[0] = BigInt(wallet); expectedBefore[1] = 1n; expectedBefore[35] = 1n; expectedBefore[37] = 1n; }
    if (plan.label === 'stale_epoch_direct_owner') { expectedBefore[0] = BigInt(A); expectedBefore[1] = 2n; expectedBefore[35] = 2n; expectedBefore[37] = 0n; }
    if (plan.label === 'final_current_owner_withdraw') expectedBefore[3] = 0n;
    need(before.every((value, at) => value === expectedBefore[at]), plan.label + ': state continuity');
    const delta = Array(40).fill(0n);
    if (plan.effect === 'post') {
      const weights = [before[9], before[15]], denominator = weights[0] + weights[1];
      const allocations = weights.map(weight => FEE * weight / denominator);
      const dust = FEE - allocations[0] - allocations[1];
      delta[2] = -FEE; delta[8] = allocations[0]; delta[14] = allocations[1];
      delta[18] = -dust; delta[19] = dust; delta[4] = delta[20] = 1n;
      verifyPost(row, before, after, probe); successfulPosts++;
    } else if (plan.effect === 'move' || plan.effect === 'withdraw_after_transfer') {
      const incoming = plan.label.startsWith('deposit'), sign = incoming ? 1n : -1n;
      delta[2] = delta[18] = delta[21] = sign; delta[22] = -sign;
      if (incoming) delta[26] = -1n;
      if (plan.callback) { delta[31] = 1n; delta[33] = REENTRANT; delta[34] = 4n; }
      const epoch = plan.effect === 'withdraw_after_transfer' ? 2 : 0;
      const method = incoming ? 'deposit' : 'withdraw';
      need(row.transaction.to === probe && row.transaction.from === A && row.transaction.data === selector(method + '(uint256,uint256,uint256)') + word(1) + word(epoch) + word(1), plan.label + ': movement calldata');
      const logs = row.receipt.logs.filter(log => log.address === probe);
      const event = incoming ? 'Deposited' : 'Withdrawn';
      need(logs.length === 1 && same(logs[0].topics, [keccakText(event + '(uint256,address,uint256,uint256,uint256)'), '0x' + word(1), '0x' + word(A)]) && logs[0].data === '0x' + [1n, after[2], BigInt(epoch)].map(word).join(''), plan.label + ': movement receipt');
    } else rejected++;
    need(after.every((value, at) => value === before[at] + delta[at]), plan.label + ': exact forty-word transition');
    previous = after;
  }
  need(same(evidence.final_snapshot, previous.map(String)) && previous[0] === BigInt(A) && previous[1] === 2n && previous[3] === 0n, 'final current-owner withdrawal');
  for (const row of evidence.transactions) if (!EXPECTED_CASES.some(c => c.label === row.label)) need(row.receipt.status === '0x1', 'successful setup/control transaction');
  return Object.freeze({ schema: 'caw-paid-adversarial-validation/1', cases: EXPECTED_CASES.length, rejectedCases: rejected, successfulPosts, transactions: rows.size, localCalls: calls.length, finalSnapshot: previous.map(String), syntheticOnly: true, authenticatesChain: false, reexecutesContract: false });
}
