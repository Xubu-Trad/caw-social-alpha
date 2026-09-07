import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
// Destination after review: app/tests/history.test.mjs.
import { UNIT, SCENARIO, createState, applyAction, canonicalExport } from '../public/model.mjs';
import { createCheckpoint, verifyHistory } from '../public/history.mjs';

const MAX_BYTES = 1024 * 1024;
const nodeDigest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const errorCode = code => error => error?.code === code;
const seed = () => ({
  version: 1,
  scenario: SCENARIO,
  accounts: [
    { name: 'alpha', controller: 'device-a', balance: (1000000n * UNIT).toString(), stake: '1' },
    { name: 'bravo', controller: 'device-b', balance: (1000000n * UNIT).toString(), stake: '2' },
    { name: 'charlie', controller: 'device-c', balance: (1000000n * UNIT).toString(), stake: '1' },
  ],
  posts: [{ id: 'seed-b', author: 'bravo', text: 'Seed receipt.', time: 'Synthetic fixture' }],
});

function states(text = 'Receipt 🐦; keep café and cafe\u0301 distinct.') {
  const initial = createState(seed());
  const first = applyAction(initial, {
    id: 'action-1', kind: 'caw', actor: 'alpha', controller: 'device-a',
    epoch: 0, nonce: 0, text,
  });
  const second = applyAction(first, {
    id: 'action-2', kind: 'like', actor: 'alpha', controller: 'device-a',
    epoch: 0, nonce: 1, postId: 'seed-b',
  });
  return { initial, first, second };
}

function checkpointForText(checkpoint, text) {
  // Independent test-only hashing deliberately makes malformed text match its
  // digest, ensuring schema/canonical checks also run rather than only hashing.
  return { ...checkpoint, sha256: nodeDigest(text) };
}

