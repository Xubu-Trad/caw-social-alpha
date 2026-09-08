import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { createState } from '../public/model.mjs';
import { createDemoSigner } from '../public/signatures.mjs';
import { createSignedLedger } from '../public/signed-ledger.mjs';
import { copyDelegation, bindDelegation } from '../public/delegation.mjs';
import { makeOwnerGrant, makeOwnerRevocation, createOwnerGrantSigner, verifyOwnerGrant, verifyOwnerRevocation } from '../public/owner-grant.mjs';
import { createLabRecordCheckpoint, verifyLabRecord } from '../public/signed-record.mjs';
import { inspectSignedHistory, inspectGrantedHistory } from '../reference/independent-history-reader.mjs';
import { copyPermissionTerms, copyPermissionAuthority, inspectDelegatedPermission, inspectOwnerGrant, inspectOwnerCancellation } from '../reference/independent-permission-reader.mjs';

// Both disclosed seeds are PUBLIC SYNTHETIC TEST MATERIAL, never wallet secrets.
// Fixed commitment/signing bytes and expected accounting come from literal
// fixtures. Writer helpers are used only on the comparison side of these tests.
const f = JSON.parse(readFileSync(new URL('../reference/fixtures/permission-history-v1.json', import.meta.url), 'utf8'));
const h = JSON.parse(readFileSync(new URL('../reference/fixtures/history-v1.json', import.meta.url), 'utf8'));
const privateKey = seed => createPrivateKey({ key: Buffer.from('302e020100300506032b657004220420' + seed, 'hex'), format: 'der', type: 'pkcs8' });
const ownerKey = privateKey(f.owner.public_test_seed_hex), delegateKey = privateKey(f.delegate.public_test_seed_hex);
const clone = value => JSON.parse(JSON.stringify(value));
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const signature = (bytes, key = ownerKey) => sign(null, bytes, key).toString('hex');
const coded = expected => error => error instanceof Error && (expected ? error.code === expected : typeof error.code === 'string');
const fixedOwnerPacket = JSON.stringify({ grant: JSON.parse(f.grant.canonical_body), signature: signature(Buffer.from(f.grant.signing_utf8_hex, 'hex')) });
const fixedCancellation = JSON.stringify({ revocation: JSON.parse(f.cancellation.canonical_body), signature: signature(Buffer.from(f.cancellation.signing_utf8_hex, 'hex')) });
const permission = patch => ({ scope: 'caw', budget: f.permission.budget, notBefore: f.permission.notBefore, expiresAt: f.permission.expiresAt, ...patch });
function orderedGrant(authority, terms, publicKey = f.delegate.public_key_hex) {
  return { version: 1, network: 'simulation', deployment: 'unconnected-lab', scenario: 'appendix-demo-v1', fee: '5000000000000000000000',
    ownerDomain: authority.domain, account: authority.account, controller: authority.controller, epoch: authority.epoch,
    ownerKey: authority.publicKey, delegateKey: publicKey, scope: terms.scope, budget: terms.budget, notBefore: terms.notBefore, expiresAt: terms.expiresAt };
}
function ownerPacket(grant, prefix = 'CAW_LOCAL_OWNER_GRANT_V1\n', key = ownerKey) {
  return JSON.stringify({ grant, signature: signature(Buffer.from(prefix + JSON.stringify(grant)), key) });
}
function cancellationPacket(revocation, prefix = 'CAW_LOCAL_OWNER_REVOCATION_V1\n', key = ownerKey) {
  return JSON.stringify({ revocation, signature: signature(Buffer.from(prefix + JSON.stringify(revocation)), key) });
}
function delegationBinding(terms, identity = h.binding) {
  const body = { account: identity.account, controller: identity.controller, epoch: identity.epoch, publicKey: identity.publicKey,
    network: 'simulation', deployment: 'unconnected-lab', scenario: 'appendix-demo-v1', fee: '5000000000000000000000',
    scope: terms.scope, budget: terms.budget, notBefore: terms.notBefore, expiresAt: terms.expiresAt };
  return { domain: 'grant-' + hash('CAW_LOCAL_DELEGATION_V1\n' + JSON.stringify(body)), account: identity.account,
    controller: identity.controller, epoch: identity.epoch, publicKey: identity.publicKey };
}
function actionPacket(binding, index = 0, patch = {}) {
  const action = { ...h.actions[Math.min(index, 1)], domain: binding.domain, nonce: index, ...patch };
  return JSON.stringify({ action, publicKey: f.delegate.public_key_hex,
    signature: signature(Buffer.from('CAW_LOCAL_SIGNED_ACTION_V1\n' + JSON.stringify(action)), delegateKey) });
}
function fingerprint(text, finalHistory = h.expected_final_history) {
  let entryCount = 3;
  try { const value = JSON.parse(text); if (Array.isArray(value?.entries)) entryCount = value.entries.length; } catch { /* bounded malformed fixture */ }
  return { format: 'caw-signed-lab-checkpoint-v1', entryCount, byteLength: Buffer.byteLength(text), sha256: hash(text), finalHistorySha256: hash(finalHistory) };
}
function bundle(mode = 'owner', options = {}) {
  const terms = permission(options.permission), authority = { ...f.owner_authority, ...options.authority };
  const grant = orderedGrant(authority, terms), grantText = 'CAW_LOCAL_OWNER_GRANT_V1\n' + JSON.stringify(grant);
  const binding = mode === 'delegated' ? delegationBinding(terms) : {
    domain: 'ownergrant-' + hash(grantText), account: authority.account, controller: authority.controller, epoch: authority.epoch, publicKey: f.delegate.public_key_hex
  };
  const grantPacket = ownerPacket(grant);
  const revocation = { version: 1, network: 'simulation', deployment: 'unconnected-lab', scenario: 'appendix-demo-v1',
    ownerDomain: authority.domain, account: authority.account, controller: authority.controller, epoch: authority.epoch, ownerKey: authority.publicKey, grantDomain: binding.domain };
  const cancellation = mode === 'delegated' ? undefined : cancellationPacket(revocation);
  const entries = h.actions.map((_, index) => ({ kind: 'signed-caw', packet: actionPacket(binding, index), acceptedAt: h.acceptedAt }));
  entries.push({ kind: 'unsigned-fixture-transfer', newController: 'device-next' });
  if (mode === 'cancelled') entries.push({ kind: 'signed-owner-revocation', packet: cancellation });
  const value = { format: mode === 'delegated' ? 'caw-delegated-lab-record-v1' : mode === 'owner' ? 'caw-owner-granted-lab-record-v1' : 'caw-owner-granted-lab-record-v2',
    initialHistory: h.initial_history, delegation: terms, ...(mode === 'delegated' ? {} : { ownerGrant: grantPacket }), entries };
  const recordText = JSON.stringify(value);
  return { mode, recordText, checkpoint: fingerprint(recordText), binding, permission: terms, authority,
    grant, grantPacket, cancellation, finalHistory: h.expected_final_history };
}
function repack(b, value, finalHistory = b.finalHistory) {
  const recordText = typeof value === 'string' ? value : JSON.stringify(value);
  return { ...b, recordText, checkpoint: fingerprint(recordText, finalHistory), finalHistory };
}
function independent(b) {
  return b.mode === 'delegated' ? inspectGrantedHistory(b.recordText, b.checkpoint, b.binding, b.permission) :
    inspectGrantedHistory(b.recordText, b.checkpoint, b.binding, b.permission, b.authority);
}
function original(b) { return verifyLabRecord(b.recordText, b.checkpoint, b.binding, b.permission, b.mode === 'delegated' ? undefined : b.authority); }
async function accepts(b, spent = '10000000000000000000000') {
  const read = independent(b), written = await original(b);
  assert.equal(read.canonicalText, b.finalHistory); assert.equal(written.canonicalText, b.finalHistory);
  assert.deepEqual(read.delegation, { permission: { ...b.permission }, spent, remaining: (BigInt(b.permission.budget) - BigInt(spent)).toString() });
  assert.deepEqual(written.delegation, read.delegation);
  assert.ok(Object.isFrozen(read)); assert.ok(Object.isFrozen(read.delegation)); assert.ok(Object.isFrozen(read.delegation.permission));
  for (const key of ['recordedTimesAreProof', 'ownershipProven', 'authorityProven', 'freshnessProven', 'livePermissionRestored']) assert.equal(read[key], false, key);
  if (b.mode !== 'delegated') { assert.equal(read.ownerGrantVerified, true); assert.equal(read.ownerRevoked, b.mode === 'cancelled'); assert.equal(read.ownerRevocations, b.mode === 'cancelled' ? 1 : 0); }
  return read;
}
async function rejects(b, writer) { assert.throws(() => independent(b), coded()); await assert.rejects(original(b), coded(writer)); }

