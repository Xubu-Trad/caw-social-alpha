import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createPaidProviderComparison } from '../reference/paid-provider-comparison.mjs';
import { reconstruct } from '../reference/paid-action-reader.mjs';

// The simulation aliases below reuse alpha.28 captures from one controlled node.
// They do not represent independently operated providers or new EVM executions.
const root = new URL('../experiments/paid-reorg/', import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const plain = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => assert.deepEqual(plain(a), plain(b));
function read(name, expected) {
  const bytes = readFileSync(new URL(name, root));
  assert.ok(bytes.length < 1024 * 1024); assert.equal(sha(bytes), expected);
  return JSON.parse(bytes.toString('utf8'));
}
const manifests = {
  left: read('manifest-left.json', 'b36b6209074c1b2d434403ef3839a6ee2441dd00d8b1c4098d947ed4185ac59c'),
  right: read('manifest-right.json', '39efad86b7ea938fdb5304b28053ec7ac097e5ea716e5a8815a72e7532232fbc')
};
const fixture = {
  leftNumber: { manifest: manifests.left, history: read('history-left-number.json', '9c1a69329dab7a232ffde072d658a02f99497348ec640f3419b1cd6a10ac88e4') },
  leftHash: { manifest: manifests.left, history: read('history-left-hash.json', 'e63c9f608d5c3b81f90e052c2e3defc6f635684fa0bf62cba89025dab8f970d4') },
  rightNumber: { manifest: manifests.right, history: read('history-right-number.json', 'bb1571c806a80d4866eeb54f61c1269831acca70f4a4efcb1d3ccc7471834cb2') },
  rightHash: { manifest: manifests.right, history: read('history-right-hash.json', 'd8aa7517ebeb7356bd176e47bb9442fc9e30afd3ab56cf61d470f5429c18da23') }
};
const context = clone(manifests.left); delete context.end_block_hash;
const watched = { schema: 'caw-paid-action-target/1', context,
  calldata: fixture.leftNumber.history.blocks[11].transactions[0].transaction.data };
const aliases = ['simulation-number', 'simulation-hash'];
const make = (ids = aliases) => createPaidProviderComparison(watched, ids);
function rejected(fn, code) {
  assert.throws(fn, error => error instanceof Error && (code === undefined || error.code === code));
}
function boundary(state, status) {
  assert.equal(state.schema, 'caw-paid-provider-comparison/1'); assert.equal(state.status, status);
  assert.equal(state.finality, 'not-established'); assert.equal(state.retry_safety, 'not-assessed');
  assert.equal(state.provider_independence, 'not-established');
  if (status !== 'matching-supplied-histories') assert.equal(state.shared_observation, null);
  for (const unsupported of ['finalized', 'canonical', 'safe_to_retry', 'majority_winner']) {
    assert.equal(Object.hasOwn(state, unsupported), false);
  }
}
function complete(comparison, selected = manifests.left, reports = [fixture.leftNumber, fixture.leftHash], ids = aliases) {
  const token = comparison.select(selected);
  ids.forEach((id, index) => comparison.submit(token, id, reports[index]));
  return comparison.state();
}
function pending(state, ids = aliases) {
  same(state.providers, ids.map(id => ({ id, status: 'pending', manifest: null, observation: null })));
}

test('initial comparison has no selected history, agreement or provider-independence claim', () => {
  const state = make().state(); boundary(state, 'unresolved');
  assert.equal(state.generation, 0); assert.equal(state.selected, null); pending(state);
});

test('matching complete number/hash envelopes publish the watched acceptance only after both reports', () => {
  same(fixture.leftNumber, fixture.leftHash);
  const comparison = make(), token = comparison.select(manifests.left);
  boundary(comparison.state(), 'incomplete'); pending(comparison.state());
  const first = comparison.submit(token, aliases[1], fixture.leftHash);
  boundary(first, 'incomplete'); same(first.providers.map(p => p.id), aliases);
  assert.equal(first.providers[0].status, 'pending'); assert.equal(first.providers[1].status, 'valid');
  const state = comparison.submit(token, aliases[0], fixture.leftNumber);
  boundary(state, 'matching-supplied-histories'); same(state.selected, manifests.left);
  assert.equal(state.shared_observation.status, 'observed-accepted');
  same(state.shared_observation, state.providers[0].observation);
  same(state.providers[0].observation, state.providers[1].observation);
  const observed = state.shared_observation.selected.observations;
  assert.equal(observed.length, 1);
  assert.equal(observed[0].block_hash, fixture.leftNumber.history.blocks[11].header.hash);
  assert.equal(observed[0].transaction_hash, fixture.leftNumber.history.blocks[11].transactions[0].receipt.transactionHash);
  assert.equal(observed[0].outcome, 'accepted');
});

test('matching right histories describe selected rejection without asserting invalid signature or retry safety', () => {
  const state = complete(make(), manifests.right, [fixture.rightNumber, fixture.rightHash]);
  boundary(state, 'matching-supplied-histories');
  assert.equal(state.shared_observation.status, 'rejected-only-in-selected-interval');
  assert.equal(state.shared_observation.finality, 'not-established');
  assert.equal(state.shared_observation.retry_safety, 'not-assessed');
  assert.equal(Object.hasOwn(state.shared_observation.selected.observations[0], 'revert_reason'), false);
});

test('JSON property ordering cannot create a false history conflict', () => {
  function reordered(value) {
    if (Array.isArray(value)) return value.map(reordered);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reordered(item)]));
    }
    return value;
  }
  const report = reordered(fixture.leftNumber);
  assert.notEqual(JSON.stringify(report), JSON.stringify(fixture.leftNumber));
  same(report, fixture.leftNumber);
  boundary(complete(make(), reordered(manifests.left), [fixture.leftNumber, report]), 'matching-supplied-histories');
});

