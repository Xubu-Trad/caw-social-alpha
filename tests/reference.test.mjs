import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, previewAction, applyAction, rebuild, canonicalExport,
} from '../public/model.mjs';

// Independently written fixture oracle; no arithmetic or fee helpers imported.
const U = 1000000000000000000n;
const SCENARIO = 'appendix-demo-v1';
const SEED = {
  version: 1,
  scenario: SCENARIO,
  accounts: [
    { name: 'pioneer', controller: 'device-pioneer', balance: '250000000000000000000000', stake: '3' },
    { name: 'signal', controller: 'device-signal', balance: '120000000000000000000000', stake: '1' },
    { name: 'keeper', controller: 'device-keeper', balance: '750000000000000000000000', stake: '2' },
  ],
  posts: [{ id: 'seed-post', author: 'pioneer', text: 'A synthetic reference post.', time: 'Local fixture' }],
};
const FEE = { caw: 5000n * U, like: 2000n * U, recaw: 4000n * U, follow: 30000n * U };
const DIRECT = { caw: 0n, like: 1600n * U, recaw: 2000n * U, follow: 24000n * U };
const POOL = { caw: 5000n * U, like: 400n * U, recaw: 2000n * U, follow: 6000n * U };

// Literal credits for the fixed seed weights. Amounts are integer base units.
// No model helper computes the expected values in this table.
const POOL_CREDITS = {
  pioneer: {
    caw: { signal: 1666666666666666666666n, keeper: 3333333333333333333333n },
    like: { signal: 133333333333333333333n, keeper: 266666666666666666666n },
    recaw: { signal: 666666666666666666666n, keeper: 1333333333333333333333n },
    follow: { signal: 2000n * U, keeper: 4000n * U },
  },
  signal: {
    caw: { pioneer: 3000n * U, keeper: 2000n * U },
    like: { pioneer: 240n * U, keeper: 160n * U },
    recaw: { pioneer: 1200n * U, keeper: 800n * U },
    follow: { pioneer: 3600n * U, keeper: 2400n * U },
  },
  keeper: {
    caw: { pioneer: 3750n * U, signal: 1250n * U },
    like: { pioneer: 300n * U, signal: 100n * U },
    recaw: { pioneer: 1500n * U, signal: 500n * U },
    follow: { pioneer: 4500n * U, signal: 1500n * U },
  },
};

const copy = value => JSON.parse(JSON.stringify(value));
function start(seed = SEED) { return createState(copy(seed)); }
function intent(state, id, kind, actor, fields = {}) {
  const account = state.accounts[actor];
  return { id, kind, actor, controller: account.controller, epoch: account.epoch, nonce: account.nonce, ...fields };
}
function total(state) {
  return Object.values(state.accounts).reduce((n, account) => n + BigInt(account.balance), BigInt(state.poolDust));
}
function credits(preview) {
  const result = {};
  for (const item of preview.allocations) result[item.account] = (result[item.account] ?? 0n) + BigInt(item.amount);
  return result;
}
function assertRejectedUnchanged(state, badIntent) {
  const before = JSON.stringify(state);
  assert.throws(() => applyAction(state, badIntent));
  assert.equal(JSON.stringify(state), before, 'rejected action mutated its input');
}
function assertReferenceStep(state, action, directRecipient) {
  const before = JSON.stringify(state);
  const balances = Object.fromEntries(Object.entries(state.accounts).map(([name, account]) => [name, BigInt(account.balance)]));
  const additions = { ...POOL_CREDITS[action.actor][action.kind] };
  if (DIRECT[action.kind]) additions[directRecipient] = (additions[directRecipient] ?? 0n) + DIRECT[action.kind];
  const poolPaid = Object.values(POOL_CREDITS[action.actor][action.kind]).reduce((sum, amount) => sum + amount, 0n);
  const remainder = POOL[action.kind] - poolPaid;
  balances[action.actor] -= FEE[action.kind];
  for (const [name, amount] of Object.entries(additions)) balances[name] += amount;
  const preview = previewAction(state, action);
  assert.equal(BigInt(preview.fee), FEE[action.kind]);
  assert.equal(BigInt(preview.poolAmount), POOL[action.kind]);
  assert.equal(BigInt(preview.poolDustAdded), remainder);
  assert.deepEqual(credits(preview), additions);
  const after = applyAction(state, action);
  assert.equal(JSON.stringify(state), before, 'accepted transition should also preserve its input');
  for (const [name, amount] of Object.entries(balances)) assert.equal(BigInt(after.accounts[name].balance), amount, name);
  assert.equal(BigInt(after.poolDust), BigInt(state.poolDust) + remainder);
  assert.equal(total(after), total(state), 'balances plus held dust must be conserved');
  assert.equal(after.accounts[action.actor].nonce, state.accounts[action.actor].nonce + 1);
  assert.equal(after.accounts[action.actor].epoch, state.accounts[action.actor].epoch);
  return after;
}

