import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as equal } from 'node:util';
import { createPaidProviderComparison, createHeaderCheckedPaidProviderComparison } from '../reference/paid-provider-comparison.mjs';
import { createHeaderCheckedPaidActionObserver } from '../reference/paid-action-observer.mjs';
import { inspectExecutionHeaderChain } from '../reference/ethereum-execution-header.mjs';
import { reconstruct } from '../reference/paid-action-reader.mjs';

// Archived alpha.28 number/hash acquisitions used one controlled local node.
// These aliases simulate report providers; no new network acquisition or
// independent provider, body-inclusion, consensus or finality claim is made.
const PROFILE = 'london-16', root = new URL('../experiments/paid-reorg/', import.meta.url);
const clone = value => structuredClone(value), plain = value => JSON.parse(JSON.stringify(value));
const same = (a, b, label = 'complete values agree') => assert.ok(equal(plain(a), plain(b)), label);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function read(name, pin) {
  const raw = readFileSync(new URL(name + '.json', root));
  assert.ok(raw.length < 1024 * 1024); assert.equal(sha(raw), pin); return JSON.parse(raw.toString('utf8'));
}
const manifests = {
  left: read('manifest-left', 'b36b6209074c1b2d434403ef3839a6ee2441dd00d8b1c4098d947ed4185ac59c'),
  right: read('manifest-right', '39efad86b7ea938fdb5304b28053ec7ac097e5ea716e5a8815a72e7532232fbc')
};
const fixture = {
  leftNumber: { manifest: manifests.left, history: read('history-left-number', '9c1a69329dab7a232ffde072d658a02f99497348ec640f3419b1cd6a10ac88e4') },
  leftHash: { manifest: manifests.left, history: read('history-left-hash', 'e63c9f608d5c3b81f90e052c2e3defc6f635684fa0bf62cba89025dab8f970d4') },
  rightNumber: { manifest: manifests.right, history: read('history-right-number', 'bb1571c806a80d4866eeb54f61c1269831acca70f4a4efcb1d3ccc7471834cb2') },
  rightHash: { manifest: manifests.right, history: read('history-right-hash', 'd8aa7517ebeb7356bd176e47bb9442fc9e30afd3ab56cf61d470f5429c18da23') }
};
const context = clone(manifests.left); delete context.end_block_hash;
const watched = { schema: 'caw-paid-action-target/1', context,
  calldata: fixture.leftNumber.history.blocks[11].transactions[0].transaction.data };
const secondTarget = { ...clone(watched), calldata: fixture.leftNumber.history.blocks[13].transactions[0].transaction.data };
const aliases = ['simulated-number', 'simulated-hash'];
const make = (ids = aliases, wanted = watched) => createHeaderCheckedPaidProviderComparison(wanted, ids, PROFILE);
const rejects = (fn, code) => assert.throws(fn, error => error instanceof Error
  && (code ? error.code === code : /^(PAID_(PROVIDERS|OBSERVER|HEADER|REORG|HISTORY)_|EXEC_HEADER_)/.test(error.code ?? '')));
