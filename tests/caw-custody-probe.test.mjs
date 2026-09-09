import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { keccak256Hex } from '../reference/keccak256.mjs';

const read = name => readFileSync(new URL('../' + name, import.meta.url));
const json = name => JSON.parse(read(name).toString('utf8'));
const captures = [json('experiments/custody/drpc-simulation.json')];
const unavailable = json('experiments/custody/publicnode-simulation.json');
const build = json('experiments/custody/probe-build.json');
const TOKEN = '0xf3b9569f82b18aef890de263b84189bd33ebe452';
const A = '0x0000000000000000000000000000000000000001';
const B = '0x0000000000000000000000000000000000000002';
const DEPLOYER = '0x' + '00'.repeat(16) + 'ca170001';
const BLOCK = '0x18bc1ea';
const HASH = '0xf3e3dfad2242562dbed62de90831c39eace7c7c6e88f8c509afccef9a5f73e4d';
const STATE_ROOT = '0x6d530d69c70f41b4b1a57f39751336304ff7c2c5d45e4dcd946869ecce4c0152';
const TOKEN_CODE_HASH = '0x6ee560d3e6b1f881a8711e0be0b30a0e8e0cf8b915ce8f75ea05002126c94256';
const SOURCE_HASH = 'a9015124d51c80d16cdedce9d97e456bc902d39d23a29d6e0528053340f4c0ee';
const BUILD_HASH = 'c939cea1d6bb8e75a3dc1f4809bb3b7fdd7358ed2c244f67e480148690e6d06a';
const SCRIPT_HASH = '9ab5583d369bb47f31370606ab38a7b1ae09fbd156e35bbb9be1bf0c29c81eec';
const COMPILER_INPUT_HASH = '03e08988181215b3005577146fe0372e3c6f5705a47459de7ad3b93b84883886';
const MAX = (1n << 256n) - 1n;
const digest = data => createHash('sha256').update(data).digest('hex');
const word = value => BigInt(value).toString(16).padStart(64, '0');
const keccakText = value => keccak256Hex('0x' + Buffer.from(value).toString('hex'));
const selector = value => keccakText(value).slice(0, 10);
const probe = '0x' + keccak256Hex('0xd694' + DEPLOYER.slice(2) + '80').slice(-40);
const TRUE = '0x' + word(1);
const DATA = /^0x(?:[0-9a-f]{2})*$/;
const quantity = value => { assert.match(value, /^0x(?:0|[1-9a-f][0-9a-f]*)$/); return BigInt(value); };
const encoded = (prefix, ...values) => prefix + values.map(word).join('');

// Independent request oracle: literal selectors and declared order. Do not
// import the Python writer, its expected fields or captured sequence metadata.
const expectedSequence = [];
const request = (label, to, data, from = A, gas = '0x30d40') => {
  const call = { from, gas, data };
  if (to !== null) call.to = to;
  expectedSequence.push({ label, call });
};
const snapshot = prefix => {
  const rows = [
    ['balance_a', TOKEN, encoded('0x70a08231', A)],
    ['balance_probe', TOKEN, encoded('0x70a08231', probe)],
    ['total_supply', TOKEN, '0x18160ddd'],
    ['allowance_probe', TOKEN, encoded('0xdd62ed3e', A, probe)],
    ['credits_a', probe, encoded('0xfe5ff468', A)],
    ['total_credits', probe, '0xb5bd3eb9']
  ];
  for (const [suffix, to, data] of rows) request(prefix + '.' + suffix, to, data, A, '0x186a0');
};
request('create_probe', null, build.bytecode, DEPLOYER, '0xf4240');
snapshot('initial');
request('approve_13', TOKEN, encoded('0x095ea7b3', probe, 13));
snapshot('after_approve');
request('deposit_1', probe, encoded('0xb6b55f25', 1)); snapshot('after_deposit_1');
request('deposit_7', probe, encoded('0xb6b55f25', 7)); snapshot('after_deposit_7');
request('foreign_withdraw_1', probe, encoded('0x2e1a7d4d', 1), B);
request('deployer_withdraw_1', probe, encoded('0x2e1a7d4d', 1), DEPLOYER);
request('deposit_zero', probe, encoded('0xb6b55f25', 0));
request('withdraw_zero', probe, encoded('0x2e1a7d4d', 0));
request('withdraw_over_credit_9', probe, encoded('0x2e1a7d4d', 9));
request('deposit_over_allowance_6', probe, encoded('0xb6b55f25', 6));
snapshot('after_rejections');
request('withdraw_3', probe, encoded('0x2e1a7d4d', 3)); snapshot('after_withdraw_3');
request('withdraw_5', probe, encoded('0x2e1a7d4d', 5)); snapshot('after_withdraw_5');
request('donate_2', TOKEN, encoded('0xa9059cbb', probe, 2)); snapshot('after_donation');
request('withdraw_surplus_1', probe, encoded('0x2e1a7d4d', 1)); snapshot('after_surplus_rejection');
request('maximum.initial_balance_b', TOKEN, encoded('0x70a08231', B), A, '0x186a0');
request('maximum.approve', TOKEN, encoded('0x095ea7b3', B, MAX));
request('maximum.allowance_before_spend', TOKEN, encoded('0xdd62ed3e', A, B), A, '0x186a0');
request('maximum.transfer_from_1', TOKEN, encoded('0x23b872dd', A, B, 1), B);
request('maximum.allowance_after_spend', TOKEN, encoded('0xdd62ed3e', A, B), A, '0x186a0');
request('maximum.final_balance_b', TOKEN, encoded('0x70a08231', B), A, '0x186a0');
snapshot('after_maximum_allowance');

