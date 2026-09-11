import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual as equal } from 'node:util';
import { createPaidActionObserver, restartPaidActionObserver,
  createHeaderCheckedPaidActionObserver, restartHeaderCheckedPaidActionObserver } from '../reference/paid-action-observer.mjs';
import { createPaidHeaderRecovery, restartPaidHeaderRecovery } from '../reference/paid-header-recovery.mjs';
import { inspectExecutionHeaderChain } from '../reference/ethereum-execution-header.mjs';

// Offline integration of existing alpha.28 and alpha.31 records. Header hashes
// are checked without asserting body inclusion, signature validity, independent
// providers, current canonicality, confirmation policy or retry permission.
const PROFILE = 'london-16', root = new URL('../', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value), plain = value => JSON.parse(JSON.stringify(value));
const same = (a, b, label = 'complete values agree') => assert.ok(equal(plain(a), plain(b)), label);
function json(path, pin) {
  const bytes = readFileSync(new URL(path, root)); assert.ok(bytes.length <= 4 * 1024 * 1024);
  if (pin) assert.equal(sha(bytes), pin); return JSON.parse(bytes.toString('utf8'));
}
const packed = readFileSync(new URL('experiments/paid-orphan-replay/execution-trace.json.gz', root));
assert.ok(packed.length <= 4 * 1024 * 1024);
const raw = gunzipSync(packed, { maxOutputLength: 4 * 1024 * 1024 });
assert.equal(raw.length, 2184365);
assert.equal(sha(raw), 'ebad7bf35c45bc4fcc0ec0d192a8313bbcf2b2d56e572a11ffdd656de86c3e49');
const replay = JSON.parse(raw.toString('utf8'));
const r31 = Object.fromEntries(['left', 'right'].map(branch => [branch, replay.branches[branch].collectors.number]));
const r28 = Object.fromEntries(['left', 'right'].map(branch => [branch, {
  history: json('experiments/paid-reorg/history-' + branch + '-number.json', branch === 'left'
    ? '9c1a69329dab7a232ffde072d658a02f99497348ec640f3419b1cd6a10ac88e4'
    : 'bb1571c806a80d4866eeb54f61c1269831acca70f4a4efcb1d3ccc7471834cb2'),
  manifest: json('experiments/paid-reorg/manifest-' + branch + '.json', branch === 'left'
    ? 'b36b6209074c1b2d434403ef3839a6ee2441dd00d8b1c4098d947ed4185ac59c'
    : '39efad86b7ea938fdb5304b28053ec7ac097e5ea716e5a8815a72e7532232fbc')
}]));
function target(item, calldata) {
  const context = clone(item.manifest); delete context.end_block_hash;
  return { schema: 'caw-paid-action-target/1', context, calldata };
}
const replayTarget = target(r31.left, replay.shared_transaction.data);
const firstTarget = target(r28.left, r28.left.history.blocks[11].transactions[0].transaction.data);
const secondTarget = target(r28.left, r28.left.history.blocks[13].transactions[0].transaction.data);
const commonTarget = target(r28.left, r28.left.history.blocks[9].transactions[0].transaction.data);
const create = wanted => createHeaderCheckedPaidActionObserver(wanted, PROFILE);
const rejects = (fn, code) => assert.throws(fn, error => error instanceof Error
  && (code ? error.code === code : /^(PAID_(OBSERVER|HEADER|REORG|HISTORY)_|EXEC_HEADER_)/.test(error.code ?? '')));
