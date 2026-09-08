// Original read-only consumer of the documented synthetic signed-action v1 wire.
// No application imports, writer helpers, replay state, private keys or network access.
import { createPublicKey, verify as verifyEd25519 } from 'node:crypto';
import { Buffer } from 'node:buffer';

const ACTION_NAMES = Object.freeze([
  'account', 'controller', 'deployment', 'domain', 'epoch', 'expiresAt', 'fee',
  'kind', 'network', 'nonce', 'notBefore', 'scenario', 'text', 'version'
]);
const TRUST_NAMES = Object.freeze(['domain', 'account', 'controller', 'epoch', 'nextNonce', 'publicKey']);
const MAX_SECOND = 253402300799;
const SIGNING_PREFIX = 'CAW_LOCAL_SIGNED_ACTION_V1\n';

function fail(category) {
  const error = new Error(`Signed-action reader rejected input: ${category}.`);
  error.code = `READER_${category}`;
  throw error;
}

// Object descriptors snapshot ordinary data records without invoking accessors.
// Proxy traps and a compromised runtime are outside this API's trust boundary.
function snapshot(input, names) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('SCHEMA');
  let prototype, descriptors;
  try {
    prototype = Object.getPrototypeOf(input);
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch { fail('SCHEMA'); }
  if (prototype !== null && prototype !== Object.prototype) fail('SCHEMA');
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== names.length || actual.some(name => !names.includes(name))) fail('SCHEMA');
  const values = Object.create(null);
  for (const name of names) {
    const property = descriptors[name];
    if (!property || !property.enumerable || !Object.hasOwn(property, 'value')) fail('SCHEMA');
    values[name] = property.value;
  }
  return values;
}

function wholeNumber(number, highest) {
  if (typeof number !== 'number' || !Number.isSafeInteger(number) ||
      Object.is(number, -0) || number < 0 || number > highest) fail('INTEGER');
}

function identityFields(value) {
  const { account, controller, domain } = value;
  if (typeof account !== 'string' || account.length < 1 || account.length > 32 ||
      /[^a-z0-9]/.test(account)) fail('LABEL');
  if (typeof controller !== 'string' || !controller.startsWith('device-')) fail('LABEL');
  const device = controller.slice(7);
  if (device.length < 1 || device.length > 40 || !/^[a-z0-9]/.test(device) ||
      /[^a-z0-9-]/.test(device)) fail('LABEL');
  if (typeof domain !== 'string' || domain.length < 1 || domain.length > 96 ||
      !/^[a-z0-9]/.test(domain) || /[^a-z0-9-]/.test(domain)) fail('LABEL');
  wholeNumber(value.epoch, 4294967295);
}

function lowerHex(value, length) {
  if (typeof value !== 'string' || value.length !== length || /[^0123456789abcdef]/.test(value)) fail('ENCODING');
}

// Count Unicode scalar values directly; do not normalize or count graphemes.
function scalarCount(value, category) {
  let count = 0;
  for (let at = 0; at < value.length; at += 1) {
    const unit = value.charCodeAt(at);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(at + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail(category);
      at += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      fail(category);
    }
    count += 1;
  }
  return count;
}

function decodedAction(input) {
  const a = snapshot(input, ACTION_NAMES);
  identityFields(a);
  wholeNumber(a.nonce, 255);
  wholeNumber(a.notBefore, MAX_SECOND);
  wholeNumber(a.expiresAt, MAX_SECOND);
  const duration = a.expiresAt - a.notBefore;
  if (duration < 1 || duration > 300) fail('WINDOW');
  if (a.version !== 1 || a.network !== 'simulation' || a.deployment !== 'unconnected-lab' ||
      a.scenario !== 'appendix-demo-v1' || a.kind !== 'caw' || a.fee !== '5000000000000000000000') fail('UNSUPPORTED');
  if (typeof a.text !== 'string' || a.text.length > 840 || a.text.trim().length === 0) fail('TEXT');
  if (scalarCount(a.text, 'TEXT') > 420) fail('TEXT');
  // Explicit wire order; insertion order of caller objects is never trusted.
  return Object.freeze({
    account: a.account, controller: a.controller, deployment: a.deployment,
    domain: a.domain, epoch: a.epoch, expiresAt: a.expiresAt, fee: a.fee,
    kind: a.kind, network: a.network, nonce: a.nonce, notBefore: a.notBefore,
    scenario: a.scenario, text: a.text, version: a.version
  });
}

/** Inspect one exact packet against caller-retained synthetic trust and time.
 * Synchronous; returns frozen facts or throws an Error with a READER_* code.
 * Repeating a valid inspection remains valid: this function consumes no nonce.
 */
export function inspectSignedAction(packetText, trusted, now) {
  if (typeof packetText !== 'string' || packetText.length > 8192 ||
      Buffer.byteLength(packetText, 'utf8') > 8192) fail('PACKET');
  scalarCount(packetText, 'PACKET');
  const context = snapshot(trusted, TRUST_NAMES);
  identityFields(context);
  wholeNumber(context.nextNonce, 256);
  lowerHex(context.publicKey, 64);
  wholeNumber(now, MAX_SECOND);

  let parsed;
  try { parsed = JSON.parse(packetText); } catch { fail('PACKET'); }
  const packet = snapshot(parsed, ['action', 'publicKey', 'signature']);
  const action = decodedAction(packet.action);
  lowerHex(packet.publicKey, 64);
  lowerHex(packet.signature, 128);
  const wireAction = JSON.stringify(action);
  const exactPacket = `{"action":${wireAction},"publicKey":${JSON.stringify(packet.publicKey)},"signature":${JSON.stringify(packet.signature)}}`;
  // Exact equality rejects whitespace, reordered/escaped keys, duplicate keys,
  // alternate escapes and number spellings, including duplicate escaped keys.
  if (packetText !== exactPacket) fail('CANONICAL');
  if (packet.publicKey !== context.publicKey) fail('KEY');
  if (action.domain !== context.domain) fail('DOMAIN');
  if (action.account !== context.account || action.controller !== context.controller || action.epoch !== context.epoch) fail('AUTHORITY');
  if (action.nonce !== context.nextNonce) fail('NONCE');
  if (now < action.notBefore || now >= action.expiresAt) fail('TIME');

  let verified;
  try {
    // RFC 8410: SEQUENCE { AlgorithmIdentifier(id-Ed25519, absent parameters),
    // BIT STRING (zero unused bits, 32 raw key bytes) }. No private key exists.
    const spki = Buffer.from(`302a300506032b6570032100${context.publicKey}`, 'hex');
    const key = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    verified = verifyEd25519(null, Buffer.from(SIGNING_PREFIX + wireAction, 'utf8'),
                            key, Buffer.from(packet.signature, 'hex'));
  } catch { fail('CRYPTO'); }
  if (verified !== true) fail('SIGNATURE');
  return Object.freeze({ action, canonical: true, signatureVerified: true,
    authorityMatched: true, nonceMatched: true, timeValid: true });
}