test('reference: literal CAW posting split includes exactly one base unit of held dust', () => {
  let state = start();
  state = assertReferenceStep(state, intent(state, 'reference-post', 'caw', 'pioneer', { text: 'Fixture post.' }));
  assert.equal(state.poolDust, '1');
  assert.equal(state.accounts.pioneer.balance, '245000000000000000000000');
  assert.equal(state.accounts.signal.balance, '121666666666666666666666');
  assert.equal(state.accounts.keeper.balance, '753333333333333333333333');
});

test('reference: literal like split credits recipient and eligible stake holders', () => {
  const state = start();
  const after = assertReferenceStep(state, intent(state, 'reference-like', 'like', 'signal', { postId: 'seed-post' }), 'pioneer');
  assert.equal(after.accounts.pioneer.balance, '251840000000000000000000');
  assert.equal(after.accounts.signal.balance, '118000000000000000000000');
  assert.equal(after.accounts.keeper.balance, '750160000000000000000000');
});

test('reference: literal reCAW split and follow split use the named appendix scenario', () => {
  let state = start();
  state = assertReferenceStep(state, intent(state, 'reference-recaw', 'recaw', 'signal', { postId: 'seed-post' }), 'pioneer');
  assert.equal(state.accounts.pioneer.balance, '253200000000000000000000');
  assert.equal(state.accounts.keeper.balance, '750800000000000000000000');
  state = start();
  state = assertReferenceStep(state, intent(state, 'reference-follow', 'follow', 'signal', { target: 'keeper' }), 'keeper');
  assert.equal(state.accounts.pioneer.balance, '253600000000000000000000');
  assert.equal(state.accounts.signal.balance, '90000000000000000000000');
  assert.equal(state.accounts.keeper.balance, '776400000000000000000000');
});

test('reference: three equal eligible weights preserve a two-base-unit remainder', () => {
  const seed = copy(SEED);
  seed.accounts[1].stake = '1';
  seed.accounts[2].stake = '1';
  seed.accounts.push({ name: 'orbit', controller: 'device-orbit', balance: '0', stake: '1' });
  const state = start(seed);
  const action = intent(state, 'three-shares', 'caw', 'pioneer', { text: 'Three-way fixture pool.' });
  const preview = previewAction(state, action);
  assert.equal(preview.poolDustAdded, '2');
  assert.deepEqual(credits(preview), {
    signal: 1666666666666666666666n,
    keeper: 1666666666666666666666n,
    orbit: 1666666666666666666666n,
  });
  const after = applyAction(state, action);
  assert.equal(after.poolDust, '2');
  assert.equal(total(after), total(state));
});

test('reference: nonzero held dust persists when later action adds no dust', () => {
  let state = start();
  state = assertReferenceStep(state, intent(state, 'dust-first', 'caw', 'pioneer', { text: 'First remainder.' }));
  state = assertReferenceStep(state, intent(state, 'dust-second', 'caw', 'pioneer', { text: 'Second remainder.' }));
  assert.equal(state.poolDust, '2');
  const beforeDust = state.poolDust;
  state = assertReferenceStep(state, intent(state, 'dust-preserved', 'like', 'signal', { postId: 'seed-post' }), 'pioneer');
  assert.equal(state.poolDust, beforeDust);
});

function history() {
  let state = start();
  const steps = [
    ['history-post', 'caw', 'pioneer', { text: 'A fixture history.' }, undefined],
    ['history-like', 'like', 'signal', { postId: 'post-history-post' }, 'pioneer'],
    ['history-recaw', 'recaw', 'keeper', { postId: 'post-history-post' }, 'pioneer'],
    ['history-follow', 'follow', 'pioneer', { target: 'signal' }, 'signal'],
    ['history-post2', 'caw', 'signal', { text: 'An independently accounted second post.' }, undefined],
  ];
  for (const [id, kind, actor, fields, recipient] of steps) state = assertReferenceStep(state, intent(state, id, kind, actor, fields), recipient);
  return state;
}

test('reference: mixed feed history agrees with the literal book after every transition', () => {
  const state = history();
  assert.equal(total(state), 1120000n * U);
  assert.equal(state.events.length, 5);
});

test('reference: controller transfer preserves economics and invalidates stale authority', () => {
  const state = history();
  const old = state.accounts.pioneer;
  const action = intent(state, 'transfer-reference', 'transfer', 'pioneer', { newController: 'device-pioneer-next' });
  const before = JSON.stringify(state);
  const after = applyAction(state, action);
  assert.equal(JSON.stringify(state), before);
  assert.equal(after.accounts.pioneer.controller, 'device-pioneer-next');
  assert.equal(after.accounts.pioneer.epoch, old.epoch + 1);
  assert.equal(after.accounts.pioneer.nonce, old.nonce + 1);
  assert.equal(after.accounts.pioneer.balance, old.balance);
  assert.equal(after.accounts.pioneer.stake, old.stake);
  assert.equal(after.poolDust, state.poolDust);
  assert.equal(total(after), total(state));
  assertRejectedUnchanged(after, {
    ...intent(after, 'stale-controller', 'caw', 'pioneer', { text: 'Stale synthetic authority.' }),
    controller: old.controller, epoch: old.epoch,
  });
});

