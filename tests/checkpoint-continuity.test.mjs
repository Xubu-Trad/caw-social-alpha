import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,applyAction,canonicalExport} from '../public/model.mjs';
import {DEMO_FEES} from '../public/economics.mjs';
import {createDemoSigner} from '../public/signatures.mjs';
import {bindDelegation} from '../public/delegation.mjs';
import {createSignedLedger} from '../public/signed-ledger.mjs';
import {appendLabRecord,createLabRecordCheckpoint,verifyLabRecord} from '../public/signed-record.mjs';
import {createOwnerGrantSigner,makeOwnerGrant,verifyOwnerGrant,makeOwnerRevocation} from '../public/owner-grant.mjs';
import {createCheckpointTracker} from '../public/checkpoint-continuity.mjs';

const NOW=1700000000,FEE=DEMO_FEES.caw;
const code=expected=>error=>error?.code===expected;
const permission=()=>({scope:'caw',budget:(2n*BigInt(FEE)).toString(),notBefore:NOW,expiresAt:NOW+120});
const state=(balance=(5n*BigInt(FEE)).toString())=>createState({version:1,scenario:'appendix-demo-v1',accounts:[
  {name:'alpha',controller:'device-alpha',balance,stake:'1'},
  {name:'beta',controller:'device-beta',balance:'0',stake:'1'}],posts:[]});
async function setup(t,{mode='ordinary',clock=()=>NOW,initial=state(),terms=permission()}={}){
  const signer=await createDemoSigner();t.after(()=>signer.revoke());
  let binding={domain:'continuity-test',account:'alpha',controller:'device-alpha',epoch:0,publicKey:signer.publicKey};
  let delegation,owner,ownerAuthority,ownerPacket,authorization;
  if(mode==='delegated'){
    delegation=terms;binding=await bindDelegation(binding,delegation);
  }else if(mode==='owner'){
    delegation=terms;owner=await createOwnerGrantSigner();t.after(()=>owner.revoke());
    ownerAuthority={domain:'continuity-owner',account:'alpha',controller:'device-alpha',epoch:0,publicKey:owner.publicKey};
    ownerPacket=await owner.sign(makeOwnerGrant(ownerAuthority,signer.publicKey,delegation));
    binding=(await verifyOwnerGrant(ownerPacket,ownerAuthority)).binding;authorization={packet:ownerPacket,authority:ownerAuthority};
  }
  function newLedger(nextInitial=initial,nextClock=clock){
    const ledger=createSignedLedger(nextInitial,binding,nextClock,delegation,authorization);t.after(()=>ledger.revoke());return ledger;
  }
  const action=(nonce=0,text='Retained history '+nonce)=>({account:'alpha',controller:'device-alpha',deployment:'unconnected-lab',domain:binding.domain,
    epoch:0,expiresAt:terms.expiresAt,fee:FEE,kind:'caw',network:'simulation',nonce,notBefore:terms.notBefore,
    scenario:'appendix-demo-v1',text,version:1});
  return {signer,binding,delegation,owner,ownerAuthority,ownerPacket,authorization,action,newLedger,ledger:newLedger(),
    packet:(nonce=0,text)=>signer.sign(action(nonce,text)),
    cancellation:()=>owner.signRevocation(makeOwnerRevocation(ownerAuthority,binding.domain))};
}
async function saved(ledger){const captured=ledger.exportRecord();return {...captured,
  checkpoint:await createLabRecordCheckpoint(captured.recordText,captured.canonicalText)};}
async function tracker(t,anchor){
  const reader=await createCheckpointTracker(anchor.recordText,anchor.checkpoint,anchor.binding,anchor.delegation,anchor.ownerAuthority);
  t.after(()=>reader.close());return reader;
}
const inspect=(reader,candidate)=>reader.inspect(candidate.recordText,candidate.checkpoint);
const advance=(reader,candidate)=>reader.advance(candidate.recordText,candidate.checkpoint);
const tuple=reader=>JSON.stringify([reader.status(),reader.exportAnchor()]);
const ledgerTuple=ledger=>JSON.stringify([ledger.status(),ledger.exportRecord(),ledger.snapshot()]);
async function repack(savedRecord,record,finalHistory=savedRecord.canonicalText){
  const recordText=JSON.stringify(record);return {...savedRecord,recordText,canonicalText:finalHistory,
    checkpoint:await createLabRecordCheckpoint(recordText,finalHistory)};
}
function hold(t,operation='verify',call=1){
  let entered,release,count=0;
  const start=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const subtle=crypto.subtle,original=subtle[operation];
  const mock=t.mock.method(subtle,operation,async function(...args){if(++count===call){entered();await gate;}return Reflect.apply(original,this,args);});
  t.after(()=>{release();mock.mock.restore();});return {entered:start,release,restore:()=>mock.mock.restore()};
}