function complete(comparison, selected = manifests.left, reports = [fixture.leftNumber, fixture.leftHash], ids = aliases) {
  const token = comparison.select(selected);
  ids.forEach((id, index) => comparison.submit(token, id, reports[index])); return comparison.state();
}
function pending(state, ids = aliases) {
  same(state.providers, ids.map(id => ({ id, status: 'pending', manifest: null, observation: null })));
}
function headerCheck(report) {
  return inspectExecutionHeaderChain([report.history.start_block, ...report.history.blocks.map(block => block.header)], {
    schema: 'caw-execution-header-chain-selection/1', profile: PROFILE,
    startHash: report.manifest.start_block_hash, endHash: report.manifest.end_block_hash
  });
}
function checkedObservation(report, wanted = watched) {
  const observer = createHeaderCheckedPaidActionObserver(wanted, PROFILE), token = observer.select(report.manifest);
  return observer.commit(observer.prepare(token, report.history));
}
function boundary(state, status, wanted = watched) {
  assert.equal(state.schema, 'caw-paid-header-provider-comparison/1'); assert.equal(state.profile, PROFILE);
  same(state.target, wanted); assert.equal(state.status, status);
  assert.equal(state.finality, 'not-established'); assert.equal(state.retry_safety, 'not-assessed');
  assert.equal(state.provider_independence, 'not-established');
  for (const claim of ['finalized', 'canonical', 'safe_to_retry', 'majority_winner', 'authenticated_providers'])
    assert.equal(Object.hasOwn(state, claim), false);
  if (status !== 'matching-supplied-histories') assert.equal(state.shared_observation, null);
  else same(state.shared_observation, state.providers[0].observation);
  for (const slot of state.providers) {
    if (slot.status !== 'valid') {
      assert.equal(slot.manifest, null); assert.equal(slot.observation, null); continue;
    }
    const observation = slot.observation;
    assert.equal(observation.schema, 'caw-paid-header-action-observation/1'); assert.equal(observation.profile, PROFILE);
    assert.equal(observation.finality, 'not-established'); assert.equal(observation.retry_safety, 'not-assessed');
    same(observation.selected.manifest, slot.manifest); same(observation.target, wanted);
    assert.equal(observation.header_integrity.startHash, slot.manifest.start_block_hash);
    assert.equal(observation.header_integrity.endHash, slot.manifest.end_block_hash);
    for (const result of [observation.header_integrity, ...observation.header_integrity.headers])
      for (const flag of ['endpointAuthenticated', 'consensusVerified', 'bodyCommitmentsVerified',
        'executionVerified', 'finalityVerified', 'freshnessVerified']) assert.equal(result[flag], false, flag);
  }
}
function freezeTree(value) {
  if (value !== null && typeof value === 'object') {
    assert.ok(Object.isFrozen(value)); Object.values(value).forEach(freezeTree);
  }
}

test('the initial checked roster has no selected endpoint or shared observation', () => {
  const state = make().state(); boundary(state, 'unresolved'); pending(state);
  assert.equal(state.selected, null); assert.equal(state.generation, 0);
});

test('both complete London acquisitions must arrive before sharing a checked acceptance', () => {
  same(fixture.leftNumber, fixture.leftHash);
  const comparison = make(), token = comparison.select(manifests.left);
  boundary(comparison.state(), 'incomplete'); pending(comparison.state());
  const first = comparison.submit(token, aliases[1], fixture.leftHash);
  boundary(first, 'incomplete'); same(first.providers.map(row => row.id), aliases);
  same(first.providers.map(row => row.status), ['pending', 'valid']);
  const state = comparison.submit(token, aliases[0], fixture.leftNumber);
  boundary(state, 'matching-supplied-histories'); same(state.selected, manifests.left);
  same(state.shared_observation, checkedObservation(fixture.leftNumber));
  same(state.shared_observation.header_integrity, headerCheck(fixture.leftNumber));
  same(state.providers[0].observation, state.providers[1].observation);
  const row = state.shared_observation.selected.observations[0];
  assert.equal(state.shared_observation.status, 'observed-accepted');
  assert.equal(state.shared_observation.selected.observations.length, 1);
  assert.equal(row.block_hash, fixture.leftNumber.history.blocks[11].header.hash);
  assert.equal(row.transaction_hash, fixture.leftNumber.history.blocks[11].transactions[0].receipt.transactionHash);
  assert.equal(row.outcome, 'accepted');
});

test('matching right histories share a checked rejection without assigning a revert reason', () => {
  const state = complete(make(), manifests.right, [fixture.rightNumber, fixture.rightHash]);
  boundary(state, 'matching-supplied-histories');
  same(state.shared_observation, checkedObservation(fixture.rightNumber));
  assert.equal(state.shared_observation.status, 'rejected-only-in-selected-interval');
  const row = state.shared_observation.selected.observations[0];
  assert.equal(row.receipt_status, '0x0'); assert.equal(Object.hasOwn(row, 'revert_reason'), false);
  assert.equal(Object.hasOwn(row, 'invalid_signature'), false);
});

test('matching absence is limited to the selected checked interval', () => {
  const state = complete(make(aliases, secondTarget), manifests.right, [fixture.rightNumber, fixture.rightHash]);
  boundary(state, 'matching-supplied-histories', secondTarget);
  assert.equal(state.shared_observation.status, 'not-observed-in-covered-interval');
  same(state.shared_observation.selected.observations, []);
  same(state.shared_observation.selected.coverage, {
    start_exclusive: { number: fixture.rightNumber.history.start_block.number, hash: manifests.right.start_block_hash },
    end_inclusive: { number: fixture.rightNumber.history.end_block.number, hash: manifests.right.end_block_hash }
  });
});

