import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify as nodeVerify, webcrypto } from 'node:crypto';
import { canonicalAction, createDemoSigner, createActionVerifier } from '../public/signatures.mjs';

// Literal reference bytes and a separate Node crypto API: no production
// canonicalization helper is used to prepare the cross-API verification input.
const PREFIX = 'CAW_LOCAL_SIGNED_ACTION_V1\n';
const NOW = 1700000000;
const FEE = '5000000000000000000000';
function action(patch = {}) {
  return {
    account: 'alpha', controller: 'device-alpha', deployment: 'unconnected-lab',
    domain: 'caw-test-session-a', epoch: 0, expiresAt: NOW + 120, fee: FEE,
    kind: 'caw', network: 'simulation', nonce: 0, notBefore: NOW,
    scenario: 'appendix-demo-v1', text: 'A local CAW.', version: 1, ...patch,
  };
}
function literalAction(a) {
  return JSON.stringify({
    account: a.account, controller: a.controller, deployment: a.deployment,
    domain: a.domain, epoch: a.epoch, expiresAt: a.expiresAt, fee: a.fee,
    kind: a.kind, network: a.network, nonce: a.nonce, notBefore: a.notBefore,
    scenario: a.scenario, text: a.text, version: a.version,
  });
}
function packetText(a, publicKey, signature) {
  return '{"action":' + literalAction(a) + ',"publicKey":' + JSON.stringify(publicKey)
    + ',"signature":' + JSON.stringify(signature) + '}';
}
function context(signer, patch = {}) {
  return {
    domain: 'caw-test-session-a', account: 'alpha', controller: 'device-alpha',
    epoch: 0, nextNonce: 0, publicKey: signer.publicKey, ...patch,
  };
}
const code = value => error => error?.code === value;
function flipHex(value) {
  return value.slice(0, -1) + (value.at(-1) === '0' ? '1' : '0');
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function holdNativeOperation(t, operation) {
  const entered = deferred(), release = deferred();
  const subtle = globalThis.crypto?.subtle ?? webcrypto.subtle;
  const original = subtle[operation];
  const mocked = t.mock.method(subtle, operation, async function (...args) {
    entered.resolve();
    await release.promise;
    return Reflect.apply(original, this, args);
  });
  t.after(() => { release.resolve(); mocked.mock.restore(); });
  return { entered: entered.promise, release: release.resolve };
}
const holdNativeVerification = t => holdNativeOperation(t, 'verify');

test('signing lab: canonical action uses literal ordered UTF-8 bytes without text normalization', () => {
  const source = Object.freeze(action({ text: 'CAW "quote"\n\te\u0301 é 🐦 \u202e' }));
  const before = literalAction(source);
  const reordered = Object.fromEntries(Object.entries(source).reverse());
  assert.equal(canonicalAction(source), before);
  assert.equal(canonicalAction(reordered), before);
  assert.deepEqual(Buffer.from(canonicalAction(source), 'utf8'), Buffer.from(before, 'utf8'));
  assert.notEqual(canonicalAction(action({ text: 'e\u0301' })), canonicalAction(action({ text: 'é' })));
  assert.equal(literalAction(source), before);
});

test('signing lab: action schema rejects extra, missing, inherited and accessor fields', () => {
  const missing = action();
  delete missing.text;
  const inherited = Object.assign(Object.create({ hidden: true }), action());
  const extra = action({ unexpected: true });
  const symbol = action();
  symbol[Symbol('extra')] = true;
  const hidden = action();
  Object.defineProperty(hidden, 'hidden', { value: true });
  let getterCalls = 0;
  const accessor = action();
  Object.defineProperty(accessor, 'text', { enumerable: true, get() { getterCalls++; return 'CAW'; } });
  for (const input of [null, [], 'CAW', missing, inherited, extra, symbol, hidden, accessor]) {
    assert.throws(() => canonicalAction(input));
  }
  assert.equal(getterCalls, 0);
});

test('signing lab: action bounds reject malformed names, domains, integers, text and fixed fields', () => {
  const patches = [
    { account: '' }, { account: 'Alpha' }, { account: 'a'.repeat(33) }, { account: 'alpha\n' },
    { controller: 'alpha' }, { controller: 'device-' }, { controller: 'device-A' },
    { controller: 'device-' + 'a'.repeat(41) }, { controller: 'device-alpha\n' },
    { domain: '' }, { domain: '-session' }, { domain: 'Session' }, { domain: 'a'.repeat(97) },
    { domain: 'session\n' }, { domain: 'https://example.invalid' },
    { epoch: -1 }, { epoch: 4294967296 }, { epoch: 0.5 }, { epoch: '0' },
    { nonce: -1 }, { nonce: 256 }, { nonce: 0.5 }, { nonce: '0' },
    { notBefore: -1 }, { notBefore: NaN }, { notBefore: Infinity }, { notBefore: '0' },
    { expiresAt: 253402300800 }, { expiresAt: NOW }, { expiresAt: NOW + 301 },
    { expiresAt: NOW + 0.5 }, { expiresAt: '1700000001' },
    { version: 2 }, { version: '1' }, { kind: 'like' }, { network: 'mainnet' },
    { deployment: 'connected' }, { scenario: 'prose-reading' }, { fee: '5000' }, { fee: 5000 },
    { text: '' }, { text: 'a'.repeat(421) }, { text: '\ud800' }, { text: '\udc00' },
    { text: 'a\ud800b' }, { text: 12 },
  ];
  for (const patch of patches) assert.throws(() => canonicalAction(action(patch)), JSON.stringify(patch));
  assert.doesNotThrow(() => canonicalAction(action({
    account: 'a'.repeat(32), controller: 'device-' + 'a'.repeat(40), domain: 'a'.repeat(96),
    epoch: 4294967295, nonce: 255, notBefore: 253402300798, expiresAt: 253402300799,
    text: '🐦'.repeat(420),
  })));
  assert.doesNotThrow(() => canonicalAction(action({ notBefore: 0, expiresAt: 300 })));
});

test('signing lab: generated signature verifies with separate Node API and frozen narrow handles', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  assert.ok(Object.isFrozen(signer));
  assert.deepEqual(Object.keys(signer).sort(), ['publicKey', 'revoke', 'sign']);
  assert.match(signer.publicKey, /^[0-9a-f]{64}$/);
  const source = Object.freeze(action({ text: 'Exact bytes\n\te\u0301 🐦' }));
  const packet = await signer.sign(source);
  const parsed = JSON.parse(packet);
  assert.deepEqual(Object.keys(parsed), ['action', 'publicKey', 'signature']);
  assert.match(parsed.signature, /^[0-9a-f]{128}$/);
  assert.equal(parsed.publicKey, signer.publicKey);
  assert.equal(packet, packetText(source, signer.publicKey, parsed.signature));
  const key = createPublicKey({ format: 'jwk', key: {
    kty: 'OKP', crv: 'Ed25519', x: Buffer.from(signer.publicKey, 'hex').toString('base64url'),
  } });
  assert.equal(nodeVerify(null, Buffer.from(PREFIX + literalAction(source), 'utf8'), key,
    Buffer.from(parsed.signature, 'hex')), true);
  assert.equal(nodeVerify(null, Buffer.from(literalAction(source), 'utf8'), key,
    Buffer.from(parsed.signature, 'hex')), false);
  const verifier = createActionVerifier(Object.freeze(context(signer)), () => NOW);
  t.after(() => verifier.revoke());
  assert.ok(Object.isFrozen(verifier));
  const checked = await verifier.check(packet);
  assert.deepEqual(checked, source);
  assert.ok(Object.isFrozen(checked));
  assert.notEqual(checked, source);
  assert.deepEqual(verifier.status(), { nextNonce: 0, revoked: false });
});