test('checkpoint continuity: a verified empty anchor is frozen and identical input is observational',async t=>{
  const f=await setup(t),anchor=await saved(f.ledger),reader=await tracker(t,anchor),before=tuple(reader);
  assert.ok(Object.isFrozen(reader));assert.equal(reader.status().revision,0);assert.equal(reader.status().entryCount,0);
  assert.equal(reader.status().signedActions,0);assert.equal(reader.status().fixtureTransfers,0);assert.equal(reader.status().inheritedEvents,0);
  assert.equal(Object.hasOwn(reader.status(),'ownerRevoked'),false);assert.equal(Object.hasOwn(reader.status(),'delegation'),false);
  assert.deepEqual(reader.exportAnchor(),anchor);
  for(const operation of [inspect,advance]){
    const result=await operation(reader,anchor);
    assert.equal(result.relation,'same');assert.equal(result.commonPrefixEntries,0);assert.equal(result.anchorEntries,0);assert.equal(result.candidateEntries,0);
    assert.equal(result.advanced,false);assert.deepEqual(result.anchor,result.candidate);assert.equal(tuple(reader),before);
  }
});

test('checkpoint continuity: inspect verifies an extension without adoption; advance adopts once with no ledger effects',async t=>{
  const f=await setup(t),anchor=await saved(f.ledger),reader=await tracker(t,anchor);
  await f.ledger.accept(await f.packet());const candidate=await saved(f.ledger),before=tuple(reader),live=ledgerTuple(f.ledger);
  const preview=await inspect(reader,candidate);
  assert.equal(preview.relation,'extension');assert.equal(preview.commonPrefixEntries,0);assert.equal(preview.anchorEntries,0);assert.equal(preview.candidateEntries,1);
  assert.equal(preview.anchor.signedActions,0);assert.equal(preview.candidate.signedActions,1);assert.equal(preview.advanced,false);
  assert.equal(tuple(reader),before);assert.equal(ledgerTuple(f.ledger),live);
  const committed=await advance(reader,candidate);assert.equal(committed.relation,'extension');assert.equal(committed.advanced,true);
  assert.equal(reader.status().revision,1);assert.equal(reader.status().entryCount,1);assert.equal(reader.status().signedActions,1);
  assert.deepEqual(reader.exportAnchor(),candidate);assert.equal(ledgerTuple(f.ledger),live);
  const after=tuple(reader);assert.equal((await advance(reader,candidate)).advanced,false);assert.equal(tuple(reader),after);
});

test('checkpoint continuity: shorter verified prefixes are inspectable rollbacks and cannot replace the anchor',async t=>{
  const f=await setup(t),empty=await saved(f.ledger);await f.ledger.accept(await f.packet());const one=await saved(f.ledger);
  await f.ledger.accept(await f.packet(1));const two=await saved(f.ledger),reader=await tracker(t,two),before=tuple(reader);
  for(const [candidate,prefix] of [[one,1],[empty,0]]){
    const result=await inspect(reader,candidate);assert.equal(result.relation,'rollback');assert.equal(result.commonPrefixEntries,prefix);
    assert.equal(result.anchorEntries,2);assert.equal(result.candidateEntries,prefix);assert.equal(result.advanced,false);
    await assert.rejects(advance(reader,candidate),code('CHECKPOINT_ROLLBACK'));assert.equal(tuple(reader),before);
  }
});

