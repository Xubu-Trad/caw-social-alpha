import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as equal } from 'node:util';
import { reconstruct } from '../reference/paid-action-reader.mjs';
import { createPaidReorgReader, restartPaidReorgReader } from '../reference/paid-reorg-reader.mjs';
import { inspectExecutionHeaderChain } from '../reference/ethereum-execution-header.mjs';
import { createPaidHeaderRecovery, restartPaidHeaderRecovery } from '../reference/paid-header-recovery.mjs';

// Offline integration of retained controlled-node histories. No live node,
// transport, signer or modified historical reader is used. A matching header
// hash does not establish body inclusion, endpoint authenticity or finality.
const PROFILE = 'london-16';
const root = new URL('../experiments/paid-reorg/', import.meta.url);
const pins = {
  'history-left-number': '9c1a69329dab7a232ffde072d658a02f99497348ec640f3419b1cd6a10ac88e4',
  'history-left-hash': 'e63c9f608d5c3b81f90e052c2e3defc6f635684fa0bf62cba89025dab8f970d4',
  'history-right-number': 'bb1571c806a80d4866eeb54f61c1269831acca70f4a4efcb1d3ccc7471834cb2',
  'history-right-hash': 'd8aa7517ebeb7356bd176e47bb9442fc9e30afd3ab56cf61d470f5429c18da23',
  'manifest-left': 'b36b6209074c1b2d434403ef3839a6ee2441dd00d8b1c4098d947ed4185ac59c',
  'manifest-right': '39efad86b7ea938fdb5304b28053ec7ac097e5ea716e5a8815a72e7532232fbc'
};
function json(name) {
  const bytes = readFileSync(new URL(name + '.json', root));
  assert.ok(bytes.length < 4 * 1024 * 1024);
  if (pins[name]) assert.equal(createHash('sha256').update(bytes).digest('hex'), pins[name], name);
  return JSON.parse(bytes.toString('utf8'));
}
const histories = Object.fromEntries(['left', 'right'].map(branch => [branch,
  Object.fromEntries(['number', 'hash'].map(strategy => [strategy, json('history-' + branch + '-' + strategy)]))]));
const manifests = Object.fromEntries(['left', 'right'].map(branch => [branch, json('manifest-' + branch)]));
const python = Object.fromEntries(['left', 'right'].map(branch => [branch,
  Object.fromEntries(['number', 'hash'].map(strategy => [strategy, json('reconstruction-python-' + branch + '-' + strategy)]))]));
const clone = value => structuredClone(value);
const plain = value => JSON.parse(JSON.stringify(value));
const same = (actual, expected, message = 'complete values match') => assert.ok(equal(plain(actual), plain(expected)), message);
const rejects = (fn, code) => assert.throws(fn, error => error instanceof Error
  && (code ? error.code === code : /^(PAID_(HEADER|REORG|HISTORY)_|EXEC_HEADER_)/.test(error.code ?? '')));
const fixture = (branch, strategy = 'number') => ({ manifest: manifests[branch], history: histories[branch][strategy] });
function apply(reader, item) {
  const selected = reader.select(item.manifest);
  return reader.commit(reader.prepare(selected, item.history));
}
function headerCheck(item) {
  return inspectExecutionHeaderChain([item.history.start_block, ...item.history.blocks.map(block => block.header)], {
    schema: 'caw-execution-header-chain-selection/1', profile: PROFILE,
    startHash: item.manifest.start_block_hash, endHash: item.manifest.end_block_hash
  });
}
function unresolved(reader) {
  const state = reader.state();
  assert.equal(state.schema, 'caw-paid-header-recovery-state/1');
  assert.equal(state.profile, PROFILE); assert.equal(state.status, 'unresolved');
  assert.equal(state.recovery.status, 'unresolved'); assert.equal(state.recovery.current, null);
  assert.equal(state.header_integrity, null);
  return state;
}
function ready(state, item) {
  assert.equal(state.schema, 'caw-paid-header-recovery-state/1');
  assert.equal(state.profile, PROFILE); assert.equal(state.status, 'ready');
  assert.equal(state.recovery.status, 'ready'); same(state.recovery.current.manifest, item.manifest);
  same(state.recovery.current.result, reconstruct(item.history, item.manifest));
  same(state.header_integrity, headerCheck(item));
  for (const result of [state.header_integrity, ...state.header_integrity.headers]) {
    for (const flag of ['endpointAuthenticated', 'consensusVerified', 'bodyCommitmentsVerified',
      'executionVerified', 'finalityVerified', 'freshnessVerified']) assert.equal(result[flag], false, flag);
  }
}
function freezeTree(value) {
  if (value !== null && typeof value === 'object') {
    assert.ok(Object.isFrozen(value)); Object.values(value).forEach(freezeTree);
  }
}
function firstPost(history) {
  return history.blocks.flatMap(block => block.transactions)
    .find(tx => tx.receipt.status === '0x1' && tx.transaction.data.startsWith('0x62f509b3'));
}