const outerRows = [
  ['chain', 'eth_chainId', []], ['block_before', 'eth_getBlockByNumber', [BLOCK, false]],
  ['token_runtime', 'eth_getCode', [TOKEN, BLOCK]]
];
const identities = when => {
  for (const [name, address] of [['deployer', DEPLOYER], ['probe', probe]]) {
    outerRows.push([name + '_nonce_' + when, 'eth_getTransactionCount', [address, BLOCK]],
      [name + '_code_' + when, 'eth_getCode', [address, BLOCK]]);
  }
};
const persistent = when => {
  for (const [name, data] of [
    ['balance_a', encoded('0x70a08231', A)], ['balance_b', encoded('0x70a08231', B)],
    ['balance_probe', encoded('0x70a08231', probe)], ['total_supply', '0x18160ddd'],
    ['allowance_probe', encoded('0xdd62ed3e', A, probe)], ['allowance_b', encoded('0xdd62ed3e', A, B)]
  ]) outerRows.push(['persistent_' + when + '.' + name, 'eth_call', [{ from: A, to: TOKEN, gas: '0x30d40', data }, BLOCK]]);
};
identities('before'); persistent('before');
outerRows.push(['custody_sequence', 'eth_simulateV1', [{ blockStateCalls: [{ calls: expectedSequence.map(row => row.call) }],
  validation: false, traceTransfers: false, returnFullTransactions: false }, BLOCK]]);
persistent('after'); identities('after');
outerRows.push(['block_after', 'eth_getBlockByNumber', [BLOCK, false]]);
const expectedRPC = outerRows.map(([label, method, params], index) => ({ label,
  request: { jsonrpc: '2.0', id: index + 1, method, params } }));