test('checkpoint continuity: valid divergent actions conflict even when the competing branch is longer',async t=>{
  const f=await setup(t),fork=f.newLedger();
  await f.ledger.accept(await f.packet(0,'First signed branch'));const first=await saved(f.ledger),reader=await tracker(t,first);
  await fork.accept(await f.packet(0,'Other signed branch'));const otherOne=await saved(fork);
  await fork.accept(await f.packet(1,'A longer competing branch'));const otherTwo=await saved(fork),before=tuple(reader);
  for(const candidate of [otherOne,otherTwo]){
    const result=await inspect(reader,candidate);assert.equal(result.relation,'conflict');assert.equal(result.commonPrefixEntries,0);
    assert.equal(result.anchorEntries,1);assert.equal(result.candidateEntries,JSON.parse(candidate.recordText).entries.length);
    await assert.rejects(advance(reader,candidate),code('CHECKPOINT_CONFLICT'));assert.equal(tuple(reader),before);
  }
});

test('checkpoint continuity: a conflict reports only the exact ordered common prefix',async t=>{
  const f=await setup(t),fork=f.newLedger(),common=await f.packet(0,'Identical first event');
  await f.ledger.accept(common);await fork.accept(common);
  await f.ledger.accept(await f.packet(1,'Second event A'));await fork.accept(await f.packet(1,'Second event B'));
  const reader=await tracker(t,await saved(f.ledger)),result=await inspect(reader,await saved(fork));
  assert.equal(result.relation,'conflict');assert.equal(result.commonPrefixEntries,1);assert.equal(result.anchorEntries,2);assert.equal(result.candidateEntries,2);
});

test('checkpoint continuity: different valid recorded times conflict despite identical signatures and final model history',async t=>{
  const f=await setup(t),fork=f.newLedger(state(),()=>NOW+1),packet=await f.packet();
  await f.ledger.accept(packet);await fork.accept(packet);const a=await saved(f.ledger),b=await saved(fork);
  assert.equal(a.canonicalText,b.canonicalText);assert.notEqual(a.recordText,b.recordText);
  assert.equal(JSON.parse(a.recordText).entries[0].packet,JSON.parse(b.recordText).entries[0].packet);
  assert.notEqual(JSON.parse(a.recordText).entries[0].acceptedAt,JSON.parse(b.recordText).entries[0].acceptedAt);
  const reader=await tracker(t,a),before=tuple(reader),result=await inspect(reader,b);
  assert.equal(result.relation,'conflict');assert.equal(result.commonPrefixEntries,0);
  await assert.rejects(advance(reader,b),code('CHECKPOINT_CONFLICT'));assert.equal(tuple(reader),before);
});

test('checkpoint continuity: a different valid initial history is a root conflict, not an empty same record',async t=>{
  const f=await setup(t),anchor=await saved(f.ledger),other=f.newLedger(state((6n*BigInt(FEE)).toString())),candidate=await saved(other);
  const reader=await tracker(t,anchor),before=tuple(reader),result=await inspect(reader,candidate);
  assert.equal(result.anchorEntries,0);assert.equal(result.candidateEntries,0);assert.equal(result.commonPrefixEntries,0);assert.equal(result.relation,'conflict');
  await assert.rejects(advance(reader,candidate),code('CHECKPOINT_CONFLICT'));assert.equal(tuple(reader),before);
});

test('checkpoint continuity: refreshed fingerprints cannot make a bad signature a valid candidate or initial anchor',async t=>{
  const f=await setup(t),anchor=await saved(f.ledger),reader=await tracker(t,anchor);await f.ledger.accept(await f.packet());
  const valid=await saved(f.ledger),record=JSON.parse(valid.recordText),packet=JSON.parse(record.entries[0].packet);
  packet.action.text='Changed after signing';record.entries[0].packet=JSON.stringify(packet);const changed=await repack(valid,record),before=tuple(reader);
  for(const operation of [inspect,advance])await assert.rejects(operation(reader,changed),code('INVALID_SIGNATURE'));
  await assert.rejects(createCheckpointTracker(changed.recordText,changed.checkpoint,changed.binding),code('INVALID_SIGNATURE'));
  assert.equal(tuple(reader),before);
  // Verification precedes relation classification even when the root also differs.
  record.initialHistory=canonicalExport(state((6n*BigInt(FEE)).toString()));const divergentBad=await repack(valid,record);
  await assert.rejects(inspect(reader,divergentBad),code('INVALID_SIGNATURE'));assert.equal(tuple(reader),before);
  await assert.rejects(inspect(reader,{...valid,checkpoint:{...valid.checkpoint,sha256:'0'.repeat(64)}}),code('CHECKPOINT_MISMATCH'));
  assert.equal(tuple(reader),before);
});

