import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual as equal } from 'node:util';
import { reconstruct } from '../reference/paid-action-reader.mjs';
import { createPaidReorgReader, restartPaidReorgReader, mergePaidHistoryRanges } from '../reference/paid-reorg-reader.mjs';

// Retained synthetic data only. No node, transport, runner, Python process or
// modified historical reader is imported. The caller explicitly chooses R;
// equal heights do not choose a canonical branch or prove public finality.
const json = name => JSON.parse(readFileSync(new URL('../experiments/paid-reorg/' + name + '.json', import.meta.url), 'utf8'));
const histories = Object.fromEntries(['left', 'right'].map(branch => [branch,
  Object.fromEntries(['number', 'hash'].map(strategy => [strategy, json('history-' + branch + '-' + strategy)]))]));
const manifests = Object.fromEntries(['left', 'right'].map(branch => [branch, json('manifest-' + branch)]));
const python = Object.fromEntries(['left', 'right'].map(branch => [branch,
  Object.fromEntries(['number', 'hash'].map(strategy => [strategy, json('reconstruction-python-' + branch + '-' + strategy)]))]));
const clone = value => structuredClone(value);
const plain = value => JSON.parse(JSON.stringify(value));
const same = (actual, expected, label) => assert.ok(equal(plain(actual), plain(expected)), label);
const rejected = (fn, code) => assert.throws(fn, error => code ? error.code === code : /^PAID_(REORG|HISTORY)_/.test(error.code ?? ''));
const bytes = text => '0x' + Buffer.from(text, 'utf8').toString('hex');
const F = 5000000000000000000000n, q1 = F / 3n, q2 = 2n * F / 3n;
const A = '0x765d03fe39e2a0a48ac162a15b541c3cd1d63e76', B = '0x47ecac8221f18970c48cf48aaa3cbe8167bbbe73';
const POST = '0x62f509b3';
const expected = {
  left: { owners: [B, A, B], epochs: ['1', '0', '0'], nonces: ['3', '0', '0'], stakes: ['0', '1', '3'],
    credits: [17n * F - 7n, 10n + 2n * q1 + F / 4n, 10n + 2n * q2 + 3n * F / 4n].map(String),
    totalCredits: String(20n * F + 11n), poolDust: '2', tokenBalance: String(20n * F + 13n), messageCount: '3',
    text: ['common-prefix', 'discarded-first', 'discarded-second'] },
  right: { owners: [A, A, B], epochs: ['1', '0', '0'], nonces: ['2', '0', '0'], stakes: ['0', '3', '2'],
    credits: [18n * F - 9n, 10n + q1 + 3n * F / 5n, 10n + q2 + 2n * F / 5n].map(String),
    totalCredits: String(20n * F + 10n), poolDust: '1', tokenBalance: String(20n * F + 11n), messageCount: '2',
    text: ['common-prefix', 'selected-first'] }
};
const cleanCache = new Map();
function clean(branch, strategy = 'number') {
  const key = branch + ':' + strategy;
  if (!cleanCache.has(key)) cleanCache.set(key, reconstruct(histories[branch][strategy], manifests[branch]));
  return cleanCache.get(key);
}
function adopt(reader, branch, strategy = 'number') {
  const selected = reader.select(manifests[branch]);
  return reader.commit(reader.prepare(selected, histories[branch][strategy]));
}
function firstPost(h) { return h.blocks.flatMap(block => block.transactions).find(tx => tx.receipt.status === '0x1' && tx.transaction.data.startsWith(POST)); }
function envelope(h) { const copy = clone(h); delete copy.blocks; return copy; }
function ancestorIndex() {
  const l = histories.left.number.blocks, r = histories.right.number.blocks;
  let n = 0; while (n < l.length && n < r.length && equal(l[n], r[n])) n++;
  return n;
}
function assertUnresolved(reader) { assert.equal(reader.state().status, 'unresolved'); assert.equal(reader.state().current, null); }
function freezeTree(value) {
  if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value), 'deep immutable publication'); Object.values(value).forEach(freezeTree); }
}

