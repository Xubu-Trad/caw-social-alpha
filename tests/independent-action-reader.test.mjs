import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { canonicalAction, createDemoSigner, createActionVerifier } from '../public/signatures.mjs';
import { inspectSignedAction } from '../reference/independent-action-reader.mjs';

// PUBLIC SYNTHETIC TEST MATERIAL. This deliberately disclosed deterministic seed
// is not a wallet credential and must never control production identity or funds.
// The expected canonical text and signing bytes below come from a literal fixture,
// never from the application encoder or the independent reader under comparison.
const fixture = JSON.parse(readFileSync(new URL('../reference/fixtures/signed-action-v1.json', import.meta.url), 'utf8'));
const privateKey = createPrivateKey({
  key: Buffer.from('302e020100300506032b657004220420' + fixture.public_test_seed_hex, 'hex'),
  format: 'der', type: 'pkcs8'
});
const expectedBytes = Buffer.from(fixture.signing_utf8_hex, 'hex');
const fixedSignature = sign(null, expectedBytes, privateKey).toString('hex');
const prefix = 'CAW_LOCAL_SIGNED_ACTION_V1\n';
const fixedPacket = wirePacket(fixture.canonical_action, fixedSignature);

function wirePacket(actionText, signature, publicKey = fixture.public_key_hex) {
  return '{"action":' + actionText + ',"publicKey":' + JSON.stringify(publicKey) +
    ',"signature":' + JSON.stringify(signature) + '}';
}

// This explicit field list is independently transcribed from the wire contract.
// It creates signed variations, not the fixed expected serialization fixture.
function actionText(patch = {}) {
  const a = { ...fixture.action, ...patch };
  return JSON.stringify({
    account: a.account, controller: a.controller, deployment: a.deployment,
    domain: a.domain, epoch: a.epoch, expiresAt: a.expiresAt, fee: a.fee,
    kind: a.kind, network: a.network, nonce: a.nonce, notBefore: a.notBefore,
    scenario: a.scenario, text: a.text, version: a.version
  });
}
function signedText(text, signingPrefix = prefix) {
  return wirePacket(text, sign(null, Buffer.from(signingPrefix + text, 'utf8'), privateKey).toString('hex'));
}
function candidate(patch = {}) { return signedText(actionText(patch)); }
function hasCode(code) {
  return error => error instanceof Error && (code ? error.code === code : typeof error.code === 'string');
}
async function accepts(packet, options = {}) {
  const trusted = options.trusted ?? fixture.trusted;
  const now = options.now ?? fixture.now;
  const read = inspectSignedAction(packet, trusted, now);
  assert.deepEqual({ ...read, action: undefined }, {
    action: undefined, canonical: true, signatureVerified: true,
    authorityMatched: true, nonceMatched: true, timeValid: true
  });
  assert.ok(Object.isFrozen(read));
  assert.ok(Object.isFrozen(read.action));
  const verifier = createActionVerifier(trusted, () => now);
  try {
    assert.deepEqual(await verifier.check(packet), read.action);
    assert.equal(verifier.status().nextNonce, trusted.nextNonce);
  } finally { verifier.revoke(); }
  return read.action;
}
async function rejects(packet, options = {}) {
  const trusted = options.trusted ?? fixture.trusted;
  const now = options.now ?? fixture.now;
  assert.throws(() => inspectSignedAction(packet, trusted, now), hasCode(options.reader));
  const verifier = createActionVerifier(trusted, () => now);
  try {
    await assert.rejects(verifier.check(packet), hasCode(options.writer));
    assert.equal(verifier.status().nextNonce, trusted.nextNonce);
  } finally { verifier.revoke(); }
}