test('checkpoint continuity: delegated spending survives adoption and cannot be reset by replaying an empty record',async t=>{
  const f=await setup(t,{mode:'delegated'}),empty=await saved(f.ledger),reader=await tracker(t,empty);
  await f.ledger.accept(await f.packet());const one=await saved(f.ledger);await advance(reader,one);
  assert.equal(reader.status().delegation.spent,FEE);assert.equal(reader.status().delegation.remaining,FEE);
  assert.deepEqual(reader.exportAnchor().delegation,f.delegation);assert.equal(Object.hasOwn(reader.status(),'ownerRevoked'),false);
  await f.ledger.accept(await f.packet(1));const two=await saved(f.ledger);await advance(reader,two);
  assert.equal(reader.status().delegation.spent,(2n*BigInt(FEE)).toString());assert.equal(reader.status().delegation.remaining,'0');
  const before=tuple(reader);await assert.rejects(advance(reader,empty),code('CHECKPOINT_ROLLBACK'));assert.equal(tuple(reader),before);
  const overspendText=appendLabRecord(two.recordText,{kind:'signed-caw',packet:await f.packet(2),acceptedAt:NOW});
  const overspend={...two,recordText:overspendText,checkpoint:await createLabRecordCheckpoint(overspendText,two.canonicalText)};
  await assert.rejects(inspect(reader,overspend),code('PERMISSION_BUDGET'));assert.equal(tuple(reader),before);
});

test('checkpoint continuity: candidate permission or owner grant cannot replace the trust retained at creation',async t=>{
  const f=await setup(t,{mode:'owner'}),anchor=await saved(f.ledger),reader=await tracker(t,anchor),before=tuple(reader);
  const changedTerms={...f.delegation,budget:FEE},record=JSON.parse(anchor.recordText);record.delegation=changedTerms;
  const changedPermission=await repack(anchor,record);await assert.rejects(inspect(reader,changedPermission),code('PERMISSION_MISMATCH'));
  record.delegation=f.delegation;
  const otherDelegate=await createDemoSigner();t.after(()=>otherDelegate.revoke());
  record.ownerGrant=await f.owner.sign(makeOwnerGrant(f.ownerAuthority,otherDelegate.publicKey,f.delegation));
  const changedGrant=await repack(anchor,record);await assert.rejects(inspect(reader,changedGrant),code('OWNER_GRANT_MISMATCH'));
  await assert.rejects(createCheckpointTracker(anchor.recordText,anchor.checkpoint,anchor.binding,anchor.delegation),code('OWNER_GRANT_REQUIRED'));
  await assert.rejects(createCheckpointTracker(anchor.recordText,anchor.checkpoint,anchor.binding,anchor.delegation,
    {...anchor.ownerAuthority,domain:'other-owner'}),code('WRONG_OWNER_AUTHORITY'));
  assert.equal(tuple(reader),before);
});

test('checkpoint continuity: owner v1 to v2 cancellation is an extension that cannot later be rolled back',async t=>{
  const f=await setup(t,{mode:'owner'});await f.ledger.accept(await f.packet());const live=await saved(f.ledger),reader=await tracker(t,live);
  await f.ledger.applyOwnerRevocation(await f.cancellation());const cancelled=await saved(f.ledger),liveTuple=ledgerTuple(f.ledger);
  assert.equal(JSON.parse(live.recordText).format,'caw-owner-granted-lab-record-v1');assert.equal(JSON.parse(cancelled.recordText).format,'caw-owner-granted-lab-record-v2');
  assert.equal(live.canonicalText,cancelled.canonicalText);
  const preview=await inspect(reader,cancelled);assert.equal(preview.relation,'extension');assert.equal(preview.commonPrefixEntries,1);
  assert.equal(preview.anchor.ownerRevoked,false);assert.equal(preview.candidate.ownerRevoked,true);assert.equal(preview.candidate.signedActions,1);
  assert.equal(preview.advanced,false);assert.equal(reader.status().ownerRevoked,false);
  assert.equal((await advance(reader,cancelled)).advanced,true);assert.equal(reader.status().ownerRevoked,true);
  assert.equal(reader.status().entryCount,2);assert.equal(reader.status().delegation.spent,FEE);assert.equal(reader.status().signedActions,1);
  const before=tuple(reader),rollback=await inspect(reader,live);assert.equal(rollback.relation,'rollback');assert.equal(rollback.commonPrefixEntries,1);
  await assert.rejects(advance(reader,live),code('CHECKPOINT_ROLLBACK'));assert.equal(tuple(reader),before);
  const stripped=JSON.parse(cancelled.recordText);stripped.format='caw-owner-granted-lab-record-v1';stripped.entries.pop();
  const freshOld=await repack(cancelled,stripped);await assert.rejects(advance(reader,freshOld),code('CHECKPOINT_ROLLBACK'));
  assert.equal(tuple(reader),before);assert.equal(ledgerTuple(f.ledger),liveTuple);
});