test('different complete endpoints remain disagreement and preserve both provider observations', () => {
  const state = complete(make(), manifests.left, [fixture.leftNumber, fixture.rightHash]);
  boundary(state, 'endpoint-disagreement'); same(state.selected, manifests.left);
  same(state.providers.map(p => p.status), ['valid', 'valid']);
  same(state.providers.map(p => p.observation.status), ['observed-accepted', 'rejected-only-in-selected-interval']);
});

test('three reports cannot outvote the fourth endpoint', () => {
  const ids = ['simulation-a', 'simulation-b', 'simulation-c', 'simulation-d'];
  const state = complete(make(ids), manifests.left,
    [fixture.leftNumber, fixture.leftHash, fixture.leftNumber, fixture.rightNumber], ids);
  boundary(state, 'endpoint-disagreement'); same(state.selected, manifests.left);
  assert.equal(state.providers.length, 4); assert.ok(state.providers.every(p => p.status === 'valid'));
});

test('unanimous reports do not replace the separately selected endpoint', () => {
  const state = complete(make(), manifests.left, [fixture.rightNumber, fixture.rightHash]);
  boundary(state, 'selected-endpoint-mismatch'); same(state.selected, manifests.left);
  assert.ok(state.providers.every(p => p.manifest.end_block_hash === manifests.right.end_block_hash));
});

test('same manifest and accounting with conflicting optional header metadata is a full-history conflict', () => {
  // This edited metadata is an unauthenticated test input, not a new capture.
  const derivative = clone(fixture.leftHash);
  derivative.history.blocks[5].header.extraData = '0x1234';
  same(reconstruct(derivative.history, derivative.manifest), reconstruct(fixture.leftNumber.history, manifests.left));
  // History conflict precedes disagreement with the separately selected tip.
  const state = complete(make(), manifests.right, [fixture.leftNumber, derivative]);
  boundary(state, 'history-conflict'); assert.ok(state.providers.every(p => p.status === 'valid'));
  same(state.providers[0].observation, state.providers[1].observation);
});

test('a pending provider prevents an early conclusion from two disagreeing reports', () => {
  const ids = ['simulation-a', 'simulation-b', 'simulation-c'];
  const comparison = make(ids), token = comparison.select(manifests.left);
  comparison.submit(token, ids[0], fixture.leftNumber); comparison.submit(token, ids[1], fixture.rightNumber);
  boundary(comparison.state(), 'incomplete'); assert.equal(comparison.state().providers[2].status, 'pending');
  comparison.submit(token, ids[2], fixture.leftHash); boundary(comparison.state(), 'endpoint-disagreement');
});

test('an unavailable slot takes priority over incomplete or disagreeing remaining slots', () => {
  const ids = ['simulation-a', 'simulation-b', 'simulation-c', 'simulation-d'];
  const comparison = make(ids), token = comparison.select(manifests.left);
  boundary(comparison.unavailable(token, ids[0]), 'provider-failed');
  comparison.submit(token, ids[1], fixture.leftNumber);
  comparison.submit(token, ids[2], fixture.rightNumber);
  boundary(comparison.state(), 'provider-failed'); assert.equal(comparison.state().providers[3].status, 'pending');
  comparison.submit(token, ids[3], fixture.leftHash);
  const state = comparison.state(); boundary(state, 'provider-failed');
  same(state.providers[0], { id: ids[0], status: 'unavailable', manifest: null, observation: null });
});