function apply(observer, item) {
  const token = observer.select(item.manifest);
  return observer.commit(observer.prepare(token, item.history));
}
function headerCheck(item) {
  return inspectExecutionHeaderChain([item.history.start_block, ...item.history.blocks.map(block => block.header)], {
    schema: 'caw-execution-header-chain-selection/1', profile: PROFILE,
    startHash: item.manifest.start_block_hash, endHash: item.manifest.end_block_hash
  });
}
function projection(item, positions) {
  const history = item.history;
  return { manifest: item.manifest,
    coverage: { start_exclusive: { number: history.start_block.number, hash: history.start_block.hash },
      end_inclusive: { number: history.end_block.number, hash: history.end_block.hash } },
    observations: positions.map(([blockIndex, txIndex]) => {
      const block = history.blocks[blockIndex], receipt = block.transactions[txIndex].receipt;
      return { block_hash: block.header.hash, block_number: block.header.number,
        transaction_hash: receipt.transactionHash, transaction_index: receipt.transactionIndex,
        receipt_status: receipt.status, outcome: receipt.status === '0x1' ? 'accepted' : 'rejected',
        log_indices: receipt.logs.map(log => log.logIndex) };
    }) };
}
function boundary(state, wanted, status, item = null) {
  assert.equal(state.schema, 'caw-paid-header-action-observation/1'); assert.equal(state.profile, PROFILE);
  same(state.target, wanted); assert.equal(state.status, status);
  assert.equal(state.finality, 'not-established'); assert.equal(state.retry_safety, 'not-assessed');
  for (const claim of ['finalized', 'expired', 'cancelled', 'safe_to_retry', 'signature_verified'])
    assert.equal(Object.hasOwn(state, claim), false);
  if (status === 'unresolved') {
    assert.equal(state.selected, null); assert.equal(state.header_integrity, null);
  } else {
    assert.ok(item); same(state.header_integrity, headerCheck(item));
    for (const checked of [state.header_integrity, ...state.header_integrity.headers])
      for (const flag of ['endpointAuthenticated', 'consensusVerified', 'bodyCommitmentsVerified',
        'executionVerified', 'finalityVerified', 'freshnessVerified']) assert.equal(checked[flag], false, flag);
  }
}
function freezeTree(value) {
  if (value !== null && typeof value === 'object') {
    assert.ok(Object.isFrozen(value)); Object.values(value).forEach(freezeTree);
  }
}

test('an initial checked target has no observation or header-integrity claim', () => {
  const observer = create(replayTarget), state = observer.state();
  boundary(state, replayTarget, 'unresolved'); assert.equal(state.generation, 0); same(state.retained_intervals, []);
  assert.equal(observer.exportRetained().recovery.recovery.branches.length, 0);
});

test('the exact alpha31 intent is accepted with its failed duplicate retained on both recorded branches', () => {
  for (const strategy of ['number', 'hash']) {
    const observer = create(replayTarget), views = {};
    for (const branch of ['left', 'right']) {
      const item = replay.branches[branch].collectors[strategy], positions = branch === 'left' ? [[11, 0], [12, 0]] : [[12, 0], [13, 0]];
      const state = apply(observer, item); boundary(state, replayTarget, 'observed-accepted', item);
      same(state.selected, projection(item, positions));
      same(state.selected.observations.map(row => row.receipt_status), ['0x1', '0x0']); views[branch] = state;
    }
    const left = views.left.selected.observations, right = views.right.selected.observations;
    for (let index = 0; index < 2; index++) {
      assert.equal(left[index].transaction_hash, right[index].transaction_hash);
      assert.notEqual(left[index].block_hash, right[index].block_hash);
      assert.notEqual(left[index].block_number, right[index].block_number);
    }
    same(views.right.retained_intervals, [views.left.selected]);
  }
});

test('alpha28 acceptance becomes rejected-only for the explicitly selected replacement interval', () => {
  const observer = create(firstTarget);
  boundary(apply(observer, r28.left), firstTarget, 'observed-accepted', r28.left);
  const state = apply(observer, r28.right); boundary(state, firstTarget, 'rejected-only-in-selected-interval', r28.right);
  same(state.selected, projection(r28.right, [[11, 0]]));
  same(state.retained_intervals, [projection(r28.left, [[11, 0]])]);
  for (const row of state.selected.observations) {
    assert.equal(Object.hasOwn(row, 'revert_reason'), false); assert.equal(Object.hasOwn(row, 'invalid_signature'), false);
  }
});

test('absence is bounded to checked coverage and does not erase the earlier accepted interval', () => {
  const observer = create(secondTarget); apply(observer, r28.left);
  const state = apply(observer, r28.right); boundary(state, secondTarget, 'not-observed-in-covered-interval', r28.right);
  same(state.selected, projection(r28.right, []));
  same(state.retained_intervals, [projection(r28.left, [[13, 0]])]);
  assert.equal(Object.hasOwn(state.retained_intervals[0], 'orphaned'), false);
});