test('signing lab: text or signature tampering fails without consuming the nonce', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  const verifier = createActionVerifier(context(signer), () => NOW);
  t.after(() => verifier.revoke());
  const p = JSON.parse(await signer.sign(action()));
  for (const packet of [
    packetText({ ...p.action, text: p.action.text + '!' }, p.publicKey, p.signature),
    packetText(p.action, p.publicKey, flipHex(p.signature)),
  ]) await assert.rejects(verifier.accept(packet), code('INVALID_SIGNATURE'));
  assert.deepEqual(verifier.status(), { nextNonce: 0, revoked: false });
});

test('signing lab: a separately trusted key rejects packets signed by another generated key', async t => {
  const signer = await createDemoSigner(), other = await createDemoSigner();
  t.after(() => { signer.revoke(); other.revoke(); });
  assert.notEqual(signer.publicKey, other.publicKey);
  const verifier = createActionVerifier(context(signer), () => NOW);
  t.after(() => verifier.revoke());
  await assert.rejects(verifier.accept(await other.sign(action())), code('WRONG_KEY'));
  const forged = JSON.parse(await other.sign(action()));
  forged.publicKey = signer.publicKey;
  await assert.rejects(verifier.accept(packetText(forged.action, forged.publicKey, forged.signature)), code('INVALID_SIGNATURE'));
  assert.deepEqual(verifier.status(), { nextNonce: 0, revoked: false });
});