test('both collectors on both retained branches combine complete accounting and header checks', () => {
  for (const branch of ['left', 'right']) for (const strategy of ['number', 'hash']) {
    const item = fixture(branch, strategy), reader = createPaidHeaderRecovery(PROFILE), base = createPaidReorgReader();
    unresolved(reader); const state = apply(reader, item); apply(base, item);
    ready(state, item); same(state.recovery, base.state(), 'existing recovery behavior retained');
    same(state.recovery.current.result, python[branch][strategy], 'complete historical Python arithmetic result');
    assert.equal(state.header_integrity.headerCount, 16);
  }
});

test('an explicit same-height branch replacement publishes accounting and header integrity together', () => {
  const reader = createPaidHeaderRecovery(PROFILE), left = apply(reader, fixture('left')), saved = plain(left);
  assert.equal(histories.left.number.end_block.number, histories.right.number.end_block.number);
  const token = reader.select(manifests.right); unresolved(reader);
  assert.equal(reader.exportRetained().recovery.branches.length, 1);
  const prepared = reader.prepare(token, histories.right.number); unresolved(reader);
  const right = reader.commit(prepared); ready(right, fixture('right'));
  const transition = right.recovery.current.transition, split = 10;
  same(transition, {
    from_tip: manifests.left.end_block_hash, to_tip: manifests.right.end_block_hash,
    common_ancestor: { number: '0xc', hash: histories.left.number.blocks[split - 1].header.hash },
    discarded_blocks: histories.left.number.blocks.slice(split).map(block => block.header.hash),
    adopted_blocks: histories.right.number.blocks.slice(split).map(block => block.header.hash)
  });
  assert.equal(right.recovery.historical.length, 1);
  same(left, saved, 'old returned state is an unchanged historical snapshot');
});

test('selection and preparation detach later mutations of supplied manifest and history', () => {
  const reader = createPaidHeaderRecovery(PROFILE), manifest = clone(manifests.left), history = clone(histories.left.number);
  const selected = reader.select(manifest); manifest.end_block_hash = '0x' + '11'.repeat(32);
  const prepared = reader.prepare(selected, history);
  history.blocks[5].header.extraData = '0x1234'; firstPost(history).receipt.logs = [];
  history.final.credits[0] = '0'; ready(reader.commit(prepared), fixture('left'));
});

test('state and retained evidence are deeply immutable and cannot change internal authority', () => {
  const reader = createPaidHeaderRecovery(PROFILE), state = apply(reader, fixture('left'));
  const retained = reader.exportRetained(), before = plain(state);
  freezeTree(state); freezeTree(retained);
  assert.throws(() => { state.header_integrity.headers[0].hash = 'changed'; }, TypeError);
  assert.throws(() => { state.recovery.current.result.credits[0] = '0'; }, TypeError);
  assert.throws(() => { retained.recovery.branches[0].history.blocks.length = 0; }, TypeError);
  same(reader.state(), before);
});

test('malformed selection and malformed selection arity immediately clear ready header claims', () => {
  for (const invoke of [reader => reader.select(null), reader => reader.select({}),
    reader => reader.select(), reader => reader.select(manifests.right, 'unexpected')]) {
    const reader = createPaidHeaderRecovery(PROFILE); apply(reader, fixture('left'));
    const retained = plain(reader.exportRetained()); rejects(() => invoke(reader));
    unresolved(reader); same(reader.exportRetained(), retained);
  }
});