test('JSON property order does not create a false conflict between identical complete reports', () => {
  function reverse(value) {
    if (Array.isArray(value)) return value.map(reverse);
    return value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverse(item)])) : value;
  }
  const reordered = reverse(fixture.leftHash); same(reordered, fixture.leftNumber);
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(fixture.leftNumber));
  boundary(complete(make(), reverse(manifests.left), [fixture.leftNumber, reordered]), 'matching-supplied-histories');
});

test('different valid same-height endpoints remain disagreement with individually checked observations', () => {
  assert.equal(fixture.leftNumber.history.end_block.number, fixture.rightNumber.history.end_block.number);
  const state = complete(make(), manifests.left, [fixture.leftNumber, fixture.rightHash]);
  boundary(state, 'endpoint-disagreement'); same(state.selected, manifests.left);
  same(state.providers.map(row => row.status), ['valid', 'valid']);
  same(state.providers.map(row => row.observation.status), ['observed-accepted', 'rejected-only-in-selected-interval']);
  assert.notEqual(state.providers[0].observation.header_integrity.endHash, state.providers[1].observation.header_integrity.endHash);
});

test('three reports cannot outvote a fourth checked endpoint', () => {
  const ids = ['simulated-a', 'simulated-b', 'simulated-c', 'simulated-d'];
  const state = complete(make(ids), manifests.left,
    [fixture.leftNumber, fixture.leftHash, fixture.leftNumber, fixture.rightHash], ids);
  boundary(state, 'endpoint-disagreement'); same(state.selected, manifests.left);
  assert.ok(state.providers.every(row => row.status === 'valid'));
});

test('unanimous checked reports cannot replace the independently supplied selection', () => {
  const state = complete(make(), manifests.left, [fixture.rightNumber, fixture.rightHash]);
  boundary(state, 'selected-endpoint-mismatch'); same(state.selected, manifests.left);
  assert.ok(state.providers.every(row => row.manifest.end_block_hash === manifests.right.end_block_hash));
});

test('a higher archived endpoint receives no automatic preference over its explicitly selected prefix', () => {
  // Derive a real recorded prefix by omitting the final successful withdrawal.
  // No header or receipt is invented; restore its nine base units in the
  // declared endpoint accounting, which both retained readers must recheck.
  const prefix = clone(fixture.rightNumber), last = prefix.history.blocks.pop();
  assert.equal(last.transactions[0].receipt.status, '0x1');
  assert.equal(last.transactions[0].transaction.data,
    '0xa41fe49f' + '1'.padStart(64, '0') + '1'.padStart(64, '0') + '9'.padStart(64, '0'));
  prefix.history.end_block = clone(prefix.history.blocks.at(-1).header);
  prefix.manifest.end_block_hash = prefix.history.end_block.hash;
  prefix.history.final.credits[0] = String(BigInt(prefix.history.final.credits[0]) + 9n);
  for (const field of ['totalCredits', 'tokenBalance']) prefix.history.final[field] = String(BigInt(prefix.history.final[field]) + 9n);
  reconstruct(prefix.history, prefix.manifest); checkedObservation(prefix);
  assert.ok(BigInt(prefix.history.end_block.number) < BigInt(fixture.rightNumber.history.end_block.number));
  const state = complete(make(), prefix.manifest, [fixture.rightNumber, fixture.rightHash]);
  boundary(state, 'selected-endpoint-mismatch'); same(state.selected, prefix.manifest);
  const mixed = complete(make(), prefix.manifest, [prefix, fixture.rightHash]);
  boundary(mixed, 'endpoint-disagreement');
});

test('equal hashes and accounting do not hide differences in unverified optional body metadata', () => {
  const derivative = clone(fixture.leftHash);
  derivative.history.blocks[5].header.withdrawals = [{ synthetic: 'not-an-observed-withdrawal' }];
  same(headerCheck(derivative), headerCheck(fixture.leftNumber));
  same(checkedObservation(derivative), checkedObservation(fixture.leftNumber));
  // Full-history conflict takes precedence over mismatch with the selected R.
  const state = complete(make(), manifests.right, [fixture.leftNumber, derivative]);
  boundary(state, 'history-conflict'); assert.ok(state.providers.every(row => row.status === 'valid'));
  same(state.providers[0].observation, state.providers[1].observation);
});

