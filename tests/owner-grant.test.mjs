import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createState} from '../public/model.mjs';
import {createDemoSigner} from '../public/signatures.mjs';
import {createSignedLedger} from '../public/signed-ledger.mjs';
import {createLabRecord,createLabRecordCheckpoint,verifyLabRecord,appendLabRecord} from '../public/signed-record.mjs';
import {createOwnerGrantSigner,makeOwnerGrant,readOwnerGrant,copyOwnerAuthority,verifyOwnerGrant} from '../public/owner-grant.mjs';
const NOW=1700000000,FEE='5000000000000000000000';
const code=expected=>error=>error?.code===expected;
const permission=()=>({scope:'caw',budget:(2n*BigInt(FEE)).toString(),notBefore:NOW,expiresAt:NOW+120});
const state=(balance=(5n*BigInt(FEE)).toString())=>createState({version:1,scenario:'appendix-demo-v1',accounts:[
  {name:'alpha',controller:'device-alpha',balance,stake:'1'},{name:'beta',controller:'device-beta',balance:'0',stake:'1'}],posts:[]});
function ownerBinding(signer,patch={}){return {domain:'owner-session-a',account:'alpha',controller:'device-alpha',epoch:0,publicKey:signer.publicKey,...patch};}
async function setup(t,{clock=()=>NOW,balance,terms=permission()}={}){
  const owner=await createOwnerGrantSigner(),delegate=await createDemoSigner();t.after(()=>{owner.revoke();delegate.revoke();});
  const authority=ownerBinding(owner),grant=makeOwnerGrant(authority,delegate.publicKey,terms),ownerPacket=await owner.sign(grant);
  const verified=await verifyOwnerGrant(ownerPacket,authority),binding=verified.binding,authorization={packet:ownerPacket,authority};
  const ledger=createSignedLedger(state(balance),binding,clock,terms,authorization);t.after(()=>ledger.revoke());
  const action=(nonce=0,patch={})=>({account:'alpha',controller:'device-alpha',deployment:'unconnected-lab',domain:binding.domain,epoch:0,
    expiresAt:terms.expiresAt,fee:FEE,kind:'caw',network:'simulation',nonce,notBefore:terms.notBefore,scenario:'appendix-demo-v1',text:'Two keys, one grant. '+nonce,version:1,...patch});
  return {owner,delegate,authority,grant,ownerPacket,terms,binding,authorization,ledger,action,packet:await delegate.sign(action())};
}
function tuple(ledger){return JSON.stringify([ledger.status(),ledger.exportRecord()]);}
async function saved(ledger){const s=ledger.exportRecord();return {...s,checkpoint:await createLabRecordCheckpoint(s.recordText,s.canonicalText)};}
const recover=s=>verifyLabRecord(s.recordText,s.checkpoint,s.binding,s.delegation,s.ownerAuthority);
function hold(t,operation='verify',call=1){
  let entered,release,count=0;const start=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;}),subtle=crypto.subtle,original=subtle[operation];
  const mock=t.mock.method(subtle,operation,async function(...args){if(++count===call){entered();await gate;}return Reflect.apply(original,this,args);});
  t.after(()=>{release();mock.mock.restore();});return {entered:start,release,restore:()=>mock.mock.restore()};
}

