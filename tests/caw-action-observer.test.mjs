import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createPaidActionObserver, restartPaidActionObserver } from '../reference/paid-action-observer.mjs';
import { reconstruct } from '../reference/paid-action-reader.mjs';

// These are offline observations of retained alpha.28/31 evidence. Generated
// limit fixtures below extend recorded failed receipts solely to exercise
// bounded state handling; they are not captures of additional EVM executions.
const root = new URL('../', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const plain = value => JSON.parse(JSON.stringify(value));
const same = (actual, expected) => assert.deepEqual(plain(actual), plain(expected));
function json(path, maximum = 4 * 1024 * 1024) {
  const bytes = readFileSync(new URL(path, root)); assert.ok(bytes.length <= maximum);
  return JSON.parse(bytes.toString('utf8'));
}
const packed = readFileSync(new URL('experiments/paid-orphan-replay/execution-trace.json.gz', root));
assert.ok(packed.length <= 4 * 1024 * 1024);
const decoded = gunzipSync(packed, { maxOutputLength: 8 * 1024 * 1024 });
assert.equal(decoded.length, 2184365);
assert.equal(sha(decoded), 'ebad7bf35c45bc4fcc0ec0d192a8313bbcf2b2d56e572a11ffdd656de86c3e49');
const replay = JSON.parse(decoded.toString('utf8'));
const r31 = Object.fromEntries(['left', 'right'].map(branch => [branch, replay.branches[branch].collectors.number]));
const r28 = Object.fromEntries(['left', 'right'].map(branch => [branch, {
  history: json('experiments/paid-reorg/history-' + branch + '-number.json'),
  manifest: json('experiments/paid-reorg/manifest-' + branch + '.json')
}]));
function target(fixture, calldata) {
  const context = clone(fixture.manifest); delete context.end_block_hash;
  return { schema: 'caw-paid-action-target/1', context, calldata };
}
const replayTarget = target(r31.left, replay.shared_transaction.data);
const firstTarget = target(r28.left, r28.left.history.blocks[11].transactions[0].transaction.data);
const secondTarget = target(r28.left, r28.left.history.blocks[13].transactions[0].transaction.data);
function apply(observer, fixture) {
  const selection = observer.select(fixture.manifest);
  const prepared = observer.prepare(selection, fixture.history);
  observer.commit(prepared);
  return observer.state();
}
function observation(block, entry) {
  const receipt = entry.receipt;
  return { block_hash: block.header.hash, block_number: block.header.number,
    transaction_hash: receipt.transactionHash, transaction_index: receipt.transactionIndex,
    receipt_status: receipt.status, outcome: receipt.status === '0x1' ? 'accepted' : 'rejected',
    log_indices: receipt.logs.map(log => log.logIndex) };
}
function projection(fixture, pairs) {
  const h = fixture.history;
  return { manifest: fixture.manifest,
    coverage: { start_exclusive: { number: h.start_block.number, hash: h.start_block.hash },
      end_inclusive: { number: h.end_block.number, hash: h.end_block.hash } },
    observations: pairs.map(([blockIndex, transactionIndex]) => observation(h.blocks[blockIndex], h.blocks[blockIndex].transactions[transactionIndex])) };
}
function boundary(state, wantedTarget, status) {
  assert.equal(state.schema, 'caw-paid-action-observation/1');
  same(state.target, wantedTarget);
  assert.equal(state.status, status);
  assert.equal(state.finality, 'not-established');
  assert.equal(state.retry_safety, 'not-assessed');
  for (const unsupported of ['finalized', 'expired', 'cancelled', 'safe_to_retry']) assert.equal(Object.hasOwn(state, unsupported), false);
}
function rejects(fn) { assert.throws(fn, error => error instanceof Error); }

test('initial target is unresolved and establishes no finality or retry permission', () => {
  const observer = createPaidActionObserver(replayTarget), state = observer.state();
  boundary(state, replayTarget, 'unresolved'); assert.equal(state.generation, 0);
  assert.equal(state.selected, null); same(state.retained_intervals, []);
});

test('acceptance wins over the later failed duplicate in the same selected interval', () => {
  const observer = createPaidActionObserver(replayTarget);
  const state = apply(observer, r31.left);
  boundary(state, replayTarget, 'observed-accepted');
  same(state.selected, projection(r31.left, [[11, 0], [12, 0]]));
  same(state.selected.observations.map(o => o.outcome), ['accepted', 'rejected']);
  same(state.retained_intervals, []);
});

test('same transaction hashes on two branches preserve separate block identities', () => {
  const observer = createPaidActionObserver(replayTarget);
  const left = apply(observer, r31.left), right = apply(observer, r31.right);
  boundary(right, replayTarget, 'observed-accepted');
  same(right.selected, projection(r31.right, [[12, 0], [13, 0]]));
  same(right.retained_intervals, [projection(r31.left, [[11, 0], [12, 0]])]);
  assert.equal(left.selected.observations[0].transaction_hash, right.selected.observations[0].transaction_hash);
  assert.notEqual(left.selected.observations[0].block_hash, right.selected.observations[0].block_hash);
  assert.equal(left.selected.observations[1].transaction_hash, right.selected.observations[1].transaction_hash);
  assert.notEqual(left.selected.observations[1].block_number, right.selected.observations[1].block_number);
});

test('a selected failed receipt replaces an earlier acceptance without deriving a revert reason', () => {
  const observer = createPaidActionObserver(firstTarget);
  boundary(apply(observer, r28.left), firstTarget, 'observed-accepted');
  const state = apply(observer, r28.right);
  boundary(state, firstTarget, 'rejected-only-in-selected-interval');
  same(state.selected, projection(r28.right, [[11, 0]]));
  same(state.retained_intervals, [projection(r28.left, [[11, 0]])]);
  for (const item of state.selected.observations) {
    assert.equal(Object.hasOwn(item, 'revert_reason'), false);
    assert.equal(Object.hasOwn(item, 'invalid_signature'), false);
  }
});

test('absence is limited to the covered interval and does not erase old observations', () => {
  const observer = createPaidActionObserver(secondTarget);
  apply(observer, r28.left);
  const state = apply(observer, r28.right);
  boundary(state, secondTarget, 'not-observed-in-covered-interval');
  same(state.selected, projection(r28.right, []));
  same(state.retained_intervals, [projection(r28.left, [[13, 0]])]);
  assert.equal(Object.hasOwn(state.retained_intervals[0], 'orphaned'), false);
});

test('select immediately invalidates a ready classification before preparing the replacement', () => {
  const observer = createPaidActionObserver(replayTarget);
  apply(observer, r31.left);
  const selection = observer.select(r31.right.manifest), selected = observer.state();
  boundary(selected, replayTarget, 'unresolved'); assert.equal(selected.selected, null);
  same(selected.retained_intervals, [projection(r31.left, [[11, 0], [12, 0]])]);
  const prepared = observer.prepare(selection, r31.right.history);
  boundary(observer.state(), replayTarget, 'unresolved');
  observer.commit(prepared); boundary(observer.state(), replayTarget, 'observed-accepted');
});

for (const [label, change] of [
  ['missing endpoint', value => { delete value.end_block_hash; }],
  ['wrong chain', value => { value.chain_id = 1; }],
  ['wrong checkpoint', value => { value.start_block_hash = '0x' + '12'.repeat(32); }],
  ['different probe', value => { value.addresses.probe = '0x' + '12'.repeat(20); }],
  ['different registry pin', value => { value.registry_runtime_sha256 = '12'.repeat(32); }]
]) test('malformed or uncovered selection clears old ready status: ' + label, () => {
  const observer = createPaidActionObserver(replayTarget); apply(observer, r31.left);
  const changed = clone(r31.right.manifest); change(changed);
  rejects(() => observer.select(changed));
  boundary(observer.state(), replayTarget, 'unresolved'); assert.equal(observer.state().selected, null);
  same(observer.state().retained_intervals, [projection(r31.left, [[11, 0], [12, 0]])]);
});

test('unrelated checkpoint context cannot silently classify the target as absent', () => {
  const observer = createPaidActionObserver(replayTarget); apply(observer, r31.left);
  rejects(() => observer.select(r28.right.manifest));
  boundary(observer.state(), replayTarget, 'unresolved'); assert.equal(observer.state().selected, null);
});

test('late preparation success or failure cannot replace the newer selected state', () => {
  const observer = createPaidActionObserver(replayTarget);
  const oldSelection = observer.select(r31.left.manifest);
  const oldPrepared = observer.prepare(oldSelection, r31.left.history);
  const newSelection = observer.select(r31.right.manifest);
  const newPrepared = observer.prepare(newSelection, r31.right.history);
  observer.commit(newPrepared); const before = plain(observer.state());
  rejects(() => observer.commit(oldPrepared));
  rejects(() => observer.prepare(oldSelection, r31.left.history));
  rejects(() => observer.prepare(oldSelection, {}));
  same(observer.state(), before);
});

test('forged, cloned and consumed opaque tokens cannot mutate a ready observation', () => {
  const observer = createPaidActionObserver(replayTarget);
  const selected = observer.select(r31.left.manifest);
  rejects(() => observer.prepare(clone(selected), r31.left.history));
  const prepared = observer.prepare(selected, r31.left.history);
  rejects(() => observer.commit(clone(prepared)));
  observer.commit(prepared); const before = plain(observer.state());
  rejects(() => observer.commit(prepared)); rejects(() => observer.commit({}));
  rejects(() => observer.prepare(selected, r31.left.history));
  same(observer.state(), before);
});

test('invalid replacement history leaves classification unresolved and preserves retained evidence', () => {
  const observer = createPaidActionObserver(replayTarget); apply(observer, r31.left);
  const selected = observer.select(r31.right.manifest), broken = clone(r31.right.history);
  broken.blocks[12].transactions[0].receipt.logs = [];
  rejects(() => observer.prepare(selected, broken));
  boundary(observer.state(), replayTarget, 'unresolved'); assert.equal(observer.state().selected, null);
  same(observer.state().retained_intervals, [projection(r31.left, [[11, 0], [12, 0]])]);
});

test('target, selection and prepared history are detached from later input mutations', () => {
  const wanted = clone(replayTarget), observer = createPaidActionObserver(wanted);
  wanted.calldata = '0x62f509b3'; wanted.context.addresses.probe = '0x' + '22'.repeat(20);
  const manifest = clone(r31.left.manifest), history = clone(r31.left.history);
  const selection = observer.select(manifest); manifest.end_block_hash = '0x' + '22'.repeat(32);
  const prepared = observer.prepare(selection, history);
  history.blocks[11].transactions[0].receipt.logs = []; history.final.nonces[0] = '0';
  observer.commit(prepared); const state = observer.state();
  boundary(state, replayTarget, 'observed-accepted'); same(state.selected, projection(r31.left, [[11, 0], [12, 0]]));
});

test('returned state and exported evidence cannot mutate internal current authority', () => {
  const observer = createPaidActionObserver(replayTarget); apply(observer, r31.left);
  const before = plain(observer.state()), state = observer.state(), retained = observer.exportRetained();
  assert.ok(Object.isFrozen(state) && Object.isFrozen(state.selected) && Object.isFrozen(state.selected.observations));
  rejects(() => { state.selected.observations[0].outcome = 'rejected'; });
  rejects(() => { state.target.calldata = '0x62f509b3'; });
  const changed = clone(retained); changed.recovery.branches[0].history.final.nonces[0] = '0';
  same(observer.state(), before);
});

test('restart ignores fake calculated status and rebuilds the explicitly selected raw history', () => {
  const observer = createPaidActionObserver(replayTarget); apply(observer, r31.left); apply(observer, r31.right);
  const retained = clone(observer.exportRetained());
  assert.equal(retained.schema, 'caw-paid-action-observer-retained/1');
  assert.equal(Object.hasOwn(retained, 'calculated_cache'), false);
  same(Object.keys(retained).sort(), ['recovery', 'schema', 'target']);
  retained.calculated_cache = { status: 'finalized', retry_safety: 'safe-to-retry', selected: { observations: [] } };
  retained.recovery.calculated_cache = { status: 'ready', credits: ['0'], current: { result: 'invented' } };
  const restored = restartPaidActionObserver(retained, r31.right.manifest), state = restored.state();
  boundary(state, replayTarget, 'observed-accepted'); same(state.selected, projection(r31.right, [[12, 0], [13, 0]]));
  same(state.retained_intervals, [projection(r31.left, [[11, 0], [12, 0]])]);
  retained.target.calldata = '0x62f509b3'; retained.recovery.branches[1].history.final.nonces[0] = '0';
  same(restored.state(), state);
});

test('restart rejects missing selected history and corrupted raw evidence despite calculated success', () => {
  const observer = createPaidActionObserver(replayTarget); apply(observer, r31.left);
  const retained = clone(observer.exportRetained()); retained.calculated_cache = { status: 'observed-accepted' };
  rejects(() => restartPaidActionObserver(retained, r31.right.manifest));
  retained.recovery.branches[0].history.final.credits[0] = '0';
  rejects(() => restartPaidActionObserver(retained, r31.left.manifest));
});

test('matching is exact calldata observation and makes no independent signature-validity claim', () => {
  const changed = clone(replayTarget); changed.calldata = changed.calldata.slice(0, -2) + '01';
  const observer = createPaidActionObserver(changed), state = apply(observer, r31.left);
  boundary(state, changed, 'not-observed-in-covered-interval'); same(state.selected, projection(r31.left, []));
});

for (const [name, input] of [
  ['null', null], ['array', []], ['class instance', new Date()],
  ['wrong schema', { ...clone(replayTarget), schema: 'invented/1' }],
  ['wrong selector', { ...clone(replayTarget), calldata: '0x00000000' }],
  ['uppercase calldata', { ...clone(replayTarget), calldata: replayTarget.calldata.toUpperCase() }],
  ['odd hex', { ...clone(replayTarget), calldata: replayTarget.calldata + '0' }],
  ['overlong calldata', { ...clone(replayTarget), calldata: '0x62f509b3' + '00'.repeat(8189) }],
  ['extra property', { ...clone(replayTarget), current: { status: 'finalized' } }]
]) test('target plain-data boundary rejects ' + name, () => rejects(() => createPaidActionObserver(input)));

test('accessors, serialization hooks and cycles are rejected without invoking hooks', () => {
  let invoked = 0;
  const access = clone(replayTarget);
  Object.defineProperty(access, 'context', { enumerable: true, get() { invoked++; throw new Error('must not execute'); } });
  rejects(() => createPaidActionObserver(access)); assert.equal(invoked, 0);
  const hook = clone(replayTarget); hook.toJSON = () => { invoked++; return replayTarget; };
  rejects(() => createPaidActionObserver(hook)); assert.equal(invoked, 0);
  const cyclic = clone(replayTarget); cyclic.context.loop = cyclic;
  rejects(() => createPaidActionObserver(cyclic));
});

function hash(label) { return '0x' + sha(Buffer.from(label, 'utf8')); }
function quantity(n) { return '0x' + BigInt(n).toString(16); }
// Internally consistent derivative inputs, not newly executed blocks. Failed
// receipts leave the source accounting unchanged; hashes identify test branches.
function extendFailures(fixture, extra, label) {
  const history = clone(fixture.history), failed = history.blocks.at(-1).transactions[0];
  assert.equal(failed.receipt.status, '0x0'); assert.equal(failed.receipt.logs.length, 0);
  for (let i = 0; i < extra; i++) {
    const parent = history.blocks.at(-1).header, block = clone(history.blocks.at(-1));
    const height = BigInt(parent.number) + 1n, timestamp = BigInt(parent.timestamp) + 1n;
    block.header.hash = hash(label + '/block/' + i); block.header.parentHash = parent.hash;
    block.header.number = quantity(height); block.header.timestamp = quantity(timestamp);
    const receipt = block.transactions[0].receipt;
    receipt.blockHash = block.header.hash; receipt.blockNumber = block.header.number;
    receipt.transactionHash = hash(label + '/tx/' + i); receipt.transactionIndex = '0x0';
    if (Object.hasOwn(receipt, 'blockTimestamp')) receipt.blockTimestamp = typeof receipt.blockTimestamp === 'number' ? Number(timestamp) : quantity(timestamp);
    block.header.transactions = [receipt.transactionHash];
    history.blocks.push(block);
  }
  history.end_block = clone(history.blocks.at(-1).header);
  const manifest = { ...clone(fixture.manifest), end_block_hash: history.end_block.hash };
  same(reconstruct(history, manifest), reconstruct(fixture.history, fixture.manifest));
  return { history, manifest };
}

test('total retained observation bound allows 256 then rejects the 257th without losing evidence', () => {
  const left = extendFailures(r31.left, 126, 'observer-limit-left');
  const right = extendFailures(r31.right, 126, 'observer-limit-right');
  const observer = createPaidActionObserver(replayTarget);
  assert.equal(apply(observer, left).selected.observations.length, 128);
  const atLimit = apply(observer, right);
  assert.equal(atLimit.selected.observations.length, 128);
  assert.equal(atLimit.retained_intervals[0].observations.length, 128);
  // Re-adopting the same interval must not charge its observations twice.
  same(apply(observer, right).selected, atLimit.selected);
  const onlyAccepted = { history: clone(r31.left.history), manifest: clone(r31.left.manifest) };
  onlyAccepted.history.blocks.pop(); onlyAccepted.history.end_block = clone(onlyAccepted.history.blocks.at(-1).header);
  onlyAccepted.manifest.end_block_hash = onlyAccepted.history.end_block.hash;
  reconstruct(onlyAccepted.history, onlyAccepted.manifest);
  const selection = observer.select(onlyAccepted.manifest);
  rejects(() => observer.prepare(selection, onlyAccepted.history));
  const state = observer.state(); boundary(state, replayTarget, 'unresolved');
  assert.equal(state.selected, null);
  assert.equal(state.retained_intervals.reduce((sum, interval) => sum + interval.observations.length, 0), 256);
});

test('pending preparation bound preserves valid tokens when a fifth candidate is refused', () => {
  const observer = createPaidActionObserver(replayTarget), selection = observer.select(r31.left.manifest);
  const pending = Array.from({ length: 4 }, () => observer.prepare(selection, r31.left.history));
  rejects(() => observer.prepare(selection, r31.left.history));
  observer.commit(pending[0]); boundary(observer.state(), replayTarget, 'observed-accepted');
  for (const stale of pending.slice(1)) rejects(() => observer.commit(stale));
});

// Optional header metadata is retained as supplied by the unchanged reader.
// These deliberately enlarged derivative inputs test storage admission only;
// their header roots and withdrawals are not authenticated Ethereum evidence.
function extendMetadata(fixture, label) {
  const history = clone(fixture.history);
  for (let index = 0; index < 150; index++) {
    const parent = history.blocks.at(-1).header, header = clone(parent);
    header.hash = hash(label + '/block/' + index); header.parentHash = parent.hash;
    header.number = quantity(BigInt(parent.number) + 1n);
    header.timestamp = quantity(BigInt(parent.timestamp) + 1n);
    header.gasUsed = '0x0'; header.transactions = [];
    header.withdrawals = Array.from({ length: 40 }, (_, entry) => ({
      index: quantity(index * 40 + entry), validatorIndex: quantity(entry),
      address: replayTarget.context.addresses.probe, amount: '0x0'
    }));
    history.blocks.push({ header, transactions: [] });
  }
  history.end_block = clone(history.blocks.at(-1).header);
  const manifest = { ...clone(fixture.manifest), end_block_hash: history.end_block.hash };
  same(reconstruct(history, manifest), reconstruct(fixture.history, fixture.manifest));
  return { history, manifest };
}
function countValues(value) {
  return 1 + (value !== null && typeof value === 'object'
    ? Object.values(value).reduce((sum, item) => sum + countValues(item), 0) : 0);
}
test('aggregate retention rejects an export that would exceed restart nodes and preserves a valid round trip', () => {
  const a = extendMetadata(r31.left, 'observer-metadata-a');
  const b = extendMetadata(r31.left, 'observer-metadata-b');
  const c = extendMetadata(r31.left, 'observer-metadata-c');
  const observer = createPaidActionObserver(replayTarget);
  apply(observer, a); apply(observer, b);
  const retained = observer.exportRetained(), before = plain(retained);
  assert.ok(countValues(retained) < 100000);
  const tooLarge = clone(retained);
  tooLarge.recovery.branches.push(c);
  assert.ok(countValues(tooLarge) > 100000);
  assert.ok(Buffer.byteLength(JSON.stringify(tooLarge)) < 8 * 1024 * 1024);
  const selection = observer.select(c.manifest);
  assert.throws(() => observer.prepare(selection, c.history), error => error.code === 'PAID_OBSERVER_LIMIT');
  boundary(observer.state(), replayTarget, 'unresolved');
  same(observer.exportRetained(), before);
  const restored = restartPaidActionObserver(observer.exportRetained(), b.manifest);
  boundary(restored.state(), replayTarget, 'observed-accepted');
  same(restored.state().selected, projection(b, [[11, 0], [12, 0]]));
  same(restored.exportRetained(), before);
});