test('stale prepared work or a delayed preparation error cannot clear a newer ready branch', () => {
  const reader = createPaidHeaderRecovery(PROFILE), oldSelection = reader.select(manifests.left);
  const oldPrepared = reader.prepare(oldSelection, histories.left.number);
  const current = apply(reader, fixture('right')), before = plain(current);
  rejects(() => reader.commit(oldPrepared), 'PAID_HEADER_STALE_PREPARED');
  rejects(() => reader.prepare(oldSelection, histories.left.number), 'PAID_HEADER_STALE_SELECTION');
  rejects(() => reader.prepare(oldSelection, {}), 'PAID_HEADER_STALE_SELECTION');
  same(reader.state(), before);
});

test('cloned foreign and consumed tokens cannot publish a prepared result', () => {
  const reader = createPaidHeaderRecovery(PROFILE), other = createPaidHeaderRecovery(PROFILE);
  const selected = reader.select(manifests.left), foreign = other.select(manifests.left);
  rejects(() => reader.prepare(clone(selected), histories.left.number), 'PAID_HEADER_STALE_SELECTION');
  rejects(() => reader.prepare(foreign, histories.left.number), 'PAID_HEADER_STALE_SELECTION');
  const prepared = reader.prepare(selected, histories.left.number), foreignPrepared = other.prepare(foreign, histories.left.number);
  rejects(() => reader.commit(clone(prepared)), 'PAID_HEADER_STALE_PREPARED');
  rejects(() => reader.commit(foreignPrepared), 'PAID_HEADER_STALE_PREPARED');
  ready(reader.commit(prepared), fixture('left')); const before = plain(reader.state());
  rejects(() => reader.commit(prepared), 'PAID_HEADER_STALE_PREPARED');
  rejects(() => reader.commit({}), 'PAID_HEADER_STALE_PREPARED');
  rejects(() => reader.prepare(selected, histories.left.number), 'PAID_HEADER_STALE_SELECTION');
  same(reader.state(), before);
});

test('failed preparation preserves an already prepared candidate within the same generation', () => {
  const reader = createPaidHeaderRecovery(PROFILE), selected = reader.select(manifests.left);
  const good = reader.prepare(selected, histories.left.number), bad = clone(histories.left.number);
  bad.blocks[5].header.extraData = '0x1234';
  rejects(() => reader.prepare(selected, bad), 'EXEC_HEADER_HASH_MISMATCH');
  unresolved(reader); ready(reader.commit(good), fixture('left'));
});

test('a rejected replacement stays unresolved while preserving the earlier raw interval', () => {
  const reader = createPaidHeaderRecovery(PROFILE); apply(reader, fixture('left'));
  const before = plain(reader.exportRetained()), selected = reader.select(manifests.right), bad = clone(histories.right.number);
  bad.blocks[11].header.extraData = '0x1234';
  rejects(() => reader.prepare(selected, bad), 'EXEC_HEADER_HASH_MISMATCH');
  unresolved(reader); same(reader.exportRetained(), before);
});

test('retained-hash mutations of checkpoint middle and tip fields pass old accounting but fail header admission', () => {
  for (const location of ['checkpoint', 'middle', 'tip']) {
    const item = clone(fixture('left'));
    const header = location === 'checkpoint' ? item.history.start_block
      : location === 'middle' ? item.history.blocks[5].header : item.history.blocks.at(-1).header;
    assert.notEqual(header.extraData, '0x1234'); header.extraData = '0x1234';
    if (location === 'tip') item.history.end_block = clone(header);
    const base = createPaidReorgReader(); apply(base, item);
    same(base.state().current.result, python.left.number, 'old accounting accepts only the isolated header alteration');
    const reader = createPaidHeaderRecovery(PROFILE), selection = reader.select(item.manifest);
    rejects(() => reader.prepare(selection, item.history), 'EXEC_HEADER_HASH_MISMATCH');
    unresolved(reader); assert.equal(reader.exportRetained().recovery.branches.length, 0);
  }
});

test('the duplicated end header must still equal the included tip in all fields', () => {
  const item = clone(fixture('right')); item.history.end_block.extraData = '0x1234';
  headerCheck(item); // The chain input uses the actual included tip, not this duplicate.
  const reader = createPaidHeaderRecovery(PROFILE), selected = reader.select(item.manifest);
  rejects(() => reader.prepare(selected, item.history), 'PAID_REORG_ENDPOINT_FIELDS'); unresolved(reader);
});

