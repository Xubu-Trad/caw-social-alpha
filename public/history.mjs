// Synthetic history integrity against a separately retained checkpoint only.
// This uses the same model as the writer; it is not an independent implementation,
// signature, proof of authorship/completeness, consensus or availability.
import { SCENARIO, canonicalExport, rebuild } from './model.mjs';

const FORMAT = 'caw-synthetic-checkpoint-v1';
const MAX_BYTES = 1024 * 1024;
const MAX_EVENTS = 256; // Must remain aligned with the reviewed model version.
const CHECKPOINT_FIELDS = ['format', 'scenario', 'eventCount', 'sha256'];
const encoder = new TextEncoder();

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function checkpointCopy(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_CHECKPOINT', 'Supply a separate synthetic history checkpoint.');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('INVALID_CHECKPOINT', 'The checkpoint must be a plain data object.');
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== CHECKPOINT_FIELDS.length ||
      keys.some(key => typeof key !== 'string' || !CHECKPOINT_FIELDS.includes(key))) {
    fail('INVALID_CHECKPOINT', 'The checkpoint fields do not match the supported format.');
  }
  const fields = Object.create(null);
  for (const key of CHECKPOINT_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      fail('INVALID_CHECKPOINT', 'Checkpoint fields must be enumerable data properties.');
    }
    // Read descriptor values, never an input getter. Capture before any await.
    fields[key] = descriptor.value;
  }
  if (fields.format !== FORMAT || fields.scenario !== SCENARIO ||
      !Number.isSafeInteger(fields.eventCount) || Object.is(fields.eventCount, -0) ||
      fields.eventCount < 0 || fields.eventCount > MAX_EVENTS ||
      typeof fields.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(fields.sha256)) {
    fail('INVALID_CHECKPOINT', 'Unsupported checkpoint format, scenario, count or digest.');
  }
  return Object.freeze({
    format: FORMAT,
    scenario: fields.scenario,
    eventCount: fields.eventCount,
    sha256: fields.sha256,
  });
}

function historyBytes(text) {
  if (typeof text !== 'string') {
    fail('INVALID_HISTORY', 'History must be canonical JSON text.');
  }
  // UTF-8 cannot use fewer bytes than this valid UTF-16 code-unit count.
  // Reject oversized strings before allocating their encoded representation.
  if (text.length > MAX_BYTES) {
    fail('HISTORY_TOO_LARGE', 'History exceeds the 1 MiB UTF-8 limit.');
  }
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        fail('INVALID_UNICODE', 'History contains an unpaired Unicode surrogate.');
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      fail('INVALID_UNICODE', 'History contains an unpaired Unicode surrogate.');
    }
  }
  const bytes = encoder.encode(text);
  if (bytes.byteLength > MAX_BYTES) {
    fail('HISTORY_TOO_LARGE', 'History exceeds the 1 MiB UTF-8 limit.');
  }
  return bytes;
}

async function sha256(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') {
    fail('CRYPTO_UNAVAILABLE', 'Platform SHA-256 is unavailable in this context.');
  }
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function createCheckpoint(state) {
  // canonicalExport validates and snapshots synchronously before SHA-256 yields.
  const text = canonicalExport(state);
  const bytes = historyBytes(text);
  const envelope = JSON.parse(text);
  return checkpointCopy({
    format: FORMAT,
    scenario: envelope.scenario,
    eventCount: envelope.expectedEventCount,
    sha256: await sha256(bytes),
  });
}

export async function verifyHistory(text, expectedCheckpoint) {
  // Copy primitive checkpoint fields first, preventing caller mutation during
  // the asynchronous digest from replacing the retained comparison target.
  const checkpoint = checkpointCopy(expectedCheckpoint);
  const bytes = historyBytes(text);
  if (await sha256(bytes) !== checkpoint.sha256) {
    fail('CHECKPOINT_MISMATCH', 'History differs from the separately retained checkpoint.');
  }

  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    fail('INVALID_HISTORY', 'History is not valid canonical JSON.');
  }
  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) {
    fail('INVALID_HISTORY', 'History must contain a synthetic export object.');
  }
  if (envelope.scenario !== checkpoint.scenario ||
      envelope.expectedEventCount !== checkpoint.eventCount) {
    fail('CHECKPOINT_MISMATCH', 'History scenario or event count differs from the checkpoint.');
  }

  // JSON.parse supplies data-only objects. The model checks the entire schema,
  // bounded structure, seed, event ordering, receipts and resulting snapshot.
  const state = rebuild(envelope.seed, envelope);
  const canonicalText = canonicalExport(state);
  if (canonicalText !== text) {
    // Includes duplicate keys that JSON.parse would otherwise silently collapse,
    // whitespace, reordered keys, alternate escapes and noncanonical numbers.
    fail('NON_CANONICAL_HISTORY', 'History must match the exact canonical export bytes.');
  }
  return Object.freeze({ state, canonicalText, checkpoint, byteLength: bytes.byteLength });
}
