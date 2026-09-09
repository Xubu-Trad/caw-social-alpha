import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { keccak256Hex } from '../reference/keccak256.mjs';

// Offline evidence checks only. No acquisition/harness imports or execution.
const read = path => readFileSync(new URL('../' + path, import.meta.url));
const json = path => JSON.parse(read(path).toString('utf8'));
const dir = 'experiments/local-custody/';
const fork = json(dir + 'fork-result.json');
const synthetic = json(dir + 'synthetic-result.json');
const probeBuild = json('experiments/custody/probe-build.json');
const fixtureBuild = json(dir + 'fixture-build.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const TOKEN = '0xf3b9569f82b18aef890de263b84189bd33ebe452';
const A = '0x0000000000000000000000000000000000000001';
const B = '0x0000000000000000000000000000000000000002';
const D = '0x00000000000000000000000000000000ca180001';
const ZERO = '0x' + '00'.repeat(20);
const PROBE = '0xd2e60639eb3432223eb8dc42e3b5c99382609700';
const BLOCK = '0x18bc1ea';
const BLOCK_HASH = '0xf3e3dfad2242562dbed62de90831c39eace7c7c6e88f8c509afccef9a5f73e4d';
const ROOT = '0x6d530d69c70f41b4b1a57f39751336304ff7c2c5d45e4dcd946869ecce4c0152';
const MAX = (1n << 256n) - 1n;
const WORD = /^0x[0-9a-f]{64}$/;
const DATA = /^0x(?:[0-9a-f]{2})*$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const word = n => BigInt(n).toString(16).padStart(64, '0');
const uint = n => '0x' + word(n);
const signatureHashes = new Map();
const topic = name => {
  if (!signatureHashes.has(name)) signatureHashes.set(name, keccak256Hex('0x' + Buffer.from(name).toString('hex')));
  return signatureHashes.get(name);
};
const selector = name => topic(name).slice(0, 10);
const abi = (name, ...args) => selector(name) + args.map(v => word(typeof v === 'boolean' ? Number(v) : v)).join('');
const errorReason = reason => {
  const bytes = Buffer.from(reason, 'ascii');
  return '0x08c379a0' + word(32) + word(bytes.length) + bytes.toString('hex').padEnd(Math.ceil(bytes.length / 32) * 64, '0');
};
const txData = (from, to, data) => ({ from, data, gas: '0xf4240', gasPrice: '0x174876e800', value: '0x0', ...(to === null ? {} : { to }) });
const log = (address, signature, indexed, amounts) => ({ address, topics: [topic(signature), ...indexed.map(uint)], data: '0x' + amounts.map(word).join('') });
const transfer = (from, to, n) => log(TOKEN, 'Transfer(address,address,uint256)', [from, to], [n]);
const approval = (owner, spender, n) => log(TOKEN, 'Approval(address,address,uint256)', [owner, spender], [n]);
const deposited = (who, n, credit) => log(PROBE, 'Deposited(address,uint256,uint256)', [who], [n, credit]);
const withdrawn = (who, n, credit) => log(PROBE, 'Withdrawn(address,uint256,uint256)', [who], [n, credit]);
const FIELDS = ['balance_a', 'balance_b', 'balance_probe', 'supply', 'allowance_a', 'allowance_b', 'credit_a', 'credit_b', 'total_credits'];
const state = values => Object.fromEntries(FIELDS.map((key, i) => [key, String(values[i])]));
const FORK_INITIAL = state([698790077736n, 0, 0, 666666666666666000000000000000000n, 0, 0, 0, 0, 0]);
const SYN_INITIAL = state([990, 993, 17, 2000, 90, 93, 10, 7, 17]);
const change = (before, delta) => Object.fromEntries(FIELDS.map(key => [key, String(BigInt(before[key]) + BigInt(delta[key] ?? 0))]));

const INPUTS = {
  '../custody/CawCustodyProbe.sol': 'a9015124d51c80d16cdedce9d97e456bc902d39d23a29d6e0528053340f4c0ee',
  '../custody/probe-build.json': 'c939cea1d6bb8e75a3dc1f4809bb3b7fdd7358ed2c244f67e480148690e6d06a',
  'AdversarialToken.sol': '816e94532981acc84c817f89e661a7bb3e77a8637f9eab794159c0e406dc9935',
  'compile-standard.json': '7ab35e4dd89eac240905a2a409f12ae615bad96c735c597bc3cbf11bca9ab411',
  'fixture-build.json': '7e902c32c0bf5027bf84abb738d23808aae3e08f301b0fa26ef7b6bf7d77b38d',
  '../../reference/fixtures/generate-ethereum-proof-fixtures.py': '5f100b6e1a12d29b0004bcb29f2ba5b23ffefc076646d2b67b1fb8df81c2effa'
};
const HARNESS_HASH = '2a9def217b099c9649006ebe80c1f468c602d886df5cc6788f639acb0e2d13f1';
const NODE_HASH = 'aa3a878c10508134b4869751df5f951aecb051ab5873ecf0299899fa512cb5ea';

// This oracle is authored from the declared experiment and contract interface.
// Captured expected_* fields never supply an expected call, balance or event.
function oracle(mode) {
  const rows = [], transactions = [], cases = [];
  const add = (label, method, params, expected) => rows.push({ label, method, params, expected });
  const ref = label => ({ resultOf: label });
  const view = (label, to, sig, args, expected) => add(label, 'eth_call', [txData(D, to, abi(sig, ...args)), 'latest'], expected);
  const snapshot = (prefix, expected) => {
    const targets = [
      [TOKEN, 'balanceOf(address)', [A]], [TOKEN, 'balanceOf(address)', [B]], [TOKEN, 'balanceOf(address)', [PROBE]],
      [TOKEN, 'totalSupply()', []], [TOKEN, 'allowance(address,address)', [A, PROBE]], [TOKEN, 'allowance(address,address)', [B, PROBE]],
      [PROBE, 'credits(address)', [A]], [PROBE, 'credits(address)', [B]], [PROBE, 'totalCredits()', []]
    ];
    FIELDS.forEach((key, i) => view(prefix + '.' + key, ...targets[i], uint(expected[key])));
  };
  const transaction = (label, from, to, data, { success = true, returned = '0x', error = null, logs = [] } = {}) => {
    const request = txData(from, to, data);
    add(label + '.dry', 'eth_call', [request, 'latest'], success ? returned : { error });
    add(label + '.send', 'eth_sendTransaction', [request], { hash: true });
    add(label + '.receipt', 'eth_getTransactionReceipt', [ref(label + '.send')], { receipt: true });
    const result = { label, request, success, returned, error, logs };
    transactions.push(result); return result;
  };
  const command = (label, from, to, sig, args, options) => transaction(label, from, to, abi(sig, ...args), options);
  const transition = (label, before, from, to, sig, args, delta, options = {}) => {
    snapshot(label + '.before', before);
    const action = command(label, from, to, sig, args, options);
    const after = change(before, delta);
    snapshot(label + '.after', after);
    const entry = { label, before, after, action }; cases.push(entry); return entry;
  };
  add('startup_chain', 'eth_chainId', [], '0x7a69'); add('chain', 'eth_chainId', [], '0x7a69');
  if (mode === 'fork') {
    add('fork_header', 'eth_getBlockByNumber', [BLOCK, false], { header: true });
    add('token_runtime', 'eth_getCode', [TOKEN, 'latest'], { tokenRuntime: true });
  } else {
    add('empty_token', 'eth_getCode', [TOKEN, 'latest'], '0x');
    add('install_fixture', 'anvil_setCode', [TOKEN, fixtureBuild.runtime], null);
    add('fixture_runtime', 'eth_getCode', [TOKEN, 'latest'], fixtureBuild.runtime);
  }
  for (const who of [A, B, D]) {
    add('gas_funding.' + who, 'anvil_setBalance', [who, '0xde0b6b3a7640000'], null);
    add('impersonate.' + who, 'anvil_impersonateAccount', [who], null);
  }
  add('deployer_nonce', 'eth_getTransactionCount', [D, 'latest'], '0x0');
  add('probe_absent', 'eth_getCode', [PROBE, 'latest'], '0x');
  transaction('create_probe', D, null, probeBuild.bytecode, { returned: probeBuild.runtime });
  add('probe_runtime', 'eth_getCode', [PROBE, 'latest'], probeBuild.runtime);

  if (mode === 'fork') {
    let current = FORK_INITIAL; snapshot('initial', current);
    const go = (label, from, to, sig, args, delta, options) => {
      const entry = transition(label, current, from, to, sig, args, delta, options); current = entry.after;
    };
    go('approve_13', A, TOKEN, 'approve(address,uint256)', [PROBE, 13], { allowance_a: 13 }, { returned: uint(1), logs: [approval(A, PROBE, 13)] });
    for (const [n, remaining, credit] of [[1, 12, 1], [7, 5, 8]]) go('deposit_' + n, A, PROBE, 'deposit(uint256)', [n],
      { balance_a: -n, balance_probe: n, allowance_a: -n, credit_a: n, total_credits: n },
      { logs: [transfer(A, PROBE, n), approval(A, PROBE, remaining), deposited(A, n, credit)] });
    for (const [label, from, sig, n, error] of [
      ['foreign', B, 'withdraw(uint256)', 1, 'InsufficientCredit()'], ['deployer', D, 'withdraw(uint256)', 1, 'InsufficientCredit()'],
      ['zero_deposit', A, 'deposit(uint256)', 0, 'ZeroAmount()'], ['zero_withdraw', A, 'withdraw(uint256)', 0, 'ZeroAmount()'],
      ['overcredit', A, 'withdraw(uint256)', 9, 'InsufficientCredit()']
    ]) go(label, from, PROBE, sig, [n], {}, { success: false, error: selector(error) });
    go('overallowance', A, PROBE, 'deposit(uint256)', [6], {}, { success: false, error: errorReason('ERC20: transfer amount exceeds allowance') });
    for (const [n, credit] of [[3, 5], [5, 0]]) go('withdraw_' + n, A, PROBE, 'withdraw(uint256)', [n],
      { balance_a: n, balance_probe: -n, credit_a: -n, total_credits: -n }, { logs: [transfer(PROBE, A, n), withdrawn(A, n, credit)] });
    go('donation', A, TOKEN, 'transfer(address,uint256)', [PROBE, 2], { balance_a: -2, balance_probe: 2 }, { returned: uint(1), logs: [transfer(A, PROBE, 2)] });
    go('surplus', A, PROBE, 'withdraw(uint256)', [1], {}, { success: false, error: selector('InsufficientCredit()') });
    go('fund_b', A, TOKEN, 'transfer(address,uint256)', [B, 4], { balance_a: -4, balance_b: 4 }, { returned: uint(1), logs: [transfer(A, B, 4)] });
    go('approve_b', B, TOKEN, 'approve(address,uint256)', [PROBE, 4], { allowance_b: 4 }, { returned: uint(1), logs: [approval(B, PROBE, 4)] });
    go('deposit_b', B, PROBE, 'deposit(uint256)', [4], { balance_b: -4, balance_probe: 4, allowance_b: -4, credit_b: 4, total_credits: 4 },
      { logs: [transfer(B, PROBE, 4), approval(B, PROBE, 0), deposited(B, 4, 4)] });
    go('a_cannot_withdraw_b', A, PROBE, 'withdraw(uint256)', [1], {}, { success: false, error: selector('InsufficientCredit()') });
    go('withdraw_b', B, PROBE, 'withdraw(uint256)', [4], { balance_b: 4, balance_probe: -4, credit_b: -4, total_credits: -4 }, { logs: [transfer(PROBE, B, 4), withdrawn(B, 4, 0)] });
    go('maximum_approve', A, TOKEN, 'approve(address,uint256)', [B, MAX], {}, { returned: uint(1), logs: [approval(A, B, MAX)] });
    view('maximum_before', TOKEN, 'allowance(address,address)', [A, B], uint(MAX));
    go('maximum_spend', B, TOKEN, 'transferFrom(address,address,uint256)', [A, B, 1], { balance_a: -1, balance_b: 1 }, { returned: uint(1), logs: [transfer(A, B, 1), approval(A, B, MAX - 1n)] });
    view('maximum_after', TOKEN, 'allowance(address,address)', [A, B], uint(MAX - 1n));
    go('zero_recipient', A, TOKEN, 'transfer(address,uint256)', [ZERO, 1], {}, { success: false, error: errorReason('ERC20: transfer to the zero address') });
    go('zero_transfer', A, TOKEN, 'transfer(address,uint256)', [B, 0], {}, { returned: uint(1), logs: [transfer(A, B, 0)] });
    go('insufficient_token_balance', A, TOKEN, 'transfer(address,uint256)', [B, 698790077737n], {}, { success: false, error: errorReason('ERC20: transfer amount exceeds balance') });
    snapshot('final', current); return { rows, transactions, cases, initial: FORK_INITIAL, final: current };
  }

  for (const who of [A, B]) {
    command('seed.' + who, D, TOKEN, 'setBalance(address,uint256)', [who, 1000]);
    command('approve.' + who, who, TOKEN, 'approve(address,uint256)', [PROBE, 100], { returned: uint(1), logs: [approval(who, PROBE, 100)] });
  }
  for (const [who, n, credit, remaining, label] of [[A, 10, 10, 90, 'a'], [B, 7, 7, 93, 'b']]) {
    command('seed_deposit_' + label, who, PROBE, 'deposit(uint256)', [n], { logs: [approval(who, PROBE, remaining), transfer(who, PROBE, n), deposited(who, n, credit)] });
  }
  snapshot('initial', SYN_INITIAL); add('snapshot', 'evm_snapshot', [], { quantity: true });
  let priorSnapshot = 'snapshot';
  const reset = label => {
    add(label + '.reset', 'evm_revert', [ref(priorSnapshot)], true);
    priorSnapshot = label + '.snapshot'; add(priorSnapshot, 'evm_snapshot', [], { quantity: true });
    snapshot(label + '.reset_state', SYN_INITIAL);
  };
  const setMode = (label, incoming, outgoing) => command(label, D, TOKEN, 'setMode(uint8,uint8)', [incoming, outgoing]);
  const movement = (direction, senderFee = false) => direction === 'deposit'
    ? { balance_a: senderFee ? -3 : -2, balance_probe: 2, allowance_a: -2, supply: senderFee ? -1 : 0, credit_a: 2, total_credits: 2 }
    : { balance_a: 2, balance_probe: -2, credit_a: -2, total_credits: -2 };
  const movingLogs = (direction, senderFee = false) => direction === 'deposit'
    ? [approval(A, PROBE, 88), transfer(A, PROBE, 2), ...(senderFee ? [transfer(A, ZERO, 1)] : []), deposited(A, 2, 12)]
    : [transfer(PROBE, A, 2), withdrawn(A, 2, 8)];
  const recover = entry => {
    const after = entry.after;
    setMode(entry.label + '.honest', 0, 0);
    command(entry.label + '.recovery_withdraw', A, PROBE, 'withdraw(uint256)', [1], { logs: [transfer(PROBE, A, 1), withdrawn(A, 1, BigInt(after.credit_a) - 1n)] });
    command(entry.label + '.recovery_deposit', A, PROBE, 'deposit(uint256)', [1], { logs: [approval(A, PROBE, BigInt(after.allowance_a) - 1n), transfer(A, PROBE, 1), deposited(A, 1, after.credit_a)] });
    entry.recovered = change(after, { allowance_a: -1 }); snapshot(entry.label + '.recovered', entry.recovered);
  };
  const returnModes = [['false', 1, false, selector('TokenRejected()')], ['revert', 2, false, selector('FixtureTransferReverted()')],
    ['short', 3, false, '0x'], ['empty', 4, false, '0x'], ['invalid_bool', 5, false, '0x'], ['trailing', 6, true, null]];
  for (const direction of ['deposit', 'withdraw']) for (const [name, modeNumber, success, error] of returnModes) {
    const label = direction + '_' + name; reset(label); setMode(label + '.mode', direction === 'deposit' ? modeNumber : 0, direction === 'withdraw' ? modeNumber : 0);
    const entry = transition(label, SYN_INITIAL, A, PROBE, direction + '(uint256)', [2], success ? movement(direction) : {}, { success, error, logs: success ? movingLogs(direction) : [] });
    recover(entry);
  }
  for (const [direction, modeNumber, name] of [['deposit', 7, 'incoming_short'], ['withdraw', 8, 'extra_debit'], ['withdraw', 9, 'short_credit'], ['deposit', 10, 'sender_fee']]) {
    const label = direction + '_' + name, success = modeNumber === 10; reset(label);
    setMode(label + '.mode', direction === 'deposit' ? modeNumber : 0, direction === 'withdraw' ? modeNumber : 0);
    const entry = transition(label, SYN_INITIAL, A, PROBE, direction + '(uint256)', [2], success ? movement(direction, true) : {},
      { success, error: success ? null : selector('UnexpectedTokenDelta()'), logs: success ? movingLogs(direction, true) : [] }); recover(entry);
  }
  for (const outer of ['deposit', 'withdraw']) for (const inner of ['deposit', 'withdraw']) for (const propagate of [false, true]) {
    const label = outer + '_callback_' + inner + (propagate ? '_bubble' : '_catch'); reset(label);
    command(label + '.configure', D, TOKEN, 'configureCallback(address,bool,bool)', [PROBE, inner === 'withdraw', propagate]);
    setMode(label + '.mode', outer === 'deposit' ? 11 : 0, outer === 'withdraw' ? 11 : 0);
    const entry = transition(label, SYN_INITIAL, A, PROBE, outer + '(uint256)', [2], propagate ? {} : movement(outer),
      { success: !propagate, error: propagate ? selector('Reentrant()') : null, logs: propagate ? [] : movingLogs(outer) });
    entry.callback = { attempts: uint(propagate ? 0 : 1), success: uint(0), error: propagate ? uint(0) : selector('Reentrant()') + '00'.repeat(28), length: uint(propagate ? 0 : 4) };
    for (const [key, sig] of [['attempts', 'callbackAttempts()'], ['success', 'lastCallbackSuccess()'], ['error', 'lastCallbackError()'], ['length', 'lastCallbackReturnLength()']]) view(label + '.' + key, TOKEN, sig, [], entry.callback[key]);
    recover(entry);
  }
  for (const direction of ['deposit', 'withdraw']) {
    const label = 'underbacked_' + direction; reset(label);
    command(label + '.loss', D, TOKEN, 'setBalance(address,uint256)', [PROBE, 16]);
    const before = change(SYN_INITIAL, { balance_probe: -1, supply: -1 });
    const entry = transition(label, before, A, PROBE, direction + '(uint256)', [2], {}, { success: false, error: selector('Underbacked()') });
    command(label + '.donate', A, TOKEN, 'transfer(address,uint256)', [PROBE, 1], { returned: uint(1), logs: [transfer(A, PROBE, 1)] });
    command(label + '.recovery_withdraw', A, PROBE, 'withdraw(uint256)', [1], { logs: [transfer(PROBE, A, 1), withdrawn(A, 1, 9)] });
    entry.recovered = change(before, { credit_a: -1, total_credits: -1 }); snapshot(label + '.recovered', entry.recovered);
  }
  const final = cases.at(-1).recovered; snapshot('final', final);
  return { rows, transactions, cases, initial: SYN_INITIAL, final };
}
const plans = new Map([[fork, oracle('fork')], [synthetic, oracle('synthetic')]]);
const indexes = new Map([fork, synthetic].map(record => [record, new Map(record.local_calls.map(row => [row.label, row]))]));
const row = (record, label) => { const found = indexes.get(record).get(label); assert.ok(found, label); return found; };
const result = (record, label) => { const r = row(record, label).response; assert.equal(r.error, undefined, label); return r.result; };
const header = block => { assert.equal(block.number, BLOCK); assert.equal(block.hash, BLOCK_HASH); assert.equal(block.stateRoot, ROOT); assert.equal(block.timestamp, '0x6aa0ae57'); };
function revertData(response) {
  assert.equal(response.result, undefined); assert.equal(response.error.code, 3);
  const data = response.error.data; assert.equal(typeof data, 'string'); assert.match(data, DATA); return data;
}
function normalizedLogs(receipt) {
  assert.ok(Array.isArray(receipt.logs));
  return receipt.logs.map((entry, i) => {
    assert.match(entry.address, ADDRESS); assert.ok(Array.isArray(entry.topics));
    entry.topics.forEach(value => assert.match(value, WORD)); assert.match(entry.data, DATA);
    assert.equal(entry.transactionHash, receipt.transactionHash); assert.equal(entry.blockHash, receipt.blockHash);
    assert.equal(entry.blockNumber, receipt.blockNumber); assert.equal(entry.removed, false);
    assert.equal(BigInt(entry.logIndex), BigInt(i));
    return { address: entry.address, topics: entry.topics, data: entry.data };
  });
}
function checkTransaction(record, expected) {
  const dry = row(record, expected.label + '.dry'), send = row(record, expected.label + '.send');
  assert.deepEqual(dry.request.params, [expected.request, 'latest']); assert.deepEqual(send.request.params, [expected.request]);
  const transactionHash = result(record, expected.label + '.send'); assert.match(transactionHash, WORD);
  const receipt = result(record, expected.label + '.receipt');
  assert.deepEqual(row(record, expected.label + '.receipt').request.params, [transactionHash]);
  assert.equal(receipt.transactionHash, transactionHash); assert.equal(receipt.from, expected.request.from);
  assert.equal(receipt.to, expected.request.to ?? null); assert.equal(receipt.contractAddress, expected.request.to ? null : PROBE);
  assert.equal(receipt.status, expected.success ? '0x1' : '0x0'); assert.equal(receipt.type, '0x0');
  assert.equal(receipt.effectiveGasPrice, '0x174876e800'); assert.match(receipt.gasUsed, QUANTITY);
  assert.ok(BigInt(receipt.gasUsed) > 0n && BigInt(receipt.gasUsed) <= 1_000_000n);
  assert.equal(receipt.cumulativeGasUsed, receipt.gasUsed); assert.equal(receipt.transactionIndex, '0x0');
  assert.match(receipt.blockHash, WORD); assert.match(receipt.blockNumber, QUANTITY);
  assert.deepEqual(normalizedLogs(receipt), expected.logs, expected.label);
  if (expected.success) assert.equal(dry.response.result, expected.returned, expected.label);
  else assert.equal(revertData(dry.response), expected.error, expected.label);
  return { dry_response: dry.response, transaction_hash: transactionHash, receipt };
}
function checkCases(record, selected) {
  const plan = plans.get(record);
  for (const expected of plan.cases.filter(selected)) {
    const actual = record.cases.find(entry => entry.label === expected.label); assert.ok(actual, expected.label);
    assert.equal(actual.kind, 'transition'); assert.equal(actual.expected_success, expected.action.success);
    assert.deepEqual(actual.before, expected.before, expected.label + '.before'); assert.deepEqual(actual.after, expected.after, expected.label + '.after');
    assert.deepEqual(actual.action, checkTransaction(record, expected.action), expected.label + '.summary');
    if (expected.recovered) assert.deepEqual(actual.recovered, expected.recovered, expected.label + '.recovered');
    if (expected.callback) assert.deepEqual(actual.callback, expected.callback, expected.label + '.callback');
  }
}

test('local custody source, compiler artifacts and runtime inputs match retained pins', () => {
  for (const [name, digest] of Object.entries(INPUTS)) assert.equal(hash(read(dir + name)), digest, name);
  assert.equal(hash(read(dir + 'run_local_custody.py')), HARNESS_HASH); assert.equal(hash(read(dir + 'local_node.py')), NODE_HASH);
  for (const record of [fork, synthetic]) assert.deepEqual(record.inputs, { harness_sha256: HARNESS_HASH, node_sha256: NODE_HASH, files: INPUTS });
  assert.equal(fixtureBuild.compiler, '0.8.10+commit.fc410830'); assert.equal(probeBuild.compiler, fixtureBuild.compiler);
  assert.equal(fixtureBuild.source_sha256, INPUTS['AdversarialToken.sol']); assert.equal(fixtureBuild.compiler_input_sha256, INPUTS['compile-standard.json']);
  assert.equal(json(dir + 'compile-standard.json').sources['AdversarialToken.sol'].content, read(dir + 'AdversarialToken.sol').toString('utf8'));
  assert.equal((fixtureBuild.bytecode.length - 2) / 2, 3408); assert.equal((fixtureBuild.runtime.length - 2) / 2, 3376);
  assert.equal(hash(Buffer.from(fixtureBuild.runtime.slice(2), 'hex')), 'e6e91d3af6e3d170b77f93fcfcd1503526e86dbfcb4be1d12cfcbf0c952eea98');
  const toolchain = json(dir + 'toolchain.json');
  assert.equal(toolchain.schema, 'caw-local-custody-toolchain/1');
  assert.equal(toolchain.anvil_source_commit, '982849d3140c01fd3b72905759581a132df7aa98');
  assert.equal(toolchain.anvil_sha256, 'c6e29da1b010fe00bac6c0dc5c29484bd641deb5a84050aea10d13e9dc4fe26f');
  assert.equal(toolchain.archive_sha256, '02d98fc2c573793960ee06b7f642487d483fe30572f7e248804c207334a418d8');
  assert.equal(toolchain.compiler_sha256, 'ec9feb83ff291ae74805b38cc6834502fb31be690f325de59dff8e60d8432d66');
  assert.equal(toolchain.fixture_compile_input_sha256, INPUTS['compile-standard.json']); assert.equal(toolchain.fixture_compiler_errors, 0);
  for (const flag of ['sigstore_cryptographically_verified', 'native_binary_distributed_in_alpha', 'production_toolchain_selected', 'probe_source_and_build_changed']) assert.equal(toolchain[flag], false);
  assert.equal(keccak256Hex(probeBuild.runtime), '0xfa0f37729cb264ed76e7616fb6fc601bfc44013ca436aa8743c3b9a1128d8f0e');
  assert.equal('0x' + keccak256Hex('0xd694' + D.slice(2) + '80').slice(-40), PROBE);
});

test('separate local runs report bounded execution and their actual synthetic overrides', () => {
  for (const [record, mode, count] of [[fork, 'fork', 23], [synthetic, 'synthetic', 26]]) {
    assert.equal(record.schema, 'caw-local-custody/1'); assert.equal(record.complete, true); assert.equal(record.failure, undefined);
    assert.equal(record.mode, mode); assert.equal(record.probe_address, PROBE); assert.equal(record.cases.length, count);
    for (const key of ['public_transaction_broadcast', 'real_wallet_used', 'consensus_or_owner_authentication']) assert.equal(record[key], false, key);
    assert.equal(record.local_impersonation, true); assert.equal(record.synthetic_token_substitution, mode === 'synthetic'); assert.equal(record.token_state_patched, mode === 'synthetic');
    const n = record.node;
    assert.equal(n.schema, 'caw-local-node/1'); assert.equal(n.mode, mode); assert.equal(n.local_chain_id, 31337);
    assert.equal(n.anvil_version, '1.8.1'); assert.equal(n.anvil_sha256, 'c6e29da1b010fe00bac6c0dc5c29484bd641deb5a84050aea10d13e9dc4fe26f'); assert.equal(n.anvil_bytes, 41583616);
    assert.equal(n.host, '127.0.0.1'); assert.equal(n.port, 18545); assert.equal(n.hardfork, 'london'); assert.equal(n.stop_reason, null);
    assert.equal(n.generated_accounts, 0); for (const key of ['wallet_used', 'transaction_broadcast', 'local_impersonation_is_ownership_proof', 'token_storage_overridden']) assert.equal(n[key], false, key);
    assert.equal(n.token_code_replaced, mode === 'synthetic'); assert.ok(n.wall_seconds > 0 && n.wall_seconds <= 600);
    assert.ok(n.peak_node_memory_bytes > 0 && n.peak_node_memory_bytes <= 512 * 1024 * 1024); assert.ok(n.node_output_bytes <= 1024 * 1024);
    assert.equal(n.local_request_count, record.local_calls.length); assert.ok(record.local_calls.length <= 1800);
    assert.equal(record.local_calls.length, mode === 'fork' ? 519 : 1482);
    assert.equal(n.local_transaction_attempts, plans.get(record).transactions.length); assert.ok(n.local_transaction_attempts <= 250);
    const overrides = [...(mode === 'synthetic' ? [{ method: 'anvil_setCode', params: [TOKEN, fixtureBuild.runtime], local_only: true }] : [])];
    for (const who of [A, B, D]) overrides.push({ method: 'anvil_setBalance', params: [who, '0xde0b6b3a7640000'], local_only: true }, { method: 'anvil_impersonateAccount', params: [who], local_only: true });
    assert.deepEqual(n.overrides, overrides);
  }
});

test('every local request and original response is accounted for by the independent full-call oracle', () => {
  for (const record of [fork, synthetic]) {
    const plan = plans.get(record);
    assert.equal(new Set(record.local_calls.map(entry => entry.label)).size, record.local_calls.length);
    assert.deepEqual(record.local_calls.map(entry => entry.label), plan.rows.map(entry => entry.label));
    for (const [index, expected] of plan.rows.entries()) {
      const actual = record.local_calls[index]; assert.equal(actual.failure, undefined); assert.deepEqual(JSON.parse(actual.raw_response), actual.response);
      const params = expected.params.map(value => value && typeof value === 'object' && Object.hasOwn(value, 'resultOf') ? result(record, value.resultOf) : value);
      assert.deepEqual(actual.request, { jsonrpc: '2.0', id: index + 1, method: expected.method, params }, expected.label);
      assert.equal(actual.response.jsonrpc, '2.0'); assert.equal(actual.response.id, index + 1);
      assert.deepEqual(Object.keys(actual.response).sort(), Object.hasOwn(actual.response, 'error') ? ['error', 'id', 'jsonrpc'] : ['id', 'jsonrpc', 'result']);
      const e = expected.expected;
      if (e && typeof e === 'object') {
        if (Object.hasOwn(e, 'error')) assert.equal(revertData(actual.response), e.error, expected.label);
        else if (e.header) header(result(record, expected.label));
        else if (e.tokenRuntime) { const bytes = result(record, expected.label); assert.match(bytes, DATA); assert.equal(hash(Buffer.from(bytes.slice(2), 'hex')), 'ac5c77c1372337655d8f0257e34feec1ab0506dc8e8e7f034252cba66390bea1'); }
        else if (e.hash) assert.match(result(record, expected.label), WORD);
        else if (e.quantity) assert.match(result(record, expected.label), QUANTITY);
        else assert.equal(e.receipt, true);
      } else assert.deepEqual(result(record, expected.label), e, expected.label);
    }
    for (const tx of plan.transactions) {
      const checked = checkTransaction(record, tx);
      if (tx.label === 'create_probe') assert.deepEqual(record.creation, checked);
    }
  }
});

test('the fork proxy forwards only pinned historical reads and the synthetic run makes no upstream requests', () => {
  assert.deepEqual(synthetic.upstream_calls, []); assert.equal(synthetic.node.proxy_request_count, 0); assert.equal(synthetic.node.upstream_forwarded_count, 0);
  assert.equal(synthetic.node.remote_provider, null); assert.equal(synthetic.node.fork_block, null);
  assert.equal(fork.node.remote_provider, 'https://eth.drpc.org'); assert.equal(fork.node.fork_block, BLOCK);
  assert.equal(fork.node.expected_fork_hash, BLOCK_HASH); assert.equal(fork.node.expected_state_root, ROOT);
  assert.equal(fork.node.proxy_request_count, fork.upstream_calls.length); assert.ok(fork.upstream_calls.length > 0 && fork.upstream_calls.length <= 200);
  let forwarded = 0, headers = 0, runtime = 0;
  // Original ERC20 layout: balances slot0, allowances nested slot1, supply slot2.
  // This checks provider input correspondence, not an authenticated state proof.
  const balanceSlot = who => keccak256Hex(uint(who) + word(0));
  const allowanceSlot = (owner, spender) => keccak256Hex(uint(spender) + keccak256Hex(uint(owner) + word(1)).slice(2));
  const storageExpected = new Map([[balanceSlot(A), uint(698790077736n)], [balanceSlot(B), uint(0)],
    [balanceSlot(PROBE), uint(0)], [uint(2), uint(FORK_INITIAL.supply)], [allowanceSlot(A, PROBE), uint(0)],
    [allowanceSlot(B, PROBE), uint(0)], [allowanceSlot(A, B), uint(0)]]);
  const storageSeen = new Set();
  const pinned = block => block === BLOCK || (block && typeof block === 'object' && Object.keys(block).sort().join(',') === 'blockHash,requireCanonical' && block.blockHash === BLOCK_HASH && typeof block.requireCanonical === 'boolean');
  for (const entry of fork.upstream_calls) {
    assert.deepEqual(JSON.parse(entry.raw_response), entry.response); assert.equal(entry.response.id, entry.request.id); assert.equal(entry.response.jsonrpc, '2.0');
    if (!entry.forwarded) {
      assert.ok(['anvil_nodeInfo', 'eth_getAccountInfo'].includes(entry.request.method)); assert.equal(entry.response.error.code, -32601); continue;
    }
    forwarded++; const request = entry.forwarded_request ?? entry.request;
    assert.equal(request.jsonrpc, '2.0'); assert.ok(Array.isArray(request.params)); assert.equal(entry.response.error, undefined);
    if (entry.forwarded_request) { assert.ok(['eth_chainId', 'net_version'].includes(request.method)); assert.deepEqual(request, { ...entry.request, params: [] }); }
    const p = request.params;
    if (request.method === 'eth_chainId') { assert.deepEqual(p, []); assert.equal(entry.response.result, '0x1'); }
    else if (request.method === 'net_version') { assert.deepEqual(p, []); assert.equal(entry.response.result, '1'); }
    else if (['eth_getBlockByNumber', 'eth_getBlockByHash'].includes(request.method)) {
      assert.equal(p.length, 2); assert.equal(p[0], request.method.endsWith('Number') ? BLOCK : BLOCK_HASH); assert.equal(typeof p[1], 'boolean'); header(entry.response.result); headers++;
    } else {
      assert.ok(['eth_getCode', 'eth_getBalance', 'eth_getTransactionCount', 'eth_getStorageAt'].includes(request.method));
      assert.match(p[0], ADDRESS); assert.ok(pinned(p.at(-1))); assert.equal(p.length, request.method === 'eth_getStorageAt' ? 3 : 2);
      if (request.method === 'eth_getStorageAt') {
        assert.equal(p[0], TOKEN); assert.ok(QUANTITY.test(p[1]) || WORD.test(p[1]));
        const slot = uint(p[1]); assert.ok(storageExpected.has(slot));
        assert.equal(entry.response.result, storageExpected.get(slot)); storageSeen.add(slot);
      }
      if (request.method === 'eth_getCode' && p[0] === TOKEN) { assert.equal(entry.response.result, result(fork, 'token_runtime')); runtime++; }
    }
  }
  assert.equal(forwarded, fork.node.upstream_forwarded_count); assert.ok(headers >= 1 && runtime >= 1);
  assert.deepEqual([...storageSeen].sort(), [...storageExpected.keys()].sort());
});

test('all 23 real-token fork transitions reproduce exact balances, ABI outcomes and event order', () => {
  assert.equal(plans.get(fork).cases.length, 23); assert.deepEqual(fork.cases.map(entry => entry.label), plans.get(fork).cases.map(entry => entry.label));
  assert.deepEqual(fork.initial, FORK_INITIAL); assert.deepEqual(fork.final, plans.get(fork).final); checkCases(fork, () => true);
  assert.equal(fork.maximum_before, String(MAX)); assert.equal(fork.maximum_after, String(MAX - 1n));
  assert.equal(fork.final.balance_probe, '2'); assert.equal(fork.final.credit_a, '0'); assert.equal(fork.final.credit_b, '0'); assert.equal(fork.final.total_credits, '0');
});

test('synthetic return violations roll back while trailing bytes retain observed compatibility', () => {
  assert.equal(plans.get(synthetic).cases.length, 26); assert.deepEqual(synthetic.cases.map(entry => entry.label), plans.get(synthetic).cases.map(entry => entry.label));
  assert.deepEqual(synthetic.initial, SYN_INITIAL); assert.deepEqual(synthetic.final, plans.get(synthetic).final);
  checkCases(synthetic, entry => /_(false|revert|short|empty|invalid_bool|trailing)$/.test(entry.label) && !entry.label.includes('incoming_'));
  for (const direction of ['deposit', 'withdraw']) assert.equal(synthetic.cases.find(entry => entry.label === direction + '_trailing').action.receipt.status, '0x1');
});

test('synthetic delta mismatches revert and an extra payer fee is explicitly an accepted deposit limit', () => {
  checkCases(synthetic, entry => ['deposit_incoming_short', 'withdraw_extra_debit', 'withdraw_short_credit', 'deposit_sender_fee'].includes(entry.label));
  const fee = synthetic.cases.find(entry => entry.label === 'deposit_sender_fee');
  assert.equal(fee.after.balance_a, '987'); assert.equal(fee.after.balance_probe, '19'); assert.equal(fee.after.credit_a, '12'); assert.equal(fee.after.supply, '1999');
});

test('all eight synthetic callback branches preserve rejection telemetry or atomically roll it back', () => {
  checkCases(synthetic, entry => entry.label.includes('_callback_'));
  assert.equal(synthetic.cases.filter(entry => entry.label.includes('_callback_')).length, 8);
  for (const entry of synthetic.cases.filter(entry => entry.label.includes('_callback_'))) {
    assert.equal(entry.callback.error, entry.label.endsWith('_bubble') ? uint(0) : selector('Reentrant()') + '00'.repeat(28));
  }
});

test('pre-existing synthetic losses stop both directions until uncredited donation restores backing', () => {
  checkCases(synthetic, entry => entry.label.startsWith('underbacked_'));
  for (const entry of synthetic.cases.filter(entry => entry.label.startsWith('underbacked_'))) {
    assert.equal(entry.before.balance_probe, '16'); assert.equal(entry.before.total_credits, '17');
    assert.equal(entry.recovered.balance_probe, '16'); assert.equal(entry.recovered.total_credits, '16'); assert.equal(entry.recovered.supply, '1999');
  }
});

test('every synthetic branch starts from the same baseline and proves exact guard recovery', () => {
  for (const entry of plans.get(synthetic).cases) {
    const actual = synthetic.cases.find(value => value.label === entry.label);
    assert.deepEqual(actual.recovered, entry.recovered);
    for (const field of FIELDS) assert.equal(result(synthetic, entry.label + '.reset_state.' + field), uint(SYN_INITIAL[field]));
    if (!entry.label.startsWith('underbacked_')) assert.equal(BigInt(actual.recovered.allowance_a), BigInt(actual.after.allowance_a) - 1n);
  }
  // Snapshot branches may reuse transaction hashes/nonces; unique labels and
  // complete request/response correlation are the identifying evidence here.
  assert.equal(synthetic.node.local_transaction_attempts, 143);
});