test('shared-prefix observations in retained intervals are not automatically labeled orphaned', () => {
  const observer = create(commonTarget), left = apply(observer, r28.left), right = apply(observer, r28.right);
  boundary(right, commonTarget, 'observed-accepted', r28.right);
  same(right.selected, projection(r28.right, [[9, 0]])); same(right.retained_intervals, [left.selected]);
  same(right.selected.observations, left.selected.observations);
  assert.equal(Object.hasOwn(right.retained_intervals[0], 'orphaned'), false);
  assert.equal(right.header_integrity.endHash, r28.right.manifest.end_block_hash);
});

test('select and prepare keep both status and headers unresolved until their atomic commit', () => {
  const observer = create(replayTarget), left = apply(observer, r31.left), before = plain(left);
  const token = observer.select(r31.right.manifest); boundary(observer.state(), replayTarget, 'unresolved');
  same(observer.state().retained_intervals, [left.selected]);
  const prepared = observer.prepare(token, r31.right.history); boundary(observer.state(), replayTarget, 'unresolved');
  const right = observer.commit(prepared); boundary(right, replayTarget, 'observed-accepted', r31.right);
  same(right.selected, projection(r31.right, [[12, 0], [13, 0]])); same(left, before);
});

test('the legacy observer still accepts isolated retained-hash metadata while checked mode refuses every status', () => {
  for (const location of ['checkpoint', 'middle', 'tip']) {
    const item = clone(r28.left), header = location === 'checkpoint' ? item.history.start_block
      : location === 'middle' ? item.history.blocks[5].header : item.history.blocks.at(-1).header;
    assert.notEqual(header.extraData, '0x1234'); header.extraData = '0x1234';
    if (location === 'tip') item.history.end_block = clone(header);
    const old = createPaidActionObserver(firstTarget), prior = apply(old, item);
    assert.equal(prior.schema, 'caw-paid-action-observation/1'); assert.equal(prior.status, 'observed-accepted');
    assert.equal(Object.hasOwn(prior, 'header_integrity'), false);
    const observer = create(firstTarget), token = observer.select(item.manifest);
    rejects(() => observer.prepare(token, item.history), 'EXEC_HEADER_HASH_MISMATCH');
    boundary(observer.state(), firstTarget, 'unresolved');
    assert.equal(observer.exportRetained().recovery.recovery.branches.length, 0);
  }
});

test('a failed replacement preserves earlier raw evidence without keeping its status authoritative', () => {
  const observer = create(firstTarget); apply(observer, r28.left);
  const before = plain(observer.exportRetained()), item = clone(r28.right), token = observer.select(item.manifest);
  item.history.blocks[11].header.extraData = '0x1234';
  rejects(() => observer.prepare(token, item.history), 'EXEC_HEADER_HASH_MISMATCH');
  boundary(observer.state(), firstTarget, 'unresolved'); same(observer.exportRetained(), before);
  same(observer.state().retained_intervals, [projection(r28.left, [[11, 0]])]);
});

test('valid header hashes cannot bypass bad receipt logs endpoint accounting or duplicate end-header fields', () => {
  for (const change of [history => { history.blocks[11].transactions[0].receipt.logs = []; },
    history => { history.final.credits[0] = '0'; }, history => { history.end_block.extraData = '0x1234'; }]) {
    const item = clone(r31.left); change(item.history); headerCheck(item);
    const observer = create(replayTarget), token = observer.select(item.manifest);
    rejects(() => observer.prepare(token, item.history)); boundary(observer.state(), replayTarget, 'unresolved');
  }
});

test('bounded unverified body metadata can be accepted without gaining a body proof', () => {
  const item = clone(r31.left);
  item.history.blocks[5].header.withdrawals = [{ synthetic: 'not-an-observed-withdrawal' }];
  const observer = create(replayTarget), state = apply(observer, item);
  boundary(state, replayTarget, 'observed-accepted', item);
  same(state.header_integrity, headerCheck(r31.left));
  same(state.selected, projection(r31.left, [[11, 0], [12, 0]]));
  assert.equal(state.header_integrity.bodyCommitmentsVerified, false);
});