test('signing lab: valid signatures cannot bypass expected domain, authority, epoch or nonce', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  const verifier = createActionVerifier(context(signer), () => NOW);
  t.after(() => verifier.revoke());
  for (const [patch, expected] of [
    [{ domain: 'caw-test-session-b' }, 'WRONG_DOMAIN'],
    [{ account: 'beta' }, 'WRONG_AUTHORITY'],
    [{ controller: 'device-beta' }, 'WRONG_AUTHORITY'],
    [{ epoch: 1 }, 'WRONG_AUTHORITY'],
    [{ nonce: 1 }, 'STALE_NONCE'],
  ]) await assert.rejects(verifier.accept(await signer.sign(action(patch))), code(expected));
  assert.deepEqual(verifier.status(), { nextNonce: 0, revoked: false });
});

test('signing lab: fixed deployment, network, fee, scenario and action kind reject in submitted packets', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  const verifier = createActionVerifier(context(signer), () => NOW);
  t.after(() => verifier.revoke());
  const p = JSON.parse(await signer.sign(action()));
  for (const patch of [
    { deployment: 'other-lab' }, { network: 'ethereum' }, { fee: '1' },
    { scenario: 'prose' }, { kind: 'transfer' }, { version: 2 },
  ]) await assert.rejects(verifier.accept(packetText({ ...p.action, ...patch }, p.publicKey, p.signature)));
  assert.deepEqual(verifier.status(), { nextNonce: 0, revoked: false });
});

test('signing lab: interval includes notBefore and excludes expiresAt, with exact maximum window', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  let now = NOW;
  const verifier = createActionVerifier(context(signer), () => now);
  t.after(() => verifier.revoke());
  const packet = await signer.sign(action({ expiresAt: NOW + 300 }));
  await verifier.check(packet);
  now = NOW + 299;
  await verifier.check(packet);
  for (const invalid of [NOW - 1, NOW + 300, NOW + 301]) {
    now = invalid;
    await assert.rejects(verifier.check(packet), code('OUTSIDE_WINDOW'));
  }
  for (const invalid of [-1, NaN, Infinity, NOW + 0.5, '1700000000', 253402300800]) {
    now = invalid;
    await assert.rejects(verifier.check(packet));
  }
  assert.deepEqual(verifier.status(), { nextNonce: 0, revoked: false });
});

test('signing lab: noncanonical or malformed packet encodings reject without acceptance', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  const verifier = createActionVerifier(context(signer), () => NOW);
  t.after(() => verifier.revoke());
  const packet = await signer.sign(action());
  const p = JSON.parse(packet);
  const reversedAction = Object.fromEntries(Object.entries(p.action).reverse());
  const malformed = [
    null, {}, '', '[]', 'null', packet + '\n', ' ' + packet, JSON.stringify(p, null, 2),
    JSON.stringify({ publicKey: p.publicKey, action: p.action, signature: p.signature }),
    JSON.stringify({ action: reversedAction, publicKey: p.publicKey, signature: p.signature }),
    packet.replace('"text":"A', '"text":"\\u0041'),
    packet.replace('"version":1', '"version":1,"version":1'),
    packet.replace('"signature":', '"publicKey":' + JSON.stringify(p.publicKey) + ',"signature":'),
    JSON.stringify({ ...p, extra: true }),
    JSON.stringify({ ...p, action: { ...p.action, extra: true } }),
    packetText(p.action, p.publicKey, 'A'.repeat(128)),
    packetText(p.action, p.publicKey, p.signature.slice(2)),
    packetText(p.action, p.publicKey, p.signature + '00'),
    packetText(p.action, 'A'.repeat(64), p.signature),
    packetText(p.action, p.publicKey.slice(2), p.signature),
  ];
  for (const input of malformed) await assert.rejects(verifier.accept(input));
  assert.deepEqual(verifier.status(), { nextNonce: 0, revoked: false });
});