test('invalid reconstruction consumes one slot while other valid evidence remains visible', () => {
  const comparison = make(), token = comparison.select(manifests.left);
  const broken = clone(fixture.leftNumber); broken.history.blocks[11].transactions[0].receipt.logs = [];
  rejected(() => comparison.submit(token, aliases[0], broken), 'PAID_PROVIDERS_REPORT');
  boundary(comparison.state(), 'provider-failed');
  same(comparison.state().providers[0], { id: aliases[0], status: 'invalid', manifest: null, observation: null });
  rejected(() => comparison.submit(token, aliases[0], fixture.leftNumber));
  rejected(() => comparison.unavailable(token, aliases[0]));
  comparison.submit(token, aliases[1], fixture.leftHash);
  boundary(comparison.state(), 'provider-failed'); assert.equal(comparison.state().providers[1].status, 'valid');
});

test('foreign target context is invalid evidence, not endpoint disagreement', () => {
  const comparison = make(), token = comparison.select(manifests.left);
  const foreign = clone(fixture.leftNumber); foreign.manifest.chain_id = 1;
  rejected(() => comparison.submit(token, aliases[0], foreign), 'PAID_PROVIDERS_REPORT');
  boundary(comparison.state(), 'provider-failed'); assert.equal(comparison.state().providers[0].status, 'invalid');
});

test('valid and unavailable replies consume slots and duplicate replies cannot change agreement', () => {
  const comparison = make(), token = comparison.select(manifests.left);
  comparison.submit(token, aliases[0], fixture.leftNumber);
  const before = plain(comparison.state());
  rejected(() => comparison.submit(token, aliases[0], fixture.rightNumber));
  rejected(() => comparison.unavailable(token, aliases[0])); same(comparison.state(), before);
  comparison.unavailable(token, aliases[1]); const failed = plain(comparison.state());
  rejected(() => comparison.submit(token, aliases[1], fixture.leftHash));
  rejected(() => comparison.unavailable(token, aliases[1])); same(comparison.state(), failed);
});

test('new selection clears prior reports and old or cloned tokens cannot alter the new round', () => {
  const comparison = make(), old = comparison.select(manifests.left);
  comparison.submit(old, aliases[0], fixture.leftNumber); comparison.submit(old, aliases[1], fixture.leftHash);
  const current = comparison.select(manifests.right); boundary(comparison.state(), 'incomplete'); pending(comparison.state());
  rejected(() => comparison.submit(old, aliases[0], fixture.leftNumber));
  rejected(() => comparison.unavailable(old, aliases[1]));
  rejected(() => comparison.submit(clone(current), aliases[0], fixture.rightNumber));
  const foreign = make().select(manifests.right);
  rejected(() => comparison.submit(foreign, aliases[0], fixture.rightNumber));
  pending(comparison.state()); comparison.submit(current, aliases[0], fixture.rightNumber);
  comparison.submit(current, aliases[1], fixture.rightHash); boundary(comparison.state(), 'matching-supplied-histories');
});

test('malformed selection removes prior agreement and invalidates the old admission token', () => {
  const comparison = make(), old = comparison.select(manifests.left);
  comparison.submit(old, aliases[0], fixture.leftNumber); comparison.submit(old, aliases[1], fixture.leftHash);
  const malformed = clone(manifests.left); delete malformed.end_block_hash;
  rejected(() => comparison.select(malformed));
  boundary(comparison.state(), 'unresolved'); assert.equal(comparison.state().selected, null); pending(comparison.state());
  rejected(() => comparison.submit(old, aliases[0], fixture.leftNumber));
  complete(comparison); boundary(comparison.state(), 'matching-supplied-histories');
});

test('unknown aliases and forged tokens never consume legitimate provider slots', () => {
  const comparison = make(), token = comparison.select(manifests.left), before = plain(comparison.state());
  rejected(() => comparison.submit(token, 'unknown-provider', fixture.leftNumber));
  rejected(() => comparison.unavailable(token, 'unknown-provider'));
  rejected(() => comparison.submit({}, aliases[0], fixture.leftNumber));
  rejected(() => comparison.unavailable({}, aliases[0])); same(comparison.state(), before);
  comparison.submit(token, aliases[0], fixture.leftNumber); comparison.submit(token, aliases[1], fixture.leftHash);
  boundary(comparison.state(), 'matching-supplied-histories');
});

