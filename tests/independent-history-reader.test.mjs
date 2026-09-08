import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { createState, canonicalExport, applyAction } from '../public/model.mjs';
import { createDemoSigner } from '../public/signatures.mjs';
import { createSignedLedger } from '../public/signed-ledger.mjs';
import { createLabRecordCheckpoint, verifyLabRecord } from '../public/signed-record.mjs';
import { inspectSignedHistory } from '../reference/independent-history-reader.mjs';

// PUBLIC SYNTHETIC TEST MATERIAL: this fixed disclosed seed must never control
// a wallet, production account, funds or confidential messages. The fixture's
// expected accounting and canonical histories were authored without app helpers.
const fixture = JSON.parse(readFileSync(new URL('../reference/fixtures/history-v1.json', import.meta.url), 'utf8'));
const key = createPrivateKey({ key: Buffer.from('302e020100300506032b657004220420' + fixture.public_test_seed_hex, 'hex'), format: 'der', type: 'pkcs8' });
const prefix = 'CAW_LOCAL_SIGNED_ACTION_V1\n';
const clone = value => JSON.parse(JSON.stringify(value));
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const coded = expected => error => error instanceof Error && (expected ? error.code === expected : typeof error.code === 'string');

// Test-only serialization for altered inputs. Literal expected histories remain
// fixture bytes. This helper imports no writer canonicalization or validation.
function sorted(value) {
  if (Array.isArray(value)) return '[' + value.map(sorted).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(name => JSON.stringify(name) + ':' + sorted(value[name])).join(',') + '}';
  return JSON.stringify(value);
}
function signed(actionText, signingPrefix = prefix) {
  const signature = sign(null, Buffer.from(signingPrefix + actionText, 'utf8'), key).toString('hex');
  return '{"action":' + actionText + ',"publicKey":' + JSON.stringify(fixture.public_key_hex) + ',"signature":' + JSON.stringify(signature) + '}';
}
function signedAction(patch = {}) { return signed(sorted({ ...fixture.actions[0], ...patch })); }
const fixedEntries = [
  ...fixture.canonical_actions.map(text => ({ kind: 'signed-caw', packet: signed(text), acceptedAt: fixture.acceptedAt })),
  { kind: 'unsigned-fixture-transfer', newController: 'device-next' }
];
function record(entries = fixedEntries, initialHistory = fixture.initial_history) {
  return JSON.stringify({ format: 'caw-signed-lab-record-v1', initialHistory, entries });
}
const fixedRecord = record();
function checkpoint(text, finalHistory = fixture.expected_final_history) {
  let entryCount = 3;
  try { const parsed = JSON.parse(text); if (Array.isArray(parsed?.entries)) entryCount = parsed.entries.length; } catch { /* Keep a bounded comparison count for malformed test input. */ }
  return { format: 'caw-signed-lab-checkpoint-v1', entryCount, byteLength: Buffer.byteLength(text, 'utf8'), sha256: digest(text), finalHistorySha256: digest(finalHistory) };
}
const fixedCheckpoint = checkpoint(fixedRecord);
function freshHistory(seed) {
  return sorted({ version: 1, scenario: 'appendix-demo-v1', seed, expectedEventCount: 0, events: [], snapshot: {
    accounts: Object.fromEntries(seed.accounts.map(account => [account.name, { ...account, epoch: 0, nonce: 0 }])),
    posts: seed.posts.map(post => ({ ...post, simulated: true })), follows: [], likes: [], recaws: [], poolDust: '0', receipts: []
  } });
}
async function acceptBoth(text, expected = fixture.expected_final_history, binding = fixture.binding) {
  const comparison = checkpoint(text, expected);
  const independent = inspectSignedHistory(text, comparison, binding);
  const original = await verifyLabRecord(text, comparison, binding);
  assert.equal(independent.canonicalText, expected);
  assert.equal(original.canonicalText, expected);
  assert.deepEqual(independent.checkpoint, comparison);
  assert.ok(Object.isFrozen(independent));
  assert.ok(Object.isFrozen(independent.checkpoint));
  for (const flag of ['recordedTimesAreProof', 'ownershipProven', 'authorityProven', 'freshnessProven', 'livePermissionRestored']) assert.equal(independent[flag], false, flag);
  assert.equal(independent.inheritedEvents, 0);
  return independent;
}
async function rejectBoth(text, options = {}) {
  const comparison = options.checkpoint ?? checkpoint(text);
  const binding = options.binding ?? fixture.binding;
  assert.throws(() => inspectSignedHistory(text, comparison, binding), coded(options.reader));
  await assert.rejects(verifyLabRecord(text, comparison, binding), coded(options.writer));
}