test('malformed selection or a different target context clears both classification and header report', () => {
  for (const change of [m => { delete m.end_block_hash; }, m => { m.chain_id = 1; },
    m => { m.start_block_hash = '0x' + '12'.repeat(32); }, m => { m.addresses.probe = '0x' + '12'.repeat(20); },
    m => { m.registry_runtime_sha256 = '12'.repeat(32); }]) {
    const observer = create(replayTarget); apply(observer, r31.left); const before = plain(observer.exportRetained());
    const selected = clone(r31.right.manifest); change(selected); rejects(() => observer.select(selected));
    boundary(observer.state(), replayTarget, 'unresolved'); same(observer.exportRetained(), before);
  }
  const observer = create(replayTarget); apply(observer, r31.left);
  rejects(() => observer.select(r28.right.manifest)); boundary(observer.state(), replayTarget, 'unresolved');
  apply(observer, r31.left); rejects(() => observer.select(r31.right.manifest, 'unexpected'));
  boundary(observer.state(), replayTarget, 'unresolved');
});

test('target manifest and prepared history are detached from later caller mutations', () => {
  const wanted = clone(replayTarget), observer = create(wanted);
  wanted.calldata = '0x62f509b3'; wanted.context.addresses.probe = '0x' + '12'.repeat(20);
  const manifest = clone(r31.left.manifest), history = clone(r31.left.history), selected = observer.select(manifest);
  manifest.end_block_hash = '0x' + '12'.repeat(32); const prepared = observer.prepare(selected, history);
  history.blocks[11].transactions[0].receipt.logs = []; history.blocks[5].header.extraData = '0x1234';
  history.final.nonces[0] = '0'; boundary(observer.commit(prepared), replayTarget, 'observed-accepted', r31.left);
  same(observer.state().selected, projection(r31.left, [[11, 0], [12, 0]]));
});

test('returned classifications header reports and saved histories are deeply immutable', () => {
  const observer = create(replayTarget), state = apply(observer, r31.left), before = plain(state), retained = observer.exportRetained();
  freezeTree(state); freezeTree(retained);
  assert.throws(() => { state.selected.observations[0].outcome = 'rejected'; }, TypeError);
  assert.throws(() => { state.header_integrity.headers[0].hash = 'changed'; }, TypeError);
  assert.throws(() => { retained.recovery.recovery.branches[0].history.blocks.length = 0; }, TypeError);
  same(observer.state(), before);
});

test('cloned foreign and consumed opaque tokens cannot publish a status or checked header', () => {
  const observer = create(replayTarget), other = create(replayTarget);
  const selected = observer.select(r31.left.manifest), foreign = other.select(r31.left.manifest);
  rejects(() => observer.prepare(clone(selected), r31.left.history)); rejects(() => observer.prepare(foreign, r31.left.history));
  const prepared = observer.prepare(selected, r31.left.history), foreignPrepared = other.prepare(foreign, r31.left.history);
  rejects(() => observer.commit(clone(prepared))); rejects(() => observer.commit(foreignPrepared));
  boundary(observer.commit(prepared), replayTarget, 'observed-accepted', r31.left); const before = plain(observer.state());
  rejects(() => observer.commit(prepared)); rejects(() => observer.commit({}));
  rejects(() => observer.prepare(selected, r31.left.history)); same(observer.state(), before);
});

test('delayed success or failure cannot clear a newer selected and committed observation', () => {
  const observer = create(replayTarget), oldSelection = observer.select(r31.left.manifest);
  const oldPrepared = observer.prepare(oldSelection, r31.left.history); apply(observer, r31.right);
  const before = plain(observer.state());
  rejects(() => observer.commit(oldPrepared)); rejects(() => observer.prepare(oldSelection, r31.left.history));
  rejects(() => observer.prepare(oldSelection, {})); same(observer.state(), before);
});

test('pending work is bounded and a failed candidate does not consume an earlier valid preparation', () => {
  const observer = create(replayTarget), selection = observer.select(r31.left.manifest);
  const pending = [observer.prepare(selection, r31.left.history)], bad = clone(r31.left.history);
  bad.blocks[5].header.extraData = '0x1234'; rejects(() => observer.prepare(selection, bad), 'EXEC_HEADER_HASH_MISMATCH');
  for (let index = 1; index < 4; index++) pending.push(observer.prepare(selection, r31.left.history));
  rejects(() => observer.prepare(selection, r31.left.history)); boundary(observer.state(), replayTarget, 'unresolved');
  boundary(observer.commit(pending[0]), replayTarget, 'observed-accepted', r31.left);
  for (const token of pending.slice(1)) rejects(() => observer.commit(token));
});