test('identical supplied optional metadata may agree while every body and trust flag stays false', () => {
  const report = clone(fixture.leftNumber);
  report.history.blocks[5].header.withdrawals = [{ synthetic: 'not-an-observed-withdrawal' }];
  const state = complete(make(), manifests.left, [report, clone(report)]);
  boundary(state, 'matching-supplied-histories');
  assert.equal(state.shared_observation.header_integrity.bodyCommitmentsVerified, false);
});

test('legacy agreement on a retained-hash alteration is rejected as invalid in the checked factory', () => {
  const report = clone(fixture.leftNumber); report.history.blocks[5].header.extraData = '0x1234';
  const legacy = createPaidProviderComparison(watched, aliases);
  const old = complete(legacy, manifests.left, [report, clone(report)]);
  assert.equal(old.schema, 'caw-paid-provider-comparison/1'); assert.equal(old.status, 'matching-supplied-histories');
  assert.equal(Object.hasOwn(old.shared_observation, 'header_integrity'), false);
  const comparison = make(), token = comparison.select(manifests.left);
  rejects(() => comparison.submit(token, aliases[0], report), 'PAID_PROVIDERS_REPORT');
  boundary(comparison.state(), 'provider-failed');
  same(comparison.state().providers.map(row => row.status), ['invalid', 'pending']);
  rejects(() => comparison.submit(token, aliases[1], report), 'PAID_PROVIDERS_REPORT');
  boundary(comparison.state(), 'provider-failed');
});

test('a false checkpoint or tip header consumes only the failed slot while a checked peer remains visible', () => {
  for (const location of ['checkpoint', 'tip']) {
    const report = clone(fixture.leftHash), h = report.history;
    const header = location === 'checkpoint' ? h.start_block : h.blocks.at(-1).header;
    header.extraData = '0x1234'; if (location === 'tip') h.end_block = clone(header);
    const comparison = make(), token = comparison.select(manifests.left);
    comparison.submit(token, aliases[0], fixture.leftNumber); const honest = plain(comparison.state().providers[0]);
    rejects(() => comparison.submit(token, aliases[1], report), 'PAID_PROVIDERS_REPORT');
    boundary(comparison.state(), 'provider-failed'); same(comparison.state().providers[0], honest);
    same(comparison.state().providers[1], { id: aliases[1], status: 'invalid', manifest: null, observation: null });
  }
});

test('a pending provider prevents an early conclusion from already disagreeing checked reports', () => {
  const ids = ['simulated-a', 'simulated-b', 'simulated-c'], comparison = make(ids), token = comparison.select(manifests.left);
  comparison.submit(token, ids[0], fixture.leftNumber); comparison.submit(token, ids[1], fixture.rightHash);
  boundary(comparison.state(), 'incomplete');
  comparison.submit(token, ids[2], fixture.leftHash); boundary(comparison.state(), 'endpoint-disagreement');
});

test('an unavailable provider takes priority over pending reports and endpoint disagreement', () => {
  const ids = ['simulated-a', 'simulated-b', 'simulated-c', 'simulated-d'], comparison = make(ids), token = comparison.select(manifests.left);
  boundary(comparison.unavailable(token, ids[0]), 'provider-failed');
  comparison.submit(token, ids[1], fixture.leftNumber); comparison.submit(token, ids[2], fixture.rightNumber);
  boundary(comparison.state(), 'provider-failed'); assert.equal(comparison.state().providers[3].status, 'pending');
  comparison.submit(token, ids[3], fixture.leftHash); boundary(comparison.state(), 'provider-failed');
});

test('matching header hashes cannot turn invalid logs accounting or a conflicting duplicate tip into a valid slot', () => {
  for (const change of [history => { history.blocks[11].transactions[0].receipt.logs = []; },
    history => { history.final.credits[0] = '0'; }, history => { history.end_block.extraData = '0x1234'; }]) {
    const report = clone(fixture.leftNumber); change(report.history); headerCheck(report);
    const comparison = make(), token = comparison.select(manifests.left);
    rejects(() => comparison.submit(token, aliases[0], report), 'PAID_PROVIDERS_REPORT');
    boundary(comparison.state(), 'provider-failed'); assert.equal(comparison.state().providers[0].observation, null);
    comparison.submit(token, aliases[1], fixture.leftHash); boundary(comparison.state(), 'provider-failed');
  }
});