test('checkpoint continuity: an invalid cancellation or version downgrade is rejected before comparison',async t=>{
  const f=await setup(t,{mode:'owner'}),anchor=await saved(f.ledger),reader=await tracker(t,anchor);
  await f.ledger.applyOwnerRevocation(await f.cancellation());const cancelled=await saved(f.ledger),record=JSON.parse(cancelled.recordText);
  const packet=JSON.parse(record.entries[0].packet);packet.signature='00'.repeat(64);record.entries[0].packet=JSON.stringify(packet);
  const changed=await repack(cancelled,record),before=tuple(reader);
  await assert.rejects(inspect(reader,changed),code('INVALID_REVOCATION_SIGNATURE'));assert.equal(tuple(reader),before);
  const downgrade=cancelled.recordText.replace('caw-owner-granted-lab-record-v2','caw-owner-granted-lab-record-v1');
  await assert.rejects(reader.inspect(downgrade,cancelled.checkpoint),code('INVALID_REVOCATION_RECORD'));assert.equal(tuple(reader),before);
});

test('checkpoint continuity: inherited model events remain distinct from signed and fixture record entries',async t=>{
  const initial=applyAction(state(),{id:'unsigned-before-tracker',kind:'caw',actor:'alpha',controller:'device-alpha',epoch:0,nonce:0,text:'Unsigned inherited fixture'});
  const f=await setup(t,{initial}),anchor=await saved(f.ledger),reader=await tracker(t,anchor);
  assert.equal(reader.status().inheritedEvents,1);assert.equal(reader.status().entryCount,0);assert.equal(reader.status().signedActions,0);
  f.ledger.simulateTransfer('device-other');const candidate=await saved(f.ledger);await advance(reader,candidate);
  assert.equal(reader.status().inheritedEvents,1);assert.equal(reader.status().fixtureTransfers,1);assert.equal(reader.status().signedActions,0);
  assert.equal(reader.status().entryCount,1);assert.equal(reader.exportAnchor().canonicalText,candidate.canonicalText);
});

test('checkpoint continuity: factory captures checkpoint, binding, permission and owner before native awaits',async t=>{
  const f=await setup(t,{mode:'owner'}),anchor=await saved(f.ledger),binding={...anchor.binding},delegation={...anchor.delegation},
    authority={...anchor.ownerAuthority},checkpoint={...anchor.checkpoint},held=hold(t,'importKey');
  const pending=createCheckpointTracker(anchor.recordText,checkpoint,binding,delegation,authority);
  await held.entered;binding.domain='changed';delegation.budget=FEE;authority.publicKey='01'.repeat(32);checkpoint.sha256='0'.repeat(64);held.release();
  const reader=await pending;t.after(()=>reader.close());held.restore();
  assert.deepEqual(reader.exportAnchor(),anchor);assert.deepEqual(reader.status().delegation.permission,anchor.delegation);
  assert.equal(reader.status().ownerRevoked,false);
});

