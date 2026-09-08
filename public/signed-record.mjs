// Bounded lab recovery. A retained fingerprint and test binding are assumptions,
// not proof of NFT ownership, historical clock accuracy, finality or availability.
import {applyAction,canonicalExport,countCharacters,rebuild} from './model.mjs';
import {createActionVerifier} from './signatures.mjs';
import {copyDelegation,checkDelegation,bindDelegation} from './delegation.mjs';

const FORMAT='caw-signed-lab-record-v1',CHECKPOINT='caw-signed-lab-checkpoint-v1';
const DELEGATED_FORMAT='caw-delegated-lab-record-v1';
export const LAB_RECORD_LIMITS=Object.freeze({maxBytes:2*1024*1024,maxEntries:64});
const encoder=new TextEncoder();
function ensure(condition,code,message){if(condition)return;const error=new Error(message);error.code=code;throw error;}
function fields(value,keys,code='INVALID_RECORD'){
  ensure(value!==null && typeof value==='object' && !Array.isArray(value),code,'Expected a plain data record.');
  const proto=Object.getPrototypeOf(value),own=Reflect.ownKeys(value);
  ensure((proto===Object.prototype||proto===null)&&own.length===keys.length&&own.every(key=>keys.includes(key)),code,'Unexpected record fields.');
  const copy={};
  for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);
    ensure(descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.enumerable,code,'Expected enumerable data fields.');copy[key]=descriptor.value;}
  return copy;
}
function bytes(text,maximum){
  ensure(typeof text==='string'&&text.length<=maximum,'RECORD_LIMIT','Text exceeds the local record bound.');
  countCharacters(text);const value=encoder.encode(text);
  ensure(value.byteLength<=maximum,'RECORD_LIMIT','UTF-8 text exceeds the local record bound.');return value;
}
function integer(value,max){ensure(Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=0&&value<=max,'INVALID_RECORD','Integer exceeds the record bound.');}
function parse(text){try{return JSON.parse(text);}catch{ensure(false,'INVALID_RECORD','Record is not valid JSON.');}}
function modelHistory(text){
  bytes(text,1024*1024);const envelope=parse(text);
  ensure(envelope!==null&&typeof envelope==='object'&&!Array.isArray(envelope),'INVALID_RECORD','Expected an initial model history.');
  const state=rebuild(envelope.seed,envelope);
  ensure(canonicalExport(state)===text,'NON_CANONICAL_RECORD','Use exact canonical model history.');return state;
}
function entryCopy(value){
  ensure(value!==null&&typeof value==='object'&&!Array.isArray(value),'INVALID_RECORD','Expected an entry.');
  const kind=Object.getOwnPropertyDescriptor(value,'kind');
  ensure(kind&&Object.hasOwn(kind,'value'),'INVALID_RECORD','Expected a plain entry kind.');
  if(kind.value==='signed-caw'){
    const entry=fields(value,['kind','packet','acceptedAt']);bytes(entry.packet,8192);integer(entry.acceptedAt,253402300799);return Object.freeze(entry);
  }
  ensure(kind.value==='unsigned-fixture-transfer','INVALID_RECORD','Unsupported lab record entry.');
  const entry=fields(value,['kind','newController']);
  ensure(typeof entry.newController==='string'&&/^device-[a-z0-9][a-z0-9-]{0,39}(?![\s\S])/.test(entry.newController),'INVALID_RECORD','Expected a synthetic controller label.');
  return Object.freeze(entry);
}
function recordCopy(text){
  bytes(text,LAB_RECORD_LIMITS.maxBytes);const parsed=parse(text),delegated=parsed?.format===DELEGATED_FORMAT;
  const value=fields(parsed,delegated?['format','initialHistory','delegation','entries']:['format','initialHistory','entries']);
  ensure((value.format===FORMAT||delegated)&&Array.isArray(value.entries)&&value.entries.length<=LAB_RECORD_LIMITS.maxEntries,'INVALID_RECORD','Unsupported record format or entry count.');
  // JSON.parse supplies dense data arrays; entry validation rejects all extras.
  modelHistory(value.initialHistory);
  const record={format:value.format,initialHistory:value.initialHistory,...(delegated?{delegation:copyDelegation(value.delegation)}:{}),entries:value.entries.map(entryCopy)};
  ensure(JSON.stringify(record)===text,'NON_CANONICAL_RECORD','Use the exact canonical record bytes.');return record;
}
export function copyLabBinding(value){
  const binding=fields(value,['domain','account','controller','epoch','publicKey'],'INVALID_BINDING');
  const validator=createActionVerifier({...binding,nextNonce:0});validator.revoke();return Object.freeze(binding);
}
export function createLabRecord(initialHistory,delegation){
  modelHistory(initialHistory);const permission=delegation===undefined?undefined:copyDelegation(delegation);
  const text=JSON.stringify({format:permission?DELEGATED_FORMAT:FORMAT,initialHistory,...(permission?{delegation:permission}:{}),entries:[]});
  bytes(text,LAB_RECORD_LIMITS.maxBytes);return text;
}
export function appendLabRecord(text,entry){
  const record=recordCopy(text);ensure(record.entries.length<LAB_RECORD_LIMITS.maxEntries,'RECORD_LIMIT','This lab preserves at most 64 added events.');
  record.entries.push(entryCopy(entry));const next=JSON.stringify(record);bytes(next,LAB_RECORD_LIMITS.maxBytes);return next;
}
function checkpointCopy(value){
  const copy=fields(value,['format','entryCount','byteLength','sha256','finalHistorySha256'],'INVALID_CHECKPOINT');
  ensure(copy.format===CHECKPOINT,'INVALID_CHECKPOINT','Unsupported saved fingerprint format.');
  integer(copy.entryCount,LAB_RECORD_LIMITS.maxEntries);integer(copy.byteLength,LAB_RECORD_LIMITS.maxBytes);
  for(const key of ['sha256','finalHistorySha256'])ensure(typeof copy[key]==='string'&&/^[0-9a-f]{64}(?![\s\S])/.test(copy[key]),'INVALID_CHECKPOINT','Expected an exact SHA-256 fingerprint.');
  return Object.freeze(copy);
}
async function hash(value){
  ensure(globalThis.crypto?.subtle,'CRYPTO_UNAVAILABLE','Native SHA-256 is unavailable.');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function createLabRecordCheckpoint(recordText,finalHistory){
  const record=recordCopy(recordText),recordBytes=bytes(recordText,LAB_RECORD_LIMITS.maxBytes);
  modelHistory(finalHistory);const finalBytes=bytes(finalHistory,1024*1024);
  // Capture both immutable strings before yielding; hashing does not certify them.
  const sha256=await hash(recordBytes),finalHistorySha256=await hash(finalBytes);
  return checkpointCopy({format:CHECKPOINT,entryCount:record.entries.length,byteLength:recordBytes.byteLength,sha256,finalHistorySha256});
}
export async function verifyLabRecord(recordText,expectedCheckpoint,binding,delegation){
  // Copy independent trust before any digest/verification yields to the caller.
  const checkpoint=checkpointCopy(expectedCheckpoint),trusted=copyLabBinding(binding),record=recordCopy(recordText);
  const permission=delegation===undefined?undefined:copyDelegation(delegation);
  ensure(Boolean(permission)===Boolean(record.delegation)&&(!permission||JSON.stringify(permission)===JSON.stringify(record.delegation)),
    'PERMISSION_MISMATCH','Supply the separately retained permission for this record; it must match exactly.');
  ensure(permission||!trusted.domain.startsWith('grant-'),'PERMISSION_REQUIRED','A grant-domain key requires its permission even in historical inspection.');
  if(permission)ensure((await bindDelegation(trusted,permission)).domain===trusted.domain,'PERMISSION_BINDING','The signed domain must commit to the supplied permission and test key.');
  const recordBytes=bytes(recordText,LAB_RECORD_LIMITS.maxBytes);
  ensure(record.entries.length===checkpoint.entryCount&&recordBytes.byteLength===checkpoint.byteLength,'CHECKPOINT_MISMATCH','Record length or entry count differs from the saved fingerprint.');
  ensure(await hash(recordBytes)===checkpoint.sha256,'CHECKPOINT_MISMATCH','Record bytes differ from the separately saved fingerprint.');
  let state=modelHistory(record.initialHistory),signedActions=0,fixtureTransfers=0,spent='0';
  const inheritedEvents=state.events.length;
  ensure(!permission||inheritedEvents===0,'PERMISSION_HISTORY','A delegated record must start from a fresh fixture.');
  ensure(Object.hasOwn(state.accounts,trusted.account),'UNKNOWN_ACCOUNT','The bound account is absent from the initial history.');
  const initial=state.accounts[trusted.account];
  ensure(initial.controller===trusted.controller&&initial.epoch===trusted.epoch,'WRONG_AUTHORITY','The separate test binding does not match the initial account.');
  for(const entry of record.entries){
    const account=state.accounts[trusted.account];let intent;
    if(entry.kind==='signed-caw'){
      ensure(account.controller===trusted.controller&&account.epoch===trusted.epoch,'WRONG_AUTHORITY','A signed action uses authority invalidated by a fixture transfer.');
      const verifier=createActionVerifier({...trusted,nextNonce:account.nonce},()=>entry.acceptedAt);let action;
      try{action=await verifier.check(entry.packet);}finally{verifier.revoke();}
      if(permission)spent=checkDelegation(permission,spent,action,entry.acceptedAt);
      intent={id:'signed-'+action.account+'-'+action.nonce,kind:'caw',actor:action.account,controller:action.controller,epoch:action.epoch,nonce:action.nonce,text:action.text};
      signedActions+=1;
    }else{
      intent={id:'transfer-'+account.name+'-'+account.nonce,kind:'transfer',actor:account.name,controller:account.controller,epoch:account.epoch,nonce:account.nonce,newController:entry.newController};
      fixtureTransfers+=1;
    }
    state=applyAction(state,intent);
  }
  const canonicalText=canonicalExport(state);
  ensure(state.events.length===inheritedEvents+record.entries.length,'RECORD_MISMATCH','Record entries do not cover the complete added event suffix.');
  ensure(await hash(bytes(canonicalText,1024*1024))===checkpoint.finalHistorySha256,'FINAL_HISTORY_MISMATCH','Rebuilt history differs from the separately saved final fingerprint.');
  return Object.freeze({canonicalText,checkpoint,signedActions,fixtureTransfers,inheritedEvents,
    entryCount:record.entries.length,recordedTimesAreProof:false,ownershipProven:false,
    ...(permission?{delegation:Object.freeze({permission,spent,remaining:(BigInt(permission.budget)-BigInt(spent)).toString()})}:{})});
}
