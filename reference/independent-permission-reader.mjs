// Original synchronous inspection of synthetic permissions and owner packets.
// No application imports, signer, private keys, storage or network operations.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { Buffer } from 'node:buffer';

const TERMS = ['scope', 'budget', 'notBefore', 'expiresAt'];
const AUTHORITY = ['domain', 'account', 'controller', 'epoch', 'publicKey'];
const GRANT = ['version', 'network', 'deployment', 'scenario', 'fee', 'ownerDomain',
  'account', 'controller', 'epoch', 'ownerKey', 'delegateKey', ...TERMS];
const CANCELLATION = ['version', 'network', 'deployment', 'scenario', 'ownerDomain',
  'account', 'controller', 'epoch', 'ownerKey', 'grantDomain'];
const FEE = '5000000000000000000000';
const MAX_BUDGET = 320000000000000000000000n;
const GRANT_PREFIX = 'CAW_LOCAL_OWNER_GRANT_V1\n';
const CANCEL_PREFIX = 'CAW_LOCAL_OWNER_REVOCATION_V1\n';
const LIMITS = Object.freeze({ authorityProven: false, freshnessProven: false, livePermissionRestored: false });

function fail(reason) {
  const error = new Error(`Independent permission reader rejected input: ${reason}.`);
  error.code = `PERMISSION_${reason}`;
  throw error;
}

function capture(input, keys) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('SCHEMA');
  let descriptors, prototype;
  try {
    descriptors = Object.getOwnPropertyDescriptors(input);
    prototype = Object.getPrototypeOf(input);
  } catch { fail('SCHEMA'); }
  if (prototype !== Object.prototype && prototype !== null) fail('SCHEMA');
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) fail('SCHEMA');
  const copy = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('SCHEMA');
    copy[key] = descriptor.value;
  }
  return copy;
}

function boundedInteger(value, max, reason) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > max) fail(reason);
}

function hex(value, characters) {
  if (typeof value !== 'string' || value.length !== characters || /[^0-9a-f]/.test(value)) fail('KEYS');
}

export function copyPermissionTerms(value) {
  if (arguments.length !== 1) fail('SCHEMA');
  const p = capture(value, TERMS);
  if (p.scope !== 'caw' || typeof p.budget !== 'string' || p.budget.length < 1 ||
      p.budget.length > 24 || p.budget[0] === '0' || /[^0-9]/.test(p.budget) || BigInt(p.budget) > MAX_BUDGET) fail('TERMS');
  boundedInteger(p.notBefore, 253402300799, 'TERMS');
  boundedInteger(p.expiresAt, 253402300799, 'TERMS');
  if (p.expiresAt <= p.notBefore || p.expiresAt - p.notBefore > 300) fail('TERMS');
  return Object.freeze({ scope: p.scope, budget: p.budget, notBefore: p.notBefore, expiresAt: p.expiresAt });
}

export function copyPermissionAuthority(value) {
  if (arguments.length !== 1) fail('SCHEMA');
  const a = capture(value, AUTHORITY);
  if (typeof a.domain !== 'string' || a.domain.length < 1 || a.domain.length > 96 ||
      !/^[a-z0-9]/.test(a.domain) || /[^a-z0-9-]/.test(a.domain)) fail('AUTHORITY');
  if (typeof a.account !== 'string' || a.account.length < 1 || a.account.length > 32 || /[^a-z0-9]/.test(a.account)) fail('AUTHORITY');
  if (typeof a.controller !== 'string' || !a.controller.startsWith('device-')) fail('AUTHORITY');
  const suffix = a.controller.slice(7);
  if (suffix.length < 1 || suffix.length > 40 || !/^[a-z0-9]/.test(suffix) || /[^a-z0-9-]/.test(suffix)) fail('AUTHORITY');
  boundedInteger(a.epoch, 4294967295, 'AUTHORITY');
  hex(a.publicKey, 64);
  return Object.freeze({ domain: a.domain, account: a.account, controller: a.controller, epoch: a.epoch, publicKey: a.publicKey });
}

function sha(text) {
  try { return createHash('sha256').update(text, 'utf8').digest('hex'); }
  catch { fail('CRYPTO'); }
}

function verifyPacket(prefix, body, signature, publicKey) {
  let valid;
  try {
    const key = createPublicKey({ key: Buffer.from('302a300506032b6570032100' + publicKey, 'hex'), format: 'der', type: 'spki' });
    valid = verify(null, Buffer.from(prefix + JSON.stringify(body), 'utf8'), key, Buffer.from(signature, 'hex'));
  } catch { fail('CRYPTO'); }
  if (!valid) fail('SIGNATURE');
}