test('valid header hashes do not bypass missing paid logs or contradictory endpoint accounting', () => {
  for (const change of [history => { firstPost(history).receipt.logs.pop(); },
    history => { history.final.credits[0] = '0'; }]) {
    const item = clone(fixture('left')); change(item.history);
    const integrity = headerCheck(item); assert.equal(integrity.bodyCommitmentsVerified, false);
    const reader = createPaidHeaderRecovery(PROFILE), selected = reader.select(item.manifest);
    rejects(() => reader.prepare(selected, item.history)); unresolved(reader);
  }
});

test('same-hash retained metadata conflicts remain conflicts even though metadata is outside header RLP', () => {
  const reader = createPaidHeaderRecovery(PROFILE); apply(reader, fixture('left'));
  const altered = clone(fixture('left')); altered.history.blocks[5].header.size = '0x1';
  assert.notEqual(altered.history.blocks[5].header.size, histories.left.number.blocks[5].header.size);
  headerCheck(altered); const selection = reader.select(altered.manifest);
  rejects(() => reader.prepare(selection, altered.history), 'PAID_REORG_BRANCH_CONFLICT');
  unresolved(reader); assert.equal(reader.exportRetained().recovery.branches.length, 1);
});

test('unverified optional body metadata can be admitted without acquiring a body-proof claim', () => {
  const item = clone(fixture('left'));
  // A bounded fabricated metadata entry is deliberately not a valid withdrawal.
  // It tests the documented omission from header RLP, not new chain evidence.
  item.history.blocks[5].header.withdrawals = [{ synthetic: 'not-an-observed-withdrawal' }];
  const reader = createPaidHeaderRecovery(PROFILE), state = apply(reader, item);
  ready(state, item); same(state.header_integrity, headerCheck(fixture('left')));
  assert.equal(state.header_integrity.bodyCommitmentsVerified, false);
  same(reader.exportRetained().recovery.branches[0].history.blocks[5].header.withdrawals,
    item.history.blocks[5].header.withdrawals);
});

test('the fixed profile is explicit and a modern layout cannot silently reinterpret London input', () => {
  for (const invalid of [undefined, null, 16, {}, 'london', 'LONDON-16', 'legacy-15'])
    rejects(() => createPaidHeaderRecovery(invalid), 'PAID_HEADER_PROFILE');
  for (const profile of ['shanghai-17', 'cancun-20', 'prague-21']) {
    const reader = createPaidHeaderRecovery(profile); assert.equal(reader.state().profile, profile);
    const selected = reader.select(manifests.left);
    rejects(() => reader.prepare(selected, histories.left.number));
    assert.equal(reader.state().status, 'unresolved'); assert.equal(reader.state().header_integrity, null);
  }
});

test('incomplete or reordered intervals and a different selected endpoint cannot be adopted', () => {
  for (const change of [history => history.blocks.splice(5, 1),
    history => { [history.blocks[5], history.blocks[6]] = [history.blocks[6], history.blocks[5]]; }]) {
    const item = clone(fixture('left')); change(item.history);
    const reader = createPaidHeaderRecovery(PROFILE), selected = reader.select(item.manifest);
    rejects(() => reader.prepare(selected, item.history)); unresolved(reader);
  }
  const reader = createPaidHeaderRecovery(PROFILE), selected = reader.select(manifests.right);
  rejects(() => reader.prepare(selected, histories.left.number)); unresolved(reader);
});

test('a fifth pending candidate is refused without consuming the first four', () => {
  const reader = createPaidHeaderRecovery(PROFILE), selected = reader.select(manifests.left);
  const pending = Array.from({ length: 4 }, () => reader.prepare(selected, histories.left.number));
  rejects(() => reader.prepare(selected, histories.left.number), 'PAID_HEADER_PENDING_LIMIT');
  unresolved(reader); ready(reader.commit(pending[0]), fixture('left'));
  for (const token of pending.slice(1)) rejects(() => reader.commit(token), 'PAID_HEADER_STALE_PREPARED');
});

test('the selection bound fails closed after an otherwise valid 1024th generation', () => {
  const reader = createPaidHeaderRecovery(PROFILE); let selected;
  for (let index = 0; index < 1024; index++) selected = reader.select(manifests.left);
  const state = reader.commit(reader.prepare(selected, histories.left.number)); ready(state, fixture('left'));
  assert.equal(state.recovery.generation, 1024);
  rejects(() => reader.select(manifests.right), 'PAID_REORG_SELECTION_LIMIT');
  unresolved(reader); assert.equal(reader.exportRetained().recovery.branches.length, 1);
});