test('selection exhaustion fails closed after a valid 1024th generation', () => {
  const observer = create(replayTarget); let selection;
  for (let index = 0; index < 1024; index++) selection = observer.select(r31.left.manifest);
  boundary(observer.commit(observer.prepare(selection, r31.left.history)), replayTarget, 'observed-accepted', r31.left);
  assert.equal(observer.state().generation, 1024); rejects(() => observer.select(r31.right.manifest));
  boundary(observer.state(), replayTarget, 'unresolved'); assert.equal(observer.exportRetained().recovery.recovery.branches.length, 1);
});

test('restart rebuilds explicit selected coverage and ignores forged caches at allowed layers', () => {
  const observer = create(replayTarget); apply(observer, r31.left); apply(observer, r31.right);
  const retained = clone(observer.exportRetained());
  assert.equal(retained.schema, 'caw-paid-header-action-observer-retained/1');
  same(Object.keys(retained).sort(), ['recovery', 'schema', 'target']); assert.equal(retained.recovery.profile, PROFILE);
  const forged = { status: 'finalized', retry_safety: 'safe-to-retry', header_integrity: { finalityVerified: true } };
  retained.calculated_cache = clone(forged); retained.recovery.calculated_cache = clone(forged);
  retained.recovery.recovery.calculated_cache = { current: { result: 'invented' } };
  for (const branch of ['left', 'right']) {
    const fresh = restartHeaderCheckedPaidActionObserver(retained, r31[branch].manifest, PROFILE);
    boundary(fresh.state(), replayTarget, 'observed-accepted', r31[branch]);
    same(fresh.state().selected, projection(r31[branch], branch === 'left' ? [[11, 0], [12, 0]] : [[12, 0], [13, 0]]));
    assert.equal(fresh.state().retained_intervals.length, 1);
    assert.equal(Object.hasOwn(fresh.exportRetained(), 'calculated_cache'), false);
  }
});

test('restart rechecks unselected branch hashes that the old observer still accepts', () => {
  const observer = create(firstTarget); apply(observer, r28.left); apply(observer, r28.right);
  const saved = clone(observer.exportRetained());
  const oldLeft = saved.recovery.recovery.branches.find(item => item.manifest.end_block_hash === r28.left.manifest.end_block_hash);
  oldLeft.history.blocks[11].header.extraData = '0x1234';
  const legacy = { schema: 'caw-paid-action-observer-retained/1', target: firstTarget, recovery: saved.recovery.recovery };
  assert.equal(restartPaidActionObserver(legacy, r28.right.manifest).state().status, 'rejected-only-in-selected-interval');
  rejects(() => restartHeaderCheckedPaidActionObserver(saved, r28.right.manifest, PROFILE), 'EXEC_HEADER_HASH_MISMATCH');
  boundary(observer.state(), firstTarget, 'rejected-only-in-selected-interval', r28.right);
});

test('missing profiles legacy schemas and forged saved header claims cannot downgrade the checked mode', () => {
  for (const profile of [undefined, null, '', 'london', 'legacy-15', 16])
    rejects(() => createHeaderCheckedPaidActionObserver(replayTarget, profile));
  rejects(() => createHeaderCheckedPaidActionObserver(replayTarget));
  const observer = create(replayTarget); apply(observer, r31.left); const retained = clone(observer.exportRetained());
  rejects(() => restartHeaderCheckedPaidActionObserver(retained, r31.left.manifest));
  rejects(() => restartHeaderCheckedPaidActionObserver(retained, r31.left.manifest, null));
  rejects(() => restartHeaderCheckedPaidActionObserver(retained, r31.left.manifest, 'shanghai-17'));
  const legacy = createPaidActionObserver(replayTarget); apply(legacy, r31.left);
  rejects(() => restartHeaderCheckedPaidActionObserver(legacy.exportRetained(), r31.left.manifest, PROFILE));
  rejects(() => restartPaidActionObserver(retained, r31.left.manifest));
  const claim = clone(retained); claim.header_integrity = { finalityVerified: true };
  rejects(() => restartHeaderCheckedPaidActionObserver(claim, r31.left.manifest, PROFILE));
  const changedProfile = clone(retained); changedProfile.recovery.profile = 'shanghai-17';
  rejects(() => restartHeaderCheckedPaidActionObserver(changedProfile, r31.left.manifest, PROFILE));
});