test('independent reader imports no application encoder, model, economics or signing helper', () => {
  const source = readFileSync(new URL('../reference/independent-action-reader.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['node:crypto', 'node:buffer']);
  assert.doesNotMatch(source, /\bimport\s*\(|\brequire\s*\(/);
});

test('literal public fixture fixes exact canonical JSON, Unicode and 373 signing bytes', () => {
  assert.equal(fixture.public_test_material, true);
  assert.equal(fixture.not_a_wallet_or_production_key, true);
  assert.match(fixture.notice, /PUBLIC SYNTHETIC TEST MATERIAL/);
  assert.equal(expectedBytes.length, 373);
  assert.equal(expectedBytes.toString('utf8'), fixture.signing_text);
  assert.equal(fixture.signing_text, prefix + fixture.canonical_action);
  assert.deepEqual(JSON.parse(fixture.canonical_action), fixture.action);
  assert.equal(canonicalAction(fixture.action), fixture.canonical_action);
  assert.equal(fixture.action.text, 'Exact bytes: caf\u00e9, cafe\u0301, \u{1f426}.\nKeep "CAW".');
  assert.notEqual(fixture.action.text, fixture.action.text.normalize('NFC'));
  const spki = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('hex');
  assert.equal(spki, '302a300506032b6570032100' + fixture.public_key_hex);
});

test('original native writer produces an exact packet the independent reader accepts', async t => {
  const signer = await createDemoSigner();
  t.after(() => signer.revoke());
  const packet = await signer.sign(fixture.action);
  assert.equal(JSON.stringify(JSON.parse(packet).action), fixture.canonical_action);
  assert.deepEqual(await accepts(packet, { trusted: { ...fixture.trusted, publicKey: signer.publicKey } }), fixture.action);
});

test('fixed independently signed packet is accepted by original verifier and independent reader', async () => {
  assert.equal(sign(null, expectedBytes, privateKey).toString('hex'), fixedSignature);
  assert.equal(verify(null, expectedBytes, createPublicKey(privateKey), Buffer.from(fixedSignature, 'hex')), true);
  assert.deepEqual(await accepts(fixedPacket), fixture.action);
});

test('read-only inspection does not consume a nonce; caller must retain replay state', async () => {
  const before = JSON.stringify(fixture.trusted);
  assert.deepEqual(inspectSignedAction(fixedPacket, fixture.trusted, fixture.now), inspectSignedAction(fixedPacket, fixture.trusted, fixture.now));
  assert.equal(JSON.stringify(fixture.trusted), before);
  const verifier = createActionVerifier(fixture.trusted, () => fixture.now);
  try {
    await verifier.check(fixedPacket);
    await verifier.check(fixedPacket);
    assert.equal(verifier.status().nextNonce, 7);
    assert.equal((await verifier.accept(fixedPacket)).nextNonce, 8);
    await assert.rejects(verifier.accept(fixedPacket), hasCode('STALE_NONCE'));
    assert.throws(() => inspectSignedAction(fixedPacket, { ...fixture.trusted, nextNonce: 8 }, fixture.now), hasCode('READER_NONCE'));
    // A stateless reader still accepts the old packet if supplied the old trust.
    assert.equal(inspectSignedAction(fixedPacket, fixture.trusted, fixture.now).nonceMatched, true);
  } finally { verifier.revoke(); }
});

test('canonical equality rejects duplicate keys, reordering, whitespace and alternate spellings', async () => {
  const parsed = JSON.parse(fixedPacket);
  const reversedAction = JSON.stringify(Object.fromEntries(Object.entries(parsed.action).reverse()));
  const cases = [
    ['leading space', ' ' + fixedPacket],
    ['trailing newline', fixedPacket + '\n'],
    ['pretty JSON', JSON.stringify(parsed, null, 2)],
    ['outer key order', JSON.stringify({ publicKey: parsed.publicKey, action: parsed.action, signature: parsed.signature })],
    ['inner key order', wirePacket(reversedAction, fixedSignature)],
    ['duplicate outer key', fixedPacket.replace('{"action":', '{"action":' + fixture.canonical_action + ',"action":')],
    ['duplicate inner key', fixedPacket.replace('{"account":', '{"account":"alpha","account":')],
    ['escaped duplicate key', fixedPacket.replace('{"account":', '{"\\u0061ccount":"alpha","account":')],
    ['escaped unique key', fixedPacket.replace('"account"', '"\\u0061ccount"')],
    ['escaped value', fixedPacket.replace('"alpha"', '"\\u0061lpha"')],
    ['escaped Unicode', fixedPacket.replace('café', 'caf\\u00e9')],
    ['decimal spelling', fixedPacket.replace('"epoch":2', '"epoch":2.0')],
    ['exponent spelling', fixedPacket.replace('"nonce":7', '"nonce":7e0')]
  ];
  for (const [name, packet] of cases) {
    assert.notEqual(packet, fixedPacket, name);
    await rejects(packet, { reader: 'READER_CANONICAL', writer: 'NON_CANONICAL_PACKET' });
  }
});

test('both consumers reject malformed JSON and non-exact packet or action schemas', async () => {
  const extraOuter = { ...JSON.parse(fixedPacket), receipt: true };
  const missingOuter = JSON.parse(fixedPacket); delete missingOuter.signature;
  const extraAction = JSON.parse(fixedPacket); extraAction.action.memo = 'unexpected';
  const missingAction = JSON.parse(fixedPacket); delete missingAction.action.fee;
  const cases = [undefined, null, 7, {}, Buffer.from(fixedPacket), new String(fixedPacket),
    '', '{', 'null', '[]', 'true', '"packet"', JSON.stringify(extraOuter),
    JSON.stringify(missingOuter), JSON.stringify(extraAction), JSON.stringify(missingAction),
    fixedPacket.replace('"action":{', '"action":null,"unused":{')];
  for (const packet of cases) await rejects(packet);
});

test('validly shaped text mutations, signature mutations and wrong signing prefix fail cryptography', async () => {
  const changed = JSON.parse(fixedPacket); changed.action.text += ' Changed.';
  const broken = JSON.parse(fixedPacket);
  broken.signature = (broken.signature[0] === '0' ? '1' : '0') + broken.signature.slice(1);
  const cases = [JSON.stringify(changed), JSON.stringify(broken), signedText(fixture.canonical_action, 'OTHER_SIGNING_CONTEXT\n')];
  for (const packet of cases) await rejects(packet, { reader: 'READER_SIGNATURE', writer: 'INVALID_SIGNATURE' });
});

test('well-formed text accepts exact 420 scalar boundaries and preserves combining marks and controls', async () => {
  const cases = ['a'.repeat(419), 'a'.repeat(420), '\u{1f426}'.repeat(420),
    'e\u0301'.repeat(210), 'caf\u00e9', 'cafe\u0301', 'A\u0000\u001b\t\nB'];
  for (const text of cases) assert.equal((await accepts(candidate({ text }))).text, text);
  assert.notEqual(candidate({ text: 'caf\u00e9' }), candidate({ text: 'cafe\u0301' }));
});

test('oversize, blank, non-string and malformed surrogate text is rejected by both consumers', async () => {
  const cases = ['a'.repeat(421), '\u{1f426}'.repeat(421), 'e\u0301'.repeat(210) + 'x',
    '', ' \t\n', '\u00a0\ufeff', '\ud800', '\udc00', 'a\ud800b', '\ud800\ud800', '\udc00\ud800', 4, null, true];
  for (const text of cases) await rejects(candidate({ text }));
});

test('fixed scenario, fee, action kind and unconnected context cannot silently change', async () => {
  const cases = [
    { kind: 'like' }, { network: 'mainnet' }, { deployment: 'connected-lab' },
    { scenario: 'recipient-proposal' }, { version: 2 }, { version: '1' },
    { fee: '5000000000000000000001' }, { fee: '05000000000000000000000' }, { fee: 5000 }
  ];
  for (const patch of cases) await rejects(candidate(patch), { reader: 'READER_UNSUPPORTED', writer: 'UNSUPPORTED_ACTION' });
});

test('identity labels agree at exact bounds and reject case, suffixes and overlong fields', async () => {
  const boundary = { account: 'a'.repeat(32), controller: 'device-' + 'b'.repeat(40), domain: 'c'.repeat(96), epoch: 4294967295 };
  assert.equal((await accepts(candidate(boundary), { trusted: { ...fixture.trusted, ...boundary } })).account, boundary.account);
  const cases = [
    { account: '' }, { account: 'a'.repeat(33) }, { account: 'Alpha' }, { account: 'alpha\n' }, { account: 'a-b' },
    { controller: 'device-' }, { controller: 'device-' + 'a'.repeat(41) }, { controller: 'device--a' },
    { controller: 'Device-alpha' }, { controller: 'device-alpha\n' },
    { domain: '' }, { domain: 'a'.repeat(97) }, { domain: '-a' }, { domain: 'A' }, { domain: 'a\n' }
  ];
  for (const patch of cases) await rejects(candidate(patch), { reader: 'READER_LABEL', writer: 'INVALID_LABEL' });
});

test('action integers and time windows reject negative-zero wire spelling and invalid bounds', async () => {
  for (const field of ['epoch', 'nonce', 'notBefore', 'expiresAt']) {
    const value = fixture.action[field];
    const text = fixture.canonical_action.replace('"' + field + '":' + value, '"' + field + '":-0');
    assert.notEqual(text, fixture.canonical_action);
    await rejects(signedText(text), { reader: 'READER_INTEGER', writer: 'INVALID_INTEGER' });
  }
  const integers = [
    { epoch: -1 }, { epoch: 4294967296 }, { epoch: 1.5 }, { epoch: '2' },
    { nonce: -1 }, { nonce: 256 }, { nonce: 0.5 }, { nonce: '7' },
    { notBefore: -1 }, { expiresAt: 253402300800 }, { expiresAt: 1700000120.5 },
    { notBefore: '1700000000' }, { epoch: Number.NaN }, { nonce: Number.POSITIVE_INFINITY }
  ];
  for (const patch of integers) await rejects(candidate(patch), { reader: 'READER_INTEGER', writer: 'INVALID_INTEGER' });
  for (const expiresAt of [fixture.now - 1, fixture.now, fixture.now + 301]) {
    await rejects(candidate({ expiresAt }), { reader: 'READER_WINDOW', writer: 'INVALID_WINDOW' });
  }
  await accepts(candidate({ expiresAt: fixture.now + 300 }));
});

test('independently supplied key, domain, authority and expected nonce govern acceptance', async () => {
  const cases = [
    [{ publicKey: '00'.repeat(32) }, 'READER_KEY', 'WRONG_KEY'],
    [{ domain: 'another-lab' }, 'READER_DOMAIN', 'WRONG_DOMAIN'],
    [{ account: 'beta' }, 'READER_AUTHORITY', 'WRONG_AUTHORITY'],
    [{ controller: 'device-beta' }, 'READER_AUTHORITY', 'WRONG_AUTHORITY'],
    [{ epoch: 3 }, 'READER_AUTHORITY', 'WRONG_AUTHORITY'],
    [{ nextNonce: 6 }, 'READER_NONCE', 'STALE_NONCE'],
    [{ nextNonce: 8 }, 'READER_NONCE', 'STALE_NONCE']
  ];
  for (const [patch, reader, writer] of cases) await rejects(fixedPacket, { trusted: { ...fixture.trusted, ...patch }, reader, writer });
});

test('trusted time is inclusive at start, exclusive at expiry and bounded independently', async () => {
  await accepts(fixedPacket, { now: fixture.action.notBefore });
  await accepts(fixedPacket, { now: fixture.action.expiresAt - 1 });
  for (const now of [fixture.action.notBefore - 1, fixture.action.expiresAt]) {
    await rejects(fixedPacket, { now, reader: 'READER_TIME', writer: 'OUTSIDE_WINDOW' });
  }
  for (const now of [-0, -1, 1.5, '1700000000', Number.NaN, Number.POSITIVE_INFINITY, 253402300800]) {
    await rejects(fixedPacket, { now, reader: 'READER_INTEGER', writer: 'INVALID_INTEGER' });
  }
  const upper = { notBefore: 253402300798, expiresAt: 253402300799 };
  await accepts(candidate(upper), { now: upper.notBefore });
  await rejects(candidate(upper), { now: upper.expiresAt, reader: 'READER_TIME', writer: 'OUTSIDE_WINDOW' });
});

test('public keys and signatures require exact lowercase hexadecimal without coercion', async () => {
  for (const field of ['publicKey', 'signature']) {
    const value = JSON.parse(fixedPacket)[field];
    const invalid = [value.toUpperCase(), value.slice(2), value + '00', value.slice(0, -1) + '\n', 'g' + value.slice(1), 0, null];
    for (const changed of invalid) {
      const packet = JSON.parse(fixedPacket); packet[field] = changed;
      await rejects(JSON.stringify(packet), { reader: 'READER_ENCODING', writer: 'INVALID_ENCODING' });
    }
  }
});

test('trust rejects getters, toJSON, hidden fields, symbols and inherited records without invoking accessors', () => {
  let invoked = 0;
  const cases = [];
  for (const field of Object.keys(fixture.trusted)) {
    const trusted = { ...fixture.trusted };
    Object.defineProperty(trusted, field, { enumerable: true, get() { invoked += 1; return fixture.trusted[field]; } });
    cases.push(trusted);
  }
  const hidden = { ...fixture.trusted }; Object.defineProperty(hidden, 'domain', { enumerable: false });
  const symbol = { ...fixture.trusted, [Symbol('extra')]: 'unexpected' };
  const missing = { ...fixture.trusted }; delete missing.controller;
  const inherited = Object.create(fixture.trusted);
  const customPrototype = Object.assign(Object.create({ marker: true }), fixture.trusted);
  const serializable = { ...fixture.trusted, toJSON() { invoked += 1; return fixture.trusted; } };
  cases.push(hidden, symbol, missing, inherited, customPrototype, serializable,
    { ...fixture.trusted, extra: true }, null, [], 1);
  for (const trusted of cases) {
    assert.throws(() => inspectSignedAction(fixedPacket, trusted, fixture.now), hasCode('READER_SCHEMA'));
    assert.throws(() => createActionVerifier(trusted, () => fixture.now), hasCode('INVALID_SCHEMA'));
  }
  assert.equal(invoked, 0);
});

test('ordinary or null-prototype trust is copied safely and frozen results cannot be altered', async () => {
  const trusted = Object.assign(Object.create(null), fixture.trusted);
  Object.freeze(trusted);
  await accepts(fixedPacket, { trusted });
  const mutable = { ...fixture.trusted };
  const verifier = createActionVerifier(mutable, () => fixture.now);
  const result = inspectSignedAction(fixedPacket, mutable, fixture.now);
  mutable.account = 'changed'; mutable.nextNonce = 8;
  try {
    assert.deepEqual(await verifier.check(fixedPacket), fixture.action);
    assert.deepEqual(result.action, fixture.action);
    assert.throws(() => { result.action.text = 'changed'; }, TypeError);
    assert.throws(() => { result.signatureVerified = false; }, TypeError);
    // A new inspection uses the new caller-supplied trust; it is not a session.
    assert.throws(() => inspectSignedAction(fixedPacket, mutable, fixture.now), hasCode('READER_AUTHORITY'));
  } finally { verifier.revoke(); }
});

test('last permitted action nonce 255 advances only the original consumer to exhausted 256', async () => {
  const trusted = { ...fixture.trusted, nextNonce: 255 };
  const packet = candidate({ nonce: 255 });
  await accepts(packet, { trusted });
  const verifier = createActionVerifier(trusted, () => fixture.now);
  try {
    assert.equal((await verifier.accept(packet)).nextNonce, 256);
    assert.throws(() => inspectSignedAction(packet, { ...trusted, nextNonce: 256 }, fixture.now), hasCode('READER_NONCE'));
    await assert.rejects(verifier.check(packet), hasCode('STALE_NONCE'));
  } finally { verifier.revoke(); }
  await rejects(candidate({ nonce: 256 }), { trusted: { ...trusted, nextNonce: 256 }, reader: 'READER_INTEGER', writer: 'INVALID_INTEGER' });
  for (const nextNonce of [-0, -1, 257, 1.5, '7']) {
    const invalid = { ...trusted, nextNonce };
    assert.throws(() => inspectSignedAction(packet, invalid, fixture.now), hasCode('READER_INTEGER'));
    assert.throws(() => createActionVerifier(invalid, () => fixture.now), hasCode('INVALID_INTEGER'));
  }
});

test('packet bound covers both UTF-16 length and UTF-8 bytes before parsing', async () => {
  const oversizedAscii = ' '.repeat(8193);
  const oversizedUtf8 = '\u{1f426}'.repeat(2050);
  assert.ok(oversizedUtf8.length < 8192);
  assert.ok(Buffer.byteLength(oversizedUtf8, 'utf8') > 8192);
  for (const packet of [oversizedAscii, oversizedUtf8]) {
    await rejects(packet, { reader: 'READER_PACKET', writer: 'INVALID_PACKET' });
  }
});