const rpc = (capture, label) => {
  const rows = capture.calls.filter(row => row.label === label);
  assert.equal(rows.length, 1, label);
  assert.equal(rows[0].http_status, 200, label);
  assert.equal(rows[0].capture_failure, undefined, label);
  assert.equal(rows[0].transport_failure, undefined, label);
  assert.deepEqual(Object.keys(rows[0].response).sort(), ['id', 'jsonrpc', 'result'], label);
  assert.equal(rows[0].response.jsonrpc, '2.0', label);
  assert.equal(rows[0].response.id, rows[0].request.id, label);
  assert.equal(rows[0].response.error, undefined, label);
  return rows[0].response.result;
};
const calls = capture => {
  const blocks = rpc(capture, 'custody_sequence');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].calls.length, 80);
  return blocks[0].calls;
};
const at = (capture, label) => {
  const indexes = expectedSequence.flatMap((row, i) => row.label === label ? [i] : []);
  assert.equal(indexes.length, 1, label);
  return calls(capture)[indexes[0]];
};
const value = (capture, label) => {
  const result = at(capture, label);
  assert.equal(result.status, '0x1', label);
  assert.equal(result.error, undefined, label);
  assert.deepEqual(normalizedLogs(result), [], label);
  assert.match(result.returnData, /^0x[0-9a-f]{64}$/);
  return BigInt(result.returnData);
};
function errorData(call) {
  const payloads = [];
  if (Object.hasOwn(call, 'returnData')) { assert.equal(typeof call.returnData, 'string'); assert.match(call.returnData, DATA); payloads.push(call.returnData); }
  if (Object.hasOwn(call, 'error')) {
    assert.ok(call.error && typeof call.error === 'object' && !Array.isArray(call.error));
    if (Object.hasOwn(call.error, 'data')) { assert.equal(typeof call.error.data, 'string'); assert.match(call.error.data, DATA); payloads.push(call.error.data); }
  }
  const nonempty = payloads.filter(x => x !== '0x');
  assert.ok(nonempty.length, 'revert bytes missing');
  assert.ok(nonempty.every(x => x === nonempty[0]), 'ambiguous revert bytes');
  return nonempty[0];
}
function normalizedLogs(call) {
  if (!Object.hasOwn(call, 'logs')) return [];
  assert.ok(Array.isArray(call.logs), 'logs must be an array when supplied');
  return call.logs.map(row => {
    assert.ok(row && typeof row === 'object' && !Array.isArray(row));
    assert.match(row.address, /^0x[0-9a-f]{40}$/);
    assert.ok(Array.isArray(row.topics) && row.topics.length <= 4);
    for (const topic of row.topics) assert.match(topic, /^0x[0-9a-f]{64}$/);
    assert.match(row.data, DATA);
    if (Object.hasOwn(row, 'removed')) assert.equal(row.removed, false);
    return { address: row.address, topics: row.topics, data: row.data };
  });
}
const transfer = (from, to, amount) => ({ address: TOKEN,
  topics: [keccakText('Transfer(address,address,uint256)'), '0x' + word(from), '0x' + word(to)], data: '0x' + word(amount) });
const approval = (spender, amount) => ({ address: TOKEN,
  topics: [keccakText('Approval(address,address,uint256)'), '0x' + word(A), '0x' + word(spender)], data: '0x' + word(amount) });
const custodyEvent = (name, amount, credit) => ({ address: probe,
  topics: [keccakText(name + '(address,uint256,uint256)'), '0x' + word(A)], data: '0x' + word(amount) + word(credit) });

test('dRPC custody capture retains the independent full request sequence and unsigned simulation boundary', () => {
  assert.deepEqual(captures.map(row => row.provider), ['https://eth.drpc.org']);
  assert.equal(expectedSequence.length, 80);
  assert.equal(expectedRPC.length, 25);
  for (const capture of captures) {
    assert.equal(capture.schema, 'caw-custody-simulation/1');
    assert.equal(capture.complete, true);
    assert.equal(capture.token, TOKEN);
    assert.equal(capture.block_number, BLOCK);
    assert.equal(capture.expected_block_hash, HASH);
    assert.equal(capture.expected_state_root, STATE_ROOT);
    assert.equal(capture.predicted_probe, probe);
    assert.equal(capture.caller_a, A); assert.equal(capture.caller_b, B); assert.equal(capture.deployer, DEPLOYER);
    for (const key of ['transaction_sent', 'state_overrides_used', 'block_overrides_used', 'nonce_overrides_used', 'wallet_or_signature_used', 'validation', 'native_value_fields_used']) assert.equal(capture[key], false, key);
    assert.equal(rpc(capture, 'chain'), '0x1');
    assert.equal(capture.calls.length, 25);
    assert.deepEqual(capture.calls.map(({ label, request }) => ({ label, request })), expectedRPC);
    assert.equal(capture.sequence.length, 80);
    assert.equal(capture.simulation_call_count, 80);
    assert.deepEqual(capture.sequence.map(({ label, call }) => ({ label, call })), expectedSequence);
    for (const label of ['block_before', 'block_after']) {
      const block = rpc(capture, label);
      assert.equal(block.number, BLOCK); assert.equal(block.hash, HASH);
      assert.equal(block.stateRoot, STATE_ROOT);
      assert.equal(block.timestamp, '0x6aa0ae57');
    }
    const runtime = rpc(capture, 'token_runtime');
    assert.match(runtime, DATA); assert.equal((runtime.length - 2) / 2, 2278);
    assert.equal(keccak256Hex(runtime), TOKEN_CODE_HASH);
    for (const row of capture.calls) rpc(capture, row.label); // Successful envelopes, including all pre/post reads.
    assert.equal(rpc(capture, 'custody_sequence')[0].parentHash, HASH);
    assert.equal(rpc(capture, 'custody_sequence')[0].number, '0x18bc1eb');
    const reported = calls(capture);
    assert.equal(capture.simulation_gas_limit_sum, 10_400_000);
    assert.equal(expectedSequence.reduce((sum, row) => sum + quantity(row.call.gas), 0n), 10_400_000n);
    for (const [index, call] of reported.entries()) {
      assert.ok(quantity(call.gasUsed) < quantity(expectedSequence[index].call.gas), expectedSequence[index].label);
    }
    assert.equal(reported.reduce((sum, call) => sum + quantity(call.gasUsed), 0n), quantity(rpc(capture, 'custody_sequence')[0].gasUsed));
  }
});

