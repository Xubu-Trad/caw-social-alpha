// Portable synthetic evidence only. No private keys, live ledger, storage or network.
import {LAB_RECORD_LIMITS,copyLabBinding,copyLabCheckpoint,verifyLabRecord} from './signed-record.mjs';
import {copyDelegation} from './delegation.mjs';
import {copyOwnerAuthority} from './owner-grant.mjs';
import {createCheckpointTracker} from './checkpoint-continuity.mjs';

export const ANCHOR_PACKAGE_FORMAT='caw-retained-anchor-package-v1';
// A canonical record string can at most double when escaped into this package.
// The remaining 16 KiB covers the bounded checkpoint and authority fields.
export const ANCHOR_PACKAGE_LIMITS=Object.freeze({
  maxBytes:2*LAB_RECORD_LIMITS.maxRevokedBytes+16*1024,
  maxDepth:2,
});
const encoder=new TextEncoder();
const REQUIRED=['recordText','checkpoint','binding'];
const OPTIONAL=['delegation','ownerAuthority'];

function ensure(ok,code,message){if(ok)return;const error=new Error(message);error.code=code;throw error;}
function fields(value,required,optional=[]){
  ensure(value!==null&&typeof value==='object'&&!Array.isArray(value),'INVALID_ANCHOR_PACKAGE','Expected plain package data.');
  const prototype=Object.getPrototypeOf(value),keys=Reflect.ownKeys(value),allowed=[...required,...optional];
  ensure((prototype===Object.prototype||prototype===null)&&keys.length>=required.length&&keys.length<=allowed.length&&
    keys.every(key=>allowed.includes(key))&&required.every(key=>keys.includes(key)),
    'INVALID_ANCHOR_PACKAGE','Unexpected or missing package fields.');
  const copy=Object.create(null);
  for(const key of keys){
    const property=Object.getOwnPropertyDescriptor(value,key);
    ensure(property&&Object.hasOwn(property,'value')&&property.enumerable,'INVALID_ANCHOR_PACKAGE','Use enumerable data fields; accessors are unsupported.');
    copy[key]=property.value;
  }
  return copy;
}
function utf8(text,maximum){
  ensure(typeof text==='string'&&text.length<=maximum,'PACKAGE_LIMIT','Package text exceeds its local bound.');
  // Reject lone surrogates rather than letting UTF-8 replace invalid input.
  for(let index=0;index<text.length;index++){
    const unit=text.charCodeAt(index);
    if(unit>=0xd800&&unit<=0xdbff){
      const next=text.charCodeAt(index+1);
      ensure(next>=0xdc00&&next<=0xdfff,'INVALID_PACKAGE_UNICODE','Package text contains an unpaired surrogate.');index++;
    }else ensure(!(unit>=0xdc00&&unit<=0xdfff),'INVALID_PACKAGE_UNICODE','Package text contains an unpaired surrogate.');
  }
  const bytes=encoder.encode(text);ensure(bytes.byteLength<=maximum,'PACKAGE_LIMIT','UTF-8 package text exceeds its local bound.');return bytes;
}
function shallowJSON(text){
  // The outer format contains records of scalars. Embedded record JSON remains
  // a string. Bound nesting before JSON.parse; parsing still checks all syntax.
  let depth=0,string=false,escaped=false;
  for(const character of text){
    if(string){
      if(escaped)escaped=false;
      else if(character==='\\')escaped=true;
      else if(character==='"')string=false;
    }else if(character==='"')string=true;
    else if(character==='{'||character==='['){depth++;ensure(depth<=ANCHOR_PACKAGE_LIMITS.maxDepth,'PACKAGE_LIMIT','Package nesting exceeds the outer format.');}
    else if(character==='}'||character===']'){depth--;ensure(depth>=0,'INVALID_ANCHOR_PACKAGE','Package JSON is malformed.');}
  }
  let parsed;try{parsed=JSON.parse(text);}catch{ensure(false,'INVALID_ANCHOR_PACKAGE','Package is not valid JSON.');}return parsed;
}
function context(value){
  // Every trust record is copied and validated synchronously before any await.
  utf8(value.recordText,LAB_RECORD_LIMITS.maxRevokedBytes);
  return Object.freeze({recordText:value.recordText,checkpoint:copyLabCheckpoint(value.checkpoint),binding:copyLabBinding(value.binding),
    ...(Object.hasOwn(value,'delegation')?{delegation:copyDelegation(value.delegation)}:{}),
    ...(Object.hasOwn(value,'ownerAuthority')?{ownerAuthority:copyOwnerAuthority(value.ownerAuthority)}:{})});
}
function wire(value){
  return Object.freeze({format:ANCHOR_PACKAGE_FORMAT,recordText:value.recordText,checkpoint:value.checkpoint,binding:value.binding,
    ...(Object.hasOwn(value,'delegation')?{delegation:value.delegation}:{}),
    ...(Object.hasOwn(value,'ownerAuthority')?{ownerAuthority:value.ownerAuthority}:{})});
}
function expectedDigest(value){
  ensure(typeof value==='string'&&value.length===64&&!/[^0-9a-f]/.test(value),
    'INVALID_PACKAGE_DIGEST','Supply the separately retained lowercase SHA-256 package fingerprint.');return value;
}
async function sha256(bytes){
  const subtle=globalThis.crypto?.subtle;ensure(subtle,'CRYPTO_UNAVAILABLE','Native SHA-256 is unavailable.');
  return Array.from(new Uint8Array(await subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** Fully verify an exported anchor, then serialize and fingerprint its evidence. */
export async function createAnchorPackage(anchorData){
  const data=fields(anchorData,REQUIRED,[...OPTIONAL,'canonicalText']),captured=context(data);
  const suppliedHistory=Object.hasOwn(data,'canonicalText')?data.canonicalText:undefined;
  if(Object.hasOwn(data,'canonicalText'))utf8(suppliedHistory,1024*1024);
  const packageText=JSON.stringify(wire(captured)),bytes=utf8(packageText,ANCHOR_PACKAGE_LIMITS.maxBytes);
  const checked=await verifyLabRecord(captured.recordText,captured.checkpoint,captured.binding,captured.delegation,captured.ownerAuthority);
  ensure(suppliedHistory===undefined||suppliedHistory===checked.canonicalText,
    'ANCHOR_HISTORY_MISMATCH','The supplied final history differs from verified replay.');
  return Object.freeze({format:ANCHOR_PACKAGE_FORMAT,packageText,sha256:await sha256(bytes),byteLength:bytes.byteLength});
}

/** Import exact bytes under a separately retained expected digest. The returned
 * handle compares history only; it cannot sign, spend or restore a live grant.
 * The caller owns explicit replacement and stale-UI-result disposal. */
export async function importAnchorPackage(packageText,expectedSha256){
  const expected=expectedDigest(expectedSha256),bytes=utf8(packageText,ANCHOR_PACKAGE_LIMITS.maxBytes);
  const data=fields(shallowJSON(packageText),['format',...REQUIRED],OPTIONAL);
  ensure(data.format===ANCHOR_PACKAGE_FORMAT,'INVALID_ANCHOR_PACKAGE','Unsupported anchor package version.');
  const captured=context(data);
  ensure(JSON.stringify(wire(captured))===packageText,'NON_CANONICAL_PACKAGE','Use the exact canonical anchor package bytes.');
  const digest=await sha256(bytes);
  ensure(digest===expected,'PACKAGE_DIGEST_MISMATCH','Package bytes differ from the separately retained fingerprint.');
  const tracker=await createCheckpointTracker(captured.recordText,captured.checkpoint,captured.binding,captured.delegation,captured.ownerAuthority);
  return Object.freeze({format:ANCHOR_PACKAGE_FORMAT,tracker,sha256:digest,byteLength:bytes.byteLength});
}