test('restart requires present unique raw histories whose context still matches the target', () => {
  const observer = create(replayTarget); apply(observer, r31.left); const retained = clone(observer.exportRetained());
  rejects(() => restartHeaderCheckedPaidActionObserver(retained, r31.right.manifest, PROFILE));
  const duplicate = clone(retained); duplicate.recovery.recovery.branches.push(clone(duplicate.recovery.recovery.branches[0]));
  rejects(() => restartHeaderCheckedPaidActionObserver(duplicate, r31.left.manifest, PROFILE));
  const empty = clone(retained); empty.recovery.recovery.branches = [];
  rejects(() => restartHeaderCheckedPaidActionObserver(empty, r31.left.manifest, PROFILE));
  const context = clone(retained); context.target.context.probe_runtime_sha256 = '12'.repeat(32);
  rejects(() => restartHeaderCheckedPaidActionObserver(context, r31.left.manifest, PROFILE));
});

test('plain-data boundaries reject getters serialization hooks cycles and exotic values without execution', () => {
  let invoked = 0; const wanted = clone(replayTarget);
  Object.defineProperty(wanted, 'calldata', { enumerable: true, get() { invoked++; return replayTarget.calldata; } });
  rejects(() => create(wanted)); assert.equal(invoked, 0);
  const observer = create(replayTarget); apply(observer, r31.left);
  const badManifest = clone(r31.right.manifest);
  Object.defineProperty(badManifest, 'end_block_hash', { enumerable: true, get() { invoked++; return r31.right.manifest.end_block_hash; } });
  rejects(() => observer.select(badManifest)); boundary(observer.state(), replayTarget, 'unresolved');
  const token = observer.select(r31.right.manifest);
  for (const change of [history => Object.defineProperty(history.blocks[0], 'header', {
    enumerable: true, get() { invoked++; return r31.right.history.blocks[0].header; }
  }), history => { history.toJSON = () => { invoked++; return r31.right.history; }; },
  history => { history.loop = history; }, history => { Object.setPrototypeOf(history, { inherited: true }); },
  history => { delete history.blocks[1]; }]) {
    const history = clone(r31.right.history); change(history); rejects(() => observer.prepare(token, history));
  }
  const saved = clone(observer.exportRetained());
  Object.defineProperty(saved, 'calculated_cache', { enumerable: true, get() { invoked++; return {}; } });
  rejects(() => restartHeaderCheckedPaidActionObserver(saved, r31.left.manifest, PROFILE)); assert.equal(invoked, 0);
});

test('oversized intervals observation lists and retained rosters are refused before publication', () => {
  const observer = create(replayTarget), token = observer.select(r31.left.manifest);
  // Deliberately invalid admission inputs; no new blocks or receipts are claimed.
  const tooManyBlocks = clone(r31.left.history);
  while (tooManyBlocks.blocks.length < 129) tooManyBlocks.blocks.push(clone(r31.left.history.blocks[0]));
  rejects(() => observer.prepare(token, tooManyBlocks));
  const tooManyMatches = clone(r31.left.history);
  tooManyMatches.blocks[11].transactions = Array.from({ length: 256 }, () => clone(r31.left.history.blocks[11].transactions[0]));
  rejects(() => observer.prepare(token, tooManyMatches), 'PAID_OBSERVER_OBSERVATION_LIMIT');
  boundary(observer.state(), replayTarget, 'unresolved'); apply(observer, r31.left);
  const saved = clone(observer.exportRetained()); saved.recovery.recovery.branches = Array(9).fill(saved.recovery.recovery.branches[0]);
  rejects(() => restartHeaderCheckedPaidActionObserver(saved, r31.left.manifest, PROFILE));
});