test('duplicate, unknown and stale replies cannot damage an already completed matching snapshot', () => {
  const comparison = make(), old = comparison.select(manifests.right), current = comparison.select(manifests.left);
  comparison.submit(current, aliases[0], fixture.leftNumber); comparison.submit(current, aliases[1], fixture.leftHash);
  const before = plain(comparison.state()); boundary(before, 'matching-supplied-histories');
  rejected(() => comparison.submit(current, aliases[0], fixture.rightNumber));
  rejected(() => comparison.unavailable(current, aliases[1]));
  rejected(() => comparison.submit(current, 'unknown-provider', fixture.rightNumber));
  rejected(() => comparison.unavailable(current, 'unknown-provider'));
  rejected(() => comparison.submit(old, aliases[0], fixture.rightNumber));
  rejected(() => comparison.unavailable(old, aliases[1]));
  rejected(() => comparison.submit(clone(current), aliases[0], fixture.rightNumber));
  same(comparison.state(), before);
});

test('target, roster, manifest and admitted history are detached from subsequent caller mutation', () => {
  const target = clone(watched), ids = [...aliases], selected = clone(manifests.left);
  const comparison = createPaidProviderComparison(target, ids);
  target.calldata = '0x62f509b3'; ids[0] = 'changed';
  const token = comparison.select(selected); selected.end_block_hash = manifests.right.end_block_hash;
  const report = clone(fixture.leftNumber); comparison.submit(token, aliases[0], report);
  report.history.final.credits[0] = '0'; report.manifest.end_block_hash = manifests.right.end_block_hash;
  comparison.submit(token, aliases[1], fixture.leftHash);
  const state = comparison.state(); boundary(state, 'matching-supplied-histories');
  same(state.providers.map(p => p.id), aliases); same(state.selected, manifests.left);
  assert.equal(state.shared_observation.status, 'observed-accepted');
});

test('published snapshots are immutable and prior agreement is only a historical snapshot', () => {
  const comparison = make(), old = complete(comparison), before = plain(old);
  assert.ok(Object.isFrozen(old) && Object.isFrozen(old.providers) && Object.isFrozen(old.shared_observation));
  rejected(() => { old.providers[0].status = 'unavailable'; });
  rejected(() => { old.shared_observation.selected.observations[0].outcome = 'rejected'; });
  comparison.select(manifests.right); boundary(comparison.state(), 'incomplete'); same(old, before);
  const restarted = make(); boundary(restarted.state(), 'unresolved'); pending(restarted.state());
  assert.equal(Object.hasOwn(comparison, 'exportRetained'), false);
});

test('report getters, serialization hooks and cycles fail closed without running caller hooks', () => {
  let invoked = 0;
  for (const variant of ['getter', 'toJSON', 'cycle']) {
    const comparison = make(), token = comparison.select(manifests.left), report = clone(fixture.leftNumber);
    if (variant === 'getter') Object.defineProperty(report, 'history', { enumerable: true, get() { invoked++; throw Error('not allowed'); } });
    if (variant === 'toJSON') report.toJSON = () => { invoked++; return fixture.leftNumber; };
    if (variant === 'cycle') report.history.loop = report;
    rejected(() => comparison.submit(token, aliases[0], report), 'PAID_PROVIDERS_REPORT');
    assert.equal(invoked, 0); boundary(comparison.state(), 'provider-failed');
    assert.equal(comparison.state().providers[0].status, 'invalid');
  }
});

test('roster accepts two through four unique safe aliases and rejects malformed lists', () => {
  for (const ids of [[], ['one'], ['a', 'b', 'c', 'd', 'e'], ['same', 'same'],
    ['Uppercase', 'lowercase'], ['a/b', 'b'], ['a b', 'b'], ['a'.repeat(33), 'b'], ['a', 2]]) {
    rejected(() => createPaidProviderComparison(watched, ids));
  }
  let invoked = 0;
  const ids = [...aliases]; Object.defineProperty(ids, '0', { enumerable: true, get() { invoked++; return 'a'; } });
  rejected(() => createPaidProviderComparison(watched, ids)); assert.equal(invoked, 0);
  rejected(() => createPaidProviderComparison({ ...clone(watched), calldata: '0x00000000' }, aliases));
});

test('selection limit clears state instead of leaving a completed stale agreement', () => {
  const comparison = make();
  for (let index = 0; index < 1023; index++) comparison.select(manifests.left);
  complete(comparison); assert.equal(comparison.state().generation, 1024);
  rejected(() => comparison.select(manifests.left)); boundary(comparison.state(), 'unresolved');
  assert.equal(comparison.state().selected, null); pending(comparison.state());
});

