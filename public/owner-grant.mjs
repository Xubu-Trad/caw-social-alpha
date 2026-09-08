// Test-owner grants. Independently supplied authority is not NFT ownership proof.
import {createActionVerifier} from './signatures.mjs';
import {copyDelegation} from './delegation.mjs';
import {DEMO_FEES} from './economics.mjs';
const PREFIX='CAW_LOCAL_OWNER_GRANT_V1\n',encoder=new TextEncoder();
const GRANT_FIELDS=['version','network','deployment','scenario','fee','ownerDomain','account','controller','epoch','ownerKey','delegateKey','scope','budget','notBefore','expiresAt'];
function ensure(ok,code,message){if(ok)return;const error=new Error(message);error.code=code;throw error;}
function fields(value,keys){
  ensure(value!==null&&typeof value==='object'&&!Array.isArray(value),'INVALID_OWNER_GRANT','Expected plain grant data.');
  const proto=Object.getPrototypeOf(value),own=Reflect.ownKeys(value),copy={};
  ensure((proto===Object.prototype||proto===null)&&own.length===keys.length&&own.every(key=>keys.includes(key)),
    'INVALID_OWNER_GRANT','Unexpected grant fields.');
  for(const key of keys){const field=Object.getOwnPropertyDescriptor(value,key);ensure(field&&Object.hasOwn(field,'value')&&field.enumerable,
    'INVALID_OWNER_GRANT','Expected enumerable grant data fields.');copy[key]=field.value;}
  return copy;
}
function hex(text,length){ensure(typeof text==='string'&&text.length===length*2&&!/[^0-9a-f]/.test(text),'INVALID_OWNER_GRANT','Expected exact lowercase hexadecimal.');return Uint8Array.from(text.match(/../g),x=>parseInt(x,16));}
function toHex(value){return Array.from(new Uint8Array(value),x=>x.toString(16).padStart(2,'0')).join('');}
function engine(){ensure(globalThis.crypto?.subtle,'CRYPTO_UNAVAILABLE','Native grant cryptography is unavailable.');return crypto.subtle;}
export function copyOwnerAuthority(value){
  const authority=fields(value,['domain','account','controller','epoch','publicKey']);
  const validator=createActionVerifier({...authority,nextNonce:0});validator.revoke();return Object.freeze(authority);
}
function grantCopy(value){
  const grant=fields(value,GRANT_FIELDS);
  ensure(grant.version===1&&grant.network==='simulation'&&grant.deployment==='unconnected-lab'&&grant.scenario==='appendix-demo-v1'&&grant.fee===DEMO_FEES.caw,
    'INVALID_OWNER_GRANT','Unsupported grant context or economics.');
  copyOwnerAuthority({domain:grant.ownerDomain,account:grant.account,controller:grant.controller,epoch:grant.epoch,publicKey:grant.ownerKey});
  hex(grant.delegateKey,32);ensure(grant.delegateKey!==grant.ownerKey,'DISTINCT_KEYS','Use separate test-owner and delegated keys.');
  copyDelegation({scope:grant.scope,budget:grant.budget,notBefore:grant.notBefore,expiresAt:grant.expiresAt});
  return Object.freeze(grant);
}
export function makeOwnerGrant(authority,delegateKey,delegation){
  const owner=copyOwnerAuthority(authority),permission=copyDelegation(delegation);
  return grantCopy({version:1,network:'simulation',deployment:'unconnected-lab',scenario:'appendix-demo-v1',fee:DEMO_FEES.caw,
    ownerDomain:owner.domain,account:owner.account,controller:owner.controller,epoch:owner.epoch,ownerKey:owner.publicKey,delegateKey,...permission});
}
export function readOwnerGrant(text){
  ensure(typeof text==='string'&&text.length<=8192&&encoder.encode(text).byteLength<=8192,'INVALID_OWNER_GRANT','Grant packet exceeds 8 KiB.');
  let parsed;try{parsed=JSON.parse(text);}catch{ensure(false,'INVALID_OWNER_GRANT','Grant packet is not JSON.');}
  const value=fields(parsed,['grant','signature']),packet=Object.freeze({grant:grantCopy(value.grant),signature:value.signature});
  hex(packet.signature,64);ensure(JSON.stringify(packet)===text,'NON_CANONICAL_GRANT','Use the exact canonical signed grant.');return packet;
}
export function copyOwnerAuthorization(value){
  const auth=fields(value,['packet','authority']);readOwnerGrant(auth.packet);
  return Object.freeze({packet:auth.packet,authority:copyOwnerAuthority(auth.authority)});
}
export async function createOwnerGrantSigner(){
  const subtle=engine();let pair;
  try{pair=await subtle.generateKey({name:'Ed25519'},false,['sign','verify']);}catch{ensure(false,'CRYPTO_UNAVAILABLE','Native Ed25519 owner signing is unavailable.');}
  let privateKey=pair.privateKey;ensure(privateKey.extractable===false,'UNSAFE_KEY','Owner test key must be non-extractable.');
  const publicKey=toHex(await subtle.exportKey('raw',pair.publicKey));pair=null;let closed=false;
  return Object.freeze({publicKey,
    async sign(value){
      ensure(!closed,'REVOKED','The test-owner signer is closed.');const grant=grantCopy(value);
      ensure(grant.ownerKey===publicKey,'WRONG_OWNER_KEY','This grant names another test-owner key.');
      const signature=toHex(await subtle.sign('Ed25519',privateKey,encoder.encode(PREFIX+JSON.stringify(grant))));
      ensure(!closed,'REVOKED','The test-owner signer closed during signing.');return JSON.stringify({grant,signature});
    },
    revoke(){closed=true;privateKey=null;}
  });
}
export async function verifyOwnerGrant(text,ownerAuthority){
  // Capture independent trust before any native operation yields.
  const authority=copyOwnerAuthority(ownerAuthority),packet=readOwnerGrant(text),grant=packet.grant,subtle=engine();
  ensure(grant.ownerKey===authority.publicKey&&grant.ownerDomain===authority.domain&&grant.account===authority.account&&
    grant.controller===authority.controller&&grant.epoch===authority.epoch,'WRONG_OWNER_AUTHORITY','The grant does not match the separately trusted test owner.');
  const bytes=encoder.encode(PREFIX+JSON.stringify(grant)),key=await subtle.importKey('raw',hex(authority.publicKey,32),'Ed25519',false,['verify']);
  ensure(await subtle.verify('Ed25519',key,hex(packet.signature,64),bytes),'INVALID_OWNER_SIGNATURE','The test-owner grant signature is invalid.');
  const domain='ownergrant-'+toHex(await subtle.digest('SHA-256',bytes));
  return Object.freeze({binding:Object.freeze({domain,account:grant.account,controller:grant.controller,epoch:grant.epoch,publicKey:grant.delegateKey}),
    delegation:copyDelegation({scope:grant.scope,budget:grant.budget,notBefore:grant.notBefore,expiresAt:grant.expiresAt}),authority});
}
export async function verifyOwnerBinding(auth,binding,permission){
  const owned=copyOwnerAuthorization(auth),trusted=copyOwnerAuthority(binding),terms=copyDelegation(permission);
  const checked=await verifyOwnerGrant(owned.packet,owned.authority);
  ensure(JSON.stringify(checked.binding)===JSON.stringify(trusted)&&JSON.stringify(checked.delegation)===JSON.stringify(terms),
    'OWNER_GRANT_MISMATCH','The delegate binding or permission differs from the owner-signed grant.');return checked;
}