test('reference: rejected inputs cannot debit balances, advance nonces or append history', () => {
  const state = start();
  const good = intent(state, 'not-applied', 'caw', 'signal', { text: 'Synthetic content.' });
  const bad = [
    { ...good, id: 'bad-owner', controller: 'device-unrelated' },
    { ...good, id: 'bad-epoch', epoch: 1 },
    { ...good, id: 'bad-nonce', nonce: 1 },
    { ...good, id: 'too-long', text: 'x'.repeat(421) },
    { ...good, id: 'extra-field', balance: '900000000000000000000000' },
    intent(state, 'missing-post', 'like', 'signal', { postId: 'does-not-exist' }),
    intent(state, 'self-like', 'like', 'pioneer', { postId: 'seed-post' }),
    intent(state, 'self-follow', 'follow', 'pioneer', { target: 'pioneer' }),
  ];
  for (const action of bad) assertRejectedUnchanged(state, action);
  const poor = copy(SEED);
  poor.accounts[1].balance = '1';
  const poorState = start(poor);
  assertRejectedUnchanged(poorState, intent(poorState, 'insufficient', 'caw', 'signal', { text: 'Not funded.' }));
  const noPool = copy(SEED);
  for (const account of noPool.accounts) account.stake = '0';
  const noPoolState = start(noPool);
  assertRejectedUnchanged(noPoolState, intent(noPoolState, 'empty-pool', 'caw', 'pioneer', { text: 'Unresolved eligibility.' }));
});

test('reference: duplicate IDs, stale nonces and repeated relationships reject atomically', () => {
  let state = start();
  const like = intent(state, 'once-only', 'like', 'signal', { postId: 'seed-post' });
  state = applyAction(state, like);
  assertRejectedUnchanged(state, like);
  assertRejectedUnchanged(state, intent(state, 'like-again', 'like', 'signal', { postId: 'seed-post' }));
  assertRejectedUnchanged(state, intent(state, 'once-only', 'caw', 'keeper', { text: 'Duplicate event identifier.' }));
  state = applyAction(state, intent(state, 'follow-once', 'follow', 'signal', { target: 'keeper' }));
  assertRejectedUnchanged(state, intent(state, 'follow-again', 'follow', 'signal', { target: 'keeper' }));
  state = applyAction(state, intent(state, 'recaw-once', 'recaw', 'keeper', { postId: 'seed-post' }));
  assertRejectedUnchanged(state, intent(state, 'recaw-again', 'recaw', 'keeper', { postId: 'seed-post' }));
});

test('reference: two fresh replays produce exactly the same canonical export', () => {
  const state = history();
  const text = canonicalExport(state);
  const first = rebuild(copy(SEED), JSON.parse(text));
  const second = rebuild(copy(SEED), JSON.parse(text));
  assert.equal(canonicalExport(first), text);
  assert.equal(canonicalExport(second), text);
  assert.notEqual(first, second);
  assert.equal(total(first), 1120000n * U);
});

test('reference: missing, reordered and duplicate history cannot masquerade as complete replay', () => {
  const pristine = JSON.parse(canonicalExport(history()));
  const mutations = [
    value => { value.events.splice(1, 1); },
    value => { value.events.splice(1, 1); value.expectedEventCount -= 1; },
    value => { [value.events[0], value.events[1]] = [value.events[1], value.events[0]]; },
    value => { value.events.push(copy(value.events[0])); value.expectedEventCount += 1; },
  ];
  for (const mutate of mutations) {
    const envelope = copy(pristine);
    mutate(envelope);
    const before = JSON.stringify(envelope);
    assert.throws(() => rebuild(copy(SEED), envelope));
    assert.equal(JSON.stringify(envelope), before, 'rejected rebuild mutated its input');
  }
});

test('reference: changed intent, receipt, snapshot or seed fails against declared history', () => {
  const pristine = JSON.parse(canonicalExport(history()));
  const mutations = [
    value => { value.events[0].intent.text = 'Different unsigned fixture text.'; },
    value => { value.events[1].receipt.fee = '0'; },
    value => { value.snapshot.accounts.pioneer.balance = '1'; },
    value => { value.snapshot.poolDust = '123'; },
    value => { value.seed.accounts[0].balance = '1'; },
    value => { value.unknown = 'unexpected envelope field'; },
  ];
  for (const mutate of mutations) {
    const envelope = copy(pristine);
    mutate(envelope);
    assert.throws(() => rebuild(copy(SEED), envelope));
  }
});

