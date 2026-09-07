// A local Ed25519 lab, not Ethereum wallet authentication or protocol settlement.
// Native WebCrypto implements the cryptography. This module defines a proposed,
// bounded envelope and an in-memory verifier with independently supplied trust.
import { countCharacters, SCENARIO } from './model.mjs';
import { DEMO_FEES } from './economics.mjs';

const FIELDS = ['account','controller','deployment','domain','epoch','expiresAt','fee',
  'kind','network','nonce','notBefore','scenario','text','version'];
const CONTEXT = ['domain','account','controller','epoch','nextNonce','publicKey'];
const encoder = new TextEncoder();
const PREFIX = 'CAW_LOCAL_SIGNED_ACTION_V1\n';
const MAX_TIME = 253402300799;
const MAX_PACKET = 8192;

function ensure(condition, code, message) {
  if (condition) return;
  const error = new Error(message); error.code = code; throw error;
}
function record(value, keys) {
  ensure(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_SCHEMA', 'Expected a plain data record.');
  const proto = Object.getPrototypeOf(value);
  ensure(proto === Object.prototype || proto === null, 'INVALID_SCHEMA', 'Expected a plain data record.');
  const own = Reflect.ownKeys(value);
  ensure(own.length === keys.length && own.every(key => keys.includes(key)), 'INVALID_SCHEMA', 'Unexpected record fields.');
  const copy = Object.create(null);
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    ensure(field && Object.hasOwn(field, 'value') && field.enumerable, 'INVALID_SCHEMA', 'Expected enumerable data fields.');
    copy[key] = field.value; // Never invoke a supplied getter or toJSON method.
  }
  return copy;
}
function integer(value, maximum) {
  ensure(Number.isSafeInteger(value) && !Object.is(value,-0) && value >= 0 && value <= maximum, 'INVALID_INTEGER', 'Integer outside the lab bound.');
}
function label(value, pattern) {
  ensure(typeof value === 'string' && pattern.test(value), 'INVALID_LABEL', 'Unsupported lab label.');
}
function identity(value) {
  label(value.account,/^[a-z0-9]{1,32}(?![\s\S])/);
  label(value.controller,/^device-[a-z0-9][a-z0-9-]{0,39}(?![\s\S])/);
  label(value.domain,/^[a-z0-9][a-z0-9-]{0,95}(?![\s\S])/);
  integer(value.epoch,4294967295);
}
function hex(value, bytes) {
  ensure(typeof value === 'string' && value.length === bytes*2 && !/[^0-9a-f]/.test(value), 'INVALID_ENCODING', 'Expected exact lowercase hexadecimal.');
  return Uint8Array.from(value.match(/../g), pair => parseInt(pair,16));
}
function toHex(value) { return Array.from(new Uint8Array(value),byte=>byte.toString(16).padStart(2,'0')).join(''); }
function actionCopy(value) {
  const action = record(value,FIELDS);
  identity(action); integer(action.nonce,255);
  integer(action.notBefore,MAX_TIME); integer(action.expiresAt,MAX_TIME);
  ensure(action.expiresAt>action.notBefore && action.expiresAt-action.notBefore<=300, 'INVALID_WINDOW', 'Use a positive validity window of at most five minutes.');
  ensure(action.version===1 && action.network==='simulation' && action.deployment==='unconnected-lab' &&
    action.scenario===SCENARIO && action.kind==='caw' && action.fee===DEMO_FEES.caw,
    'UNSUPPORTED_ACTION', 'Only the fixed local CAW example is supported.');
  ensure(typeof action.text==='string' && action.text.length<=840 && countCharacters(action.text)<=420 && action.text.trim().length>0,
    'INVALID_TEXT','Use 1–420 well-formed Unicode code points.');
  return Object.freeze(Object.fromEntries(FIELDS.map(key=>[key,action[key]])));
}
export function canonicalAction(action) { return JSON.stringify(actionCopy(action)); }
function packetCopy(text) {
  ensure(typeof text==='string' && text.length<=MAX_PACKET && encoder.encode(text).byteLength<=MAX_PACKET, 'INVALID_PACKET', 'Signed example exceeds the 8 KiB bound.');
  let value;
  try { value=JSON.parse(text); } catch { ensure(false,'INVALID_PACKET','Signed example is not JSON.'); }
  const raw=record(value,['action','publicKey','signature']);
  const action=actionCopy(raw.action);
  hex(raw.publicKey,32); hex(raw.signature,64);
  const packet=Object.freeze({action,publicKey:raw.publicKey,signature:raw.signature});
  ensure(JSON.stringify(packet)===text,'NON_CANONICAL_PACKET','Use the exact signed example bytes.');
  return packet;
}
function subtle() {
  ensure(globalThis.crypto?.subtle,'CRYPTO_UNAVAILABLE','Native cryptography is unavailable. The lab stays disabled.');
  return globalThis.crypto.subtle;
}