test('signing lab: checks are read-only, acceptance advances once and repeat acceptance fails', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  const verifier = createActionVerifier(context(signer), () => NOW);
  t.after(() => verifier.revoke());
  const packet = await signer.sign(action());
  await verifier.check(packet);
  await verifier.check(packet);
  assert.equal(verifier.status().nextNonce, 0);
  const accepted = await verifier.accept(packet);
  assert.ok(Object.isFrozen(accepted) && Object.isFrozen(accepted.action));
  assert.deepEqual(accepted, { action: action(), nextNonce: 1 });
  await assert.rejects(verifier.accept(packet), code('STALE_NONCE'));
  await assert.rejects(verifier.check(packet), code('STALE_NONCE'));
  assert.equal(verifier.status().nextNonce, 1);
  const next = await verifier.accept(await signer.sign(action({ nonce: 1 })));
  assert.equal(next.nextNonce, 2);
});

test('signing lab: concurrent duplicate acceptance consumes only one nonce', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  const verifier = createActionVerifier(context(signer), () => NOW);
  t.after(() => verifier.revoke());
  const packet = await signer.sign(action());
  const results = await Promise.allSettled([verifier.accept(packet), verifier.accept(packet)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'STALE_NONCE');
  assert.equal(verifier.status().nextNonce, 1);
});

test('signing lab: nonce 255 advances to exhausted 256 without wrapping', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  const verifier = createActionVerifier(context(signer, { nextNonce: 255 }), () => NOW);
  t.after(() => verifier.revoke());
  const packet = await signer.sign(action({ nonce: 255 }));
  assert.equal((await verifier.accept(packet)).nextNonce, 256);
  await assert.rejects(verifier.accept(packet), code('STALE_NONCE'));
  await assert.rejects(signer.sign(action({ nonce: 256 })));
  assert.deepEqual(verifier.status(), { nextNonce: 256, revoked: false });
});

test('signing lab: trusted context is captured and caller action is not mutated or reread after signing starts', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  const original = action(), snapshot = { ...original };
  const signing = signer.sign(original);
  original.text = 'Changed after the sign call.';
  original.nonce = 12;
  const packet = await signing;
  assert.deepEqual(JSON.parse(packet).action, snapshot);
  const trusted = context(signer);
  const verifier = createActionVerifier(trusted, () => NOW);
  t.after(() => verifier.revoke());
  trusted.domain = 'changed'; trusted.account = 'beta'; trusted.epoch = 99;
  trusted.nextNonce = 200; trusted.publicKey = '0'.repeat(64);
  assert.deepEqual(await verifier.check(packet), snapshot);
  const frozen = Object.freeze(action({ text: 'Untouched frozen input.' }));
  const before = literalAction(frozen);
  await signer.sign(frozen);
  assert.equal(literalAction(frozen), before);
});

test('signing lab: invalid verifier contexts reject before a verifier is created', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  const missing = context(signer);
  delete missing.publicKey;
  let getterCalls = 0;
  const accessor = context(signer);
  Object.defineProperty(accessor, 'publicKey', { enumerable: true, get() { getterCalls++; return signer.publicKey; } });
  for (const input of [null, [], missing, accessor, context(signer, { extra: true }),
    context(signer, { nextNonce: -1 }), context(signer, { nextNonce: 257 }),
    context(signer, { nextNonce: '0' }), context(signer, { epoch: 4294967296 }),
    context(signer, { account: 'Alpha' }), context(signer, { controller: 'wallet-address' }),
    context(signer, { domain: '-invalid' }), context(signer, { publicKey: 'A'.repeat(64) }),
    context(signer, { publicKey: '0'.repeat(62) }),
  ]) assert.throws(() => createActionVerifier(input, () => NOW));
  assert.equal(getterCalls, 0);
  const exhausted = createActionVerifier(context(signer, { nextNonce: 256 }), () => NOW);
  exhausted.revoke();
});

