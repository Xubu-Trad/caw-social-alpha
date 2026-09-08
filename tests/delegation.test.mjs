import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createState,applyAction} from '../public/model.mjs';
import {createDemoSigner} from '../public/signatures.mjs';
import {createSignedLedger} from '../public/signed-ledger.mjs';
import {copyDelegation,bindDelegation,MAX_DELEGATED_BUDGET} from '../public/delegation.mjs';
import {createLabRecordCheckpoint,verifyLabRecord,createLabRecord,appendLabRecord} from '../public/signed-record.mjs';
const NOW=1700000000,FEE='5000000000000000000000';
const code=expected=>error=>error?.code===expected;
function initial(balance=(BigInt(FEE)*80n).toString(),posts=[]){return createState({version:1,scenario:'appendix-demo-v1',accounts:[
  {name:'alpha',controller:'device-alpha',balance,stake:'1'},
  {name:'beta',controller:'device-beta',balance:'0',stake:'1'}],posts});}
function grant(patch={}){return {scope:'caw',budget:(BigInt(FEE)*2n).toString(),notBefore:NOW,expiresAt:NOW+120,...patch};}
async function setup(t,{permission=grant(),balance,clock=()=>NOW,posts}={}){
  const signer=await createDemoSigner();t.after(()=>signer.revoke());
  const binding=await bindDelegation({domain:'unbound',account:'alpha',controller:'device-alpha',epoch:0,publicKey:signer.publicKey},permission);
  const state=initial(balance,posts),ledger=createSignedLedger(state,binding,clock,permission);t.after(()=>ledger.revoke());
  const action=(nonce=0,patch={})=>({account:'alpha',controller:'device-alpha',deployment:'unconnected-lab',domain:binding.domain,epoch:0,
    expiresAt:NOW+120,fee:FEE,kind:'caw',network:'simulation',nonce,notBefore:NOW,scenario:'appendix-demo-v1',text:'Permission example '+nonce,version:1,...patch});
  return {signer,binding,permission,ledger,state,action,packet:await signer.sign(action())};
}
function tuple(ledger){return JSON.stringify([ledger.status(),ledger.exportRecord()]);}
function hold(t,operation='verify'){
  let entered,release;const start=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;}),subtle=crypto.subtle,original=subtle[operation];
  const mock=t.mock.method(subtle,operation,async function(...args){entered();await gate;return Reflect.apply(original,this,args);});
  t.after(()=>{release();mock.mock.restore();});return {entered:start,release};
}
async function save(ledger){const out=ledger.exportRecord();return {...out,checkpoint:await createLabRecordCheckpoint(out.recordText,out.canonicalText)};}
const verify=s=>verifyLabRecord(s.recordText,s.checkpoint,s.binding,s.delegation);