test('owner grant: two distinct keys bind exact terms and verify both signatures before settlement',async t=>{
  const f=await setup(t),before=tuple(f.ledger);assert.notEqual(f.owner.publicKey,f.delegate.publicKey);
  const expected='ownergrant-'+createHash('sha256').update('CAW_LOCAL_OWNER_GRANT_V1\n'+JSON.stringify(f.grant)).digest('hex');
  assert.equal(f.binding.domain,expected);assert.ok(Object.isFrozen(f.grant));
  await f.ledger.check(f.packet);assert.equal(tuple(f.ledger),before);
  await f.ledger.accept(f.packet);assert.equal(f.ledger.status().delegation.spent,FEE);assert.equal(f.ledger.status().nextNonce,1);
  const s=await saved(f.ledger),r=await recover(s);assert.equal(r.canonicalText,s.canonicalText);assert.equal(r.ownerGrantVerified,true);assert.equal(r.ownershipProven,false);
  assert.equal(JSON.parse(s.recordText).format,'caw-owner-granted-lab-record-v1');assert.equal(JSON.parse(s.recordText).ownerGrant,f.ownerPacket);
});
test('owner grant: changing any signed authority, limit or context field rejects',async t=>{
  const f=await setup(t),patches=[{budget:FEE},{expiresAt:NOW+121},{notBefore:NOW-1},{account:'beta'},{controller:'device-other'},
    {epoch:1},{ownerDomain:'other-owner-session'},{ownerKey:'01'.repeat(32)},{delegateKey:'02'.repeat(32)}];
  for(const patch of patches){const packet=JSON.stringify({grant:{...f.grant,...patch},signature:readOwnerGrant(f.ownerPacket).signature});
    await assert.rejects(verifyOwnerGrant(packet,f.authority));}
  for(const patch of [{network:'mainnet'},{deployment:'other'},{scenario:'other'},{fee:'1'},{scope:'withdraw'},{version:2}])
    assert.throws(()=>readOwnerGrant(JSON.stringify({grant:{...f.grant,...patch},signature:readOwnerGrant(f.ownerPacket).signature})),code(patch.scope?'INVALID_PERMISSION':'INVALID_OWNER_GRANT'));
});
test('owner grant: packet-nominated owner and substituted independent authority cannot authorize each other',async t=>{
  const f=await setup(t),other=await createOwnerGrantSigner();t.after(()=>other.revoke());
  const outsider=ownerBinding(other),packet=await other.sign(makeOwnerGrant(outsider,f.delegate.publicKey,f.terms));
  await assert.rejects(verifyOwnerGrant(packet,f.authority),code('WRONG_OWNER_AUTHORITY'));
  await assert.rejects(verifyOwnerGrant(f.ownerPacket,outsider),code('WRONG_OWNER_AUTHORITY'));
  await assert.rejects(verifyOwnerGrant(f.ownerPacket,{...f.authority,publicKey:f.delegate.publicKey}),code('WRONG_OWNER_AUTHORITY'));
});
test('owner grant: same delegate and limits under another owner have a different signed action domain',async t=>{
  const f=await setup(t),other=await createOwnerGrantSigner();t.after(()=>other.revoke());const authority=ownerBinding(other);
  const packet=await other.sign(makeOwnerGrant(authority,f.delegate.publicKey,f.terms)),checked=await verifyOwnerGrant(packet,authority);
  assert.notEqual(checked.binding.domain,f.binding.domain);
  const ledger=createSignedLedger(state(),checked.binding,()=>NOW,f.terms,{packet,authority});t.after(()=>ledger.revoke());
  await assert.rejects(ledger.accept(f.packet),code('WRONG_DOMAIN'));assert.equal(ledger.status().delegation.spent,'0');
});
test('owner grant: key roles must differ and only the named owner signer may sign',async t=>{
  const f=await setup(t);assert.throws(()=>makeOwnerGrant(f.authority,f.owner.publicKey,f.terms),code('DISTINCT_KEYS'));
  const other=await createOwnerGrantSigner();t.after(()=>other.revoke());await assert.rejects(other.sign(f.grant),code('WRONG_OWNER_KEY'));
});
test('owner grant: invalid owner or delegate signatures leave every state component unchanged',async t=>{
  const f=await setup(t),bad=JSON.parse(f.ownerPacket);bad.signature=(bad.signature[0]==='0'?'1':'0')+bad.signature.slice(1);
  const ledger=createSignedLedger(state(),f.binding,()=>NOW,f.terms,{packet:JSON.stringify(bad),authority:f.authority});t.after(()=>ledger.revoke());
  const before=tuple(ledger);await assert.rejects(ledger.accept(f.packet),code('INVALID_OWNER_SIGNATURE'));assert.equal(tuple(ledger),before);
  const altered=JSON.parse(f.packet);altered.action.text='Edited after signature';const original=tuple(f.ledger);
  await assert.rejects(f.ledger.accept(JSON.stringify(altered)),code('INVALID_SIGNATURE'));assert.equal(tuple(f.ledger),original);
});
test('owner grant: independently supplied delegate or permission must match the approved grant',async t=>{
  const f=await setup(t);
  for(const [binding,terms] of [[f.binding,{...f.terms,budget:FEE}],[{...f.binding,publicKey:'01'.repeat(32)},f.terms]]){
    const ledger=createSignedLedger(state(),binding,()=>NOW,terms,f.authorization);t.after(()=>ledger.revoke());
    const before=tuple(ledger);await assert.rejects(ledger.accept(f.packet),code('OWNER_GRANT_MISMATCH'));assert.equal(tuple(ledger),before);
  }
});
test('owner grant: omission cannot downgrade to ordinary or unsigned limited authority',async t=>{
  const f=await setup(t);
  assert.throws(()=>createSignedLedger(state(),f.binding,()=>NOW),code('OWNER_GRANT_REQUIRED'));
  assert.throws(()=>createSignedLedger(state(),f.binding,()=>NOW,f.terms),code('OWNER_GRANT_REQUIRED'));
  assert.throws(()=>createSignedLedger(state(),{...f.binding,domain:'ordinary'},()=>NOW,f.terms,f.authorization),code('OWNER_GRANT_REQUIRED'));
  assert.throws(()=>createSignedLedger(state(),f.binding,()=>NOW,undefined,f.authorization),code('OWNER_GRANT_REQUIRED'));
});
test('owner grant: relabelled empty and used records cannot bypass owner verification with fresh fingerprints',async t=>{
  const f=await setup(t);
  for(const used of [false,true]){
    if(used)await f.ledger.accept(f.packet);const s=await saved(f.ledger),record=JSON.parse(s.recordText);
    await assert.rejects(verifyLabRecord(s.recordText,s.checkpoint,s.binding,s.delegation),code('OWNER_GRANT_REQUIRED'));
    for(const format of ['caw-signed-lab-record-v1','caw-delegated-lab-record-v1']){
      const changed={format,initialHistory:record.initialHistory,...(format.includes('delegated')?{delegation:record.delegation}:{}),entries:record.entries};
      const text=JSON.stringify(changed),checkpoint=await createLabRecordCheckpoint(text,s.canonicalText);
      await assert.rejects(verifyLabRecord(text,checkpoint,s.binding,format.includes('delegated')?s.delegation:undefined),code('OWNER_GRANT_REQUIRED'));
      await assert.rejects(verifyLabRecord(text,checkpoint,s.binding,format.includes('delegated')?s.delegation:undefined,s.ownerAuthority),code('OWNER_GRANT_REQUIRED'));
    }
  }
});
test('owner grant: two permitted spends exhaust budget and a third cannot mutate the ledger',async t=>{
  const f=await setup(t);await f.ledger.accept(f.packet);await f.ledger.accept(await f.delegate.sign(f.action(1)));const before=tuple(f.ledger);
  await assert.rejects(f.ledger.accept(await f.delegate.sign(f.action(2))),code('PERMISSION_BUDGET'));assert.equal(tuple(f.ledger),before);
  const r=await recover(await saved(f.ledger));assert.equal(r.delegation.remaining,'0');assert.equal(r.signedActions,2);
});
test('owner grant: concurrent attempts near the budget boundary commit once',async t=>{
  const f=await setup(t,{terms:{...permission(),budget:FEE}}),held=hold(t);
  const pending=Promise.allSettled([f.ledger.accept(f.packet),f.ledger.accept(f.packet)]);await held.entered;held.release();const results=await pending;
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.ledger.status().delegation.spent,FEE);assert.equal(f.ledger.status().events,1);
});
test('owner grant: insufficient funds and narrow signed windows consume no budget',async t=>{
  const f=await setup(t,{balance:'0'}),before=tuple(f.ledger);await assert.rejects(f.ledger.accept(f.packet),code('INSUFFICIENT_BALANCE'));assert.equal(tuple(f.ledger),before);
  const funded=await setup(t);await assert.rejects(funded.ledger.accept(await funded.delegate.sign(funded.action(0,{notBefore:NOW-1}))),code('PERMISSION_WINDOW'));
  assert.equal(funded.ledger.status().delegation.spent,'0');
});
test('owner grant: transfer, revoke and expiry during either signature check cannot commit',async t=>{
  for(const call of [1,2])for(const mode of ['transfer','revoke','expire']){
    let now=NOW;const f=await setup(t,{clock:()=>now}),held=hold(t,'verify',call);
    const pending=f.ledger.accept(f.packet),rejected=assert.rejects(pending);await held.entered;
    if(mode==='transfer')f.ledger.simulateTransfer('device-new');else if(mode==='revoke')f.ledger.revoke();else now=NOW+120;
    const before=tuple(f.ledger);held.release();await rejected;held.restore();assert.equal(tuple(f.ledger),before);assert.equal(f.ledger.status().delegation.spent,'0');
  }
});
test('owner grant: a final clock hook cannot move control and let the old grant settle',async t=>{
  let ledger,calls=0;const f=await setup(t,{clock:()=>{if(++calls===3)ledger.simulateTransfer('device-new');return NOW;}});ledger=f.ledger;
  await assert.rejects(ledger.accept(f.packet),code('STATE_CHANGED'));assert.equal(ledger.status().delegation.spent,'0');assert.equal(ledger.status().events,1);
});
test('owner grant: transfer away and back does not revive the original owner epoch',async t=>{
  const f=await setup(t);f.ledger.simulateTransfer('device-other');f.ledger.simulateTransfer('device-alpha');const before=tuple(f.ledger);
  await assert.rejects(f.ledger.accept(f.packet),code('WRONG_AUTHORITY'));assert.equal(tuple(f.ledger),before);
});
test('owner grant: external authority mutations during verify and recovery cannot replace captured trust',async t=>{
  const f=await setup(t),authority={...f.authority},held=hold(t,'importKey');
  const pending=verifyOwnerGrant(f.ownerPacket,authority);await held.entered;authority.publicKey='01'.repeat(32);held.release();
  assert.deepEqual((await pending).authority,f.authority);held.restore();
  await f.ledger.accept(f.packet);const s=await saved(f.ledger),mutable={...s.ownerAuthority},gate=hold(t,'verify');
  const recovery=verifyLabRecord(s.recordText,s.checkpoint,s.binding,s.delegation,mutable);await gate.entered;mutable.account='beta';gate.release();
  assert.equal((await recovery).ownerGrantVerified,true);
});
test('owner grant: live constructor owns authorization and rejects accessors without invoking them',async t=>{
  const f=await setup(t),auth={packet:f.ownerPacket,authority:{...f.authority}},ledger=createSignedLedger(state(),f.binding,()=>NOW,f.terms,auth);t.after(()=>ledger.revoke());
  auth.packet='changed';auth.authority.account='beta';await ledger.accept(f.packet);assert.equal(ledger.status().nextNonce,1);
  let reads=0;const accessor={...f.authority};Object.defineProperty(accessor,'publicKey',{enumerable:true,get(){reads++;return f.owner.publicKey;}});
  assert.throws(()=>copyOwnerAuthority(accessor),code('INVALID_OWNER_GRANT'));assert.equal(reads,0);
  const extra={...f.grant,toJSON(){reads++;return f.grant;}};await assert.rejects(f.owner.sign(extra),code('INVALID_OWNER_GRANT'));assert.equal(reads,0);
});
test('owner grant: malformed, noncanonical and oversized packets fail closed',async t=>{
  const f=await setup(t);for(const raw of [f.ownerPacket+' ',f.ownerPacket.replace('"grant":','"extra":0,"grant":'),'not json','x'.repeat(8193)])assert.throws(()=>readOwnerGrant(raw));
  for(const patch of [{signature:'A'.repeat(128)},{signature:'0'.repeat(127)}])assert.throws(()=>readOwnerGrant(JSON.stringify({...JSON.parse(f.ownerPacket),...patch})),code('INVALID_OWNER_GRANT'));
});
test('owner grant: signer closure during native signing fails; closing signer does not revoke an already issued grant',async t=>{
  const f=await setup(t),held=hold(t,'sign'),pending=f.owner.sign(f.grant),rejected=assert.rejects(pending,code('REVOKED'));
  await held.entered;f.owner.revoke();held.release();await rejected;await assert.rejects(f.owner.sign(f.grant),code('REVOKED'));
  assert.equal((await verifyOwnerGrant(f.ownerPacket,f.authority)).binding.domain,f.binding.domain);
});
test('owner grant: native keys are non-extractable and missing native crypto does not fall back',async t=>{
  const subtle=crypto.subtle,original=subtle.generateKey;let observed=false;
  const spy=t.mock.method(subtle,'generateKey',async function(algorithm,extractable,usages){observed=true;assert.equal(extractable,false);const pair=await Reflect.apply(original,this,[algorithm,extractable,usages]);assert.equal(pair.privateKey.extractable,false);return pair;});
  const signer=await createOwnerGrantSigner();signer.revoke();assert.equal(observed,true);spy.mock.restore();
  t.mock.method(subtle,'generateKey',async()=>{throw new Error('Unavailable');});await assert.rejects(createOwnerGrantSigner(),code('CRYPTO_UNAVAILABLE'));
});
test('owner grant: valid historical record survives local closure but is not current authority',async t=>{
  const f=await setup(t);await f.ledger.accept(f.packet);const s=await saved(f.ledger);f.ledger.revoke();
  const r=await recover(s);assert.equal(r.ownerGrantVerified,true);assert.equal(r.ownershipProven,false);assert.equal(r.recordedTimesAreProof,false);
  await assert.rejects(f.ledger.accept(f.packet),code('REVOKED'));
});
test('owner grant: altered owner signature rejects even with a recomputed record fingerprint',async t=>{
  const f=await setup(t);await f.ledger.accept(f.packet);const s=await saved(f.ledger),record=JSON.parse(s.recordText),packet=JSON.parse(record.ownerGrant);
  packet.signature='00'.repeat(64);record.ownerGrant=JSON.stringify(packet);const recordText=JSON.stringify(record),checkpoint=await createLabRecordCheckpoint(recordText,s.canonicalText);
  await assert.rejects(recover({...s,recordText,checkpoint}),code('INVALID_OWNER_SIGNATURE'));
});
test('owner grant: recovery independently rejects a signed overspend and wrong trusted owner',async t=>{
  const f=await setup(t,{terms:{...permission(),budget:FEE}});await f.ledger.accept(f.packet);const s=await saved(f.ledger);
  const recordText=appendLabRecord(s.recordText,{kind:'signed-caw',packet:await f.delegate.sign(f.action(1)),acceptedAt:NOW});
  const checkpoint=await createLabRecordCheckpoint(recordText,s.canonicalText);await assert.rejects(recover({...s,recordText,checkpoint}),code('PERMISSION_BUDGET'));
  await assert.rejects(recover({...s,ownerAuthority:{...s.ownerAuthority,domain:'another-session'}}),code('WRONG_OWNER_AUTHORITY'));
});