test('probe creation and compiler inputs preserve reviewed source and bounded call identities', () => {
  assert.equal(digest(read('experiments/custody/CawCustodyProbe.sol')), SOURCE_HASH);
  assert.equal(digest(read('experiments/custody/probe-build.json')), BUILD_HASH);
  assert.equal(digest(read('experiments/custody/simulate-custody.py')), SCRIPT_HASH);
  assert.equal(digest(read('experiments/custody/compile-standard.json')), COMPILER_INPUT_HASH);
  assert.equal(build.schema, 'caw-custody-probe-build/1');
  assert.equal(build.compiler, '0.8.10+commit.fc410830');
  assert.equal(build.compiler_input_sha256, COMPILER_INPUT_HASH);
  assert.equal(digest(read('experiments/custody/CawCustodyProbe.sol')), build.source_sha256);
  assert.equal(json('experiments/custody/compile-standard.json').sources['CawCustodyProbe.sol'].content, read('experiments/custody/CawCustodyProbe.sol').toString('utf8'));
  for (const capture of captures) {
    assert.equal(capture.inputs.build_sha256, digest(read('experiments/custody/probe-build.json')));
    assert.equal(capture.inputs.script_sha256, digest(read('experiments/custody/simulate-custody.py')));
    assert.equal(capture.inputs.source_sha256, SOURCE_HASH);
    assert.equal(capture.inputs.oracle_sha256, '5f100b6e1a12d29b0004bcb29f2ba5b23ffefc076646d2b67b1fb8df81c2effa');
    assert.deepEqual(capture.sequence[0].call, { from: DEPLOYER, gas: '0xf4240', data: build.bytecode });
    assert.equal(at(capture, 'create_probe').status, '0x1');
    assert.equal(at(capture, 'create_probe').error, undefined);
    assert.equal(at(capture, 'create_probe').returnData, build.runtime);
    assert.deepEqual(normalizedLogs(at(capture, 'create_probe')), []);
    assert.equal(keccak256Hex(build.runtime), '0xfa0f37729cb264ed76e7616fb6fc601bfc44013ca436aa8743c3b9a1128d8f0e');
    assert.equal(capture.inputs.probe_runtime_keccak256, keccak256Hex(build.runtime));
    assert.ok(capture.sequence.length <= 100);
    assert.ok(capture.sequence.reduce((sum, row) => sum + Number(BigInt(row.call.gas)), 0) <= 20_000_000);
    for (const row of capture.sequence.slice(1)) {
      assert.deepEqual(Object.keys(row.call).sort(), ['data','from','gas','to']);
      assert.ok([TOKEN, probe].includes(row.call.to));
      assert.ok([A, B, DEPLOYER].includes(row.call.from));
      assert.ok(BigInt(row.call.gas) <= 200_000n);
    }
  }
});