export async function createDemoSigner() {
  const engine=subtle();
  let pair;
  try { pair=await engine.generateKey({name:'Ed25519'},false,['sign','verify']); }
  catch { ensure(false,'CRYPTO_UNAVAILABLE','This browser does not support the signature lab.'); }
  let privateKey=pair.privateKey;
  ensure(privateKey.extractable===false,'UNSAFE_KEY','The test private key must be non-extractable.');
  const publicKey=toHex(await engine.exportKey('raw',pair.publicKey));
  pair=null;
  let revoked=false;
  return Object.freeze({
    publicKey,
    async sign(value) {
      ensure(!revoked,'REVOKED','The temporary signer has been closed.');
      const action=actionCopy(value), bytes=encoder.encode(PREFIX+JSON.stringify(action));
      const signature=toHex(await engine.sign('Ed25519',privateKey,bytes));
      ensure(!revoked,'REVOKED','The temporary signer was closed during signing.');
      return JSON.stringify({action,publicKey,signature});
    },
    revoke() { revoked=true; privateKey=null; }
  });
}

export function createActionVerifier(value, clock=()=>Math.floor(Date.now()/1000)) {
  const trusted=record(value,CONTEXT); identity(trusted);
  integer(trusted.nextNonce,256); hex(trusted.publicKey,32);
  ensure(typeof clock==='function','INVALID_CLOCK','A trusted lab clock is required.');
  Object.freeze(trusted);
  let nextNonce=trusted.nextNonce, revoked=false;
  const engine=subtle();
  function policy(packet) {
    const action=packet.action;
    const now=clock(); integer(now,MAX_TIME);
    ensure(!revoked,'REVOKED','The temporary verifier has been closed.');
    ensure(packet.publicKey===trusted.publicKey,'WRONG_KEY','The signature key is not the key trusted by this lab.');
    ensure(action.domain===trusted.domain,'WRONG_DOMAIN','This example belongs to another lab session.');
    ensure(action.account===trusted.account && action.controller===trusted.controller && action.epoch===trusted.epoch,
      'WRONG_AUTHORITY','The account, controller or ownership epoch does not match.');
    ensure(action.nonce===nextNonce,'STALE_NONCE','This action number is already used or out of order.');
    ensure(now>=action.notBefore && now<action.expiresAt,'OUTSIDE_WINDOW','This example is not yet valid or has expired.');
  }
  async function verify(text, consume) {
    const packet=packetCopy(text); policy(packet);
    // The trusted public key is captured separately from the submitted packet.
    const key=await engine.importKey('raw',hex(trusted.publicKey,32),'Ed25519',false,['verify']);
    const valid=await engine.verify('Ed25519',key,hex(packet.signature,64),encoder.encode(PREFIX+JSON.stringify(packet.action)));
    ensure(valid,'INVALID_SIGNATURE','The signed fields or signature were changed.');
    // No await between the final state check and consuming the nonce. Concurrent
    // calls on this one verifier cannot both accept an identical action number.
    policy(packet);
    if (!consume) return packet.action;
    nextNonce+=1;
    return Object.freeze({action:packet.action,nextNonce});
  }
  return Object.freeze({
    check(text) { return verify(text,false); },
    accept(text) { return verify(text,true); },
    revoke() { revoked=true; },
    status() { return Object.freeze({nextNonce,revoked}); }
  });
}
