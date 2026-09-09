import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { keccak256Hex } from '../reference/keccak256.mjs';

// Offline oracle: never imports or runs the acquisition/scenario programs.
// Literal actions below come from the reviewed experiment; expected balances,
// authorities and logs are reconstructed here, never from captured expected*.
const dir = 'experiments/account-authority/';
const read = path => readFileSync(new URL('../' + path, import.meta.url));
const json = path => JSON.parse(read(path).toString('utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const build = json(dir + 'authority-build.json');
const records = ['fork', 'synthetic'].map(mode => json(dir + mode + '-result.json'));
const TOKEN = '0xf3b9569f82b18aef890de263b84189bd33ebe452';
const A = '0x0000000000000000000000000000000000000001';
const B = '0x0000000000000000000000000000000000000002';
const D = '0x00000000000000000000000000000000ca180001';
const ZERO = '0x' + '00'.repeat(20);
const BLOCK = '0x18bc1ea';
const BLOCK_HASH = '0xf3e3dfad2242562dbed62de90831c39eace7c7c6e88f8c509afccef9a5f73e4d';
const ROOT = '0x6d530d69c70f41b4b1a57f39751336304ff7c2c5d45e4dcd946869ecce4c0152';
const WORD = /^0x[0-9a-f]{64}$/;
const DATA = /^0x(?:[0-9a-f]{2})*$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const word = value => BigInt(typeof value === 'boolean' ? Number(value) : value).toString(16).padStart(64, '0');
const uint = value => '0x' + word(value);
const topics = new Map();
const topic = signature => {
  if (!topics.has(signature)) topics.set(signature, keccak256Hex('0x' + Buffer.from(signature).toString('hex')));
  return topics.get(signature);
};
const selector = signature => topic(signature).slice(0, 10);
const abi = (signature, ...args) => selector(signature) + args.map(word).join('');
const reason = text => {
  const bytes = Buffer.from(text, 'ascii');
  return '0x08c379a0' + word(32) + word(bytes.length) + bytes.toString('hex').padEnd(Math.ceil(bytes.length / 32) * 64, '0');
};
// Fixed original actor, nonce 0..4, short canonical RLP. No harness address code.
const created = nonce => '0x' + keccak256Hex('0xd694' + D.slice(2) + (nonce === 0 ? '80' : nonce.toString(16).padStart(2, '0'))).slice(-40);
const REG = created(0), PROBE = created(1), HOOK = created(2);
const names = new Map([[A, 'a'], [B, 'b'], [D, 'd'], [HOOK, 'hook'], [PROBE, 'probe']]);
const txData = (from, to, data) => ({ from, data, gas: '0xf4240', gasPrice: '0x174876e800', value: '0x0', ...(to === null ? {} : { to }) });
const event = (address, signature, indexed, values) => ({ address, topics: [topic(signature), ...indexed.map(uint)], data: '0x' + values.map(word).join('') });
const tokenTransfer = (from, to, amount) => event(TOKEN, 'Transfer(address,address,uint256)', [from, to], [amount]);
const tokenApproval = (owner, amount) => event(TOKEN, 'Approval(address,address,uint256)', [owner, PROBE], [amount]);
const nftTransfer = (from, to, id) => event(REG, 'Transfer(address,address,uint256)', [from, to, id], []);
const nftApproval = (owner, approved, id) => event(REG, 'Approval(address,address,uint256)', [owner, approved, id], []);
const custodyEvent = (kind, id, owner, amount, credit, epoch) => event(PROBE,
  kind === 'deposit' ? 'Deposited(uint256,address,uint256,uint256,uint256)' : 'Withdrawn(uint256,address,uint256,uint256,uint256)',
  [id, owner], [amount, credit, epoch]);
const INPUTS = {
  'CawAccountCustodyProbe.sol': '4c94066daf7b9d31a8da4717adb316e19a9ac8db400dd82e420071d3c4a19055',
  'TestAccountRegistry.sol': 'ab3aecb6b0bc77fa838baf1141d2af96ad8395850b714f35b2f0cdb3b8c826df',
  'AccountHookFixture.sol': 'f0bb1cc2070376750f4888e96204511ad948c5a4f03d6940e68ec591656de474',
  'AccountAdversarialToken.sol': 'aedb0c7d317bf55591f3c38db3f36783b32c18129c33582cfa7fc4459445a58f',
  'compile-standard.json': 'de67929edaefab5980a467a8422d4f7bfa650020a2e322fe593fe249ce811807',
  'authority-build.json': '43dca5ba9079d2f5a1bc4a155b21b31a147f573fd8ab995c7fbde3e11b9341fa',
  'account-token-build.json': '55a07478fa4673c9d48d4f5905b1b73cc540e6bac90b023cec705cf80562129f',
  'account_node.py': '461a0d0e0f6124d8540f58bb77252406d081a81dd180438cea26d01420bb5bbf',
  '../../reference/fixtures/generate-ethereum-proof-fixtures.py': '5f100b6e1a12d29b0004bcb29f2ba5b23ffefc076646d2b67b1fb8df81c2effa'
};
const HARNESS = 'd6ed0548f91a2b5d7a9208ef24ff4a78b5094aae185e63e9a704b2ce728d533f';
const INPUT_MANIFEST = '23bf546149bf28d8107866cfd8256091f18d4621b1ca10e8be6d093275c83d14';

function runtime(name, bindings = {}) {
  const contract = build.contracts[name], bytes = Buffer.from(contract.runtime.slice(2), 'hex');
  assert.deepEqual(Object.keys(contract.immutables).sort(), Object.keys(bindings).sort());
  const used = new Set();
  for (const [binding, locations] of Object.entries(contract.immutables)) for (const { start, length } of locations) {
    assert.equal(length, 32); assert.ok(Number.isSafeInteger(start) && start >= 0 && start + length <= bytes.length);
    for (let i = start; i < start + length; i++) { assert.ok(!used.has(i)); used.add(i); assert.equal(bytes[i], 0); }
    Buffer.from(word(bindings[binding]), 'hex').copy(bytes, start);
  }
  return '0x' + bytes.toString('hex');
}
const REG_HASH = keccak256Hex(runtime('TestAccountRegistry'));
const RUNTIMES = {
  TestAccountRegistry: runtime('TestAccountRegistry'),
  CawAccountCustodyProbe: runtime('CawAccountCustodyProbe', { registry: REG, registryCodeHash: REG_HASH }),
  AccountHookFixture: runtime('AccountHookFixture')
};
function initial(mode) {
  const state = { balance_a: '698790077736', balance_b: '0', balance_d: '0', balance_hook: '0', balance_probe: '0',
    supply: '666666666666666000000000000000000', allowance_a: '0', allowance_b: '0', total_credits: '0',
    operator_a_d: '0', nft_a: '2', nft_b: '1', nft_d: '0', nft_hook: '0' };
  for (const id of [1, 2, 3]) Object.assign(state, { ['owner_' + id]: id === 3 ? B : A, ['epoch_' + id]: '0', ['credit_' + id]: '0', ['approved_' + id]: ZERO });
  if (mode === 'synthetic') Object.assign(state, { balance_a: '983', balance_b: '995', balance_probe: '22', supply: '2000', allowance_a: '83', allowance_b: '95', credit_1: '10', credit_2: '7', credit_3: '5', total_credits: '22' });
  return state;
}
const adjust = (state, changes) => {
  for (const [key, delta] of Object.entries(changes)) { state[key] = String(BigInt(state[key]) + BigInt(delta)); assert.ok(BigInt(state[key]) >= 0n, key); }
};

function oracle(mode) {
  const rows = [], transactions = [], steps = [], resets = [], telemetry = [], deployments = [];
  let current = initial(mode);
  const add = (label, method, params, expected) => rows.push({ label, method, params, expected });
  const ref = label => ({ resultOf: label });
  const view = (label, to, signature, args, expected) => add(label, 'eth_call', [txData(D, to, abi(signature, ...args)), 'latest'], expected);
  const observe = (label, state) => {
    for (const [who, name] of names) view(label + '.balance_' + name, TOKEN, 'balanceOf(address)', [who], uint(state['balance_' + name]));
    view(label + '.supply', TOKEN, 'totalSupply()', [], uint(state.supply));
    for (const [who, name] of [[A, 'a'], [B, 'b']]) view(label + '.allowance_' + name, TOKEN, 'allowance(address,address)', [who, PROBE], uint(state['allowance_' + name]));
    for (const id of [1, 2, 3]) {
      view(label + '.authority_' + id, REG, 'authority(uint256)', [id], uint(state['owner_' + id]) + word(state['epoch_' + id]));
      view(label + '.credit_' + id, PROBE, 'credits(uint256)', [id], uint(state['credit_' + id]));
      view(label + '.approved_' + id, REG, 'getApproved(uint256)', [id], uint(state['approved_' + id]));
    }
    view(label + '.total_credits', PROBE, 'totalCredits()', [], uint(state.total_credits));
    view(label + '.operator_a_d', REG, 'isApprovedForAll(address,address)', [A, D], uint(state.operator_a_d));
    for (const [who, name] of [[A, 'a'], [B, 'b'], [D, 'd'], [HOOK, 'hook']]) view(label + '.nft_' + name, REG, 'balanceOf(address)', [who], uint(state['nft_' + name]));
  };
  const transaction = (label, caller, to, data, { error = null, returned = '0x', logs = [], address = null, section = 'setup' } = {}) => {
    const request = txData(caller, to, data), success = error === null;
    add(label + '.dry', 'eth_call', [request, 'latest'], success ? returned : { error });
    add(label + '.send', 'eth_sendTransaction', [request], { hash: true });
    add(label + '.receipt', 'eth_getTransactionReceipt', [ref(label + '.send')], { receipt: true });
    const tx = { label, request, success, returned, error, logs, address, section }; transactions.push(tx); return tx;
  };
  const command = (label, caller, to, signature, args, options = {}) => transaction(label, caller, to, abi(signature, ...args), options);
  const step = (label, caller, to, signature, args, effect = () => [], options = {}) => {
    const before = { ...current }, after = { ...current };
    const logs = options.error ? [] : effect(after);
    const tx = command(label, caller, to, signature, args, { ...options, logs, section: 'steps' });
    const observed = options.observed !== false;
    if (observed) observe(label + '.after', after);
    steps.push({ label, before, after, observed, tx }); current = after;
  };
  const failed = (label, who, kind, id, epoch, amount, error) => step(label, who, PROBE, kind + '(uint256,uint256,uint256)', [id, epoch, amount], undefined,
    { error: error.startsWith('0x') ? error : selector(error) });
  const movement = (kind, who, id, epoch, amount, state) => {
    assert.equal(state['owner_' + id], who); assert.equal(state['epoch_' + id], String(epoch));
    const name = names.get(who), incoming = kind === 'deposit', sign = incoming ? 1 : -1;
    adjust(state, { ['balance_' + name]: -sign * amount, balance_probe: sign * amount, ['credit_' + id]: sign * amount, total_credits: sign * amount });
    const moved = tokenTransfer(incoming ? who : PROBE, incoming ? PROBE : who, amount), logs = [moved];
    if (incoming) {
      adjust(state, { ['allowance_' + name]: -amount });
      const approved = tokenApproval(who, state['allowance_' + name]);
      if (mode === 'fork') logs.push(approved); else logs.unshift(approved);
    }
    assert.ok(BigInt(state.balance_probe) >= BigInt(state.total_credits));
    logs.push(custodyEvent(kind, id, who, amount, state['credit_' + id], epoch)); return logs;
  };
  const move = (label, kind, who, id, epoch, amount) => step(label, who, PROBE, kind + '(uint256,uint256,uint256)', [id, epoch, amount], state => movement(kind, who, id, epoch, amount, state));
  const tokenApprove = (label, who, amount) => step(label, who, TOKEN, 'approve(address,uint256)', [PROBE, amount], state => {
    state['allowance_' + names.get(who)] = String(amount); return [tokenApproval(who, amount)];
  }, { returned: uint(1) });
  const approveNFT = (label, approved, id) => step(label, A, REG, 'approve(address,uint256)', [approved, id], state => {
    const owner = state['owner_' + id]; assert.equal(owner, A); state['approved_' + id] = approved; return [nftApproval(owner, approved, id)];
  });
  const changeOwner = (state, from, to, id) => {
    assert.equal(state['owner_' + id], from);
    if (from !== to) adjust(state, { ['nft_' + names.get(from)]: -1, ['nft_' + names.get(to)]: 1 });
    state['owner_' + id] = to; state['approved_' + id] = ZERO; adjust(state, { ['epoch_' + id]: 1 });
    return [nftApproval(from, ZERO, id), nftTransfer(from, to, id)];
  };
  const transferNFT = (label, caller, from, to, id, { error = null, safe = false, onward = null } = {}) => step(label, caller, REG,
    (safe ? 'safeTransferFrom' : 'transferFrom') + '(address,address,uint256)', [from, to, id], state => {
      assert.ok(caller === from || state['approved_' + id] === caller || (from === A && caller === D && state.operator_a_d === '1'));
      return [...changeOwner(state, from, to, id), ...(onward ? changeOwner(state, to, onward, id) : [])];
    }, { error: error ? selector(error) : null });
  const configure = (label, modeNumber, id = 1, epoch = 0) => step(label, D, HOOK,
    'configure(address,address,uint256,address,address,uint256,uint8)', [REG, PROBE, id, A, B, epoch, modeNumber], undefined, { observed: false });
  const setMode = (label, incoming, outgoing) => step(label, D, TOKEN, 'setMode(uint8,uint8)', [incoming, outgoing], undefined, { observed: false });
  const callback = (label, propagate) => step(label, D, TOKEN, 'configureCallback(address,bool,bool)', [HOOK, false, propagate], undefined, { observed: false });

  add('startup_chain', 'eth_chainId', [], '0x7a69'); add('chain', 'eth_chainId', [], '0x7a69');
  if (mode === 'fork') {
    add('fork_header', 'eth_getBlockByNumber', [BLOCK, false], { header: true });
    add('token_runtime', 'eth_getCode', [TOKEN, 'latest'], { realToken: true });
  } else {
    add('empty_token', 'eth_getCode', [TOKEN, 'latest'], '0x');
    add('install_fixture', 'anvil_setCode', [TOKEN, build.contracts.AccountAdversarialToken.runtime], null);
    add('token_runtime', 'eth_getCode', [TOKEN, 'latest'], build.contracts.AccountAdversarialToken.runtime);
  }
  for (const who of [A, B, D]) {
    add('gas.' + who, 'anvil_setBalance', [who, '0xde0b6b3a7640000'], null);
    add('actor.' + who, 'anvil_impersonateAccount', [who], null);
  }
  add('initial_nonce', 'eth_getTransactionCount', [D, 'latest'], '0x0');
  for (const [i, label, name, args] of [[0, 'create_registry', 'TestAccountRegistry', [A, B]], [1, 'create_probe', 'CawAccountCustodyProbe', [REG, REG_HASH]], [2, 'create_hook', 'AccountHookFixture', []]]) {
    const address = created(i), code = RUNTIMES[name];
    add(label + '.nonce', 'eth_getTransactionCount', [D, 'latest'], '0x' + i.toString(16));
    add(label + '.absent', 'eth_getCode', [address, 'latest'], '0x');
    transaction(label, D, null, build.contracts[name].bytecode + args.map(word).join(''), { address, returned: code,
      logs: i === 0 ? [nftTransfer(ZERO, A, 1), nftTransfer(ZERO, A, 2), nftTransfer(ZERO, B, 3)] : [] });
    add(label + '.runtime', 'eth_getCode', [address, 'latest'], code);
    deployments.push({ name, address, constructor_args: args, runtime: code, label });
  }
  transaction('wrong_registry', D, null, build.contracts.CawAccountCustodyProbe.bytecode + word(ZERO) + word(REG_HASH), { error: selector('InvalidRegistry()'), address: created(3) });
  transaction('wrong_registry_hash', D, null, build.contracts.CawAccountCustodyProbe.bytecode + word(REG) + '01'.repeat(32), { error: selector('RegistryCodeChanged()'), address: created(4) });
  for (const [iface, enabled] of [['01ffc9a7', true], ['80ac58cd', true], ['ffffffff', false], ['5b5e139f', false]])
    add('interface.' + iface, 'eth_call', [txData(D, REG, selector('supportsInterface(bytes4)') + iface.padEnd(64, '0')), 'latest'], uint(enabled));
  view('registry_binding', PROBE, 'registry()', [], uint(REG)); view('registry_hash_binding', PROBE, 'registryCodeHash()', [], REG_HASH);
  if (mode === 'synthetic') {
    for (const [name, who] of [['a', A], ['b', B]]) {
      command('seed_' + name, D, TOKEN, 'setBalance(address,uint256)', [who, 1000]);
      command('approve_' + name, who, TOKEN, 'approve(address,uint256)', [PROBE, 100], { returned: uint(1), logs: [tokenApproval(who, 100)] });
    }
    for (const [id, who, amount, remaining] of [[1, A, 10, 90], [2, A, 7, 83], [3, B, 5, 95]])
      command('seed_' + id, who, PROBE, 'deposit(uint256,uint256,uint256)', [id, 0, amount], { logs: [tokenApproval(who, remaining), tokenTransfer(who, PROBE, amount), custodyEvent('deposit', id, who, amount, amount, 0)] });
  }
  observe('initial', current);
  if (mode === 'fork') {
    tokenApprove('approve_a', A, 20); move('deposit_1', 'deposit', A, 1, 0, 10); move('deposit_2', 'deposit', A, 2, 0, 6);
    for (const [label, who, id, epoch, amount, error] of [
      ['foreign', B, 1, 0, 1, 'NotAccountOwner()'], ['deployer', D, 1, 0, 1, 'NotAccountOwner()'],
      ['stale', A, 1, 1, 1, 'StaleEpoch()'], ['invalid_id', A, 4, 0, 1, 'UnknownAccount()'],
      ['zero_withdraw', A, 1, 0, 0, 'ZeroAmount()'], ['isolated_credit', A, 2, 0, 7, 'InsufficientCredit()']
    ]) failed(label, who, 'withdraw', id, epoch, amount, error);
    failed('zero_deposit', A, 'deposit', 1, 0, 0, 'ZeroAmount()');
    failed('allowance_failure', A, 'deposit', 1, 0, 5, reason('ERC20: transfer amount exceeds allowance'));
    move('withdraw_2', 'withdraw', A, 2, 0, 2); approveNFT('approve_nft', D, 1);
    failed('approved_not_spender', D, 'withdraw', 1, 0, 1, 'NotAccountOwner()'); failed('approved_not_depositor', D, 'deposit', 1, 0, 1, 'NotAccountOwner()');
    transferNFT('unauthorized_transfer', B, A, B, 1, { error: 'NotAuthorized()' });
    transferNFT('wrong_from', D, B, A, 1, { error: 'WrongFrom()' }); transferNFT('zero_recipient', D, A, ZERO, 1, { error: 'InvalidRecipient()' });
    transferNFT('approved_transfer', D, A, B, 1); failed('old_owner', A, 'withdraw', 1, 1, 1, 'NotAccountOwner()');
    failed('new_owner_stale', B, 'withdraw', 1, 0, 1, 'StaleEpoch()'); move('new_owner_withdraw', 'withdraw', B, 1, 1, 3);
    tokenApprove('approve_b', B, 2); move('new_owner_deposit', 'deposit', B, 1, 1, 2); transferNFT('return_to_a', B, B, A, 1);
    failed('old_epoch_after_return', A, 'withdraw', 1, 0, 1, 'StaleEpoch()'); move('current_epoch', 'withdraw', A, 1, 2, 4);
    transferNFT('self_transfer', A, A, A, 1); failed('pre_self_epoch', A, 'withdraw', 1, 2, 1, 'StaleEpoch()');
    const operator = (label, allowed) => step(label, A, REG, 'setApprovalForAll(address,bool)', [D, allowed], state => {
      state.operator_a_d = allowed ? '1' : '0'; return [event(REG, 'ApprovalForAll(address,address,bool)', [A, D], [allowed])];
    });
    operator('operator_grant', true); failed('operator_not_spender', D, 'withdraw', 1, 3, 1, 'NotAccountOwner()');
    transferNFT('operator_takes_ownership', D, A, D, 1); move('operator_now_owner', 'withdraw', D, 1, 4, 1); transferNFT('operator_returns_nft', D, D, A, 1);
    operator('operator_revoke', false); transferNFT('revoked_operator', D, A, B, 1, { error: 'NotAuthorized()' });
    configure('receiver_reject_config', 5, 2); transferNFT('receiver_reject', A, A, HOOK, 2, { error: 'UnsafeRecipient()', safe: true });
    configure('receiver_forward_config', 6, 2); transferNFT('receiver_forward', A, A, HOOK, 2, { safe: true, onward: B });
    move('forwarded_owner_withdraw', 'withdraw', B, 2, 2, 2); configure('receiver_accept_config', 0, 1, 5);
    transferNFT('receiver_accept', A, A, HOOK, 1, { safe: true }); failed('prior_owner_after_safe', A, 'withdraw', 1, 6, 1, 'NotAccountOwner()');
    configure('contract_owner_config', 2, 1, 6);
    step('contract_owner_withdraw', D, HOOK, 'withdraw(uint256)', [1], state => movement('withdraw', HOOK, 1, 6, 1, state));
  } else {
    add('baseline', 'evm_snapshot', [], { quantity: true }); let priorSnapshot = 'baseline';
    const reset = label => {
      add(label + '.revert', 'evm_revert', [ref(priorSnapshot)], true); priorSnapshot = label + '.snapshot';
      add(priorSnapshot, 'evm_snapshot', [], { quantity: true }); current = initial('synthetic');
      observe(label + '.state', current); resets.push({ label, before_step: steps.length, state: { ...current } });
    };
    for (const [label, incoming, outgoing, kind, error] of [
      ['false_deposit', 1, 0, 'deposit', 'TokenRejected()'], ['false_withdraw', 0, 1, 'withdraw', 'TokenRejected()'],
      ['sender_fee', 10, 0, 'deposit', 'UnexpectedTokenDelta()'], ['short_intake', 7, 0, 'deposit', 'UnexpectedTokenDelta()'],
      ['extra_vault_debit', 0, 8, 'withdraw', 'UnexpectedTokenDelta()'], ['short_recipient', 0, 9, 'withdraw', 'UnexpectedTokenDelta()']
    ]) { reset(label); setMode(label + '.mode', incoming, outgoing); failed(label, A, kind, 1, 0, 2, error); }
    for (const outer of ['deposit', 'withdraw']) for (const inner of [1, 2]) for (const propagate of [false, true]) {
      const label = 'reentrant_' + outer + '_' + inner + '_' + Number(propagate); reset(label); configure(label + '.hook', inner);
      callback(label + '.callback', propagate); setMode(label + '.mode', outer === 'deposit' ? 11 : 0, outer === 'withdraw' ? 11 : 0);
      if (propagate) failed(label, A, outer, 1, 0, 2, 'Reentrant()'); else move(label, outer, A, 1, 0, 2);
      const values = { label, attempts: propagate ? '0' : '1', success: '0', length: propagate ? '0' : '4', error: propagate ? uint(0) : selector('Reentrant()').padEnd(66, '0') };
      for (const [key, signature] of [['attempts', 'callbackAttempts()'], ['success', 'lastCallbackSuccess()'], ['length', 'lastCallbackReturnLength()']]) view(label + '.' + key, TOKEN, signature, [], uint(values[key]));
      view(label + '.error', TOKEN, 'lastCallbackError()', [], values.error); telemetry.push(values);
    }
    for (const outer of ['deposit', 'withdraw']) for (const number of [3, 4]) {
      const label = 'ownership_' + outer + '_' + number; reset(label); configure(label + '.hook', number);
      approveNFT(label + '.nft_approval', HOOK, 1); callback(label + '.callback', true);
      setMode(label + '.mode', outer === 'deposit' ? 11 : 0, outer === 'withdraw' ? 11 : 0);
      failed(label, A, outer, 1, 0, 2, 'AuthorityChanged()');
    }
    for (const kind of ['deposit', 'withdraw']) {
      const label = 'underbacked_' + kind; reset(label);
      step(label + '.loss', D, TOKEN, 'setBalance(address,uint256)', [PROBE, 21], state => { adjust(state, { balance_probe: -1, supply: -1 }); return []; });
      failed(label, A, kind, 1, 0, 2, 'Underbacked()');
      step(label + '.replenish', A, TOKEN, 'transfer(address,uint256)', [PROBE, 1], state => {
        adjust(state, { balance_a: -1, balance_probe: 1 }); return [tokenTransfer(A, PROBE, 1)];
      }, { returned: uint(1) });
      move(label + '.recovered', 'withdraw', A, 1, 0, 1);
    }
  }
  return { rows, transactions, steps, resets, telemetry, deployments, initial: initial(mode), final: current };
}
const plans = new Map(records.map(record => [record.mode, oracle(record.mode)]));
function index(record) {
  const map = new Map(record.local_calls.map(row => [row.label, row]));
  assert.equal(map.size, record.local_calls.length, 'duplicate local labels');
  const row = label => { assert.ok(map.has(label), label); return map.get(label); };
  const result = label => { const response = row(label).response; assert.equal(response.error, undefined, label); return response.result; };
  return { row, result };
}
const checkHeader = block => {
  assert.equal(block.number, BLOCK); assert.equal(block.hash, BLOCK_HASH); assert.equal(block.stateRoot, ROOT); assert.equal(block.timestamp, '0x6aa0ae57');
};
const PENDING_ERROR = { code: -32601, message: 'Read-only historical proxy refused method or parameters' };
function receiptAttempts(label, lookup) {
  const attempts = [];
  for (let i = 0; i < 10; i++) {
    const receiptLabel = label + (i === 0 ? '.receipt' : '.receipt_retry_' + i), row = lookup.row(receiptLabel);
    assert.deepEqual(row.request.params, [lookup.result(label + '.send')], receiptLabel);
    if (row.response.result !== undefined && row.response.result !== null) {
      assert.equal(typeof row.response.result, 'object'); assert.ok(!Array.isArray(row.response.result));
      attempts.push({ label: receiptLabel, pending: false }); return attempts;
    }
    if (Object.hasOwn(row.response, 'error')) assert.deepEqual(row.response.error, PENDING_ERROR, receiptLabel);
    else assert.equal(row.response.result, null, receiptLabel);
    attempts.push({ label: receiptLabel, pending: true });
  }
  assert.fail('receipt polling exceeded ten attempts');
}
function expandedRows(record, lookup = index(record)) {
  return plans.get(record.mode).rows.flatMap(row => row.expected?.receipt
    ? receiptAttempts(row.label.slice(0, -'.receipt'.length), lookup).map(attempt => ({ ...row, label: attempt.label, expected: attempt.pending ? { pending: true } : { receipt: true } }))
    : [row]);
}
function checkLogs(receipt, expected) {
  assert.ok(Array.isArray(receipt.logs));
  const actual = receipt.logs.map((entry, i) => {
    assert.match(entry.address, ADDRESS); assert.ok(Array.isArray(entry.topics)); entry.topics.forEach(value => assert.match(value, WORD));
    assert.match(entry.data, DATA); assert.equal(entry.transactionHash, receipt.transactionHash); assert.equal(entry.blockHash, receipt.blockHash);
    assert.equal(entry.blockNumber, receipt.blockNumber); assert.equal(entry.removed, false); assert.equal(BigInt(entry.logIndex), BigInt(i));
    return { address: entry.address, topics: entry.topics, data: entry.data };
  });
  assert.deepEqual(actual, expected);
}
function checkTransaction(record, expected, lookup = index(record)) {
  const { row, result } = lookup, attempts = receiptAttempts(expected.label, lookup), receipt = result(attempts.at(-1).label), transactionHash = result(expected.label + '.send');
  assert.match(transactionHash, WORD);
  assert.equal(receipt.transactionHash, transactionHash); assert.equal(receipt.from, expected.request.from); assert.equal(receipt.to, expected.request.to ?? null);
  if (expected.request.to) assert.equal(receipt.contractAddress, null);
  else assert.equal(receipt.contractAddress, expected.address);
  assert.equal(receipt.status, expected.success ? '0x1' : '0x0'); assert.match(receipt.blockHash, WORD); assert.match(receipt.blockNumber, QUANTITY);
  assert.equal(receipt.transactionIndex, '0x0'); assert.ok(BigInt(receipt.gasUsed) > 0n && BigInt(receipt.gasUsed) <= 1000000n);
  assert.equal(receipt.cumulativeGasUsed, receipt.gasUsed); assert.equal(BigInt(receipt.effectiveGasPrice), 100000000000n); checkLogs(receipt, expected.logs);
  const actual = record[expected.section].find(entry => entry.label === expected.label); assert.ok(actual, expected.label);
  assert.deepEqual(actual.transaction, expected.request); assert.deepEqual(actual.dry_response, row(expected.label + '.dry').response); assert.deepEqual(actual.receipt, receipt);
  assert.equal(actual.receipt_attempts, attempts.length);
}
function checkCalls(record) {
  const plan = plans.get(record.mode), lookup = index(record), expectedRows = expandedRows(record, lookup);
  assert.deepEqual(record.local_calls.map(row => row.label), expectedRows.map(row => row.label));
  for (const [i, expected] of expectedRows.entries()) {
    const actual = record.local_calls[i]; assert.equal(actual.transport_error, undefined); assert.equal(actual.failure, undefined);
    assert.deepEqual(JSON.parse(actual.raw_response), actual.response);
    const params = expected.params.map(value => value && Object.hasOwn(value, 'resultOf') ? lookup.result(value.resultOf) : value);
    assert.deepEqual(actual.request, { jsonrpc: '2.0', id: i + 1, method: expected.method, params }, expected.label);
    assert.equal(actual.response.jsonrpc, '2.0'); assert.equal(actual.response.id, i + 1);
    assert.deepEqual(Object.keys(actual.response).sort(), Object.hasOwn(actual.response, 'error') ? ['error', 'id', 'jsonrpc'] : ['id', 'jsonrpc', 'result']);
    const e = expected.expected;
    if (e && typeof e === 'object') {
      if (Object.hasOwn(e, 'error')) { assert.equal(actual.response.error.code, 3); assert.equal(actual.response.error.data, e.error, expected.label); }
      else if (e.header) checkHeader(lookup.result(expected.label));
      else if (e.realToken) {
        const code = lookup.result(expected.label); assert.match(code, DATA);
        assert.equal(hash(Buffer.from(code.slice(2), 'hex')), 'ac5c77c1372337655d8f0257e34feec1ab0506dc8e8e7f034252cba66390bea1');
      } else if (e.pending) {
        if (Object.hasOwn(actual.response, 'error')) assert.deepEqual(actual.response.error, PENDING_ERROR);
        else assert.equal(actual.response.result, null);
      } else if (e.hash) assert.match(lookup.result(expected.label), WORD);
      else if (e.quantity) assert.match(lookup.result(expected.label), QUANTITY);
      else assert.equal(e.receipt, true);
    } else assert.deepEqual(lookup.result(expected.label), e, expected.label);
  }
  assert.deepEqual(record.setup.map(row => row.label), plan.transactions.filter(tx => tx.section === 'setup').map(tx => tx.label));
  assert.deepEqual(record.steps.map(row => row.label), plan.steps.map(step => step.label));
  for (const transaction of plan.transactions) checkTransaction(record, transaction, lookup);
}
function checkStates(record, predicate = () => true) {
  const plan = plans.get(record.mode);
  for (const expected of plan.steps.filter(predicate)) {
    const actual = record.steps.find(step => step.label === expected.label); assert.ok(actual, expected.label);
    assert.deepEqual(actual.before, expected.before, expected.label + '.before'); assert.deepEqual(actual.after, expected.after, expected.label + '.after');
    assert.equal(actual.after_observed, expected.observed, expected.label);
    assert.equal(BigInt(actual.after.total_credits), [1, 2, 3].reduce((sum, id) => sum + BigInt(actual.after['credit_' + id]), 0n));
    assert.equal(['a', 'b', 'd', 'hook'].reduce((sum, key) => sum + BigInt(actual.after['nft_' + key]), 0n), 3n);
    if (!expected.tx.success) assert.deepEqual(actual.after, actual.before, expected.label + ' rollback');
  }
}

test('the reviewed original source, compiler artifacts and immutable runtime bindings are pinned', () => {
  for (const [file, expected] of Object.entries(INPUTS)) assert.equal(hash(read(dir + file)), expected, file);
  assert.equal(hash(read(dir + 'run_account_authority.py')), HARNESS); assert.equal(hash(read(dir + 'experiment-inputs.json')), INPUT_MANIFEST);
  assert.deepEqual(json(dir + 'experiment-inputs.json'), { schema: 'caw-account-authority-inputs/1', files: INPUTS });
  assert.equal(build.schema, 'caw-account-authority-build/1'); assert.equal(build.compiler, '0.8.10+commit.fc410830');
  assert.equal(build.compiler_input_sha256, INPUTS['compile-standard.json']);
  const compilerInput = json(dir + 'compile-standard.json');
  assert.deepEqual(Object.keys(compilerInput.sources).sort(), Object.keys(build.sources).sort());
  for (const [file, digest] of Object.entries(build.sources)) { assert.equal(digest, INPUTS[file]); assert.equal(compilerInput.sources[file].content, read(dir + file).toString('utf8')); }
  for (const contract of Object.values(build.contracts)) {
    assert.match(contract.bytecode, DATA); assert.match(contract.runtime, DATA);
    assert.equal(hash(Buffer.from(contract.runtime.slice(2), 'hex')), contract.runtime_template_sha256);
  }
  const tokenBuild = json(dir + 'account-token-build.json');
  assert.equal(tokenBuild.runtime, build.contracts.AccountAdversarialToken.runtime);
  assert.equal(hash(Buffer.from(tokenBuild.runtime.slice(2), 'hex')), tokenBuild.runtime_sha256);
  const toolchain = json(dir + 'toolchain.json');
  assert.equal(toolchain.schema, 'caw-account-authority-toolchain/1');
  assert.equal(toolchain.compiler, '0.8.10+commit.fc410830'); assert.equal(toolchain.compiler_error_diagnostics, 0);
  assert.equal(toolchain.compiler_sha256, 'ec9feb83ff291ae74805b38cc6834502fb31be690f325de59dff8e60d8432d66');
  assert.equal(toolchain.anvil_source_commit, '982849d3140c01fd3b72905759581a132df7aa98');
  assert.equal(toolchain.anvil_sha256, 'c6e29da1b010fe00bac6c0dc5c29484bd641deb5a84050aea10d13e9dc4fe26f');
  assert.equal(toolchain.archive_sha256, '02d98fc2c573793960ee06b7f642487d483fe30572f7e248804c207334a418d8');
  assert.equal(toolchain.authority_build_sha256, INPUTS['authority-build.json']); assert.equal(toolchain.compile_input_sha256, INPUTS['compile-standard.json']);
  assert.equal(toolchain.helper_sha256, INPUTS['account_node.py']); assert.equal(toolchain.input_manifest_sha256, INPUT_MANIFEST);
  assert.deepEqual(toolchain.source_sha256, build.sources);
  for (const key of ['sigstore_cryptographically_verified', 'native_binary_distributed_in_alpha', 'production_toolchain_selected', 'real_wallet_used', 'public_transaction_broadcast', 'signature_api_implemented', 'delegate_api_implemented']) assert.equal(toolchain[key], false);
  assert.equal(toolchain.registry_code_pin_is_not_authenticity, true); assert.equal(toolchain.expected_epoch_is_proposed_policy, true);
  for (const record of records) {
    assert.deepEqual(record.inputs, INPUTS); assert.equal(record.harness_sha256, HARNESS); assert.equal(record.input_manifest_sha256, INPUT_MANIFEST);
    assert.deepEqual(record.addresses, { registry: REG, probe: PROBE, hook: HOOK }); assert.equal(record.registry_codehash, REG_HASH);
    assert.deepEqual(record.deployments, plans.get(record.mode).deployments);
  }
});

test('both complete runs retain bounded local execution and explicit separation from production authority', () => {
  assert.deepEqual(records.map(record => record.mode), ['fork', 'synthetic']);
  for (const record of records) {
    const plan = plans.get(record.mode), n = record.node;
    assert.equal(record.schema, 'caw-account-authority/1'); assert.equal(record.complete, true); assert.equal(record.failure, undefined);
    for (const key of ['real_wallet_used', 'public_transaction_broadcast', 'registration_implemented', 'signature_verification_implemented', 'delegation_implemented']) assert.equal(record[key], false);
    assert.equal(n.schema, 'caw-local-node/1'); assert.equal(n.mode, record.mode); assert.equal(n.local_chain_id, 31337);
    assert.equal(n.anvil_sha256, 'c6e29da1b010fe00bac6c0dc5c29484bd641deb5a84050aea10d13e9dc4fe26f'); assert.equal(n.anvil_bytes, 41583616); assert.equal(n.anvil_version, '1.8.1');
    assert.equal(n.hardfork, 'london'); assert.equal(n.host, '127.0.0.1'); assert.equal(n.port, 18545); assert.equal(n.generated_accounts, 0); assert.equal(n.stop_reason, null);
    for (const key of ['wallet_used', 'transaction_broadcast', 'local_impersonation_is_ownership_proof', 'token_storage_overridden']) assert.equal(n[key], false);
    assert.equal(n.token_code_replaced, record.mode === 'synthetic'); assert.ok(n.wall_seconds > 0 && n.wall_seconds <= 600);
    assert.ok(n.peak_node_memory_bytes > 0 && n.peak_node_memory_bytes <= 512 * 1024 * 1024); assert.ok(n.node_output_bytes <= 1024 * 1024);
    assert.equal(n.local_request_count, record.local_calls.length); assert.equal(n.local_request_count, expandedRows(record).length); assert.ok(n.local_request_count <= 1800);
    assert.equal(plan.rows.length, record.mode === 'fork' ? 1168 : 1525);
    assert.equal(n.local_transaction_attempts, plan.transactions.length); assert.ok(n.local_transaction_attempts <= 250);
    const overrides = record.mode === 'synthetic' ? [{ method: 'anvil_setCode', params: [TOKEN, build.contracts.AccountAdversarialToken.runtime], local_only: true }] : [];
    for (const who of [A, B, D]) overrides.push({ method: 'anvil_setBalance', params: [who, '0xde0b6b3a7640000'], local_only: true }, { method: 'anvil_impersonateAccount', params: [who], local_only: true });
    assert.deepEqual(n.overrides, overrides);
  }
});

test('the complete literal request sequence validates every view, submitted transaction and receipt', () => {
  for (const record of records) checkCalls(record);
});

test('the fork forwards only pinned historical reads while synthetic execution has no upstream source', () => {
  const [fork, synthetic] = records;
  assert.deepEqual(synthetic.upstream_calls, []); assert.equal(synthetic.node.proxy_request_count, 0); assert.equal(synthetic.node.upstream_forwarded_count, 0);
  assert.equal(synthetic.node.remote_provider, null); assert.equal(synthetic.node.fork_block, null);
  assert.equal(fork.node.remote_provider, 'https://eth.drpc.org'); assert.equal(fork.node.fork_block, BLOCK); assert.equal(fork.node.expected_fork_hash, BLOCK_HASH); assert.equal(fork.node.expected_state_root, ROOT);
  const allowedAddresses = new Set([TOKEN, A, B, D, ZERO, ...[0, 1, 2, 3, 4].map(created)]);
  const balanceSlot = who => keccak256Hex(uint(who) + word(0));
  const allowanceSlot = who => keccak256Hex(uint(PROBE) + keccak256Hex(uint(who) + word(1)).slice(2));
  const storage = new Map([...names].map(([who, name]) => [balanceSlot(who), uint(initial('fork')['balance_' + name])]));
  storage.set(uint(2), uint(initial('fork').supply)); storage.set(allowanceSlot(A), uint(0)); storage.set(allowanceSlot(B), uint(0));
  const pinned = value => value === BLOCK || (value && typeof value === 'object' && Object.keys(value).sort().join(',') === 'blockHash,requireCanonical' && value.blockHash === BLOCK_HASH && typeof value.requireCanonical === 'boolean');
  let forwarded = 0, headers = 0, tokenCode = 0; const slots = new Set();
  for (const entry of fork.upstream_calls) {
    assert.equal(entry.failure, undefined); assert.deepEqual(JSON.parse(entry.raw_response), entry.response); assert.equal(entry.response.id, entry.request.id); assert.equal(entry.response.jsonrpc, '2.0');
    if (!entry.forwarded) { assert.ok(['anvil_nodeInfo', 'eth_getAccountInfo'].includes(entry.request.method)); assert.equal(entry.response.error.code, -32601); continue; }
    forwarded++; const request = entry.forwarded_request ?? entry.request, p = request.params;
    assert.equal(request.jsonrpc, '2.0'); assert.ok(Array.isArray(p)); assert.equal(entry.response.error, undefined);
    if (entry.forwarded_request) { assert.ok(['eth_chainId', 'net_version'].includes(request.method)); assert.deepEqual(request, { ...entry.request, params: [] }); }
    if (request.method === 'eth_chainId' || request.method === 'net_version') { assert.deepEqual(p, []); assert.equal(entry.response.result, request.method === 'eth_chainId' ? '0x1' : '1'); }
    else if (['eth_getBlockByNumber', 'eth_getBlockByHash'].includes(request.method)) {
      assert.equal(p.length, 2); assert.equal(p[0], request.method.endsWith('Number') ? BLOCK : BLOCK_HASH); assert.equal(typeof p[1], 'boolean'); checkHeader(entry.response.result); headers++;
    } else {
      assert.ok(['eth_getCode', 'eth_getBalance', 'eth_getTransactionCount', 'eth_getStorageAt'].includes(request.method)); assert.ok(allowedAddresses.has(p[0])); assert.ok(pinned(p.at(-1)));
      assert.equal(p.length, request.method === 'eth_getStorageAt' ? 3 : 2);
      if (request.method === 'eth_getStorageAt') {
        assert.equal(p[0], TOKEN); assert.ok(QUANTITY.test(p[1]) || WORD.test(p[1])); const slot = uint(p[1]); assert.ok(storage.has(slot), slot); assert.equal(entry.response.result, storage.get(slot)); slots.add(slot);
      } else if (request.method === 'eth_getCode') {
        if (p[0] === TOKEN) { assert.equal(entry.response.result, index(fork).result('token_runtime')); tokenCode++; }
        else assert.equal(entry.response.result, '0x');
      } else { assert.match(entry.response.result, QUANTITY); if (request.method === 'eth_getTransactionCount') assert.equal(entry.response.result, p[0] === TOKEN ? '0x1' : '0x0'); }
    }
  }
  assert.equal(fork.node.proxy_request_count, fork.upstream_calls.length); assert.ok(fork.upstream_calls.length > 0 && fork.upstream_calls.length <= 200);
  assert.equal(fork.node.upstream_forwarded_count, forwarded); assert.ok(headers >= 1 && tokenCode >= 1);
  assert.deepEqual([...slots].sort(), [...storage.keys()].sort());
});

test('all ID-based credits and NFT authority states reconstruct exactly across both experiments', () => {
  for (const record of records) {
    const plan = plans.get(record.mode); assert.deepEqual(record.initial, plan.initial); assert.deepEqual(record.final, plan.final); checkStates(record);
  }
  const fork = records[0];
  assert.equal(fork.steps.length, 46); assert.equal(records[1].steps.length, 72);
  assert.equal(fork.final.owner_1, HOOK); assert.equal(fork.final.epoch_1, '6'); assert.equal(fork.final.credit_1, '3');
  assert.equal(fork.final.owner_2, B); assert.equal(fork.final.epoch_2, '2'); assert.equal(fork.final.credit_2, '2');
  assert.equal(fork.final.credit_3, '0'); assert.equal(fork.final.total_credits, '5'); assert.equal(fork.final.balance_probe, '5');
});

test('transfers clear token approval and invalidate old epochs, including round-trip and self-transfer', () => {
  const record = records[0], step = label => record.steps.find(entry => entry.label === label);
  for (const label of ['approved_transfer', 'return_to_a', 'self_transfer', 'operator_takes_ownership', 'operator_returns_nft']) {
    const current = step(label); assert.equal(current.after.approved_1, ZERO); assert.equal(BigInt(current.after.epoch_1), BigInt(current.before.epoch_1) + 1n);
    assert.equal(current.after.credit_1, current.before.credit_1);
  }
  assert.equal(step('old_epoch_after_return').before.owner_1, A); assert.equal(step('old_epoch_after_return').receipt.status, '0x0');
  assert.equal(step('pre_self_epoch').before.owner_1, A); assert.equal(step('pre_self_epoch').receipt.status, '0x0');
  assert.equal(step('approved_not_spender').receipt.status, '0x0'); assert.equal(step('operator_not_spender').receipt.status, '0x0');
  assert.equal(step('operator_now_owner').after.balance_d, '1'); assert.equal(step('operator_now_owner').after.owner_1, D);
  assert.equal(step('revoked_operator').after.operator_a_d, '0');
});

test('receiver rejection rolls back while accepted onward transfer counts both ownership changes', () => {
  const record = records[0], step = label => record.steps.find(entry => entry.label === label);
  assert.deepEqual(step('receiver_reject').before, step('receiver_reject').after); assert.deepEqual(step('receiver_reject').receipt.logs, []);
  assert.equal(step('receiver_forward').after.owner_2, B); assert.equal(step('receiver_forward').after.epoch_2, '2');
  assert.equal(step('receiver_forward').after.nft_hook, '0'); assert.equal(step('receiver_forward').receipt.logs.length, 4);
  assert.equal(step('receiver_accept').after.owner_1, HOOK); assert.equal(step('contract_owner_withdraw').after.balance_hook, '1');
  assert.equal(step('contract_owner_withdraw').receipt.from, D);
});

test('synthetic payer/vault/recipient mismatches reject all tentative accounting and logs', () => {
  const record = records[1];
  for (const label of ['false_deposit', 'false_withdraw', 'sender_fee', 'short_intake', 'extra_vault_debit', 'short_recipient']) {
    const step = record.steps.find(entry => entry.label === label); assert.deepEqual(step.before, step.after); assert.equal(step.receipt.status, '0x0'); assert.deepEqual(step.receipt.logs, []);
  }
});

test('callbacks cannot re-enter custody or preserve ownership changes during a custody operation', () => {
  const record = records[1], plan = plans.get('synthetic'); assert.deepEqual(record.telemetry, plan.telemetry); assert.equal(record.telemetry.length, 8);
  for (const step of record.steps.filter(entry => /^ownership_(deposit|withdraw)_[34]$/.test(entry.label))) {
    assert.equal(step.after.owner_1, A); assert.equal(step.after.epoch_1, '0'); assert.equal(step.after.approved_1, HOOK); assert.deepEqual(step.before, step.after); assert.deepEqual(step.receipt.logs, []);
  }
  assert.equal(record.steps.filter(entry => /^ownership_(deposit|withdraw)_[34]$/.test(entry.label)).length, 4);
});

test('all twenty synthetic branches reset to the observed baseline and backing-loss recovery is exact', () => {
  const record = records[1], plan = plans.get('synthetic'); assert.deepEqual(record.resets, plan.resets); assert.equal(record.resets.length, 20);
  for (const kind of ['deposit', 'withdraw']) {
    const loss = record.steps.find(entry => entry.label === 'underbacked_' + kind + '.loss');
    const failed = record.steps.find(entry => entry.label === 'underbacked_' + kind);
    const recovered = record.steps.find(entry => entry.label === 'underbacked_' + kind + '.recovered');
    assert.equal(loss.after.balance_probe, '21'); assert.equal(loss.after.total_credits, '22'); assert.equal(loss.after.supply, '1999');
    assert.deepEqual(failed.before, failed.after); assert.equal(recovered.after.balance_probe, '21'); assert.equal(recovered.after.total_credits, '21'); assert.equal(recovered.after.credit_1, '9');
  }
});

test('the oracle rejects forged view results, missing transactions, altered logs and false reset summaries', () => {
  const mutate = (record, change, checker) => { const copy = structuredClone(record); change(copy); assert.throws(() => checker(copy), error => error?.code === 'ERR_ASSERTION'); };
  mutate(records[0], copy => {
    const row = copy.local_calls.find(entry => entry.label === 'approved_transfer.after.authority_1'); row.response.result = uint(A) + word(0); row.raw_response = JSON.stringify(row.response);
  }, checkCalls);
  mutate(records[0], copy => { copy.local_calls.splice(copy.local_calls.findIndex(entry => entry.label === 'operator_now_owner.send'), 1); }, checkCalls);
  mutate(records[0], copy => {
    const row = copy.local_calls.find(entry => entry.label === 'receiver_forward.receipt'); row.response.result.logs.pop(); row.raw_response = JSON.stringify(row.response);
  }, checkCalls);
  mutate(records[1], copy => { copy.resets[0].state.credit_1 = '11'; }, copy => assert.deepEqual(copy.resets, plans.get('synthetic').resets));
  mutate(records[0], copy => { copy.steps.find(entry => entry.label === 'self_transfer').after.epoch_1 = '2'; }, checkStates);
});