function quantity(value) { return '0x' + BigInt(value).toString(16); }
// Internally consistent reader inputs only: optional metadata/root relationships
// are unauthenticated, and these blocks have never been executed by an EVM.
function enlarged(mode) {
  const report = clone(fixture.leftNumber), history = report.history;
  const count = mode === 'nodes' ? 150 : 70;
  for (let index = 0; index < count; index++) {
    const parent = history.blocks.at(-1).header, header = clone(parent);
    header.hash = '0x' + sha(Buffer.from('provider-' + mode + '/' + index));
    header.parentHash = parent.hash; header.number = quantity(BigInt(parent.number) + 1n);
    header.timestamp = quantity(BigInt(parent.timestamp) + 1n); header.gasUsed = '0x0'; header.transactions = [];
    if (mode === 'nodes') header.withdrawals = Array.from({ length: 40 }, (_, n) => ({
      index: quantity(index * 40 + n), validatorIndex: quantity(n), address: context.addresses.probe, amount: '0x0'
    }));
    if (mode === 'bytes') header.extraData = '0x' + '00'.repeat(30000);
    history.blocks.push({ header, transactions: [] });
  }
  history.end_block = clone(history.blocks.at(-1).header); report.manifest.end_block_hash = history.end_block.hash;
  same(reconstruct(history, report.manifest), reconstruct(fixture.leftNumber.history, manifests.left));
  return report;
}
function values(value) {
  return 1 + (value !== null && typeof value === 'object' ? Object.values(value).reduce((n, item) => n + values(item), 0) : 0);
}

test('a higher endpoint receives no automatic preference and requires a new explicit selection', () => {
  // One synthetic empty extension preserves accounting but has a higher tip.
  const report = clone(fixture.leftNumber), parent = report.history.end_block, header = clone(parent);
  header.hash = '0x' + sha(Buffer.from('provider-higher-endpoint'));
  header.parentHash = parent.hash; header.number = quantity(BigInt(parent.number) + 1n);
  header.timestamp = quantity(BigInt(parent.timestamp) + 1n); header.gasUsed = '0x0'; header.transactions = [];
  report.history.blocks.push({ header, transactions: [] }); report.history.end_block = clone(header);
  report.manifest.end_block_hash = header.hash;
  same(reconstruct(report.history, report.manifest), reconstruct(fixture.leftNumber.history, manifests.left));
  const comparison = make(), state = complete(comparison, manifests.left, [report, report]);
  boundary(state, 'selected-endpoint-mismatch'); same(state.selected, manifests.left);
  const token = comparison.select(report.manifest); pending(comparison.state());
  comparison.submit(token, aliases[0], report); comparison.submit(token, aliases[1], report);
  boundary(comparison.state(), 'matching-supplied-histories'); same(comparison.state().selected, report.manifest);
});

test('aggregate report node limit consumes only the over-budget slot and resets for a fresh round', () => {
  const report = enlarged('nodes'), ids = ['simulation-a', 'simulation-b', 'simulation-c'];
  assert.ok(values([report, report]) < 100000); assert.ok(values([report, report, report]) > 100000);
  const comparison = make(ids), token = comparison.select(report.manifest);
  comparison.submit(token, ids[0], report); comparison.submit(token, ids[1], report);
  rejected(() => comparison.submit(token, ids[2], report), 'PAID_PROVIDERS_REPORT');
  boundary(comparison.state(), 'provider-failed');
  same(comparison.state().providers.map(p => p.status), ['valid', 'valid', 'invalid']);
  const reset = comparison.select(manifests.left);
  ids.forEach(id => comparison.submit(reset, id, fixture.leftNumber));
  boundary(comparison.state(), 'matching-supplied-histories');
});

test('aggregate report byte limit rejects a second individually valid oversized envelope', () => {
  const report = enlarged('bytes');
  assert.ok(Buffer.byteLength(JSON.stringify(report)) > 4 * 1024 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify(report)) < 8 * 1024 * 1024);
  const comparison = make(), token = comparison.select(report.manifest);
  comparison.submit(token, aliases[0], report);
  rejected(() => comparison.submit(token, aliases[1], report), 'PAID_PROVIDERS_REPORT');
  boundary(comparison.state(), 'provider-failed');
  same(comparison.state().providers.map(p => p.status), ['valid', 'invalid']);
});