test('signing lab: revoke is idempotent and disables both future signing and acceptance', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  const verifier = createActionVerifier(context(signer), () => NOW);
  t.after(() => verifier.revoke());
  const packet = await signer.sign(action());
  signer.revoke(); signer.revoke();
  await assert.rejects(signer.sign(action()), code('REVOKED'));
  verifier.revoke(); verifier.revoke();
  await assert.rejects(verifier.check(packet), code('REVOKED'));
  await assert.rejects(verifier.accept(packet), code('REVOKED'));
  assert.deepEqual(verifier.status(), { nextNonce: 0, revoked: true });
});

test('signing lab: revoke during native verification prevents a late acceptance', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  const verifier = createActionVerifier(context(signer), () => NOW);
  t.after(() => verifier.revoke());
  const packet = await signer.sign(action());
  const gate = holdNativeVerification(t);
  const pending = verifier.accept(packet);
  const rejection = assert.rejects(pending, code('REVOKED'));
  await gate.entered;
  verifier.revoke();
  gate.release();
  await rejection;
  assert.deepEqual(verifier.status(), { nextNonce: 0, revoked: true });
});

test('signing lab: expiry reached during native verification is rechecked before acceptance', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  let now = NOW;
  const verifier = createActionVerifier(context(signer), () => now);
  t.after(() => verifier.revoke());
  const packet = await signer.sign(action({ expiresAt: NOW + 1 }));
  const gate = holdNativeVerification(t);
  const pending = verifier.accept(packet);
  const rejection = assert.rejects(pending, code('OUTSIDE_WINDOW'));
  await gate.entered;
  now = NOW + 1;
  gate.release();
  await rejection;
  assert.deepEqual(verifier.status(), { nextNonce: 0, revoked: false });
});

test('signing lab: packet limit measures UTF-8 bytes and includes exactly 8 KiB', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  const verifier = createActionVerifier(context(signer), () => NOW);
  t.after(() => verifier.revoke());
  const p = JSON.parse(await signer.sign(action()));
  const multibyte = packetText(action({ text: 'é'.repeat(4000) }), p.publicKey, p.signature);
  assert.ok(multibyte.length < 8192);
  assert.ok(Buffer.byteLength(multibyte, 'utf8') > 8192);
  // It is parseable JSON. Without the byte gate it would reach INVALID_TEXT;
  // this assertion distinguishes the byte limit from a generic parse failure.
  assert.doesNotThrow(() => JSON.parse(multibyte));
  await assert.rejects(verifier.accept(multibyte), code('INVALID_PACKET'));
  const overhead = Buffer.byteLength(packetText(action({ text: '' }), p.publicKey, p.signature), 'utf8');
  const exact = packetText(action({ text: 'x'.repeat(8192 - overhead) }), p.publicKey, p.signature);
  assert.equal(Buffer.byteLength(exact, 'utf8'), 8192);
  // Exactly at the packet bound reaches the distinct action text limit.
  await assert.rejects(verifier.accept(exact), code('INVALID_TEXT'));
  const over = packetText(action({ text: 'x'.repeat(8193 - overhead) }), p.publicKey, p.signature);
  assert.equal(Buffer.byteLength(over, 'utf8'), 8193);
  await assert.rejects(verifier.accept(over), code('INVALID_PACKET'));
  assert.deepEqual(verifier.status(), { nextNonce: 0, revoked: false });
});

test('signing lab: revocation during native signing suppresses the completed packet', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  const gate = holdNativeOperation(t, 'sign');
  const pending = signer.sign(action());
  const rejection = assert.rejects(pending, code('REVOKED'));
  await gate.entered;
  signer.revoke();
  gate.release();
  await rejection;
  await assert.rejects(signer.sign(action()), code('REVOKED'));
});

test('signing lab: unavailable native Ed25519 fails closed without another key-generation attempt', async t => {
  const subtle = globalThis.crypto?.subtle ?? webcrypto.subtle;
  const unsupported = t.mock.method(subtle, 'generateKey', async () => {
    throw new Error('Native algorithm unavailable in this test.');
  });
  t.after(() => unsupported.mock.restore());
  await assert.rejects(createDemoSigner(), code('CRYPTO_UNAVAILABLE'));
  assert.equal(unsupported.mock.callCount(), 1);
});