test('sequential custody snapshots conserve exact credits, balances, allowance and supply', () => {
  const states = [
    ['initial',0,0,null,0], ['after_approve',0,0,13,0],
    ['after_deposit_1',1,1,12,1], ['after_deposit_7',8,8,5,8], ['after_rejections',8,8,5,8],
    ['after_withdraw_3',5,5,5,5], ['after_withdraw_5',0,0,5,0],
    ['after_donation',2,2,5,0], ['after_surplus_rejection',2,2,5,0], ['after_maximum_allowance',3,2,5,0]
  ];
  for (const capture of captures) {
    for (const when of ['before', 'after']) for (const name of ['balance_a','balance_b','balance_probe','total_supply','allowance_probe','allowance_b']) {
      assert.match(rpc(capture, 'persistent_' + when + '.' + name), /^0x[0-9a-f]{64}$/);
    }
    assert.equal(BigInt(rpc(capture, 'persistent_before.balance_probe')), 0n);
    const initial = BigInt(rpc(capture, 'persistent_before.balance_a'));
    assert.ok(initial >= 14n);
    const supply = BigInt(rpc(capture, 'persistent_before.total_supply'));
    const allowance = BigInt(rpc(capture, 'persistent_before.allowance_probe'));
    for (const [label, spent, held, allowed, credit] of states) {
      const expected = [initial-BigInt(spent), BigInt(held), supply, allowed === null ? allowance : BigInt(allowed), BigInt(credit), BigInt(credit)];
      const names = ['balance_a','balance_probe','total_supply','allowance_probe','credits_a','total_credits'];
      assert.deepEqual(names.map(name => value(capture, label+'.'+name)), expected, label);
    }
  }
});

test('successful token and probe events match exact deposit, withdrawal and donation effects', () => {
  for (const capture of captures) {
    for (const [label, returned] of [['approve_13',TRUE], ['deposit_1','0x'], ['deposit_7','0x'],
      ['withdraw_3','0x'], ['withdraw_5','0x'], ['donate_2',TRUE], ['maximum.approve',TRUE], ['maximum.transfer_from_1',TRUE]]) {
      const call = at(capture, label);
      assert.equal(call.status, '0x1', label); assert.equal(call.returnData, returned, label);
      assert.equal(call.error, undefined, label);
    }
    assert.deepEqual(normalizedLogs(at(capture,'approve_13')), [approval(probe,13)]);
    for (const [label,amount,remaining,credit] of [['deposit_1',1,12,1],['deposit_7',7,5,8]]) {
      assert.deepEqual(normalizedLogs(at(capture,label)), [transfer(A,probe,amount),approval(probe,remaining),custodyEvent('Deposited',amount,credit)], label);
    }
    for (const [label,amount,credit] of [['withdraw_3',3,5],['withdraw_5',5,0]]) {
      assert.deepEqual(normalizedLogs(at(capture,label)), [transfer(probe,A,amount),custodyEvent('Withdrawn',amount,credit)], label);
    }
    assert.deepEqual(normalizedLogs(at(capture,'donate_2')), [transfer(A,probe,2)]);
  }
});

test('rejected foreign, deployer, zero and excessive withdrawals preserve failure bytes and no events', () => {
  for (const capture of captures) {
    for (const [label,signature,amount,caller] of [
      ['foreign_withdraw_1','InsufficientCredit()',1,B],['deployer_withdraw_1','InsufficientCredit()',1,DEPLOYER],
      ['deposit_zero','ZeroAmount()',0,A],['withdraw_zero','ZeroAmount()',0,A],
      ['withdraw_over_credit_9','InsufficientCredit()',9,A],['withdraw_surplus_1','InsufficientCredit()',1,A]]) {
      const row = capture.sequence.find(row => row.label === label);
      assert.equal(row.call.from, caller); assert.equal(row.call.to, probe);
      assert.equal(row.call.data, selector(label==='deposit_zero'?'deposit(uint256)':'withdraw(uint256)')+word(amount));
      const call = at(capture,label);
      assert.equal(call.status,'0x0'); assert.equal(errorData(call),selector(signature));
      assert.deepEqual(normalizedLogs(call),[]);
    }
    const allowanceFailure=at(capture,'deposit_over_allowance_6');
    assert.equal(allowanceFailure.status,'0x0'); assert.deepEqual(normalizedLogs(allowanceFailure),[]);
    const reason = Buffer.from('ERC20: transfer amount exceeds allowance', 'utf8');
    const completeABI = '0x08c379a0' + word(32) + word(reason.length) +
      reason.toString('hex').padEnd(Math.ceil(reason.length / 32) * 64, '0');
    assert.equal(errorData(allowanceFailure), completeABI);
  }
});