test('retained collectors agree on a common prefix and two five-block suffixes at the same height', () => {
  for (const branch of ['left', 'right']) same(histories[branch].number, histories[branch].hash, branch + ' complete acquired history');
  const l = histories.left.number, r = histories.right.number, shared = ancestorIndex();
  assert.ok(shared > 0, 'a shared acquired prefix exists');
  assert.equal(l.blocks.length - shared, 5); assert.equal(r.blocks.length - shared, 5);
  assert.equal(l.end_block.number, r.end_block.number); assert.notEqual(l.end_block.hash, r.end_block.hash);
  same(l.start_block, r.start_block, 'same exclusive checkpoint');
  for (const h of [l, r]) {
    for (const block of h.blocks.slice(shared)) assert.equal(block.transactions.length, 1);
  }
  assert.equal(l.blocks.slice(shared).flatMap(block => block.transactions).filter(tx => tx.receipt.status === '0x0').length, 0);
  const refused = r.blocks.slice(shared).flatMap(block => block.transactions).filter(tx => tx.receipt.status === '0x0');
  assert.equal(refused.length, 1); assert.equal(refused[0].receipt.logs.length, 0);
});

for (const branch of ['left', 'right']) for (const strategy of ['number', 'hash']) {
  test(branch + '/' + strategy + ' matches independent arithmetic, exact message bytes and the separate Python rebuild', () => {
    const result = clean(branch, strategy), oracle = expected[branch];
    for (const key of ['owners', 'epochs', 'nonces', 'stakes', 'credits', 'totalCredits', 'poolDust', 'tokenBalance', 'messageCount']) same(result[key], oracle[key], key);
    same(result.messages.map(message => message.text_hex), oracle.text.map(bytes), 'exact UTF-8 messages');
    same(result, python[branch][strategy], 'complete separately executed Python result');
    same(result, clean(branch, strategy === 'number' ? 'hash' : 'number'), 'both unchanged-reader acquisitions');
    const reader = createPaidReorgReader();
    same(adopt(reader, branch, strategy).result, result, 'adapter equals clean reconstruction');
  });
}

test('selection is unresolved until preparation and atomic commit finish', () => {
  const reader = createPaidReorgReader(); assertUnresolved(reader);
  const selection = reader.select(manifests.left); assertUnresolved(reader);
  const pending = reader.prepare(selection, histories.left.number); assertUnresolved(reader);
  assert.equal(reader.exportRetained().branches.length, 0, 'uncommitted data are not retained as valid branches');
  const current = reader.commit(pending);
  assert.equal(reader.state().status, 'ready'); assert.equal(reader.state().current, current);
  same(current.result, clean('left'), 'complete L state');
});

test('R immediately invalidates L authority and replaces every state field while preserving L historically', () => {
  const reader = createPaidReorgReader(), old = adopt(reader, 'left'), shared = ancestorIndex();
  const selection = reader.select(manifests.right); assertUnresolved(reader);
  assert.equal(reader.state().historical.length, 1); assert.equal(reader.state().historical[0].branch_key, old.branch_key);
  const pending = reader.prepare(selection, histories.right.hash); assertUnresolved(reader);
  const next = reader.commit(pending); same(next.result, clean('right', 'hash'), 'complete selected state');
  same(next.transition.common_ancestor, { hash: histories.right.hash.blocks[shared - 1].header.hash,
    number: histories.right.hash.blocks[shared - 1].header.number }, 'actual common ancestor');
  same(next.transition.discarded_blocks, histories.left.number.blocks.slice(shared).map(block => block.header.hash), 'all discarded descendants');
  same(next.transition.adopted_blocks, histories.right.number.blocks.slice(shared).map(block => block.header.hash), 'all replacement descendants');
  assert.equal(next.transition.from_tip, manifests.left.end_block_hash); assert.equal(next.transition.to_tip, manifests.right.end_block_hash);
  const oldText = clean('left').messages.slice(1).map(message => message.text_hex);
  assert.ok(next.result.messages.every(message => !oldText.includes(message.text_hex)), 'no discarded message survives');
  assert.equal(next.result.messages[1].id, old.result.messages[1].id, 'branch-local message ID is reused');
  assert.notEqual(next.result.messages[1].text_hex, old.result.messages[1].text_hex);
  const retained = reader.exportRetained(); assert.equal(retained.branches.length, 2);
  const l = retained.branches.find(entry => entry.manifest.end_block_hash === manifests.left.end_block_hash);
  same(reconstruct(l.history, l.manifest), clean('left'), 'retained L remains a valid historical observation');
  assert.equal(reader.state().historical[0].branch_key, old.branch_key);
});

test('failed replacement leaves authority unresolved rather than silently retaining L', () => {
  const reader = createPaidReorgReader(); adopt(reader, 'left');
  const selection = reader.select(manifests.right), bad = clone(histories.right.number); bad.blocks.splice(2, 1);
  rejected(() => reader.prepare(selection, bad)); assertUnresolved(reader);
  assert.equal(reader.exportRetained().branches.length, 1);
  same(reader.exportRetained().branches[0].manifest, manifests.left, 'historical L kept');
});