test('restart rebuilds both complete histories and honors the separately selected branch', () => {
  const reader = createPaidHeaderRecovery(PROFILE); apply(reader, fixture('left')); apply(reader, fixture('right'));
  const retained = reader.exportRetained();
  assert.equal(retained.schema, 'caw-paid-header-recovery-retained/1'); assert.equal(retained.profile, PROFILE);
  same(Object.keys(retained).sort(), ['profile', 'recovery', 'schema']);
  for (const branch of ['left', 'right']) {
    const fresh = restartPaidHeaderRecovery(retained, manifests[branch], PROFILE);
    ready(fresh.state(), fixture(branch)); assert.equal(fresh.state().recovery.historical.length, 1);
    same(fresh.exportRetained(), retained, 'all raw intervals survive restart');
  }
});

test('forged calculated caches are ignored and retained inputs are detached on restart', () => {
  const reader = createPaidHeaderRecovery(PROFILE); apply(reader, fixture('left')); apply(reader, fixture('right'));
  const retained = clone(reader.exportRetained());
  retained.calculated_cache = { status: 'ready', header_integrity: { endpointAuthenticated: true, finalityVerified: true } };
  retained.recovery.calculated_cache = { current: { result: { credits: ['0'] } }, selected: manifests.left };
  const fresh = restartPaidHeaderRecovery(retained, manifests.right, PROFILE); ready(fresh.state(), fixture('right'));
  const before = plain(fresh.state()); retained.recovery.branches[1].history.final.credits[0] = '0';
  same(fresh.state(), before); assert.equal(Object.hasOwn(fresh.exportRetained(), 'calculated_cache'), false);
});

test('restart hashes an unselected retained branch rather than trusting its earlier calculated success', () => {
  const reader = createPaidHeaderRecovery(PROFILE); apply(reader, fixture('left')); apply(reader, fixture('right'));
  const retained = clone(reader.exportRetained());
  const oldLeft = retained.recovery.branches.find(branch => branch.manifest.end_block_hash === manifests.left.end_block_hash);
  oldLeft.history.blocks[11].header.extraData = '0x1234';
  // The changed field is in L's unique suffix; old accounting and shared-prefix
  // consistency still succeed, isolating the new all-retained-header obligation.
  const base = restartPaidReorgReader(retained.recovery, manifests.right);
  same(base.state().current.result, python.right.number);
  rejects(() => restartPaidHeaderRecovery(retained, manifests.right, PROFILE), 'EXEC_HEADER_HASH_MISMATCH');
  ready(reader.state(), fixture('right'));
});

test('restart rejects profile mismatch missing selection duplicate intervals and absent history', () => {
  const reader = createPaidHeaderRecovery(PROFILE); apply(reader, fixture('left'));
  const retained = clone(reader.exportRetained());
  rejects(() => restartPaidHeaderRecovery(retained, manifests.left, 'shanghai-17'));
  rejects(() => restartPaidHeaderRecovery({ ...retained, profile: 'shanghai-17' }, manifests.left, PROFILE));
  rejects(() => restartPaidHeaderRecovery(retained, undefined, PROFILE));
  rejects(() => restartPaidHeaderRecovery(retained, manifests.right, PROFILE));
  const duplicate = clone(retained); duplicate.recovery.branches.push(clone(duplicate.recovery.branches[0]));
  rejects(() => restartPaidHeaderRecovery(duplicate, manifests.left, PROFILE));
  const empty = clone(retained); empty.recovery.branches = [];
  rejects(() => restartPaidHeaderRecovery(empty, manifests.left, PROFILE));
});