test('checkpoint continuity: inspect and advance capture candidate checkpoints before verification yields',async t=>{
  const f=await setup(t),anchor=await saved(f.ledger);await f.ledger.accept(await f.packet());const candidate=await saved(f.ledger);
  for(const operation of [inspect,advance]){
    const reader=await tracker(t,anchor),checkpoint={...candidate.checkpoint},held=hold(t),pending=operation(reader,{...candidate,checkpoint});
    await held.entered;checkpoint.sha256='0'.repeat(64);checkpoint.entryCount=0;checkpoint.finalHistorySha256='1'.repeat(64);held.release();
    const result=await pending;held.restore();assert.equal(result.relation,'extension');assert.deepEqual(result.candidate.checkpoint,candidate.checkpoint);
    assert.deepEqual(reader.exportAnchor().checkpoint,operation===advance?candidate.checkpoint:anchor.checkpoint);
  }
});

test('checkpoint continuity: accessor trust and checkpoint fields are rejected without invoking getters or hooks',async t=>{
  const f=await setup(t,{mode:'owner'}),anchor=await saved(f.ledger),reader=await tracker(t,anchor),before=tuple(reader);let calls=0;
  const withGetter=(value,key)=>{const copy={...value};Object.defineProperty(copy,key,{enumerable:true,get(){calls++;return value[key];}});return copy;};
  await assert.rejects(createCheckpointTracker(anchor.recordText,withGetter(anchor.checkpoint,'sha256'),anchor.binding,anchor.delegation,anchor.ownerAuthority),code('INVALID_CHECKPOINT'));
  await assert.rejects(createCheckpointTracker(anchor.recordText,anchor.checkpoint,withGetter(anchor.binding,'publicKey'),anchor.delegation,anchor.ownerAuthority),code('INVALID_BINDING'));
  await assert.rejects(createCheckpointTracker(anchor.recordText,anchor.checkpoint,anchor.binding,withGetter(anchor.delegation,'budget'),anchor.ownerAuthority),code('INVALID_PERMISSION'));
  await assert.rejects(createCheckpointTracker(anchor.recordText,anchor.checkpoint,anchor.binding,anchor.delegation,withGetter(anchor.ownerAuthority,'publicKey')),code('INVALID_OWNER_GRANT'));
  for(const operation of [inspect,advance]){
    await assert.rejects(operation(reader,{...anchor,checkpoint:withGetter(anchor.checkpoint,'entryCount')}),code('INVALID_CHECKPOINT'));
    await assert.rejects(operation(reader,{...anchor,checkpoint:{...anchor.checkpoint,toJSON(){calls++;return anchor.checkpoint;}}}),code('INVALID_CHECKPOINT'));
  }
  await assert.rejects(reader.inspect({toString(){calls++;return anchor.recordText;}},anchor.checkpoint),code('RECORD_LIMIT'));
  assert.equal(calls,0);assert.equal(tuple(reader),before);
});

test('checkpoint continuity: exposed snapshots cannot mutate the retained record or its independent trust',async t=>{
  const f=await setup(t,{mode:'owner'}),anchor=await saved(f.ledger),reader=await tracker(t,anchor),before=tuple(reader);
  const exported=reader.exportAnchor(),status=reader.status(),comparison=await inspect(reader,anchor);
  for(const mutate of [()=>{exported.recordText='changed';},()=>{exported.checkpoint.sha256='0'.repeat(64);},
    ()=>{exported.binding.publicKey='01'.repeat(32);},()=>{exported.delegation.budget=FEE;},()=>{exported.ownerAuthority.account='beta';},
    ()=>{status.delegation.spent=FEE;},()=>{comparison.candidate.checkpoint.entryCount=9;},()=>{comparison.anchor.delegation.permission.budget=FEE;}]){
    try{mutate();}catch(error){assert.ok(error instanceof TypeError);}
  }
  assert.equal(tuple(reader),before);assert.equal((await inspect(reader,anchor)).relation,'same');
});

test('checkpoint continuity: racing valid extensions commit once and the delayed verification cannot overwrite the winner',async t=>{
  const f=await setup(t),anchor=await saved(f.ledger),fork=f.newLedger();
  await f.ledger.accept(await f.packet(0,'Branch A'));await fork.accept(await f.packet(0,'Branch B'));
  const a=await saved(f.ledger),b=await saved(fork),reader=await tracker(t,anchor),held=hold(t);
  const pending=advance(reader,a),rejected=assert.rejects(pending,code('ANCHOR_CHANGED'));await held.entered;
  const winner=await advance(reader,b);assert.equal(winner.advanced,true);const won=tuple(reader);held.release();await rejected;held.restore();
  assert.equal(tuple(reader),won);assert.equal(reader.status().revision,1);assert.deepEqual(reader.exportAnchor(),b);
  assert.equal((await inspect(reader,a)).relation,'conflict');await assert.rejects(advance(reader,a),code('CHECKPOINT_CONFLICT'));
});