test('a delayed L commit and stale prepare cannot overwrite or clear an already adopted R', () => {
  const reader = createPaidReorgReader(), l = reader.select(manifests.left);
  const delayed = reader.prepare(l, histories.left.number); const r = adopt(reader, 'right');
  rejected(() => reader.commit(delayed), 'PAID_REORG_STALE_PREPARED');
  let invoked = 0; const hostile = {};
  Object.defineProperty(hostile, 'schema', { enumerable: true, get() { invoked++; throw new Error('must not execute'); } });
  rejected(() => reader.prepare(l, hostile), 'PAID_REORG_STALE_SELECTION');
  assert.equal(invoked, 0); assert.equal(reader.state().status, 'ready'); assert.equal(reader.state().current, r);
});

test('selection and prepared tokens cannot be forged or committed twice', () => {
  const reader = createPaidReorgReader(), selected = reader.select(manifests.right);
  rejected(() => reader.prepare(clone(selected), histories.right.number), 'PAID_REORG_STALE_SELECTION');
  const prepared = reader.prepare(selected, histories.right.number);
  rejected(() => reader.commit(clone(prepared)), 'PAID_REORG_STALE_PREPARED');
  const current = reader.commit(prepared);
  rejected(() => reader.commit(prepared), 'PAID_REORG_STALE_PREPARED');
  assert.equal(reader.state().current, current);
});

test('mutating caller inputs after selection/preparation cannot change the committed snapshot', () => {
  const reader = createPaidReorgReader(), pin = clone(manifests.right), candidate = clone(histories.right.number);
  const selection = reader.select(pin); pin.end_block_hash = manifests.left.end_block_hash;
  const prepared = reader.prepare(selection, candidate);
  candidate.final.owners[0] = B; candidate.blocks.length = 0; candidate.end_block.hash = manifests.left.end_block_hash;
  const result = reader.commit(prepared);
  same(result.result, clean('right'), 'captured immutable R result'); same(result.manifest, manifests.right, 'captured external selection');
  assert.equal(reader.exportRetained().branches[0].history.blocks.length, histories.right.number.blocks.length);
});

test('state, results, index and retained branch publications are recursively immutable', () => {
  const reader = createPaidReorgReader(); adopt(reader, 'left'); adopt(reader, 'right');
  const state = reader.state(), retained = reader.exportRetained(); freezeTree(state); freezeTree(retained);
  assert.throws(() => { state.current.result.credits[0] = '0'; }, TypeError);
  assert.throws(() => { retained.branches[0].history.blocks[0].header.hash = manifests.right.end_block_hash; }, TypeError);
  assert.throws(() => { state.historical[0].manifest.end_block_hash = manifests.right.end_block_hash; }, TypeError);
});

test('cache positions bind deployment, block hash, transaction hash and log index rather than height or message ID', () => {
  const reader = createPaidReorgReader(), l = adopt(reader, 'left'), r = adopt(reader, 'right');
  for (const [branch, published] of [['left', l], ['right', r]]) {
    const h = histories[branch].number, m = manifests[branch], index = published.index;
    for (const part of [String(m.chain_id), m.addresses.registry, m.addresses.probe, m.addresses.token,
      m.registry_runtime_sha256, m.probe_runtime_sha256, m.start_block_hash]) assert.ok(index.identity.includes(part), 'deployment identity');
    assert.equal(index.blocks.length, h.blocks.length);
    for (const item of index.blocks) assert.ok(item.key.includes(h.blocks[item.block_index].header.hash), 'block hash key');
    for (const item of index.transactions) {
      const block = h.blocks[item.block_index], tx = block.transactions[item.transaction_index];
      assert.ok(item.key.startsWith(index.identity) && item.key.includes(block.header.hash) && item.key.includes(tx.receipt.transactionHash), 'transaction branch identity');
    }
    for (const item of index.logs) {
      const block = h.blocks[item.block_index], tx = block.transactions[item.transaction_index], log = tx.receipt.logs[item.event_index];
      assert.ok(item.key.startsWith(index.identity) && item.key.includes(block.header.hash)
        && item.key.includes(log.transactionHash) && item.key.endsWith('/log/' + log.logIndex), 'event branch identity');
    }
    assert.equal(new Set(index.logs.map(item => item.key)).size, index.logs.length);
  }
  const discarded = new Set(l.index.blocks.slice(ancestorIndex()).map(item => item.key));
  assert.ok(r.index.blocks.every(item => !discarded.has(item.key)), 'same-height R blocks never reuse L cache identity');
});