test('plain-data capture rejects accessors hooks cycles and exotic input without calling supplied code', () => {
  let invoked = 0;
  const reader = createPaidHeaderRecovery(PROFILE); apply(reader, fixture('left'));
  const selectedInput = clone(manifests.right);
  Object.defineProperty(selectedInput, 'end_block_hash', { enumerable: true, get() { invoked++; return manifests.right.end_block_hash; } });
  rejects(() => reader.select(selectedInput)); unresolved(reader); assert.equal(invoked, 0);
  const selection = reader.select(manifests.right);
  for (const change of [history => Object.defineProperty(history.blocks[0], 'header', {
    enumerable: true, get() { invoked++; return histories.right.number.blocks[0].header; }
  }), history => { history.toJSON = () => { invoked++; return histories.right.number; }; },
  history => { history.loop = history; }, history => { Object.setPrototypeOf(history, { inherited: true }); },
  history => { delete history.blocks[1]; }]) {
    const bad = clone(histories.right.number); change(bad); rejects(() => reader.prepare(selection, bad));
  }
  assert.equal(invoked, 0); unresolved(reader);
  const retained = clone(reader.exportRetained());
  Object.defineProperty(retained, 'calculated_cache', { enumerable: true, get() { invoked++; return {}; } });
  rejects(() => restartPaidHeaderRecovery(retained, manifests.left, PROFILE)); assert.equal(invoked, 0);
});

test('the wrapper refuses more than 128 included blocks and more than eight retained intervals', () => {
  const reader = createPaidHeaderRecovery(PROFILE), selected = reader.select(manifests.left), bad = clone(histories.left.number);
  // Deliberately oversized admission input, not a claimed extended chain.
  while (bad.blocks.length < 129) bad.blocks.push(clone(histories.left.number.blocks.at(-1)));
  rejects(() => reader.prepare(selected, bad), 'PAID_HEADER_RANGE'); unresolved(reader);
  apply(reader, fixture('left')); const retained = clone(reader.exportRetained());
  retained.recovery.branches = Array(9).fill(retained.recovery.branches[0]);
  rejects(() => restartPaidHeaderRecovery(retained, manifests.left, PROFILE));
});

// Synthetic optional metadata for capture admission only. The original hashed
// fields, roots, transaction/receipt bytes and every endpoint hash are unchanged.
// This is not a claim about actual withdrawals or newly observed node data.
function paddedMetadata(item) {
  const copy = clone(item);
  for (const header of [copy.history.start_block, ...copy.history.blocks.map(block => block.header)])
    header.withdrawals = Array.from({ length: 2048 }, () => ({ test: null }));
  copy.history.end_block = clone(copy.history.blocks.at(-1).header);
  return copy;
}
function countValues(value) {
  return 1 + (value !== null && typeof value === 'object'
    ? Object.values(value).reduce((sum, item) => sum + countValues(item), 0) : 0);
}

test('aggregate retained-node admission preserves a restartable export when the next branch exceeds its cap', () => {
  const left = paddedMetadata(fixture('left')), right = paddedMetadata(fixture('right'));
  // Both histories fit individually, and identical metadata on their common
  // prefix avoids introducing a same-hash conflict unrelated to the node cap.
  headerCheck(left); headerCheck(right);
  same(reconstruct(left.history, left.manifest), python.left.number);
  same(reconstruct(right.history, right.manifest), python.right.number);
  const reader = createPaidHeaderRecovery(PROFILE); apply(reader, left);
  const before = plain(reader.exportRetained()); assert.ok(countValues(before) < 100000);
  const oversized = clone(before); oversized.recovery.branches.push(right);
  assert.ok(countValues(oversized) > 100000);
  assert.ok(Buffer.byteLength(JSON.stringify(oversized)) < 8 * 1024 * 1024);
  const selected = reader.select(right.manifest);
  rejects(() => reader.prepare(selected, right.history), 'PAID_HEADER_LIMIT');
  unresolved(reader); same(reader.exportRetained(), before, 'failed admission leaves earlier raw export intact');
  const fresh = restartPaidHeaderRecovery(reader.exportRetained(), left.manifest, PROFILE);
  ready(fresh.state(), left); same(fresh.exportRetained(), before);
  rejects(() => restartPaidHeaderRecovery(oversized, right.manifest, PROFILE), 'PAID_HEADER_LIMIT');
});

test('ignored calculated caches remain bounded rather than bypassing retained-input admission', () => {
  const reader = createPaidHeaderRecovery(PROFILE); apply(reader, fixture('left'));
  const retained = clone(reader.exportRetained());
  // Repeated immutable strings keep test construction small while the supplied
  // plain-data value still exceeds the weighted eight-MiB capture budget.
  retained.calculated_cache = Array(43).fill('x'.repeat(200000));
  rejects(() => restartPaidHeaderRecovery(retained, manifests.left, PROFILE), 'PAID_HEADER_LIMIT');
  ready(reader.state(), fixture('left'));
});