function countValues(value) {
  return 1 + (value !== null && typeof value === 'object'
    ? Object.values(value).reduce((sum, item) => sum + countValues(item), 0) : 0);
}
function paddedPair(entries) {
  return ['left', 'right'].map(branch => {
    const item = clone(r28[branch]);
    for (const header of [item.history.start_block, ...item.history.blocks.map(block => block.header)])
      header.withdrawals = Array.from({ length: entries }, () => ({ synthetic: null }));
    item.history.end_block = clone(item.history.blocks.at(-1).header); return item;
  });
}
function innerSaved(branches) {
  return { schema: 'caw-paid-header-recovery-retained/1', profile: PROFILE,
    recovery: { schema: 'caw-paid-reorg-retained/1', branches } };
}
function outerSaved(recovery) {
  return { schema: 'caw-paid-header-action-observer-retained/1', target: firstTarget, recovery };
}

test('outer target overhead is bounded even when both checked recovery histories individually and jointly fit', () => {
  // Synthetic optional metadata only. Every original consensus field, header
  // hash and receipt is preserved; the metadata is not actual withdrawal data.
  const empty = paddedPair(0), emptyInner = innerSaved(empty);
  const overhead = countValues(outerSaved(emptyInner)) - countValues(emptyInner);
  assert.ok(overhead > 2 && overhead < 100);
  const desired = 100000 - Math.floor(overhead / 2);
  const occurrences = empty.reduce((n, item) => n + item.history.blocks.length + 2, 0);
  const entries = Math.floor((desired - countValues(emptyInner)) / (2 * occurrences));
  assert.ok(entries > 0 && entries < 2000);
  const pair = paddedPair(entries), padded = innerSaved(pair), remaining = desired - countValues(padded);
  assert.ok(remaining >= 0 && remaining < 2 * occurrences);
  // L's non-tip unique suffix avoids changing a shared block or its end copy.
  pair[0].history.blocks[11].header.withdrawals.push(...Array(remaining).fill(null));
  assert.ok(pair[0].history.blocks[11].header.withdrawals.length <= 2048);
  assert.equal(countValues(padded), desired); assert.ok(countValues(outerSaved(padded)) > 100000);
  assert.ok(Buffer.byteLength(JSON.stringify(outerSaved(padded))) < 8 * 1024 * 1024);
  const inner = createPaidHeaderRecovery(PROFILE); apply(inner, pair[0]); apply(inner, pair[1]);
  same(inner.exportRetained(), padded, 'inner recovery admits this full retained envelope');
  assert.equal(restartPaidHeaderRecovery(inner.exportRetained(), pair[1].manifest, PROFILE).state().status, 'ready');
  const observer = create(firstTarget); apply(observer, pair[0]); const before = plain(observer.exportRetained());
  const token = observer.select(pair[1].manifest);
  rejects(() => observer.prepare(token, pair[1].history), 'PAID_OBSERVER_LIMIT');
  boundary(observer.state(), firstTarget, 'unresolved'); same(observer.exportRetained(), before);
  const fresh = restartHeaderCheckedPaidActionObserver(observer.exportRetained(), pair[0].manifest, PROFILE);
  boundary(fresh.state(), firstTarget, 'observed-accepted', pair[0]); same(fresh.exportRetained(), before);
  rejects(() => restartHeaderCheckedPaidActionObserver(outerSaved(padded), pair[1].manifest, PROFILE), 'PAID_OBSERVER_LIMIT');
});

test('ignored calculated caches remain subject to the outer capture size limit', () => {
  const observer = create(replayTarget); apply(observer, r31.left); const saved = clone(observer.exportRetained());
  saved.calculated_cache = Array(43).fill('x'.repeat(200000));
  rejects(() => restartHeaderCheckedPaidActionObserver(saved, r31.left.manifest, PROFILE), 'PAID_OBSERVER_LIMIT');
  boundary(observer.state(), replayTarget, 'observed-accepted', r31.left);
});

test('watching different signature bytes reports bounded absence rather than deciding signature validity', () => {
  const wanted = clone(replayTarget), last = parseInt(wanted.calldata.slice(-2), 16);
  wanted.calldata = wanted.calldata.slice(0, -2) + (last ^ 1).toString(16).padStart(2, '0');
  assert.notEqual(wanted.calldata, replayTarget.calldata);
  const observer = create(wanted), state = apply(observer, r31.left);
  boundary(state, wanted, 'not-observed-in-covered-interval', r31.left);
  same(state.selected, projection(r31.left, [])); assert.equal(state.header_integrity.executionVerified, false);
});