test('foreign report contexts and saved status claims are invalid reports rather than endpoint disagreement', () => {
  for (const change of [report => { report.manifest.chain_id = 1; },
    report => { report.manifest.probe_runtime_sha256 = '12'.repeat(32); },
    report => { report.header_integrity = { finalityVerified: true }; },
    report => { delete report.history; report.observation = { status: 'observed-accepted' }; }]) {
    const report = clone(fixture.leftNumber); change(report);
    const comparison = make(), token = comparison.select(manifests.left);
    rejects(() => comparison.submit(token, aliases[0], report), 'PAID_PROVIDERS_REPORT');
    boundary(comparison.state(), 'provider-failed'); assert.equal(comparison.state().providers[0].status, 'invalid');
  }
});

test('valid invalid and unavailable replies each consume exactly one provider slot', () => {
  for (const admitted of ['valid', 'invalid', 'unavailable']) {
    const comparison = make(), token = comparison.select(manifests.left);
    if (admitted === 'valid') comparison.submit(token, aliases[0], fixture.leftNumber);
    if (admitted === 'invalid') rejects(() => comparison.submit(token, aliases[0], {}), 'PAID_PROVIDERS_REPORT');
    if (admitted === 'unavailable') comparison.unavailable(token, aliases[0]);
    const before = plain(comparison.state());
    rejects(() => comparison.submit(token, aliases[0], fixture.leftHash), 'PAID_PROVIDERS_CONSUMED');
    rejects(() => comparison.unavailable(token, aliases[0]), 'PAID_PROVIDERS_CONSUMED'); same(comparison.state(), before);
    comparison.submit(token, aliases[1], fixture.leftHash); assert.equal(comparison.state().providers[1].status, 'valid');
  }
});

test('fresh selection clears old reports and stale cloned foreign or unknown admissions cannot damage the new round', () => {
  const comparison = make(), old = comparison.select(manifests.left);
  comparison.submit(old, aliases[0], fixture.leftNumber); comparison.submit(old, aliases[1], fixture.leftHash);
  const current = comparison.select(manifests.right), before = plain(comparison.state());
  boundary(before, 'incomplete'); pending(before);
  const foreign = make().select(manifests.right);
  for (const token of [old, clone(current), foreign, {}]) {
    rejects(() => comparison.submit(token, aliases[0], fixture.rightNumber), 'PAID_PROVIDERS_STALE_ROUND');
    rejects(() => comparison.unavailable(token, aliases[1]), 'PAID_PROVIDERS_STALE_ROUND');
  }
  rejects(() => comparison.submit(current, 'unknown-provider', fixture.rightNumber), 'PAID_PROVIDERS_PROVIDER');
  rejects(() => comparison.unavailable(current, 'unknown-provider'), 'PAID_PROVIDERS_PROVIDER'); same(comparison.state(), before);
  comparison.submit(current, aliases[0], fixture.rightNumber); comparison.submit(current, aliases[1], fixture.rightHash);
  boundary(comparison.state(), 'matching-supplied-histories'); const done = plain(comparison.state());
  rejects(() => comparison.submit(old, aliases[0], {})); rejects(() => comparison.submit(current, aliases[0], {}));
  rejects(() => comparison.unavailable(current, aliases[1])); same(comparison.state(), done);
});

test('malformed selections including arity and context failures clear previous checked agreement', () => {
  for (const invoke of [comparison => comparison.select(), comparison => comparison.select(manifests.left, 'unexpected'),
    comparison => comparison.select({}), comparison => comparison.select({ ...clone(manifests.left), chain_id: 1 })]) {
    const comparison = make(); complete(comparison); rejects(() => invoke(comparison));
    boundary(comparison.state(), 'unresolved'); pending(comparison.state()); assert.equal(comparison.state().selected, null);
    boundary(complete(comparison), 'matching-supplied-histories');
  }
});