function freezeDeep(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

test('checkpoint uses SHA-256 over the exact canonical UTF-8 export', async () => {
  assert.equal(nodeDigest('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const state = states().second;
  const text = canonicalExport(state);
  const checkpoint = await createCheckpoint(state);
  assert.deepEqual(checkpoint, {
    format: 'caw-synthetic-checkpoint-v1', scenario: SCENARIO,
    eventCount: 2, sha256: nodeDigest(text),
  });
  assert.equal(Object.isFrozen(checkpoint), true);
  const verified = await verifyHistory(text, checkpoint);
  assert.equal(verified.canonicalText, text);
  assert.equal(verified.byteLength, Buffer.byteLength(text, 'utf8'));
  assert.deepEqual(verified.state, state);
  assert.deepEqual(verified.checkpoint, checkpoint);
  assert.notEqual(verified.checkpoint, checkpoint);
  assert.equal(Object.isFrozen(verified), true);
});

test('zero-event checkpoint restores its self-contained seed without external fixture input', async () => {
  const state = createState({ ...seed(), description: 'A separately retained synthetic seed.' });
  const text = canonicalExport(state);
  const checkpoint = await createCheckpoint(state);
  assert.equal(checkpoint.eventCount, 0);
  const result = await verifyHistory(text, checkpoint);
  assert.deepEqual(result.state.seed, state.seed);
  assert.equal(result.canonicalText, text);
});

test('coherent rewriting and valid truncation fail against an unchanged checkpoint', async () => {
  const original = states();
  const checkpoint = await createCheckpoint(original.second);
  const rewrite = states('Coherently changed message and recomputed receipts.').second;
  const rewrittenText = canonicalExport(rewrite);
  const shortenedText = canonicalExport(original.first);
  assert.equal(JSON.parse(rewrittenText).expectedEventCount, checkpoint.eventCount);
  assert.equal(JSON.parse(shortenedText).expectedEventCount, 1);
  await assert.rejects(verifyHistory(rewrittenText, checkpoint), errorCode('CHECKPOINT_MISMATCH'));
  await assert.rejects(verifyHistory(shortenedText, checkpoint), errorCode('CHECKPOINT_MISMATCH'));
  // Hash agreement is not authorship or completeness: changing the separately
  // retained target too permits another internally consistent synthetic history.
  const replacementCheckpoint = await createCheckpoint(rewrite);
  assert.equal((await verifyHistory(rewrittenText, replacementCheckpoint)).canonicalText, rewrittenText);
});

test('canonical text is mandatory even when a dirty file has a matching digest', async () => {
  const state = states().second;
  const text = canonicalExport(state);
  const checkpoint = await createCheckpoint(state);
  const parsed = JSON.parse(text);
  const dirty = [
    '\n' + text,
    text + '\n',
    JSON.stringify(parsed, null, 2),
    JSON.stringify(Object.fromEntries(Object.entries(parsed).reverse())),
    '{"scenario":"' + SCENARIO + '",' + text.slice(1),
    '{"\\u0073cenario":"' + SCENARIO + '",' + text.slice(1),
    text.replace('"controller":"device-a"', '"controller":"device-a","controller":"device-a"'),
    text.replace('alpha', '\\u0061lpha'),
  ];
  for (const candidate of dirty) {
    assert.notEqual(candidate, text);
    await assert.rejects(verifyHistory(candidate, checkpointForText(checkpoint, candidate)), errorCode('NON_CANONICAL_HISTORY'));
  }
});

test('matching hash cannot make invalid schema or inconsistent receipts valid', async () => {
  const state = states().second;
  const text = canonicalExport(state);
  const checkpoint = await createCheckpoint(state);
  for (const change of [
    value => { value.unknown = true; },
    value => { value.events[0].receipt.fee = '0'; },
    value => { value.snapshot.accounts.alpha.balance = '0'; },
    value => { value.events.reverse(); },
    value => { value.events[1] = value.events[0]; },
  ]) {
    const value = JSON.parse(text);
    change(value);
    const candidate = JSON.stringify(value);
    await assert.rejects(verifyHistory(candidate, checkpointForText(checkpoint, candidate)));
  }
  for (const candidate of ['', '{', 'null', '[]', 'true', '"text"', '\ufeff' + text]) {
    await assert.rejects(verifyHistory(candidate, checkpointForText(checkpoint, candidate)), errorCode('INVALID_HISTORY'));
  }
});

test('checkpoint metadata and structure reject malformed or executable properties', async () => {
  const state = states().second;
  const text = canonicalExport(state);
  const checkpoint = await createCheckpoint(state);
  const bad = [undefined, null, [], new Date(), Object.create(checkpoint),
    { ...checkpoint, extra: true },
    { ...checkpoint, format: 'other' },
    { ...checkpoint, scenario: 'other' },
    { ...checkpoint, sha256: checkpoint.sha256.toUpperCase() },
    { ...checkpoint, sha256: 'a'.repeat(63) },
    { ...checkpoint, sha256: 'g'.repeat(64) },
    { ...checkpoint, sha256: ' ' + checkpoint.sha256 },
    { ...checkpoint, sha256: new String(checkpoint.sha256) },
  ];
  for (const eventCount of [-1, -0, 0.5, 257, NaN, Infinity, '2', 2n]) {
    bad.push({ ...checkpoint, eventCount });
  }
  const missing = { ...checkpoint }; delete missing.sha256; bad.push(missing);
  const symbol = { ...checkpoint }; symbol[Symbol('extra')] = 1; bad.push(symbol);
  const hidden = { ...checkpoint }; Object.defineProperty(hidden, 'sha256', { enumerable: false }); bad.push(hidden);
  const unusualPrototype = { ...checkpoint }; Object.setPrototypeOf(unusualPrototype, { injected: true }); bad.push(unusualPrototype);
  const protoKey = JSON.parse(JSON.stringify(checkpoint).replace('{', '{"__proto__":{},')); bad.push(protoKey);
  let getterReads = 0;
  const accessor = { ...checkpoint };
  Object.defineProperty(accessor, 'sha256', { enumerable: true, get() { getterReads += 1; throw Error('must not run'); } });
  bad.push(accessor);
  let toJSONCalls = 0;
  bad.push({ ...checkpoint, toJSON() { toJSONCalls += 1; throw Error('must not run'); } });
  for (const candidate of bad) {
    await assert.rejects(verifyHistory(text, candidate), errorCode('INVALID_CHECKPOINT'));
  }
  assert.equal(getterReads, 0);
  assert.equal(toJSONCalls, 0);
  const plainWithoutPrototype = Object.assign(Object.create(null), checkpoint);
  assert.equal((await verifyHistory(text, plainWithoutPrototype)).canonicalText, text);
});

test('well-formed but wrong checkpoint count or digest is rejected', async () => {
  const state = states().second;
  const text = canonicalExport(state);
  const checkpoint = await createCheckpoint(state);
  await assert.rejects(verifyHistory(text, { ...checkpoint, eventCount: 1 }), errorCode('CHECKPOINT_MISMATCH'));
  const otherDigest = checkpoint.sha256[0] === '0' ? '1' : '0';
  await assert.rejects(verifyHistory(text, { ...checkpoint, sha256: otherDigest + checkpoint.sha256.slice(1) }), errorCode('CHECKPOINT_MISMATCH'));
});

test('history input has a byte bound and rejects malformed Unicode without replacement', async () => {
  const state = states().second;
  const text = canonicalExport(state);
  const checkpoint = await createCheckpoint(state);
  for (const value of [null, undefined, {}, new String(text), new Uint8Array(1)]) {
    await assert.rejects(verifyHistory(value, checkpoint), errorCode('INVALID_HISTORY'));
  }
  await assert.rejects(verifyHistory(' '.repeat(MAX_BYTES + 1), checkpoint), errorCode('HISTORY_TOO_LARGE'));
  // Code units fit, UTF-8 bytes do not.
  await assert.rejects(verifyHistory('€'.repeat(Math.floor(MAX_BYTES / 2)), checkpoint), errorCode('HISTORY_TOO_LARGE'));
  // The exact byte ceiling passes the size gate, then fails JSON validation.
  const exactBound = ' '.repeat(MAX_BYTES);
  await assert.rejects(verifyHistory(exactBound, checkpointForText(checkpoint, exactBound)), errorCode('INVALID_HISTORY'));
  for (const invalid of ['\ud800', '\udc00', 'a\ud800b', '\ud800\ud800']) {
    await assert.rejects(verifyHistory(invalid, checkpoint), errorCode('INVALID_UNICODE'));
  }
  const escapedLoneSurrogate = text.replace('Receipt 🐦', '\\ud800');
  assert.notEqual(escapedLoneSurrogate, text);
  await assert.rejects(verifyHistory(escapedLoneSurrogate, checkpointForText(checkpoint, escapedLoneSurrogate)), errorCode('INVALID_UNICODE'));
});

test('export/checkpoint verification leaves inputs unchanged and returns a separate state', async () => {
  const state = freezeDeep(states().second);
  const before = canonicalExport(state);
  const checkpoint = await createCheckpoint(state);
  const checkpointBefore = JSON.stringify(checkpoint);
  const result = await verifyHistory(before, checkpoint);
  assert.equal(canonicalExport(state), before);
  assert.equal(JSON.stringify(checkpoint), checkpointBefore);
  assert.notEqual(result.state, state);
  assert.notEqual(result.state.seed, state.seed);
  result.state.accounts.alpha.balance = '0';
  assert.equal(canonicalExport(state), before);
});

test('verification captures retained checkpoint values before asynchronous hashing', async () => {
  const state = states().second;
  const text = canonicalExport(state);
  const checkpoint = { ...await createCheckpoint(state) };
  const retained = { ...checkpoint };
  const pending = verifyHistory(text, checkpoint);
  checkpoint.sha256 = '0'.repeat(64);
  checkpoint.eventCount = 0;
  const result = await pending;
  assert.deepEqual(result.checkpoint, retained);
  assert.notEqual(result.checkpoint, checkpoint);
});