test('history reader has independent replay and accounting without application imports', () => {
  const source = readFileSync(new URL('../reference/independent-history-reader.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.ok(imports.length > 0);
  assert.ok(imports.every(name => ['node:crypto', 'node:buffer', './independent-action-reader.mjs'].includes(name)), imports.join(', '));
  assert.doesNotMatch(source, /\bimport\s*\(|\brequire\s*\(/);
});

test('literal fixture fixes exact starting bytes, integer credits, dust, text and final state', () => {
  assert.equal(fixture.public_test_material, true);
  assert.equal(fixture.not_a_wallet_or_production_key, true);
  assert.match(fixture.notice, /PUBLIC SYNTHETIC TEST MATERIAL/);
  assert.equal(canonicalExport(createState(fixture.seed)), fixture.initial_history);
  assert.equal(freshHistory(fixture.seed), fixture.initial_history);
  const final = JSON.parse(fixture.expected_final_history);
  assert.equal(sorted(final), fixture.expected_final_history);
  assert.equal(final.expectedEventCount, 3);
  assert.deepEqual(final.snapshot.posts.map(post => post.text), ['CAW one.', 'CAW two: e\u0301 \u{1f426}.']);
  assert.deepEqual(final.snapshot.receipts.map(receipt => receipt.characterCount), [8, 14, 0]);
  assert.deepEqual(final.snapshot.receipts[0].allocations, [
    { account: 'keeper', amount: '3333333333333333333333', reason: 'stake-pool' },
    { account: 'signal', amount: '1666666666666666666666', reason: 'stake-pool' }
  ]);
  assert.equal(final.snapshot.accounts.pioneer.balance, '10000000000000000000000');
  assert.equal(final.snapshot.accounts.signal.balance, '23333333333333333333332');
  assert.equal(final.snapshot.accounts.keeper.balance, '26666666666666666666666');
  assert.equal(final.snapshot.poolDust, '2');
  assert.equal(Object.values(final.snapshot.accounts).reduce((sum, a) => sum + BigInt(a.balance), 0n) + 2n, 60000000000000000000000n);
});

test('independently signed fixed record rebuilds literal final bytes through both readers', async () => {
  const result = await acceptBoth(fixedRecord);
  assert.equal(result.entryCount, 3);
  assert.equal(result.signedActions, 2);
  assert.equal(result.fixtureTransfers, 1);
  assert.equal(fixedEntries[0].packet, signed(fixture.canonical_actions[0]));
});

test('original signer and settlement writer produce the same independently specified final history', async t => {
  const signer = await createDemoSigner(); t.after(() => signer.revoke());
  const binding = { ...fixture.binding, publicKey: signer.publicKey };
  const ledger = createSignedLedger(createState(fixture.seed), binding, () => fixture.acceptedAt); t.after(() => ledger.revoke());
  for (const action of fixture.actions) await ledger.accept(await signer.sign(action));
  ledger.simulateTransfer('device-next');
  const saved = ledger.exportRecord();
  assert.equal(saved.canonicalText, fixture.expected_final_history);
  const originalCheckpoint = await createLabRecordCheckpoint(saved.recordText, saved.canonicalText);
  assert.deepEqual(originalCheckpoint, checkpoint(saved.recordText));
  assert.equal(inspectSignedHistory(saved.recordText, originalCheckpoint, binding).canonicalText, fixture.expected_final_history);
});

test('inspection is repeatable, cannot mutate captured inputs and never restores permission', () => {
  const binding = Object.freeze(Object.assign(Object.create(null), fixture.binding));
  const comparison = Object.freeze(Object.assign(Object.create(null), fixedCheckpoint));
  const before = JSON.stringify({ binding, comparison });
  const first = inspectSignedHistory(fixedRecord, comparison, binding);
  assert.deepEqual(first, inspectSignedHistory(fixedRecord, comparison, binding));
  assert.equal(JSON.stringify({ binding, comparison }), before);
  assert.equal(first.livePermissionRestored, false);
  assert.throws(() => { first.canonicalText = '{}'; }, TypeError);
  assert.throws(() => { first.checkpoint.entryCount = 0; }, TypeError);
});

test('exact canonical records reject whitespace, duplicate keys, reordered entries and alternate escaping', async () => {
  const parsed = JSON.parse(fixedRecord);
  const entry = parsed.entries[0];
  const changedOrder = clone(parsed); changedOrder.entries[0] = { packet: entry.packet, kind: entry.kind, acceptedAt: entry.acceptedAt };
  const cases = [
    ' ' + fixedRecord, fixedRecord + '\n', JSON.stringify(parsed, null, 2),
    JSON.stringify({ entries: parsed.entries, initialHistory: parsed.initialHistory, format: parsed.format }),
    fixedRecord.replace('{"format":', '{"format":"caw-signed-lab-record-v1","format":'),
    fixedRecord.replace('"acceptedAt":1700000000', '"acceptedAt":1700000000,"acceptedAt":1700000000'),
    fixedRecord.replace('"format"', '"\\u0066ormat"'),
    fixedRecord.replace('"acceptedAt":1700000000', '"acceptedAt":1700000000.0'),
    JSON.stringify(changedOrder)
  ];
  for (const text of cases) { assert.notEqual(text, fixedRecord); await rejectBoth(text); }
  const nested = clone(parsed); nested.initialHistory += '\n';
  await rejectBoth(JSON.stringify(nested));
  const escaped = clone(parsed); escaped.entries[0].packet = escaped.entries[0].packet.replace('"pioneer"', '"\\u0070ioneer"');
  await rejectBoth(JSON.stringify(escaped));
});

test('record and entry schemas reject malformed JSON, missing fields and unexpected instructions', async () => {
  for (const text of ['', '{', 'null', '[]', 'true', '"history"']) await rejectBoth(text);
  const original = JSON.parse(fixedRecord);
  const extra = { ...original, nextInstruction: 'must be rejected as data' };
  const missing = clone(original); delete missing.initialHistory;
  const noTime = clone(original); delete noTime.entries[0].acceptedAt;
  const extraEntry = clone(original); extraEntry.entries[0].receipt = {};
  const extraTransfer = clone(original); extraTransfer.entries[2].publicKey = fixture.public_key_hex;
  const unknown = clone(original); unknown.entries[0] = { kind: 'execute-command', command: 'untrusted data' };
  for (const value of [extra, missing, noTime, extraEntry, extraTransfer, unknown, { ...original, entries: {} }, { ...original, entries: [null] }]) await rejectBoth(JSON.stringify(value));
  for (const input of [undefined, null, 1, {}, Buffer.from(fixedRecord)]) {
    assert.throws(() => inspectSignedHistory(input, fixedCheckpoint, fixture.binding), coded());
    await assert.rejects(verifyLabRecord(input, fixedCheckpoint, fixture.binding), coded());
  }
});

test('independently retained fingerprints cover record bytes, counts, length and final history', async () => {
  const cases = [
    { sha256: '0'.repeat(64) }, { finalHistorySha256: '0'.repeat(64) }, { entryCount: 2 }, { byteLength: fixedCheckpoint.byteLength + 1 },
    { format: 'different-checkpoint' }, { entryCount: -0 }, { entryCount: 66 }, { byteLength: -1 },
    { sha256: fixedCheckpoint.sha256.toUpperCase() }, { sha256: fixedCheckpoint.sha256 + '\n' }, { entryCount: '3' }
  ];
  for (const patch of cases) await rejectBoth(fixedRecord, { checkpoint: { ...fixedCheckpoint, ...patch } });
  await rejectBoth(fixedRecord.replace('CAW one.', 'CAW bad.'), { checkpoint: fixedCheckpoint });
});

test('checkpoint and binding require descriptor-safe exact independently supplied data', async () => {
  let called = 0;
  for (const which of ['checkpoint', 'binding']) {
    const source = which === 'checkpoint' ? fixedCheckpoint : fixture.binding;
    const cases = [];
    for (const field of Object.keys(source)) {
      const value = { ...source };
      Object.defineProperty(value, field, { enumerable: true, get() { called += 1; return source[field]; } });
      cases.push(value);
    }
    const hidden = { ...source }; Object.defineProperty(hidden, Object.keys(source)[0], { enumerable: false });
    const missing = { ...source }; delete missing[Object.keys(source)[0]];
    cases.push(hidden, missing, { ...source, [Symbol('extra')]: true }, { ...source, extra: true },
      { ...source, toJSON() { called += 1; return source; } }, Object.create(source), null, []);
    for (const value of cases) {
      const comparison = which === 'checkpoint' ? value : fixedCheckpoint;
      const binding = which === 'binding' ? value : fixture.binding;
      assert.throws(() => inspectSignedHistory(fixedRecord, comparison, binding), coded());
      await assert.rejects(verifyLabRecord(fixedRecord, comparison, binding), coded());
    }
  }
  assert.equal(called, 0);
  for (const patch of [{ domain: 'other-history' }, { account: 'signal' }, { controller: 'device-other' }, { epoch: 1 }, { publicKey: '00'.repeat(32) }]) await rejectBoth(fixedRecord, { binding: { ...fixture.binding, ...patch } });
});

test('rehashed reordered, duplicated and deleted entries still fail replay or final comparison', async () => {
  const [first, second, transfer] = fixedEntries;
  const cases = [[second, first, transfer], [first, first, transfer], [first, transfer], [second, transfer], [first, second], [transfer, first, second]];
  for (const entries of cases) await rejectBoth(record(entries));
  await rejectBoth(record([first, second]), { checkpoint: fixedCheckpoint });
});

test('fresh fingerprints cannot repair altered signatures, wrong signing domains or stale actions', async () => {
  const changed = clone(fixedEntries); const packet = JSON.parse(changed[0].packet); packet.action.text = 'Changed without signing.'; changed[0].packet = JSON.stringify(packet);
  await rejectBoth(record(changed), { writer: 'INVALID_SIGNATURE' });
  const broken = clone(fixedEntries); const sig = JSON.parse(broken[0].packet); sig.signature = (sig.signature[0] === '0' ? '1' : '0') + sig.signature.slice(1); broken[0].packet = JSON.stringify(sig);
  await rejectBoth(record(broken), { writer: 'INVALID_SIGNATURE' });
  const cases = [
    [signed(fixture.canonical_actions[0], 'WRONG_PREFIX\n'), 'INVALID_SIGNATURE'],
    [signedAction({ domain: 'other-history' }), 'WRONG_DOMAIN'],
    [signedAction({ account: 'signal' }), 'WRONG_AUTHORITY'],
    [signedAction({ controller: 'device-other' }), 'WRONG_AUTHORITY'],
    [signedAction({ epoch: 1 }), 'WRONG_AUTHORITY'],
    [signedAction({ nonce: 1 }), 'STALE_NONCE']
  ];
  for (const [replacement, writer] of cases) {
    const entries = clone(fixedEntries); entries[0].packet = replacement;
    await rejectBoth(record(entries), { writer });
  }
});

test('recorded acceptance time is window-checked but neither implementation authenticates historical time', async () => {
  const later = clone(fixedEntries); later[0].acceptedAt += 7;
  const checked = await acceptBoth(record(later));
  assert.equal(checked.recordedTimesAreProof, false);
  const backwards = clone(fixedEntries); backwards[0].acceptedAt += 10; backwards[1].acceptedAt += 5;
  assert.ok(backwards[1].acceptedAt < backwards[0].acceptedAt);
  assert.equal((await acceptBoth(record(backwards))).recordedTimesAreProof, false);
  for (const acceptedAt of [fixture.acceptedAt - 1, fixture.acceptedAt + 120]) {
    const entries = clone(fixedEntries); entries[0].acceptedAt = acceptedAt;
    await rejectBoth(record(entries), { writer: 'OUTSIDE_WINDOW' });
  }
  for (const acceptedAt of [-1, 1.5, '1700000000', 253402300800]) {
    const entries = clone(fixedEntries); entries[0].acceptedAt = acceptedAt;
    await rejectBoth(record(entries));
  }
  await rejectBoth(fixedRecord.replace('"acceptedAt":1700000000', '"acceptedAt":-0'));
});

test('independent settlement rejects underfunding, exhausted funds, empty pools and recipient overflow', async () => {
  const cases = [
    ['4999999999999999999999', null, 'INSUFFICIENT_BALANCE'],
    ['5000000000000000000000', null, 'INSUFFICIENT_BALANCE'],
    [null, 'zero-pool', 'UNRESOLVED_POOL'],
    [null, 'overflow', 'AMOUNT_OVERFLOW']
  ];
  for (const [balance, mode, writer] of cases) {
    const seed = clone(fixture.seed);
    if (balance !== null) seed.accounts[0].balance = balance;
    if (mode === 'zero-pool') { seed.accounts[1].stake = '0'; seed.accounts[2].stake = '0'; }
    if (mode === 'overflow') seed.accounts[2].balance = ((1n << 256n) - 1n).toString();
    await rejectBoth(record(fixedEntries, freshHistory(seed)), { writer });
  }
});

test('unsigned transfers charge zero and cannot restore an invalidated signing binding', async () => {
  const final = JSON.parse((await acceptBoth(fixedRecord)).canonicalText);
  const receipt = final.snapshot.receipts[2];
  assert.equal(receipt.fee, '0'); assert.deepEqual(receipt.allocations, []);
  assert.equal(final.snapshot.accounts.pioneer.controller, 'device-next');
  assert.equal(final.snapshot.accounts.pioneer.epoch, 1); assert.equal(final.snapshot.accounts.pioneer.nonce, 3);
  await rejectBoth(record([{ kind: 'unsigned-fixture-transfer', newController: 'device-a' }]), { writer: 'NO_CHANGE' });
  await rejectBoth(record([...fixedEntries, { kind: 'signed-caw', packet: signedAction({ nonce: 3 }), acceptedAt: fixture.acceptedAt }]), { writer: 'WRONG_AUTHORITY' });
  const returned = [...fixedEntries, { kind: 'unsigned-fixture-transfer', newController: 'device-a' },
    { kind: 'signed-caw', packet: signedAction({ nonce: 4, epoch: 2 }), acceptedAt: fixture.acceptedAt }];
  await rejectBoth(record(returned), { writer: 'WRONG_AUTHORITY' });
  for (const newController of ['device-', 'Device-a', 'device-a\n', 'device-' + 'x'.repeat(41)]) await rejectBoth(record([{ kind: 'unsigned-fixture-transfer', newController }]));
});

test('seed validation rejects ambiguous amounts, duplicate identities, bad posts and collisions', async () => {
  const seeds = [];
  for (const patch of [{ balance: '01' }, { balance: '1\n' }, { balance: 1 }, { balance: (1n << 256n).toString() }, { stake: '1000001' }, { stake: '-1' }, { name: 'Pioneer' }, { controller: 'device-a\n' }]) {
    const seed = clone(fixture.seed); Object.assign(seed.accounts[0], patch); seeds.push(seed);
  }
  const duplicate = clone(fixture.seed); duplicate.accounts.push(clone(duplicate.accounts[0])); seeds.push(duplicate);
  const unknown = clone(fixture.seed); unknown.posts.push({ id: 'seed-post', author: 'absent', text: 'Text', time: 'Before' }); seeds.push(unknown);
  const repeated = clone(fixture.seed); repeated.posts = [{ id: 'seed-post', author: 'pioneer', text: 'Text', time: 'Before' }, { id: 'seed-post', author: 'signal', text: 'Again', time: 'Before' }]; seeds.push(repeated);
  const collision = clone(fixture.seed); collision.posts.push({ id: 'post-signed-pioneer-0', author: 'pioneer', text: 'Earlier', time: 'Before' }); seeds.push(collision);
  for (const text of ['x'.repeat(421), '\ud800', '\udc00', ' \n']) {
    const seed = clone(fixture.seed); seed.posts.push({ id: 'seed-post', author: 'pioneer', text, time: 'Before' }); seeds.push(seed);
  }
  for (const seed of seeds) await rejectBoth(record(fixedEntries, freshHistory(seed)));
  // Rehashing altered initial snapshots must not bypass the empty-history gate.
  // The retained final fingerprint is the correct original EMPTY history: a
  // consumer that silently discards the forged snapshot would otherwise pass.
  const final = JSON.parse(fixture.expected_final_history);
  const alterSnapshot = [
    snapshot => { snapshot.accounts.pioneer.balance = '20000000000000000000001'; },
    snapshot => { snapshot.accounts.pioneer.nonce = 1; },
    snapshot => { snapshot.accounts.pioneer.epoch = 1; },
    snapshot => { snapshot.poolDust = '1'; },
    snapshot => { snapshot.receipts.push(clone(final.snapshot.receipts[0])); },
    snapshot => { snapshot.posts.push(clone(final.snapshot.posts[0])); },
    snapshot => { snapshot.follows.push({ actor: 'pioneer', target: 'keeper' }); },
    snapshot => { snapshot.likes.push({ actor: 'pioneer', postId: 'post-signed-pioneer-0' }); },
    snapshot => { snapshot.recaws.push({ actor: 'pioneer', postId: 'post-signed-pioneer-0' }); }
  ];
  for (const alter of alterSnapshot) {
    const initial = JSON.parse(fixture.initial_history); alter(initial.snapshot);
    const text = record([], sorted(initial));
    await rejectBoth(text, { checkpoint: checkpoint(text, fixture.initial_history), reader: 'HISTORY_INITIAL_HISTORY', writer: 'SNAPSHOT_MISMATCH' });
  }
});

test('fresh seed posts and optional descriptive fields survive exact independent reconstruction', async () => {
  const seed = clone(fixture.seed);
  seed.description = 'Synthetic source text only.'; seed.policies = ['Provisional weights.', 'Exact e\u0301 and \u{1f426}.'];
  seed.posts = [{ id: 'seed-post', author: 'keeper', text: 'A\u0000\u001b\t\nB', time: 'Before session' }];
  const initial = freshHistory(seed);
  const result = await acceptBoth(record([], initial), initial);
  assert.equal(result.entryCount, 0); assert.equal(result.signedActions, 0);
  assert.equal(JSON.parse(result.canonicalText).snapshot.posts[0].text, seed.posts[0].text);
  const bounded = clone(seed);
  while (bounded.accounts.length < 32) { const n = bounded.accounts.length; bounded.accounts.push({ name: 'account' + n, controller: 'device-' + n, balance: '0', stake: '0' }); }
  bounded.posts = Array.from({ length: 128 }, (_, n) => ({ id: 'seed-' + n, author: 'keeper', text: 'Seed ' + n, time: 'Before' }));
  const atLimit = freshHistory(bounded);
  await acceptBoth(record([], atLimit), atLimit);
  bounded.accounts.push({ name: 'overflow', controller: 'device-overflow', balance: '0', stake: '0' });
  await rejectBoth(record([], freshHistory(bounded)));
});

test('inherited history and delegated or owner-granted formats are explicit unsupported scope', async () => {
  const inherited = applyAction(createState(fixture.seed), { id: 'prior', kind: 'caw', actor: 'pioneer', controller: 'device-a', epoch: 0, nonce: 0, text: 'Unsigned inherited event.' });
  const initial = canonicalExport(inherited), text = record([], initial), comparison = checkpoint(text, initial);
  assert.equal((await verifyLabRecord(text, comparison, fixture.binding)).inheritedEvents, 1);
  assert.throws(() => inspectSignedHistory(text, comparison, fixture.binding), coded('HISTORY_INHERITED'));
  for (const format of ['caw-delegated-lab-record-v1', 'caw-owner-granted-lab-record-v1', 'caw-owner-granted-lab-record-v2', 'unknown-format']) {
    const altered = JSON.parse(fixedRecord); altered.format = format;
    const unsupported = JSON.stringify(altered);
    assert.throws(() => inspectSignedHistory(unsupported, checkpoint(unsupported), fixture.binding), coded('HISTORY_FORMAT'));
  }
  const empty = record([], fixture.initial_history), emptyCheckpoint = checkpoint(empty, fixture.initial_history);
  for (const domain of ['grant-reserved', 'ownergrant-reserved']) {
    await rejectBoth(empty, { checkpoint: emptyCheckpoint, binding: { ...fixture.binding, domain } });
  }
});

test('numeric account keys retain JSON enumeration while allocation order is lexical and constructor is valid', async t => {
  const seed = { version: 1, scenario: 'appendix-demo-v1', accounts: [
    { name: 'constructor', controller: 'device-constructor', balance: '10000000000000000000000', stake: '9' },
    { name: '2', controller: 'device-two', balance: '0', stake: '1' },
    { name: '10', controller: 'device-ten', balance: '0', stake: '1' },
    { name: '01', controller: 'device-zeroone', balance: '0', stake: '1' }
  ], posts: [] };
  const binding = { ...fixture.binding, account: 'constructor', controller: 'device-constructor' };
  const ledger = createSignedLedger(createState(seed), binding, () => fixture.acceptedAt); t.after(() => ledger.revoke());
  await ledger.accept(signedAction({ account: 'constructor', controller: 'device-constructor' }));
  const saved = ledger.exportRecord();
  const result = await acceptBoth(saved.recordText, saved.canonicalText, binding);
  const snapshot = JSON.parse(result.canonicalText).snapshot;
  assert.deepEqual(Object.keys(snapshot.accounts), ['2', '10', '01', 'constructor']);
  assert.deepEqual(snapshot.receipts[0].allocations, [
    { account: '01', amount: '1666666666666666666666', reason: 'stake-pool' },
    { account: '10', amount: '1666666666666666666666', reason: 'stake-pool' },
    { account: '2', amount: '1666666666666666666666', reason: 'stake-pool' }
  ]);
  assert.equal(snapshot.accounts.constructor.balance, '5000000000000000000000');
  for (const name of ['2', '10', '01']) assert.equal(snapshot.accounts[name].balance, '1666666666666666666666');
  assert.equal(snapshot.poolDust, '2');
});

test('matching editable checkpoints establish consistency without freshness or original-source authority', async () => {
  const rollback = record([], fixture.initial_history);
  await rejectBoth(rollback, { checkpoint: fixedCheckpoint });
  const result = await acceptBoth(rollback, fixture.initial_history);
  assert.equal(result.freshnessProven, false); assert.equal(result.authorityProven, false);
  const changedSeed = clone(fixture.seed); changedSeed.accounts[0].balance = '21000000000000000000000';
  const rewritten = freshHistory(changedSeed);
  const selfConsistent = await acceptBoth(record([], rewritten), rewritten);
  assert.equal(selfConsistent.ownershipProven, false); assert.equal(selfConsistent.livePermissionRestored, false);
});

test('64 transfer entries are inspectable and a 65th entry exceeds the shared ordinary-record bound', async t => {
  const signer = await createDemoSigner(); t.after(() => signer.revoke());
  const binding = { ...fixture.binding, publicKey: signer.publicKey };
  const ledger = createSignedLedger(createState(fixture.seed), binding, () => fixture.acceptedAt); t.after(() => ledger.revoke());
  for (let n = 0; n < 64; n += 1) ledger.simulateTransfer(n % 2 ? 'device-a' : 'device-next');
  const saved = ledger.exportRecord();
  const checked = await acceptBoth(saved.recordText, saved.canonicalText, binding);
  assert.equal(checked.entryCount, 64); assert.equal(checked.fixtureTransfers, 64); assert.equal(checked.signedActions, 0);
  const altered = JSON.parse(saved.recordText); altered.entries.push({ kind: 'unsigned-fixture-transfer', newController: 'device-next' });
  await rejectBoth(JSON.stringify(altered), { binding, checkpoint: checkpoint(JSON.stringify(altered), saved.canonicalText) });
});

test('record and initial-history limits apply to UTF-8 bytes before reconstruction', async () => {
  const maximum = 2 * 1024 * 1024;
  const unicode = '\u{1f426}'.repeat(maximum / 4 + 1);
  assert.ok(unicode.length < maximum); assert.ok(Buffer.byteLength(unicode) > maximum);
  for (const text of [' '.repeat(maximum + 1), unicode]) await rejectBoth(text, { checkpoint: fixedCheckpoint });
  const tooLargeInitial = record([], ' '.repeat(1024 * 1024 + 1));
  await rejectBoth(tooLargeInitial);
  const malformed = record([], fixture.initial_history.replace('"pioneer"', '"pioneer\\ud800"'));
  await rejectBoth(malformed);
});
