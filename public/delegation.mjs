// Proposed local permission limits. The caller supplies trust; no NFT owner lookup.
import {DEMO_FEES} from './economics.mjs';
import {createActionVerifier} from './signatures.mjs';
export const MAX_DELEGATED_BUDGET=(BigInt(DEMO_FEES.caw)*64n).toString();
function ensure(ok,code,message){if(ok)return;const error=new Error(message);error.code=code;throw error;}
export function copyDelegation(value){
  const keys=['scope','budget','notBefore','expiresAt'];
  ensure(value!==null&&typeof value==='object'&&!Array.isArray(value),'INVALID_PERMISSION','Expected a plain permission record.');
  const proto=Object.getPrototypeOf(value),own=Reflect.ownKeys(value),copy={};
  ensure((proto===Object.prototype||proto===null)&&own.length===keys.length&&own.every(key=>keys.includes(key)),
    'INVALID_PERMISSION','Unexpected permission fields.');
  for(const key of keys){const field=Object.getOwnPropertyDescriptor(value,key);
    ensure(field&&Object.hasOwn(field,'value')&&field.enumerable,'INVALID_PERMISSION','Expected permission data fields.');copy[key]=field.value;}
  ensure(copy.scope==='caw','INVALID_PERMISSION','This permission allows only public CAWs.');
  ensure(typeof copy.budget==='string'&&/^[1-9][0-9]{0,23}(?![\s\S])/.test(copy.budget)&&BigInt(copy.budget)<=BigInt(MAX_DELEGATED_BUDGET),
    'INVALID_PERMISSION','Use a positive base-unit budget within the 64-CAW lab bound.');
  for(const key of ['notBefore','expiresAt'])ensure(Number.isSafeInteger(copy[key])&&!Object.is(copy[key],-0)&&copy[key]>=0&&copy[key]<=253402300799,
    'INVALID_PERMISSION','Use bounded integer permission times.');
  ensure(copy.expiresAt>copy.notBefore&&copy.expiresAt-copy.notBefore<=300,'INVALID_PERMISSION','A permission lasts at most five minutes.');
  return Object.freeze(copy);
}
// Internal state supplies spent. Pure calculation: checking never consumes budget.
export function checkDelegation(permission,spent,action,now){
  ensure(action.kind===permission.scope,'PERMISSION_SCOPE','This action is outside the permission.');
  ensure(action.notBefore>=permission.notBefore&&action.expiresAt<=permission.expiresAt&&now>=permission.notBefore&&now<permission.expiresAt,
    'PERMISSION_WINDOW','The action must stay within the permission validity window.');
  const next=BigInt(spent)+BigInt(action.fee);
  ensure(next<=BigInt(permission.budget),'PERMISSION_BUDGET','The remaining permission budget cannot cover this CAW.');
  return next.toString();
}
export async function bindDelegation(binding,delegation){
  // Copy trust before native hashing; never invoke getters or trust toJSON.
  const keys=['domain','account','controller','epoch','publicKey'],trusted={};
  ensure(binding!==null&&typeof binding==='object'&&!Array.isArray(binding),'INVALID_BINDING','Expected a test-key binding.');
  const proto=Object.getPrototypeOf(binding),own=Reflect.ownKeys(binding);
  ensure((proto===Object.prototype||proto===null)&&own.length===keys.length&&own.every(key=>keys.includes(key)),
    'INVALID_BINDING','Unexpected binding fields.');
  for(const key of keys){const field=Object.getOwnPropertyDescriptor(binding,key);
    ensure(field&&Object.hasOwn(field,'value')&&field.enumerable,'INVALID_BINDING','Expected binding data fields.');trusted[key]=field.value;}
  const validator=createActionVerifier({...trusted,nextNonce:0});validator.revoke();
  const permission=copyDelegation(delegation);
  const bytes=new TextEncoder().encode('CAW_LOCAL_DELEGATION_V1\n'+JSON.stringify({account:trusted.account,controller:trusted.controller,
    epoch:trusted.epoch,publicKey:trusted.publicKey,network:'simulation',deployment:'unconnected-lab',scenario:'appendix-demo-v1',
    fee:DEMO_FEES.caw,...permission}));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const domain='grant-'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  return Object.freeze({...trusted,domain});
}