test('bad submit or unavailable arity cannot consume legitimate pending slots', () => {
  const comparison = make(), token = comparison.select(manifests.left), before = plain(comparison.state());
  rejects(() => comparison.submit(token, aliases[0]), 'PAID_PROVIDERS_SCHEMA');
  rejects(() => comparison.submit(token, aliases[0], fixture.leftNumber, 'unexpected'), 'PAID_PROVIDERS_SCHEMA');
  rejects(() => comparison.unavailable(token), 'PAID_PROVIDERS_SCHEMA');
  rejects(() => comparison.unavailable(token, aliases[0], 'unexpected'), 'PAID_PROVIDERS_SCHEMA'); same(comparison.state(), before);
});

test('captured target roster selection and accepted reports cannot be changed through caller references', () => {
  const wanted = clone(watched), ids = [...aliases], selected = clone(manifests.left);
  const comparison = createHeaderCheckedPaidProviderComparison(wanted, ids, PROFILE);
  wanted.calldata = '0x62f509b3'; ids[0] = 'changed';
  const token = comparison.select(selected); selected.end_block_hash = manifests.right.end_block_hash;
  const report = clone(fixture.leftNumber); comparison.submit(token, aliases[0], report);
  report.history.blocks[5].header.extraData = '0x1234'; report.history.final.credits[0] = '0';
  report.manifest.end_block_hash = manifests.right.end_block_hash;
  comparison.submit(token, aliases[1], fixture.leftHash); const state = comparison.state();
  boundary(state, 'matching-supplied-histories'); same(state.selected, manifests.left); same(state.providers.map(row => row.id), aliases);
});

test('snapshots are deeply immutable and restart requires new complete reports instead of saved agreement', () => {
  const comparison = make(), state = complete(comparison), before = plain(state); freezeTree(state);
  assert.throws(() => { state.providers[0].status = 'unavailable'; }, TypeError);
  assert.throws(() => { state.shared_observation.header_integrity.headers[0].hash = 'changed'; }, TypeError);
  assert.throws(() => { state.shared_observation.selected.observations[0].outcome = 'rejected'; }, TypeError);
  comparison.select(manifests.right); boundary(comparison.state(), 'incomplete'); same(state, before);
  const fresh = make(); boundary(fresh.state(), 'unresolved'); pending(fresh.state());
  assert.equal(Object.hasOwn(comparison, 'exportRetained'), false);
});

test('report getters hooks cycles sparse arrays and exotic prototypes are refused without invoking caller code', () => {
  let invoked = 0;
  for (const change of [report => Object.defineProperty(report, 'history', {
    enumerable: true, get() { invoked++; throw Error('private caller diagnostic'); }
  }), report => { report.toJSON = () => { invoked++; return fixture.leftNumber; }; },
  report => { report.history.loop = report; }, report => { delete report.history.blocks[1]; },
  report => { Object.setPrototypeOf(report, { inherited: true }); }, report => { report[Symbol('extra')] = true; }]) {
    const comparison = make(), token = comparison.select(manifests.left), report = clone(fixture.leftNumber); change(report);
    assert.throws(() => comparison.submit(token, aliases[0], report), error => error.code === 'PAID_PROVIDERS_REPORT'
      && error.message === 'Provider comparison rejected: REPORT.');
    assert.equal(invoked, 0); boundary(comparison.state(), 'provider-failed');
  }
});

test('factory and selection capture reject accessors without reading them', () => {
  let invoked = 0; const wanted = clone(watched);
  Object.defineProperty(wanted, 'calldata', { enumerable: true, get() { invoked++; return watched.calldata; } });
  rejects(() => createHeaderCheckedPaidProviderComparison(wanted, aliases, PROFILE));
  const ids = [...aliases]; Object.defineProperty(ids, '0', { enumerable: true, get() { invoked++; return aliases[0]; } });
  rejects(() => createHeaderCheckedPaidProviderComparison(watched, ids, PROFILE));
  const comparison = make(); complete(comparison); const selected = clone(manifests.left);
  Object.defineProperty(selected, 'end_block_hash', { enumerable: true, get() { invoked++; return manifests.left.end_block_hash; } });
  rejects(() => comparison.select(selected)); assert.equal(invoked, 0); boundary(comparison.state(), 'unresolved'); pending(comparison.state());
});