function parsePacket(text) {
  if (typeof text !== 'string' || text.length > 8192 || Buffer.byteLength(text, 'utf8') > 8192) fail('PACKET');
  for (let at = 0; at < text.length; at += 1) {
    const unit = text.charCodeAt(at);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(at + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('PACKET');
      at += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) fail('PACKET');
  }
  try { return JSON.parse(text); } catch { fail('PACKET'); }
}

function context(body, includesFee) {
  if (body.version !== 1 || body.network !== 'simulation' || body.deployment !== 'unconnected-lab' ||
      body.scenario !== 'appendix-demo-v1' || (includesFee && body.fee !== FEE)) fail('CONTEXT');
}

function grantDomain(value) {
  if (typeof value !== 'string' || !value.startsWith('ownergrant-') || value.length !== 75 ||
      /[^0-9a-f]/.test(value.slice(11))) fail('DOMAIN');
}

function ownerFrom(body) {
  return copyPermissionAuthority({ domain: body.ownerDomain, account: body.account,
    controller: body.controller, epoch: body.epoch, publicKey: body.ownerKey });
}

export function inspectDelegatedPermission(binding, permission) {
  if (arguments.length !== 2) fail('SCHEMA');
  const trusted = copyPermissionAuthority(binding), terms = copyPermissionTerms(permission);
  const body = { account: trusted.account, controller: trusted.controller, epoch: trusted.epoch,
    publicKey: trusted.publicKey, network: 'simulation', deployment: 'unconnected-lab',
    scenario: 'appendix-demo-v1', fee: FEE, ...terms };
  const domain = 'grant-' + sha('CAW_LOCAL_DELEGATION_V1\n' + JSON.stringify(body));
  if (trusted.domain !== domain) fail('DOMAIN');
  return Object.freeze({ binding: trusted, permission: terms, domainMatched: true, ...LIMITS });
}

export function inspectOwnerGrant(packetText, ownerAuthority) {
  if (arguments.length !== 2) fail('SCHEMA');
  const authority = copyPermissionAuthority(ownerAuthority);
  const packet = capture(parsePacket(packetText), ['grant', 'signature']);
  const value = capture(packet.grant, GRANT);
  context(value, true);
  const namedOwner = ownerFrom(value);
  hex(value.delegateKey, 64); hex(packet.signature, 128);
  if (value.delegateKey === value.ownerKey) fail('KEYS');
  const permission = copyPermissionTerms({ scope: value.scope, budget: value.budget,
    notBefore: value.notBefore, expiresAt: value.expiresAt });
  const grant = Object.freeze({ version: value.version, network: value.network, deployment: value.deployment,
    scenario: value.scenario, fee: value.fee, ownerDomain: value.ownerDomain, account: value.account,
    controller: value.controller, epoch: value.epoch, ownerKey: value.ownerKey, delegateKey: value.delegateKey, ...permission });
  if (JSON.stringify({ grant, signature: packet.signature }) !== packetText) fail('CANONICAL');
  if (JSON.stringify(namedOwner) !== JSON.stringify(authority)) fail('OWNER');
  verifyPacket(GRANT_PREFIX, grant, packet.signature, authority.publicKey);
  const binding = Object.freeze({ domain: 'ownergrant-' + sha(GRANT_PREFIX + JSON.stringify(grant)),
    account: grant.account, controller: grant.controller, epoch: grant.epoch, publicKey: grant.delegateKey });
  return Object.freeze({ binding, permission, authority, ownerGrantVerified: true, ...LIMITS });
}

export function inspectOwnerCancellation(packetText, ownerAuthority, expectedGrantDomain) {
  if (arguments.length !== 3) fail('SCHEMA');
  const authority = copyPermissionAuthority(ownerAuthority);
  grantDomain(expectedGrantDomain);
  const packet = capture(parsePacket(packetText), ['revocation', 'signature']);
  const value = capture(packet.revocation, CANCELLATION);
  context(value, false); ownerFrom(value); grantDomain(value.grantDomain); hex(packet.signature, 128);
  const revocation = Object.freeze({ version: value.version, network: value.network, deployment: value.deployment,
    scenario: value.scenario, ownerDomain: value.ownerDomain, account: value.account, controller: value.controller,
    epoch: value.epoch, ownerKey: value.ownerKey, grantDomain: value.grantDomain });
  if (JSON.stringify({ revocation, signature: packet.signature }) !== packetText) fail('CANONICAL');
  if (revocation.ownerDomain !== authority.domain || revocation.account !== authority.account ||
      revocation.controller !== authority.controller || revocation.epoch !== authority.epoch ||
      revocation.ownerKey !== authority.publicKey || revocation.grantDomain !== expectedGrantDomain) fail('CANCELLATION');
  verifyPacket(CANCEL_PREFIX, revocation, packet.signature, authority.publicKey);
  return Object.freeze({ revocation, ownerRevocationVerified: true, ...LIMITS });
}