test('restart rebuilds selected R from retained intervals, ignoring corrupt or absent calculated cache', () => {
  const reader = createPaidReorgReader(); adopt(reader, 'left'); const current = adopt(reader, 'right');
  for (const includeCache of [false, true]) {
    const retained = plain(reader.exportRetained());
    if (includeCache) retained.calculated_cache = { status: 'ready', owner: B, credits: ['999999999999'], messageCount: '999', branch: 'left' };
    const fresh = restartPaidReorgReader(retained, manifests.right);
    assert.equal(fresh.state().status, 'ready');
    same(fresh.state().current.result, current.result, 'fresh full R rebuild');
    same(fresh.state().current.index, current.index, 'fresh cache positions');
    assert.equal(fresh.state().historical.length, 1);
  }
});

test('restart requires independently supplied selection and cannot promote a fabricated calculated cache', () => {
  const reader = createPaidReorgReader(); adopt(reader, 'left'); const retained = plain(reader.exportRetained());
  retained.calculated_cache = { selected: manifests.right, result: plain(clean('right')) };
  rejected(() => restartPaidReorgReader(retained), 'PAID_REORG_SCHEMA');
  rejected(() => restartPaidReorgReader(retained, manifests.right), 'PAID_REORG_SELECTED_HISTORY_MISSING');
  const fresh = restartPaidReorgReader(retained, manifests.left); same(fresh.state().current.result, clean('left'), 'explicit L can be selected historically');
});

test('restart revalidates the historical branch too, rejecting corruption before publishing any state', () => {
  const reader = createPaidReorgReader(); adopt(reader, 'left'); adopt(reader, 'right');
  const retained = plain(reader.exportRetained()); retained.branches[0].history.blocks.splice(1, 1);
  rejected(() => restartPaidReorgReader(retained, manifests.right));
});

test('overlapping acquired ranges merge identical complete blocks once and rebuild all of R', () => {
  const h = histories.right.number, split = ancestorIndex();
  const ranges = [clone(h.blocks.slice(split - 2)), clone(histories.right.hash.blocks.slice(0, split + 2))];
  const merged = mergePaidHistoryRanges(envelope(h), ranges, manifests.right);
  same(merged, h, 'complete ordered interval after overlap merge'); freezeTree(merged);
  const reader = createPaidReorgReader(), selected = reader.select(manifests.right);
  same(reader.commit(reader.prepare(selected, merged)).result, clean('right'), 'merged history clean rebuild');
});

test('same-height blocks from opposite suffixes are a conflict, not a duplicate to discard', () => {
  const h = histories.right.number, l = histories.left.number, split = ancestorIndex();
  rejected(() => mergePaidHistoryRanges(envelope(h), [h.blocks, [l.blocks[split]]], manifests.right), 'PAID_REORG_HEIGHT_CONFLICT');
});

test('a repeated block hash with contradictory retained content is rejected during overlap merging', () => {
  const h = histories.right.number, altered = clone(h.blocks[1]); altered.header.stateRoot = '0x' + '11'.repeat(32);
  assert.notEqual(altered.header.stateRoot, h.blocks[1].header.stateRoot);
  rejected(() => mergePaidHistoryRanges(envelope(h), [h.blocks, [altered]], manifests.right), 'PAID_REORG_HASH_CONFLICT');
});

test('an incomplete merged interval is not repaired using an old calculated cache or a hidden prefix', () => {
  const h = histories.right.number, blocks = clone(h.blocks); blocks.splice(ancestorIndex() - 1, 1);
  rejected(() => mergePaidHistoryRanges(envelope(h), [blocks], manifests.right));
});

for (const [name, mutate] of [
  ['mixed L/R suffix', h => { h.blocks[ancestorIndex()] = clone(histories.left.number.blocks[ancestorIndex()]); }],
  ['missing ancestor', h => { h.blocks.splice(ancestorIndex() - 1, 1); }],
  ['missing post log', h => { firstPost(h).receipt.logs.pop(); }],
  ['duplicate transaction', h => { h.blocks[0].transactions.push(clone(h.blocks[0].transactions[0])); }],
  ['duplicate event', h => { const tx = firstPost(h); tx.receipt.logs.push(clone(tx.receipt.logs.at(-1))); }]
]) {
  test(name + ' rejects replacement and leaves no authoritative partial state', () => {
    const reader = createPaidReorgReader(); adopt(reader, 'left');
    const selection = reader.select(manifests.right), bad = clone(histories.right.number); mutate(bad);
    rejected(() => reader.prepare(selection, bad)); assertUnresolved(reader); assert.equal(reader.exportRetained().branches.length, 1);
  });
}