test('explicit profile arity and roster validation cannot downgrade to the legacy factory', () => {
  rejects(() => createHeaderCheckedPaidProviderComparison(watched, aliases), 'PAID_PROVIDERS_SCHEMA');
  rejects(() => createHeaderCheckedPaidProviderComparison(watched, aliases, PROFILE, 'unexpected'), 'PAID_PROVIDERS_SCHEMA');
  for (const profile of [undefined, null, '', 'london', 'legacy-15', 16])
    rejects(() => createHeaderCheckedPaidProviderComparison(watched, aliases, profile), 'PAID_HEADER_PROFILE');
  for (const profile of ['shanghai-17', 'cancun-20', 'prague-21']) {
    const comparison = createHeaderCheckedPaidProviderComparison(watched, aliases, profile);
    assert.equal(comparison.state().profile, profile); const token = comparison.select(manifests.left);
    rejects(() => comparison.submit(token, aliases[0], fixture.leftNumber), 'PAID_PROVIDERS_REPORT');
    assert.equal(comparison.state().shared_observation, null);
  }
  for (const ids of [[], ['one'], ['a', 'b', 'c', 'd', 'e'], ['same', 'same'], ['Upper', 'lower'], ['a/b', 'b'], ['a'.repeat(33), 'b'], ['a', 2]])
    rejects(() => createHeaderCheckedPaidProviderComparison(watched, ids, PROFILE));
});

test('selection exhaustion removes completed agreement instead of leaving a stale checked result', () => {
  const comparison = make(); for (let index = 0; index < 1023; index++) comparison.select(manifests.left);
  complete(comparison); assert.equal(comparison.state().generation, 1024);
  rejects(() => comparison.select(manifests.left), 'PAID_PROVIDERS_SELECTION_LIMIT');
  boundary(comparison.state(), 'unresolved'); pending(comparison.state()); assert.equal(comparison.state().selected, null);
});

function values(value) {
  return 1 + (value !== null && typeof value === 'object'
    ? Object.values(value).reduce((total, entry) => total + values(entry), 0) : 0);
}
function paddedReport() {
  const report = clone(fixture.leftNumber);
  // Synthetic optional metadata only. Original hashed fields, transaction and
  // receipt bytes stay unchanged. This is not actual withdrawal information.
  for (const header of [report.history.start_block, ...report.history.blocks.map(block => block.header)])
    header.withdrawals = Array.from({ length: 2048 }, () => ({ test: null }));
  report.history.end_block = clone(report.history.blocks.at(-1).header); return report;
}

test('the complete raw report set counts repeated valid provider envelopes and rejects an aggregate node overflow', () => {
  const report = paddedReport();
  assert.ok(values({ reports: [report] }) < 100000); assert.ok(values({ reports: [report, report] }) > 100000);
  assert.ok(Buffer.byteLength(JSON.stringify({ reports: [report, report] })) < 8 * 1024 * 1024);
  assert.equal(checkedObservation(report).status, 'observed-accepted');
  const comparison = make(), token = comparison.select(manifests.left);
  comparison.submit(token, aliases[0], report); boundary(comparison.state(), 'incomplete');
  const honest = plain(comparison.state().providers[0]);
  rejects(() => comparison.submit(token, aliases[1], report), 'PAID_PROVIDERS_REPORT');
  boundary(comparison.state(), 'provider-failed'); same(comparison.state().providers[0], honest);
  same(comparison.state().providers.map(row => row.status), ['valid', 'invalid']);
  rejects(() => comparison.submit(token, aliases[1], fixture.leftHash), 'PAID_PROVIDERS_CONSUMED');
  boundary(complete(comparison), 'matching-supplied-histories');
});

test('oversized raw input or more than 128 included blocks cannot produce a checked provider observation', () => {
  for (const report of (() => {
    const interval = clone(fixture.leftNumber);
    while (interval.history.blocks.length < 129) interval.history.blocks.push(clone(fixture.leftNumber.history.blocks[0]));
    const oversized = clone(fixture.leftNumber); oversized.history.final.credits = Array(43).fill('x'.repeat(200000));
    // Rejected admission inputs only; they do not describe new executed blocks.
    return [interval, oversized];
  })()) {
    const comparison = make(), token = comparison.select(manifests.left);
    rejects(() => comparison.submit(token, aliases[0], report), 'PAID_PROVIDERS_REPORT');
    boundary(comparison.state(), 'provider-failed'); assert.equal(comparison.state().providers[0].observation, null);
  }
});