test('delegation: permission digest binds the complete scope, key, authority and economics',async t=>{
  const f=await setup(t),p=f.permission,b=f.binding;
  const bytes='CAW_LOCAL_DELEGATION_V1\n'+JSON.stringify({account:b.account,controller:b.controller,epoch:b.epoch,publicKey:b.publicKey,
    network:'simulation',deployment:'unconnected-lab',scenario:'appendix-demo-v1',fee:FEE,...p});
  assert.equal(b.domain,'grant-'+createHash('sha256').update(bytes).digest('hex'));
  assert.ok(Object.isFrozen(b));assert.ok(Object.isFrozen(copyDelegation(p)));
  for(const patch of [{budget:FEE},{notBefore:NOW-1},{expiresAt:NOW+121}])assert.notEqual((await bindDelegation(b,{...p,...patch})).domain,b.domain);
  for(const patch of [{account:'beta'},{controller:'device-other'},{epoch:1},{publicKey:'01'.repeat(32)}])assert.notEqual((await bindDelegation({...b,...patch},p)).domain,b.domain);
});
test('delegation: previews spend nothing, exact budget settles twice and third acceptance is unchanged',async t=>{
  const {ledger,signer,packet,action}=await setup(t),before=tuple(ledger);
  await ledger.check(packet);assert.equal(tuple(ledger),before);
  await ledger.accept(packet);assert.equal(ledger.status().delegation.spent,FEE);
  await ledger.accept(await signer.sign(action(1)));assert.equal(ledger.status().delegation.remaining,'0');
  const exhausted=tuple(ledger),third=await signer.sign(action(2));
  for(const method of ['check','accept'])await assert.rejects(ledger[method](third),code('PERMISSION_BUDGET'));
  assert.equal(tuple(ledger),exhausted);assert.equal(ledger.status().nextNonce,2);
  const saved=await save(ledger),rebuilt=await verify(saved);
  assert.equal(rebuilt.canonicalText,saved.canonicalText);assert.deepEqual(rebuilt.delegation,ledger.status().delegation);
});
test('delegation: one base unit short rejects without spending or model mutation',async t=>{
  const {ledger,packet}=await setup(t,{permission:grant({budget:(BigInt(FEE)-1n).toString()})}),before=tuple(ledger);
  await assert.rejects(ledger.accept(packet),code('PERMISSION_BUDGET'));assert.equal(tuple(ledger),before);
});
test('delegation: concurrent acceptance near budget limit commits once',async t=>{
  const {ledger,packet}=await setup(t,{permission:grant({budget:FEE})}),held=hold(t);
  const pending=Promise.allSettled([ledger.accept(packet),ledger.accept(packet)]);await held.entered;held.release();const result=await pending;
  assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(ledger.status().delegation.remaining,'0');
  assert.equal(ledger.status().nextNonce,1);assert.equal(ledger.status().events,1);
});
test('delegation: wrong key, domain, authority, changed words and replay never consume permission',async t=>{
  const f=await setup(t),before=tuple(f.ledger),stranger=await createDemoSigner();t.after(()=>stranger.revoke());
  await assert.rejects(f.ledger.accept(await stranger.sign(f.action())),code('WRONG_KEY'));
  for(const [patch,reason] of [[{domain:'another-grant'},'WRONG_DOMAIN'],[{account:'beta'},'WRONG_AUTHORITY'],[{epoch:1},'WRONG_AUTHORITY'],[{nonce:1},'STALE_NONCE']])
    await assert.rejects(f.ledger.accept(await f.signer.sign(f.action(0,patch))),code(reason));
  const changed=JSON.parse(f.packet);changed.action.text='Edited';await assert.rejects(f.ledger.accept(JSON.stringify(changed)),code('INVALID_SIGNATURE'));
  assert.equal(tuple(f.ledger),before);await f.ledger.accept(f.packet);const accepted=tuple(f.ledger);
  await assert.rejects(f.ledger.accept(f.packet),code('STALE_NONCE'));assert.equal(tuple(f.ledger),accepted);
});
test('delegation: widening the permission cannot reuse the old signed domain',async t=>{
  const f=await setup(t),wider=grant({budget:MAX_DELEGATED_BUDGET}),other=createSignedLedger(initial(),f.binding,()=>NOW,wider);t.after(()=>other.revoke());
  const before=tuple(other);await assert.rejects(other.accept(f.packet),code('PERMISSION_BINDING'));assert.equal(tuple(other),before);
  const correctBinding=await bindDelegation(f.binding,wider),correct=createSignedLedger(initial(),correctBinding,()=>NOW,wider);t.after(()=>correct.revoke());
  await assert.rejects(correct.accept(f.packet),code('WRONG_DOMAIN'));
});
test('delegation: action validity must fit the complete permission interval',async t=>{
  const f=await setup(t),before=tuple(f.ledger);
  for(const patch of [{notBefore:NOW-1},{expiresAt:NOW+121}])await assert.rejects(f.ledger.accept(await f.signer.sign(f.action(0,patch))),code('PERMISSION_WINDOW'));
  assert.equal(tuple(f.ledger),before);
});
test('delegation: accounting failure and generated post collision leave permission unchanged',async t=>{
  for(const options of [{balance:'0'},{posts:[{id:'post-signed-alpha-0',author:'beta',text:'Collision',time:'Fixture'}]}]){
    const f=await setup(t,options),before=tuple(f.ledger);
    await assert.rejects(f.ledger.accept(f.packet),code(options.balance==='0'?'INSUFFICIENT_BALANCE':'DUPLICATE_POST'));assert.equal(tuple(f.ledger),before);
  }
});
test('delegation: revocation, transfer and expiry during verification cannot spend budget',async t=>{
  for(const mode of ['revoke','transfer','expire']){
    let now=NOW;const f=await setup(t,{clock:()=>now}),held=hold(t);
    const pending=f.ledger.accept(f.packet),rejected=assert.rejects(pending);
    await held.entered;if(mode==='revoke')f.ledger.revoke();else if(mode==='transfer')f.ledger.simulateTransfer('device-other');else now=NOW+120;
    const before=tuple(f.ledger);held.release();await rejected;assert.equal(tuple(f.ledger),before);assert.equal(f.ledger.status().delegation.spent,'0');
    crypto.subtle.verify.mock.restore();
  }
});
test('delegation: a final-clock mutation cannot apply a stale budget debit',async t=>{
  let ledger,calls=0;const f=await setup(t,{clock:()=>{if(++calls===3)ledger.simulateTransfer('device-other');return NOW;}});ledger=f.ledger;
  await assert.rejects(ledger.accept(f.packet),code('STATE_CHANGED'));assert.equal(ledger.status().delegation.spent,'0');assert.equal(ledger.status().events,1);
});
test('delegation: transfer away and back does not restore grant authority',async t=>{
  const f=await setup(t);f.ledger.simulateTransfer('device-other');f.ledger.simulateTransfer('device-alpha');const before=tuple(f.ledger);
  await assert.rejects(f.ledger.accept(await f.signer.sign(f.action(2,{epoch:2}))),code('WRONG_AUTHORITY'));
  assert.equal(tuple(f.ledger),before);assert.equal(f.ledger.status().delegation.remaining,f.permission.budget);
});
test('delegation: caller mutation during digest cannot replace binding or permission',async t=>{
  const f=await setup(t),binding={...f.binding},permission={...f.permission},held=hold(t,'digest');
  const pending=bindDelegation(binding,permission);await held.entered;binding.account='beta';permission.budget='1';held.release();
  assert.deepEqual(await pending,f.binding);
  const livePermission={...f.permission},ledger=createSignedLedger(initial(),f.binding,()=>NOW,livePermission);t.after(()=>ledger.revoke());
  livePermission.budget='1';await ledger.accept(f.packet);assert.equal(ledger.status().delegation.spent,FEE);
});
test('delegation: malformed permissions and accessors are rejected without execution',async t=>{
  const f=await setup(t);let called=0;const accessor=grant();Object.defineProperty(accessor,'budget',{enumerable:true,get(){called++;return FEE;}});
  for(const value of [null,[],accessor,{...grant(),extra:1},grant({scope:'withdraw'}),grant({budget:'01'}),grant({budget:1}),grant({budget:'0'}),
    grant({budget:(BigInt(MAX_DELEGATED_BUDGET)+1n).toString()}),grant({expiresAt:NOW+301}),grant({notBefore:-0}),grant({expiresAt:NOW})])
    assert.throws(()=>createSignedLedger(initial(),f.binding,()=>NOW,value),code('INVALID_PERMISSION'));
  assert.equal(called,0);
});
test('delegation: inherited events cannot be used to reinstall a fresh budget',async t=>{
  const f=await setup(t),used=applyAction(initial(),{id:'prior',kind:'caw',actor:'alpha',controller:'device-alpha',epoch:0,nonce:0,text:'Prior'});
  assert.throws(()=>createSignedLedger(used,f.binding,()=>NOW,f.permission),code('PERMISSION_HISTORY'));
});
test('delegation: recovery requires independent exact permission and verifies its signed commitment',async t=>{
  const f=await setup(t);await f.ledger.accept(f.packet);const saved=await save(f.ledger);
  assert.equal(JSON.parse(saved.recordText).format,'caw-delegated-lab-record-v1');
  await assert.rejects(verifyLabRecord(saved.recordText,saved.checkpoint,saved.binding),code('PERMISSION_MISMATCH'));
  await assert.rejects(verify({...saved,delegation:grant({budget:FEE})}),code('PERMISSION_MISMATCH'));
  const changed=JSON.parse(saved.recordText);changed.delegation.budget=MAX_DELEGATED_BUDGET;
  const text=JSON.stringify(changed),checkpoint=await createLabRecordCheckpoint(text,saved.canonicalText);
  await assert.rejects(verify({...saved,recordText:text,checkpoint,delegation:changed.delegation}),code('PERMISSION_BINDING'));
  f.ledger.revoke();assert.equal((await verify(saved)).canonicalText,saved.canonicalText,'Historic inspection is not current grant activation');
});
test('delegation: recovery rejects a validly signed overspend even with newly calculated fingerprints',async t=>{
  const f=await setup(t,{permission:grant({budget:FEE})});await f.ledger.accept(f.packet);const saved=await save(f.ledger);
  const extra=await f.signer.sign(f.action(1));const recordText=appendLabRecord(saved.recordText,{kind:'signed-caw',packet:extra,acceptedAt:NOW});
  const checkpoint=await createLabRecordCheckpoint(recordText,saved.canonicalText);
  await assert.rejects(verify({...saved,recordText,checkpoint}),code('PERMISSION_BUDGET'));
});
test('delegation: record capacity transfer failure preserves the remaining budget',async t=>{
  const f=await setup(t,{permission:grant({budget:MAX_DELEGATED_BUDGET})});
  for(let i=0;i<63;i++)await f.ledger.accept(await f.signer.sign(f.action(i)));
  f.ledger.simulateTransfer('device-other');const full=tuple(f.ledger);
  assert.throws(()=>f.ledger.simulateTransfer('device-alpha'),code('RECORD_LIMIT'));assert.equal(tuple(f.ledger),full);
  assert.equal(f.ledger.status().delegation.remaining,FEE);
});
test('delegation: separate fresh lab copies have independent counters, not durable replay protection',async t=>{
  const f=await setup(t),other=createSignedLedger(initial(),f.binding,()=>NOW,f.permission);t.after(()=>other.revoke());
  await f.ledger.accept(f.packet);await other.accept(f.packet);assert.equal(other.snapshot(),f.ledger.snapshot());
});
test('delegation: omitting permission cannot downgrade a scoped key to ordinary authority',async t=>{
  const f=await setup(t);assert.throws(()=>createSignedLedger(initial(),f.binding,()=>NOW),code('PERMISSION_REQUIRED'));
  const ordinary=createLabRecord(f.ledger.snapshot()),checkpoint=await createLabRecordCheckpoint(ordinary,f.ledger.snapshot());
  await assert.rejects(verifyLabRecord(ordinary,checkpoint,f.binding),code('PERMISSION_REQUIRED'));
  const raw=JSON.parse(f.ledger.exportRecord().recordText);delete raw.delegation;raw.format='caw-signed-lab-record-v1';
  const recordText=JSON.stringify(raw),saved=await createLabRecordCheckpoint(recordText,f.ledger.snapshot());
  await assert.rejects(verifyLabRecord(recordText,saved,f.binding),code('PERMISSION_REQUIRED'));
});