test('original token maximum allowance decreases and simulated changes are absent from pinned persistent reads', () => {
  for (const capture of captures) {
    assert.equal(value(capture,'maximum.initial_balance_b'),BigInt(rpc(capture,'persistent_before.balance_b')));
    assert.equal(value(capture,'maximum.allowance_before_spend'),MAX);
    assert.equal(value(capture,'maximum.allowance_after_spend'),MAX-1n);
    assert.equal(value(capture,'maximum.final_balance_b'),BigInt(rpc(capture,'persistent_before.balance_b'))+1n);
    assert.deepEqual(normalizedLogs(at(capture,'maximum.transfer_from_1')),[transfer(A,B,1),approval(B,MAX-1n)]);
    assert.deepEqual(normalizedLogs(at(capture,'maximum.approve')),[approval(B,MAX)]);
    for (const name of ['balance_a','balance_b','balance_probe','total_supply','allowance_probe','allowance_b']) assert.equal(rpc(capture,'persistent_before.'+name),rpc(capture,'persistent_after.'+name),name);
    for (const identity of ['deployer','probe']) for (const when of ['before','after']) {
      assert.equal(rpc(capture,identity+'_code_'+when),'0x'); assert.equal(rpc(capture,identity+'_nonce_'+when),'0x0');
    }
  }
});

test('PublicNode archive access failure remains a failure without simulated outcomes or provider agreement', () => {
  assert.equal(unavailable.schema, 'caw-custody-simulation/1');
  assert.equal(unavailable.provider, 'https://ethereum-rpc.publicnode.com');
  assert.equal(unavailable.complete, false);
  assert.equal(unavailable.failure, 'RPC_REJECTED');
  assert.equal(unavailable.token, TOKEN);
  assert.equal(unavailable.block_number, BLOCK);
  assert.equal(unavailable.expected_block_hash, HASH);
  assert.equal(unavailable.expected_state_root, STATE_ROOT);
  assert.equal(unavailable.inputs.script_sha256, SCRIPT_HASH);
  for (const key of ['transaction_sent', 'state_overrides_used', 'block_overrides_used', 'nonce_overrides_used', 'wallet_or_signature_used', 'validation', 'native_value_fields_used']) assert.equal(unavailable[key], false, key);
  assert.equal(unavailable.calls.length, 3);
  assert.deepEqual(unavailable.calls.map(({ label, request }) => ({ label, request })), expectedRPC.slice(0, 3));
  assert.equal(rpc(unavailable, 'chain'), '0x1');
  const header = rpc(unavailable, 'block_before');
  assert.equal(header.number, BLOCK); assert.equal(header.hash, HASH); assert.equal(header.stateRoot, STATE_ROOT);
  const rejected = unavailable.calls[2];
  assert.equal(rejected.http_status, 403);
  assert.equal(rejected.capture_failure, 'RPC_REJECTED');
  assert.equal(rejected.response.jsonrpc, '2.0'); assert.equal(rejected.response.id, 3);
  assert.deepEqual(Object.keys(rejected.response).sort(), ['error', 'id', 'jsonrpc']);
  assert.equal(rejected.response.error.code, -32602);
  assert.equal(rejected.response.error.message, 'Archive requests require a personal token. Get one at: https://www.allnodes.com/publicnode');
  for (const field of ['sequence', 'checks', 'simulation_call_count', 'persistent_after']) assert.equal(Object.hasOwn(unavailable, field), false, field);
});