test('an L history under the independently selected R endpoint is rejected', () => {
  const reader = createPaidReorgReader(), selection = reader.select(manifests.right);
  rejected(() => reader.prepare(selection, histories.left.number)); assertUnresolved(reader);
});

test('full duplicate endpoint equality closes optional-header discrepancies in the unchanged reader', () => {
  for (const field of ['stateRoot', 'receiptsRoot']) {
    const bad = clone(histories.right.number); bad.end_block[field] = '0x' + '11'.repeat(32);
    assert.notEqual(bad.end_block[field], bad.blocks.at(-1).header[field]);
    // The retained reader checks only part of the duplicated endpoint header.
    // Its accounting still reconstructs; the new adapter must reject the conflict.
    same(reconstruct(bad, manifests.right), clean('right'), 'historical reader limitation isolated');
    const reader = createPaidReorgReader(), selection = reader.select(manifests.right);
    rejected(() => reader.prepare(selection, bad), 'PAID_REORG_ENDPOINT_FIELDS'); assertUnresolved(reader);
  }
});

test('historical same-hash and checkpoint content cannot silently change between branches', () => {
  for (const target of ['block', 'anchor']) {
    const reader = createPaidReorgReader(); adopt(reader, 'left');
    const selection = reader.select(manifests.right), bad = clone(histories.right.number);
    const header = target === 'block' ? bad.blocks[1].header : bad.start_block;
    header.stateRoot = '0x' + '11'.repeat(32);
    rejected(() => reader.prepare(selection, bad), target === 'block' ? 'PAID_REORG_HASH_CONFLICT' : 'PAID_REORG_ANCHOR_CONFLICT');
    assertUnresolved(reader);
  }
});

test('malformed selection fails closed and getters are rejected without being invoked', () => {
  const reader = createPaidReorgReader(); adopt(reader, 'left');
  const bad = clone(manifests.right); let calls = 0;
  Object.defineProperty(bad, 'end_block_hash', { enumerable: true, get() { calls++; return manifests.right.end_block_hash; } });
  rejected(() => reader.select(bad), 'PAID_REORG_DESCRIPTOR'); assert.equal(calls, 0); assertUnresolved(reader);
  const valid = reader.select(manifests.right), history = clone(histories.right.number);
  Object.defineProperty(history.blocks[0], 'transactions', { enumerable: true, get() { calls++; return []; } });
  rejected(() => reader.prepare(valid, history), 'PAID_REORG_DESCRIPTOR'); assert.equal(calls, 0);
});

for (const [name, mutate] of [
  ['exotic prototype', h => Object.setPrototypeOf(h, { unexpected: true })],
  ['sparse interval', h => { delete h.blocks[1]; }],
  ['symbol member', h => { h[Symbol('unexpected')] = true; }],
  ['non-enumerable member', h => Object.defineProperty(h, 'extra', { value: 1 })],
  ['toJSON function', h => { h.toJSON = () => histories.right.number; }],
  ['cyclic input', h => { h.loop = h; }],
  ['oversized string', h => { h.registry_runtime = 'a'.repeat(262145); }],
  ['oversized array', h => { h.blocks = new Array(2049).fill(null); }]
]) {
  test(name + ' is rejected at the bounded plain-data boundary', () => {
    const reader = createPaidReorgReader(), selection = reader.select(manifests.right), bad = clone(histories.right.number); mutate(bad);
    rejected(() => reader.prepare(selection, bad)); assertUnresolved(reader);
  });
}

test('bounded pending work does not publish intermediate results or block a valid prepared commit', () => {
  const reader = createPaidReorgReader(), selection = reader.select(manifests.right);
  const pending = Array.from({ length: 4 }, () => reader.prepare(selection, histories.right.number));
  rejected(() => reader.prepare(selection, histories.right.number), 'PAID_REORG_PENDING_LIMIT'); assertUnresolved(reader);
  const current = reader.commit(pending[0]); same(current.result, clean('right'), 'valid pending result still commits');
  rejected(() => reader.commit(pending[1]), 'PAID_REORG_STALE_PREPARED'); assert.equal(reader.state().current, current);
});

test('retained branch count and overlap range count are bounded before use', () => {
  const branch = { manifest: manifests.right, history: histories.right.number };
  rejected(() => restartPaidReorgReader({ schema: 'caw-paid-reorg-retained/1', branches: Array(9).fill(branch) }, manifests.right));
  rejected(() => mergePaidHistoryRanges(envelope(histories.right.number), Array(9).fill([histories.right.number.blocks[0]]), manifests.right), 'PAID_REORG_RANGE');
});