test('permission reader imports only native primitives and independent reference code', () => {
  const source = readFileSync(new URL('../reference/independent-permission-reader.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.ok(imports.length > 0);
  assert.ok(imports.every(name => ['node:crypto', 'node:buffer', './independent-action-reader.mjs'].includes(name)), imports.join(', '));
  assert.doesNotMatch(source, /\bimport\s*\(|\brequire\s*\(/);
});

test('literal fixture fixes distinct public keys, exact commitment bytes and three signing contexts', () => {
  assert.equal(f.public_test_material, true); assert.equal(f.not_a_wallet_or_production_key, true);
  assert.match(f.notice, /PUBLIC SYNTHETIC TEST MATERIAL/); assert.notEqual(f.owner.public_key_hex, f.delegate.public_key_hex);
  for (const [material, key] of [[f.owner, ownerKey], [f.delegate, delegateKey]]) {
    assert.equal(createPublicKey(key).export({ format: 'der', type: 'spki' }).toString('hex'), '302a300506032b6570032100' + material.public_key_hex);
  }
  for (const part of [f.delegation, f.grant, f.cancellation]) {
    const text = part.commitment_text ?? part.signing_text, bytes = Buffer.from(part.commitment_utf8_hex ?? part.signing_utf8_hex, 'hex');
    assert.equal(bytes.toString('utf8'), text); assert.equal(bytes.length, part.byte_length);
    if (part.sha256) assert.equal(hash(text), part.sha256);
  }
  assert.equal(f.delegation.byte_length, 368); assert.equal(f.grant.byte_length, 495); assert.equal(f.cancellation.byte_length, 385);
  assert.equal(f.delegated_binding.domain, 'grant-' + f.delegation.sha256);
  assert.equal(f.owner_granted_binding.domain, 'ownergrant-' + f.grant.sha256);
  assert.deepEqual(bundle('delegated').binding, f.delegated_binding);
  assert.deepEqual(bundle('owner').binding, f.owner_granted_binding);
  assert.equal(bundle('owner').grantPacket, fixedOwnerPacket); assert.equal(bundle('cancelled').cancellation, fixedCancellation);
});

test('literal delegation commitment agrees with the writer without binding its discarded input domain', async () => {
  assert.deepEqual(await bindDelegation({ ...h.binding, domain: 'another-unbound-input' }, f.permission), f.delegated_binding);
  const result = inspectDelegatedPermission(f.delegated_binding, f.permission);
  assert.deepEqual(result.binding, f.delegated_binding); assert.deepEqual(result.permission, f.permission); assert.equal(result.domainMatched, true);
  assert.equal(result.authorityProven, false); assert.equal(result.freshnessProven, false); assert.equal(result.livePermissionRestored, false);
  assert.equal(Object.hasOwn(JSON.parse(f.delegation.canonical_body), 'domain'), false);
  const changed = { ...f.permission, budget: '10000000000000000000001' };
  assert.notEqual(delegationBinding(changed).domain, f.delegated_binding.domain);
  assert.throws(() => inspectDelegatedPermission(f.delegated_binding, changed), coded());
});

test('literal owner grant and cancellation verify in both implementations with supplied authority', async () => {
  assert.deepEqual(makeOwnerGrant(f.owner_authority, f.delegate.public_key_hex, f.permission), f.grant.body);
  const independentGrant = inspectOwnerGrant(fixedOwnerPacket, f.owner_authority), written = await verifyOwnerGrant(fixedOwnerPacket, f.owner_authority);
  assert.deepEqual(independentGrant.binding, f.owner_granted_binding); assert.deepEqual(written.binding, independentGrant.binding);
  assert.deepEqual(independentGrant.permission, written.delegation); assert.equal(independentGrant.ownerGrantVerified, true);
  assert.equal(independentGrant.binding.domain, 'ownergrant-' + hash(f.grant.signing_text));
  assert.deepEqual(makeOwnerRevocation(f.owner_authority, f.owner_granted_binding.domain), f.cancellation.body);
  const cancellation = inspectOwnerCancellation(fixedCancellation, f.owner_authority, f.owner_granted_binding.domain);
  assert.deepEqual(cancellation.revocation, await verifyOwnerRevocation(fixedCancellation, f.owner_authority, f.owner_granted_binding.domain));
  assert.equal(cancellation.ownerRevocationVerified, true); assert.equal(cancellation.authorityProven, false);
});

test('delegated, owner-granted and cancelled fixed histories preserve alpha13 literal accounting', async () => {
  for (const mode of ['delegated', 'owner', 'cancelled']) {
    const result = await accepts(bundle(mode));
    assert.equal(result.signedActions, 2); assert.equal(result.fixtureTransfers, 1); assert.equal(result.inheritedEvents, 0);
    assert.equal(result.entryCount, mode === 'cancelled' ? 4 : 3);
    const final = JSON.parse(result.canonicalText); assert.equal(final.expectedEventCount, 3); assert.equal(final.snapshot.poolDust, '2');
    assert.equal(final.snapshot.accounts.pioneer.nonce, 3); assert.equal(final.snapshot.accounts.pioneer.balance, '10000000000000000000000');
  }
});

test('native owner and action writers interoperate with independent grant and cancelled-history inspection', async t => {
  const owner = await createOwnerGrantSigner(), delegate = await createDemoSigner(); t.after(() => { owner.revoke(); delegate.revoke(); });
  const authority = { ...f.owner_authority, publicKey: owner.publicKey };
  const grant = makeOwnerGrant(authority, delegate.publicKey, f.permission), packet = await owner.sign(grant);
  const read = inspectOwnerGrant(packet, authority), verified = await verifyOwnerGrant(packet, authority);
  assert.deepEqual(read.binding, verified.binding);
  const ledger = createSignedLedger(createState(h.seed), read.binding, () => h.acceptedAt, f.permission, { packet, authority }); t.after(() => ledger.revoke());
  for (const action of h.actions) await ledger.accept(await delegate.sign({ ...action, domain: read.binding.domain }));
  ledger.simulateTransfer('device-next');
  const cancellation = await owner.signRevocation(makeOwnerRevocation(authority, read.binding.domain));
  assert.equal(inspectOwnerCancellation(cancellation, authority, read.binding.domain).ownerRevocationVerified, true);
  await ledger.applyOwnerRevocation(cancellation); const saved = ledger.exportRecord();
  const comparison = await createLabRecordCheckpoint(saved.recordText, saved.canonicalText);
  const result = inspectGrantedHistory(saved.recordText, comparison, saved.binding, saved.delegation, saved.ownerAuthority);
  assert.equal(result.canonicalText, h.expected_final_history); assert.equal(result.ownerRevoked, true); assert.equal(result.delegation.remaining, '0');
});

test('permission schema permits positive sub-fee or nonmultiple budgets but keeps exact bounds', () => {
  for (const budget of ['1', '4999999999999999999999', '5000000000000000000001', '320000000000000000000000']) {
    const terms = permission({ budget }); assert.deepEqual(copyPermissionTerms(terms), copyDelegation(terms));
  }
  const invalid = [
    { scope: 'withdraw' }, { scope: 'like' }, { budget: '0' }, { budget: '01' }, { budget: 1 }, { budget: '1\n' },
    { budget: '320000000000000000000001' }, { notBefore: -0 }, { notBefore: -1 }, { notBefore: '1700000000' },
    { expiresAt: 1700000000 }, { expiresAt: 1700000301 }, { expiresAt: 253402300800 }, { expiresAt: 1700000120.5 }
  ];
  for (const patch of invalid) { const terms = permission(patch); assert.throws(() => copyPermissionTerms(terms), coded()); assert.throws(() => copyDelegation(terms), coded()); }
});

test('recomputed records cannot overspend a correctly bound budget or widen old grants', async () => {
  for (const mode of ['delegated', 'owner']) {
    for (const budget of ['1', '4999999999999999999999', '9999999999999999999999']) await rejects(bundle(mode, { permission: { budget } }), 'PERMISSION_BUDGET');
    const b = bundle(mode), value = JSON.parse(b.recordText);
    value.entries.splice(2, 0, { kind: 'signed-caw', packet: actionPacket(b.binding, 2), acceptedAt: h.acceptedAt });
    await rejects(repack(b, value), 'PERMISSION_BUDGET');
    const widened = JSON.parse(b.recordText); widened.delegation.budget = '15000000000000000000000';
    const changed = repack({ ...b, permission: widened.delegation }, widened);
    await rejects(changed, mode === 'delegated' ? 'PERMISSION_BINDING' : 'OWNER_GRANT_MISMATCH');
  }
});

test('full signed action windows must fit permission windows, even when acceptance time fits', async () => {
  for (const mode of ['delegated', 'owner']) {
    const b = bundle(mode);
    for (const patch of [{ notBefore: h.acceptedAt - 1 }, { expiresAt: h.acceptedAt + 121 }]) {
      const value = JSON.parse(b.recordText); value.entries[0].packet = actionPacket(b.binding, 0, patch);
      await rejects(repack(b, value), 'PERMISSION_WINDOW');
    }
    for (const acceptedAt of [h.acceptedAt - 1, h.acceptedAt + 120]) {
      const value = JSON.parse(b.recordText); value.entries[0].acceptedAt = acceptedAt; await rejects(repack(b, value), 'OUTSIDE_WINDOW');
    }
  }
});

test('canonical grant and cancellation packets reject duplicates, ordering, alternate escapes and negative zero', async () => {
  for (const [fixed, inspect, verify] of [
    [fixedOwnerPacket, text => inspectOwnerGrant(text, f.owner_authority), text => verifyOwnerGrant(text, f.owner_authority)],
    [fixedCancellation, text => inspectOwnerCancellation(text, f.owner_authority, f.owner_granted_binding.domain), text => verifyOwnerRevocation(text, f.owner_authority, f.owner_granted_binding.domain)]
  ]) {
    const parsed = JSON.parse(fixed), field = Object.hasOwn(parsed, 'grant') ? 'grant' : 'revocation';
    const extra = clone(parsed); extra[field].instruction = 'untrusted extra field';
    const variants = [' ' + fixed, fixed + '\n', JSON.stringify(parsed, null, 2), JSON.stringify({ signature: parsed.signature, [field]: parsed[field] }),
      fixed.replace('"version":1', '"version":1,"version":1'), fixed.replace('"version":1', '"version":1.0'),
      fixed.replace('"epoch":0', '"epoch":-0'), fixed.replace('"pioneer"', '"\\u0070ioneer"'), JSON.stringify(extra),
      fixed.replace('"signature"', '"\\u0073ignature"')];
    for (const text of variants) { assert.notEqual(text, fixed); assert.throws(() => inspect(text), coded()); await assert.rejects(verify(text), coded()); }
  }
});

test('altered signatures, wrong signing prefixes and delegate-signed owner packets fail cryptography', async () => {
  const grantVariants = [ownerPacket(f.grant.body, ''), ownerPacket(f.grant.body, 'CAW_LOCAL_SIGNED_ACTION_V1\n'), ownerPacket(f.grant.body, 'CAW_LOCAL_OWNER_GRANT_V1\n', delegateKey)];
  const changedGrant = JSON.parse(fixedOwnerPacket); changedGrant.grant.budget = '10000000000000000000001'; grantVariants.push(JSON.stringify(changedGrant));
  for (const text of grantVariants) { assert.throws(() => inspectOwnerGrant(text, f.owner_authority), coded()); await assert.rejects(verifyOwnerGrant(text, f.owner_authority), coded('INVALID_OWNER_SIGNATURE')); }
  for (const text of [cancellationPacket(f.cancellation.body, ''), cancellationPacket(f.cancellation.body, 'CAW_LOCAL_OWNER_GRANT_V1\n'), cancellationPacket(f.cancellation.body, 'CAW_LOCAL_OWNER_REVOCATION_V1\n', delegateKey)]) {
    assert.throws(() => inspectOwnerCancellation(text, f.owner_authority, f.owner_granted_binding.domain), coded());
    await assert.rejects(verifyOwnerRevocation(text, f.owner_authority, f.owner_granted_binding.domain), coded('INVALID_REVOCATION_SIGNATURE'));
  }
});

test('owner authority, distinct keys and complete context cannot be nominated by a submitted grant', async () => {
  for (const patch of [{ domain: 'other-owner' }, { account: 'signal' }, { controller: 'device-other' }, { epoch: 1 }, { publicKey: f.delegate.public_key_hex }]) {
    const authority = { ...f.owner_authority, ...patch };
    assert.throws(() => inspectOwnerGrant(fixedOwnerPacket, authority), coded()); await assert.rejects(verifyOwnerGrant(fixedOwnerPacket, authority), coded('WRONG_OWNER_AUTHORITY'));
  }
  const sameKey = { ...f.grant.body, delegateKey: f.owner.public_key_hex };
  assert.throws(() => inspectOwnerGrant(ownerPacket(sameKey), f.owner_authority), coded());
  await assert.rejects(verifyOwnerGrant(ownerPacket(sameKey), f.owner_authority), coded('DISTINCT_KEYS'));
  for (const patch of [{ version: 2 }, { network: 'mainnet' }, { deployment: 'live' }, { scenario: 'other' }, { fee: '1' }, { ownerKey: f.owner.public_key_hex.toUpperCase() }, { delegateKey: '00' }]) {
    const packet = ownerPacket({ ...f.grant.body, ...patch }); assert.throws(() => inspectOwnerGrant(packet, f.owner_authority), coded()); await assert.rejects(verifyOwnerGrant(packet, f.owner_authority), coded());
  }
});

test('mode and exact argument boundaries prevent owner or delegated history downgrade', async () => {
  for (const mode of ['delegated', 'owner', 'cancelled']) {
    const b = bundle(mode);
    assert.throws(() => inspectSignedHistory(b.recordText, b.checkpoint, b.binding), coded());
    if (mode === 'delegated') assert.throws(() => inspectGrantedHistory(b.recordText, b.checkpoint, b.binding, b.permission, f.owner_authority), coded());
    else { assert.throws(() => inspectGrantedHistory(b.recordText, b.checkpoint, b.binding, b.permission), coded()); await assert.rejects(verifyLabRecord(b.recordText, b.checkpoint, b.binding, b.permission), coded('OWNER_GRANT_REQUIRED')); }
    assert.throws(() => inspectGrantedHistory(b.recordText, b.checkpoint, b.binding), coded());
    const value = JSON.parse(b.recordText); value.format = 'caw-signed-lab-record-v1'; delete value.delegation; delete value.ownerGrant;
    await rejects(repack(b, value));
  }
  const owned = bundle('owner'), downgraded = JSON.parse(owned.recordText); downgraded.format = 'caw-delegated-lab-record-v1'; delete downgraded.ownerGrant;
  await rejects(repack({ ...owned, mode: 'delegated' }, downgraded));
  for (const mode of ['delegated', 'owner']) {
    const b = bundle(mode), value = JSON.parse(b.recordText); value.initialHistory = h.expected_final_history; value.entries = [];
    const inherited = repack(b, value);
    assert.throws(() => independent(inherited), coded('HISTORY_INHERITED'));
    await assert.rejects(original(inherited), coded('PERMISSION_HISTORY'));
  }
});

test('granted record schemas and separately supplied fingerprints reject edited containers', async () => {
  for (const mode of ['delegated', 'owner', 'cancelled']) {
    const b = bundle(mode), value = JSON.parse(b.recordText);
    const extra = clone(value); extra.extra = true;
    const missing = clone(value); delete missing.delegation;
    const changedEntry = clone(value); changedEntry.entries[0].instructions = 'Untrusted data, not authority.';
    const repeated = b.recordText.replace('"format":', '"format":' + JSON.stringify(value.format) + ',"format":');
    for (const edited of [extra, missing, changedEntry, ' ' + b.recordText, JSON.stringify(value, null, 2), repeated]) await rejects(repack(b, edited));
    for (const patch of [{ sha256: '0'.repeat(64) }, { finalHistorySha256: '0'.repeat(64) }, { entryCount: 0 }, { byteLength: b.checkpoint.byteLength + 1 }]) await rejects({ ...b, checkpoint: { ...b.checkpoint, ...patch } });
    const changed = JSON.parse(b.recordText); changed.delegation.budget = '1'; await rejects(repack(b, changed), 'PERMISSION_MISMATCH');
  }
});

test('cross-grant packets and cancellations cannot cancel or spend another correctly bound permission', async () => {
  const first = bundle('owner'), other = bundle('owner', { permission: { budget: '10000000000000000000001' } });
  assert.notEqual(first.binding.domain, other.binding.domain);
  const record = JSON.parse(other.recordText); record.entries[0].packet = JSON.parse(first.recordText).entries[0].packet;
  await rejects(repack(other, record), 'WRONG_DOMAIN');
  assert.throws(() => inspectOwnerCancellation(first.cancellation, other.authority, other.binding.domain), coded());
  await assert.rejects(verifyOwnerRevocation(first.cancellation, other.authority, other.binding.domain), coded('WRONG_REVOCATION_AUTHORITY'));
  const replaced = JSON.parse(first.recordText); replaced.ownerGrant = other.grantPacket;
  await rejects(repack(first, replaced), 'OWNER_GRANT_MISMATCH');
});

test('owner cancellation is exactly one terminal entry and changes no accounting or spending', async () => {
  const b = bundle('cancelled'), value = JSON.parse(b.recordText), stop = value.entries.at(-1), first = value.entries[0];
  const result = await accepts(b); assert.equal(result.ownerRevocations, 1); assert.equal(result.canonicalText, h.expected_final_history);
  for (const entries of [[], value.entries.slice(0, -1), [stop, first], [...value.entries, stop], [...value.entries, first], [...value.entries, { kind: 'unsigned-fixture-transfer', newController: 'device-a' }]]) await rejects(repack(b, { ...value, entries }), 'INVALID_REVOCATION_RECORD');
  await rejects(repack({ ...b, mode: 'owner' }, { ...value, format: 'caw-owner-granted-lab-record-v1' }), 'INVALID_REVOCATION_RECORD');
  const standalone = repack(b, { ...value, entries: [stop] }, h.initial_history);
  const onlyCancellation = await accepts(standalone, '0'); assert.equal(onlyCancellation.signedActions, 0); assert.equal(onlyCancellation.fixtureTransfers, 0); assert.equal(onlyCancellation.entryCount, 1);
});

test('fixture transfers invalidate spending even after return while owner cancellation remains historical journal evidence', async () => {
  for (const mode of ['delegated', 'owner']) {
    const b = bundle(mode), value = JSON.parse(b.recordText);
    value.entries.push({ kind: 'unsigned-fixture-transfer', newController: 'device-a' });
    value.entries.push({ kind: 'signed-caw', packet: actionPacket(b.binding, 4, { epoch: 2 }), acceptedAt: h.acceptedAt });
    await rejects(repack(b, value), 'WRONG_AUTHORITY');
  }
  const cancelled = await accepts(bundle('cancelled'));
  assert.equal(cancelled.fixtureTransfers, 1); assert.equal(cancelled.ownerRevoked, true); assert.equal(cancelled.authorityProven, false);
});

test('non-monotonic recorded times and older uncancelled records do not prove current permission', async () => {
  const before = bundle('owner'), after = bundle('cancelled');
  assert.equal(before.checkpoint.finalHistorySha256, after.checkpoint.finalHistorySha256); assert.notEqual(before.checkpoint.sha256, after.checkpoint.sha256);
  const historic = await accepts(before), cancelled = await accepts(after);
  assert.equal(historic.ownerRevoked, false); assert.equal(cancelled.ownerRevoked, true); assert.equal(historic.freshnessProven, false);
  const backwards = JSON.parse(before.recordText); backwards.entries[0].acceptedAt += 10; backwards.entries[1].acceptedAt += 5;
  assert.equal((await accepts(repack(before, backwards))).recordedTimesAreProof, false);
  await rejects({ ...before, checkpoint: after.checkpoint }, 'CHECKPOINT_MISMATCH');
  const stripped = JSON.parse(after.recordText); stripped.format = 'caw-owner-granted-lab-record-v1'; stripped.entries.pop();
  assert.equal((await accepts(repack(before, stripped))).livePermissionRestored, false);
});

test('data-only permission, owner authority and binding trust reject getters without invoking them', async () => {
  let calls = 0;
  for (const [which, source] of [['permission', f.permission], ['authority', f.owner_authority], ['binding', f.owner_granted_binding], ['checkpoint', bundle('owner').checkpoint]]) {
    const bad = [];
    for (const field of Object.keys(source)) { const value = { ...source }; Object.defineProperty(value, field, { enumerable: true, get() { calls += 1; return source[field]; } }); bad.push(value); }
    const hidden = { ...source }; Object.defineProperty(hidden, Object.keys(source)[0], { enumerable: false });
    bad.push(hidden, Object.create(source), { ...source, extra: true }, { ...source, [Symbol('extra')]: 1 }, { ...source, toJSON() { calls += 1; return source; } });
    for (const value of bad) { const b = bundle('owner'); b[which] = value; await rejects(b); }
  }
  assert.equal(calls, 0);
  assert.deepEqual(copyPermissionTerms(Object.freeze(Object.assign(Object.create(null), f.permission))), f.permission);
  assert.deepEqual(copyPermissionAuthority(Object.freeze(Object.assign(Object.create(null), f.owner_authority))), f.owner_authority);
  const b = bundle('cancelled'); b.permission = Object.freeze(Object.assign(Object.create(null), b.permission)); b.authority = Object.freeze(Object.assign(Object.create(null), b.authority));
  const result = await accepts(b); assert.throws(() => { result.delegation.spent = '0'; }, TypeError);
});

test('reserved-looking owner domains remain valid owner context while spending domains stay committed', async () => {
  for (const domain of ['grant-owner-context', 'ownergrant-owner-context']) {
    const b = bundle('owner', { authority: { domain } });
    const result = inspectOwnerGrant(b.grantPacket, b.authority);
    assert.deepEqual(result.binding, b.binding); assert.ok(b.binding.domain.startsWith('ownergrant-'));
    await accepts(b);
  }
});

test('grant and cancellation packet resource bounds reject malformed and oversized input', async () => {
  for (const text of ['', 'null', '[]', '{}', ' '.repeat(8193), '\u{1f426}'.repeat(2050)]) {
    assert.throws(() => inspectOwnerGrant(text, f.owner_authority), coded()); await assert.rejects(verifyOwnerGrant(text, f.owner_authority), coded());
    assert.throws(() => inspectOwnerCancellation(text, f.owner_authority, f.owner_granted_binding.domain), coded());
    await assert.rejects(verifyOwnerRevocation(text, f.owner_authority, f.owner_granted_binding.domain), coded());
  }
  for (const mode of ['delegated', 'owner', 'cancelled']) {
    const b = bundle(mode), value = JSON.parse(b.recordText); value.entries = Array.from({ length: 66 }, () => ({ kind: 'unsigned-fixture-transfer', newController: 'device-next' }));
    await rejects(repack(b, value));
  }
});

test('64 model changes permit one reserved terminal cancellation, with zero permission spending', async t => {
  const b = bundle('owner'), ledger = createSignedLedger(createState(h.seed), b.binding, () => h.acceptedAt, b.permission, { packet: b.grantPacket, authority: b.authority }); t.after(() => ledger.revoke());
  for (let n = 0; n < 64; n += 1) ledger.simulateTransfer(n % 2 ? 'device-a' : 'device-next');
  await ledger.applyOwnerRevocation(b.cancellation);
  const saved = ledger.exportRecord(), comparison = await createLabRecordCheckpoint(saved.recordText, saved.canonicalText);
  const result = inspectGrantedHistory(saved.recordText, comparison, saved.binding, saved.delegation, saved.ownerAuthority);
  assert.equal(result.entryCount, 65); assert.equal(result.fixtureTransfers, 64); assert.equal(result.ownerRevocations, 1);
  assert.equal(result.canonicalText, saved.canonicalText); assert.equal(result.delegation.spent, '0'); assert.equal(result.delegation.remaining, f.permission.budget);
  assert.equal((await verifyLabRecord(saved.recordText, comparison, saved.binding, saved.delegation, saved.ownerAuthority)).canonicalText, result.canonicalText);
});