test('checkpoint continuity: a longer winning prefix makes a delayed shorter advance stale, then a rollback',async t=>{
  const f=await setup(t),anchor=await saved(f.ledger);await f.ledger.accept(await f.packet());const one=await saved(f.ledger);
  await f.ledger.accept(await f.packet(1));const two=await saved(f.ledger),reader=await tracker(t,anchor),held=hold(t);
  const pending=advance(reader,one),rejected=assert.rejects(pending,code('ANCHOR_CHANGED'));await held.entered;
  await advance(reader,two);const won=tuple(reader);held.release();await rejected;held.restore();assert.equal(tuple(reader),won);
  assert.equal((await inspect(reader,one)).relation,'rollback');await assert.rejects(advance(reader,one),code('CHECKPOINT_ROLLBACK'));
});

test('checkpoint continuity: invalidating pending native verification advances only the guard revision',async t=>{
  const f=await setup(t),anchor=await saved(f.ledger);await f.ledger.accept(await f.packet());const candidate=await saved(f.ledger);
  for(const operation of [inspect,advance]){
    const reader=await tracker(t,anchor),held=hold(t),pending=operation(reader,candidate),rejected=assert.rejects(pending,code('ANCHOR_CHANGED'));
    await held.entered;reader.invalidatePending();assert.equal(reader.status().revision,1);assert.deepEqual(reader.exportAnchor(),anchor);
    const invalidated=tuple(reader);held.release();await rejected;held.restore();assert.equal(tuple(reader),invalidated);
    assert.equal((await advance(reader,candidate)).advanced,true);assert.equal(reader.status().revision,2);
  }
});

test('checkpoint continuity: close rejects pending and future work while leaving the retained anchor readable',async t=>{
  const f=await setup(t),anchor=await saved(f.ledger);await f.ledger.accept(await f.packet());const candidate=await saved(f.ledger);
  for(const operation of [inspect,advance]){
    const reader=await tracker(t,anchor),held=hold(t),pending=operation(reader,candidate),rejected=assert.rejects(pending,code('TRACKER_CLOSED'));
    await held.entered;reader.close();assert.equal(reader.status().revision,1);assert.deepEqual(reader.exportAnchor(),anchor);
    const closed=tuple(reader);held.release();await rejected;held.restore();assert.equal(tuple(reader),closed);
    await assert.rejects(inspect(reader,candidate),code('TRACKER_CLOSED'));await assert.rejects(advance(reader,candidate),code('TRACKER_CLOSED'));
    assert.throws(()=>reader.invalidatePending(),code('TRACKER_CLOSED'));assert.equal(tuple(reader),closed);
  }
});

test('checkpoint continuity: different readers can retain conflicting valid branches without a global freshness oracle',async t=>{
  const f=await setup(t),anchor=await saved(f.ledger),fork=f.newLedger(),readerA=await tracker(t,anchor),readerB=await tracker(t,anchor);
  await f.ledger.accept(await f.packet(0,'Valid observation A'));await fork.accept(await f.packet(0,'Valid observation B'));
  const a=await saved(f.ledger),b=await saved(fork);assert.equal((await advance(readerA,a)).advanced,true);assert.equal((await advance(readerB,b)).advanced,true);
  assert.equal((await inspect(readerA,b)).relation,'conflict');assert.equal((await inspect(readerB,a)).relation,'conflict');
  assert.notEqual(readerA.status().checkpoint.sha256,readerB.status().checkpoint.sha256);
  // Each reader preserves only its supplied anchor; signatures and fingerprints
  // do not determine which outside record is latest, available, or authoritative.
  const verified=await verifyLabRecord(a.recordText,a.checkpoint,a.binding);assert.equal(verified.recordedTimesAreProof,false);assert.equal(verified.ownershipProven,false);
});
