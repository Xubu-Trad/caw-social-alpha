import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicKey,verify as nativeVerify} from 'node:crypto';
import {createState} from '../public/model.mjs';
import {DEMO_FEES} from '../public/economics.mjs';
import {createDemoSigner} from '../public/signatures.mjs';
import {createSignedLedger} from '../public/signed-ledger.mjs';
import {appendLabRecord,createLabRecordCheckpoint,verifyLabRecord,LAB_RECORD_LIMITS} from '../public/signed-record.mjs';
import {createOwnerGrantSigner,makeOwnerGrant,readOwnerGrant,verifyOwnerGrant,
  makeOwnerRevocation,readOwnerRevocation,verifyOwnerRevocation} from '../public/owner-grant.mjs';

const NOW=1700000000,FEE=DEMO_FEES.caw;
const V1='caw-owner-granted-lab-record-v1',V2='caw-owner-granted-lab-record-v2';
const PREFIX='CAW_LOCAL_OWNER_REVOCATION_V1\n';
const code=expected=>error=>error?.code===expected;
const permission=()=>({scope:'caw',budget:(2n*BigInt(FEE)).toString(),notBefore:NOW,expiresAt:NOW+120});
const state=()=>createState({version:1,scenario:'appendix-demo-v1',accounts:[
  {name:'alpha',controller:'device-alpha',balance:(5n*BigInt(FEE)).toString(),stake:'1'},
  {name:'beta',controller:'device-beta',balance:'0',stake:'1'}],posts:[]});
const ownerBinding=owner=>({domain:'owner-cancellation-a',account:'alpha',controller:'device-alpha',epoch:0,publicKey:owner.publicKey});

async function setup(t,{clock=()=>NOW,terms=permission()}={}){
  const owner=await createOwnerGrantSigner(),delegate=await createDemoSigner();
  t.after(()=>{owner.revoke();delegate.revoke();});
  const authority=ownerBinding(owner),grant=makeOwnerGrant(authority,delegate.publicKey,terms),ownerPacket=await owner.sign(grant);
  const {binding}=await verifyOwnerGrant(ownerPacket,authority),authorization={packet:ownerPacket,authority};
  const ledger=createSignedLedger(state(),binding,clock,terms,authorization);t.after(()=>ledger.revoke());
  const action=(nonce=0)=>({account:'alpha',controller:'device-alpha',deployment:'unconnected-lab',domain:binding.domain,epoch:0,
    expiresAt:terms.expiresAt,fee:FEE,kind:'caw',network:'simulation',nonce,notBefore:terms.notBefore,
    scenario:'appendix-demo-v1',text:'A recorded cancellation. '+nonce,version:1});
  const revocation=makeOwnerRevocation(authority,binding.domain),cancellation=await owner.signRevocation(revocation);
  return {owner,delegate,authority,grant,ownerPacket,authorization,binding,terms,ledger,action,revocation,cancellation,
    packet:await delegate.sign(action())};
}
const tuple=ledger=>JSON.stringify([ledger.status(),ledger.exportRecord(),ledger.snapshot()]);
async function saved(ledger){const copy=ledger.exportRecord();return {...copy,checkpoint:await createLabRecordCheckpoint(copy.recordText,copy.canonicalText)};}
const recover=copy=>verifyLabRecord(copy.recordText,copy.checkpoint,copy.binding,copy.delegation,copy.ownerAuthority);
async function recheck(copy,record){const recordText=JSON.stringify(record);return recover({...copy,recordText,
  checkpoint:await createLabRecordCheckpoint(recordText,copy.canonicalText)});}
function hold(t,operation='verify',call=1){
  let entered,release,count=0;
  const start=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const subtle=crypto.subtle,original=subtle[operation];
  const mock=t.mock.method(subtle,operation,async function(...args){if(++count===call){entered();await gate;}return Reflect.apply(original,this,args);});
  t.after(()=>{release();mock.mock.restore();});
  return {entered:start,release,restore:()=>mock.mock.restore()};
}

test('owner cancellation: exact fields and a distinct signed prefix verify with the separately supplied owner',async t=>{
  const f=await setup(t),packet=readOwnerRevocation(f.cancellation);
  assert.deepEqual(Object.keys(packet.revocation),['version','network','deployment','scenario','ownerDomain','account','controller','epoch','ownerKey','grantDomain']);
  assert.deepEqual(packet.revocation,{version:1,network:'simulation',deployment:'unconnected-lab',scenario:'appendix-demo-v1',
    ownerDomain:f.authority.domain,account:'alpha',controller:'device-alpha',epoch:0,ownerKey:f.owner.publicKey,grantDomain:f.binding.domain});
  assert.ok(Object.isFrozen(f.revocation));assert.ok(Object.isFrozen(packet));assert.ok(Object.isFrozen(packet.revocation));
  assert.deepEqual(await verifyOwnerRevocation(f.cancellation,f.authority,f.binding.domain),f.revocation);
  // Independent Node verification fixes the prefix and bytes, without exporting a private key.
  const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(f.owner.publicKey,'hex')]),format:'der',type:'spki'});
  const signature=Buffer.from(packet.signature,'hex'),body=JSON.stringify(packet.revocation);
  assert.equal(nativeVerify(null,Buffer.from(PREFIX+body),key,signature),true);
  for(const prefix of ['', 'CAW_LOCAL_OWNER_GRANT_V1\n', 'CAW_LOCAL_SIGNED_ACTION_V1\n']){
    assert.equal(nativeVerify(null,Buffer.from(prefix+body),key,signature),false);
  }
});

test('owner cancellation: success closes only the grant journal, without a fee, nonce or model event',async t=>{
  const f=await setup(t);await f.ledger.accept(f.packet);
  const before=f.ledger.status(),history=f.ledger.snapshot(),old=JSON.parse(f.ledger.exportRecord().recordText);
  assert.equal(before.ownerRevoked,false);assert.equal(old.format,V1);
  assert.deepEqual(await f.ledger.applyOwnerRevocation(f.cancellation),{ownerRevoked:true,grantDomain:f.binding.domain});
  const after=f.ledger.status(),record=JSON.parse(f.ledger.exportRecord().recordText);
  assert.equal(after.closed,true);assert.equal(after.ownerRevoked,true);assert.equal(after.revision,before.revision+1);
  for(const key of ['balance','nextNonce','events','acceptedSignatures','controller','epoch'])assert.equal(after[key],before[key]);
  assert.deepEqual(after.delegation,before.delegation);assert.equal(f.ledger.snapshot(),history);
  assert.equal(record.format,V2);assert.deepEqual(record.entries,[...old.entries,{kind:'signed-owner-revocation',packet:f.cancellation}]);
  const r=await recover(await saved(f.ledger));
  assert.equal(r.canonicalText,history);assert.equal(r.ownerGrantVerified,true);assert.equal(r.ownerRevoked,true);assert.equal(r.ownerRevocations,1);
  assert.equal(r.signedActions,1);assert.equal(r.entryCount,2);assert.equal(r.ownershipProven,false);assert.equal(r.recordedTimesAreProof,false);
});

test('owner cancellation: repeated cancellation, checks, spends and fixture transfers cannot change a closed ledger',async t=>{
  const f=await setup(t);await f.ledger.applyOwnerRevocation(f.cancellation);const before=tuple(f.ledger);
  await assert.rejects(f.ledger.applyOwnerRevocation(f.cancellation),code('REVOKED'));
  await assert.rejects(f.ledger.check(f.packet),code('REVOKED'));
  await assert.rejects(f.ledger.accept(f.packet),code('REVOKED'));
  assert.throws(()=>f.ledger.simulateTransfer('device-other'),code('REVOKED'));
  assert.throws(()=>appendLabRecord(f.ledger.exportRecord().recordText,{kind:'signed-owner-revocation',packet:f.cancellation}),code('GRANT_REVOKED'));
  assert.equal(tuple(f.ledger),before);
});

test('owner cancellation: an empty grant may be cancelled before its window or after expiry',async t=>{
  for(const now of [NOW-1,NOW+120,NOW+1000]){
    const f=await setup(t,{clock:()=>now}),history=f.ledger.snapshot();
    await f.ledger.applyOwnerRevocation(f.cancellation);
    assert.equal(f.ledger.snapshot(),history);assert.equal(f.ledger.status().nextNonce,0);assert.equal(f.ledger.status().events,0);
    const r=await recover(await saved(f.ledger));assert.equal(r.ownerRevoked,true);assert.equal(r.signedActions,0);assert.equal(r.entryCount,1);
  }
});

test('owner cancellation: the original owner can cancel its old grant after a fixture transfer',async t=>{
  const f=await setup(t);f.ledger.simulateTransfer('device-other');const before=f.ledger.status(),history=f.ledger.snapshot();
  await f.ledger.applyOwnerRevocation(f.cancellation);assert.equal(f.ledger.snapshot(),history);
  assert.equal(f.ledger.status().epoch,before.epoch);assert.equal(f.ledger.status().controller,'device-other');
  const r=await recover(await saved(f.ledger));assert.equal(r.fixtureTransfers,1);assert.equal(r.signedActions,0);assert.equal(r.ownerRevoked,true);
});

test('owner cancellation: an ordinary ledger has no owner status and cannot accept a signed owner cancellation',async t=>{
  const f=await setup(t),binding={...f.binding,domain:'ordinary-cancellation-test'};
  const ordinary=createSignedLedger(state(),binding,()=>NOW);t.after(()=>ordinary.revoke());
  const before=tuple(ordinary);assert.equal(Object.hasOwn(ordinary.status(),'ownerRevoked'),false);
  await assert.rejects(ordinary.applyOwnerRevocation(f.cancellation),code('OWNER_GRANT_REQUIRED'));
  assert.equal(tuple(ordinary),before);
  assert.throws(()=>appendLabRecord(ordinary.exportRecord().recordText,{kind:'signed-owner-revocation',packet:f.cancellation}),code('OWNER_GRANT_REQUIRED'));
});

test('owner cancellation: altered signed fields, keys and domains cannot replace independent authority',async t=>{
  const f=await setup(t),before=tuple(f.ledger),parsed=readOwnerRevocation(f.cancellation);
  for(const patch of [{ownerDomain:'another-owner-session'},{account:'beta'},{controller:'device-other'},{epoch:1},
    {ownerKey:'01'.repeat(32)},{grantDomain:'ownergrant-'+'0'.repeat(64)}]){
    const altered=JSON.stringify({revocation:{...parsed.revocation,...patch},signature:parsed.signature});
    await assert.rejects(verifyOwnerRevocation(altered,f.authority,f.binding.domain),code('WRONG_REVOCATION_AUTHORITY'));
    await assert.rejects(f.ledger.applyOwnerRevocation(altered),code('WRONG_REVOCATION_AUTHORITY'));assert.equal(tuple(f.ledger),before);
  }
  const other=await createOwnerGrantSigner();t.after(()=>other.revoke());const outsider=ownerBinding(other);
  const outsiderPacket=await other.signRevocation(makeOwnerRevocation(outsider,f.binding.domain));
  await assert.rejects(verifyOwnerRevocation(outsiderPacket,f.authority,f.binding.domain),code('WRONG_REVOCATION_AUTHORITY'));
  await assert.rejects(verifyOwnerRevocation(f.cancellation,outsider,f.binding.domain),code('WRONG_REVOCATION_AUTHORITY'));
  await assert.rejects(other.signRevocation(f.revocation),code('WRONG_OWNER_KEY'));
  const alternateDelegate=await createDemoSigner();t.after(()=>alternateDelegate.revoke());
  const alternateGrant=await f.owner.sign(makeOwnerGrant(f.authority,alternateDelegate.publicKey,f.terms));
  const alternateBinding=(await verifyOwnerGrant(alternateGrant,f.authority)).binding;
  assert.notEqual(alternateBinding.domain,f.binding.domain);
  await assert.rejects(verifyOwnerRevocation(f.cancellation,f.authority,alternateBinding.domain),code('WRONG_REVOCATION_AUTHORITY'));
});

test('owner cancellation: bad cancellation or grant signatures leave all state and record components unchanged',async t=>{
  const f=await setup(t),bad=JSON.parse(f.cancellation);bad.signature='00'.repeat(64);const before=tuple(f.ledger);
  await assert.rejects(f.ledger.applyOwnerRevocation(JSON.stringify(bad)),code('INVALID_REVOCATION_SIGNATURE'));
  assert.equal(tuple(f.ledger),before);
  const badGrant=JSON.parse(f.ownerPacket);badGrant.signature='00'.repeat(64);
  const ledger=createSignedLedger(state(),f.binding,()=>NOW,f.terms,{packet:JSON.stringify(badGrant),authority:f.authority});t.after(()=>ledger.revoke());
  const original=tuple(ledger);await assert.rejects(ledger.applyOwnerRevocation(f.cancellation),code('INVALID_OWNER_SIGNATURE'));
  assert.equal(tuple(ledger),original);
  await f.ledger.applyOwnerRevocation(f.cancellation);const s=await saved(f.ledger),record=JSON.parse(s.recordText);
  record.entries.at(-1).packet=JSON.stringify(bad);
  await assert.rejects(recheck(s,record),code('INVALID_REVOCATION_SIGNATURE'));
  record.entries.at(-1).packet=f.cancellation;record.ownerGrant=JSON.stringify(badGrant);
  await assert.rejects(recheck(s,record),code('INVALID_OWNER_SIGNATURE'));
});

test('owner cancellation: canonical packet, context, Unicode byte and schema bounds fail closed',async t=>{
  const f=await setup(t),packet=readOwnerRevocation(f.cancellation);
  for(const patch of [{version:2},{network:'mainnet'},{deployment:'other'},{scenario:'other'}]){
    assert.throws(()=>readOwnerRevocation(JSON.stringify({revocation:{...f.revocation,...patch},signature:packet.signature})),code('INVALID_OWNER_REVOCATION'));
  }
  for(const text of [f.cancellation+' ',JSON.stringify(JSON.parse(f.cancellation),null,2),
    f.cancellation.replace('"revocation":','"revocation":{},"revocation":'),
    f.cancellation.replace('"revocation":','"revoca\\u0074ion":{},"revocation":')]){
    assert.throws(()=>readOwnerRevocation(text),code('NON_CANONICAL_REVOCATION'));
  }
  for(const text of ['not json','x'.repeat(8193),'🐦'.repeat(2049),null,{},new String(f.cancellation)]){
    assert.throws(()=>readOwnerRevocation(text),code('INVALID_OWNER_REVOCATION'));
  }
  for(const signature of ['A'.repeat(128),'0'.repeat(127),'0'.repeat(129)])assert.throws(()=>readOwnerRevocation(JSON.stringify({...packet,signature})));
  for(const value of [{...f.revocation,fee:FEE},{...f.revocation,toJSON(){throw new Error('unexpected hook');}},Object.create(f.revocation)]){
    await assert.rejects(f.owner.signRevocation(value),code('INVALID_OWNER_GRANT'));
  }
  assert.throws(()=>readOwnerRevocation(f.ownerPacket));assert.throws(()=>readOwnerGrant(f.cancellation));
});

test('owner cancellation: domain and identity boundaries remain exact',async t=>{
  const f=await setup(t),authority={...f.authority,domain:'a'.repeat(96),account:'a'.repeat(32),controller:'device-'+'a'.repeat(40),epoch:4294967295};
  const value=makeOwnerRevocation(authority,'ownergrant-'+'f'.repeat(64)),packet=await f.owner.signRevocation(value);
  assert.deepEqual(await verifyOwnerRevocation(packet,authority,value.grantDomain),value);
  for(const domain of ['', 'ownergrant-'+'f'.repeat(63),'ownergrant-'+'f'.repeat(65),'ownergrant-'+'F'.repeat(64),f.binding.domain+'\n',null,{}]){
    assert.throws(()=>makeOwnerRevocation(f.authority,domain),code('INVALID_OWNER_REVOCATION'));
  }
  for(const patch of [{domain:'a'.repeat(97)},{account:'a'.repeat(33)},{controller:'device-'+'a'.repeat(41)}]){
    assert.throws(()=>makeOwnerRevocation({...authority,...patch},f.binding.domain),code('INVALID_LABEL'));
  }
  for(const epoch of [-0,-1,4294967296,1.5,'0'])assert.throws(()=>makeOwnerRevocation({...authority,epoch},f.binding.domain),code('INVALID_INTEGER'));
});

test('owner cancellation: getters and conversion hooks are never invoked',async t=>{
  const f=await setup(t);let calls=0;
  const authority={...f.authority};Object.defineProperty(authority,'publicKey',{enumerable:true,get(){calls++;return f.owner.publicKey;}});
  assert.throws(()=>makeOwnerRevocation(authority,f.binding.domain),code('INVALID_OWNER_GRANT'));
  await assert.rejects(verifyOwnerRevocation(f.cancellation,authority,f.binding.domain),code('INVALID_OWNER_GRANT'));
  for(const field of ['ownerKey','grantDomain']){
    const value={...f.revocation};Object.defineProperty(value,field,{enumerable:true,get(){calls++;return f.revocation[field];}});
    await assert.rejects(f.owner.signRevocation(value),code('INVALID_OWNER_GRANT'));
  }
  const packetLike={toString(){calls++;return f.cancellation;}};
  await assert.rejects(f.ledger.applyOwnerRevocation(packetLike),code('INVALID_OWNER_REVOCATION'));
  const entry={kind:'signed-owner-revocation'};Object.defineProperty(entry,'packet',{enumerable:true,get(){calls++;return f.cancellation;}});
  assert.throws(()=>appendLabRecord(f.ledger.exportRecord().recordText,entry),code('INVALID_RECORD'));
  assert.equal(calls,0);
});

test('owner cancellation: sign and verify capture mutable inputs before native awaits',async t=>{
  const f=await setup(t),value={...f.revocation},held=hold(t,'sign');
  const pending=f.owner.signRevocation(value);await held.entered;value.ownerDomain='changed';value.grantDomain='ownergrant-'+'0'.repeat(64);held.release();
  const packet=await pending;held.restore();assert.deepEqual(readOwnerRevocation(packet).revocation,f.revocation);
  const authority={...f.authority},gate=hold(t,'importKey'),checked=verifyOwnerRevocation(packet,authority,f.binding.domain);
  await gate.entered;authority.publicKey='01'.repeat(32);authority.domain='changed';gate.release();
  assert.deepEqual(await checked,f.revocation);gate.restore();
  await f.ledger.applyOwnerRevocation(packet);const s=await saved(f.ledger),copy={...s.ownerAuthority},fingerprint={...s.checkpoint},binding={...s.binding},recoveryGate=hold(t,'verify');
  const recovered=verifyLabRecord(s.recordText,fingerprint,binding,s.delegation,copy);await recoveryGate.entered;
  copy.account='beta';fingerprint.sha256='0'.repeat(64);binding.domain='changed';recoveryGate.release();
  assert.equal((await recovered).ownerRevoked,true);
});

test('owner cancellation: closing an owner signer blocks pending and future signatures, without cancelling an issued grant',async t=>{
  const f=await setup(t),held=hold(t,'sign'),pending=f.owner.signRevocation(f.revocation),rejected=assert.rejects(pending,code('REVOKED'));
  await held.entered;f.owner.revoke();held.release();await rejected;held.restore();
  await assert.rejects(f.owner.signRevocation(f.revocation),code('REVOKED'));
  await assert.rejects(f.owner.sign(f.grant),code('REVOKED'));
  assert.equal(f.ledger.status().ownerRevoked,false);await f.ledger.accept(f.packet);
  await f.ledger.applyOwnerRevocation(f.cancellation);assert.equal(f.ledger.status().ownerRevoked,true);
});

test('owner cancellation: cancellation during either accept signature stage prevents every action mutation',async t=>{
  for(const call of [1,2]){
    const f=await setup(t),held=hold(t,'verify',call),pending=f.ledger.accept(f.packet),rejected=assert.rejects(pending,code('REVOKED'));
    await held.entered;await f.ledger.applyOwnerRevocation(f.cancellation);const cancelled=tuple(f.ledger);
    held.release();await rejected;held.restore();assert.equal(tuple(f.ledger),cancelled);
    assert.equal(f.ledger.status().events,0);assert.equal(f.ledger.status().delegation.spent,'0');assert.equal(f.ledger.status().nextNonce,0);
  }
});

test('owner cancellation: action or transfer racing either cancellation signature stage forces retry before closure',async t=>{
  for(const call of [1,2])for(const mode of ['accept','transfer']){
    const f=await setup(t),held=hold(t,'verify',call),pending=f.ledger.applyOwnerRevocation(f.cancellation),rejected=assert.rejects(pending,code('STATE_CHANGED'));
    await held.entered;
    if(mode==='accept')await f.ledger.accept(f.packet);else f.ledger.simulateTransfer('device-other');
    const committed=tuple(f.ledger);held.release();await rejected;held.restore();
    assert.equal(tuple(f.ledger),committed);assert.equal(f.ledger.status().ownerRevoked,false);assert.equal(f.ledger.status().events,1);
    const history=f.ledger.snapshot();await f.ledger.applyOwnerRevocation(f.cancellation);assert.equal(f.ledger.snapshot(),history);
    assert.equal((await recover(await saved(f.ledger))).ownerRevoked,true);
  }
});

test('owner cancellation: local closure during verification cannot append a cancellation or claim owner revocation',async t=>{
  for(const call of [1,2]){
    const f=await setup(t),held=hold(t,'verify',call),pending=f.ledger.applyOwnerRevocation(f.cancellation),rejected=assert.rejects(pending,code('REVOKED'));
    await held.entered;f.ledger.revoke();const closed=tuple(f.ledger);held.release();await rejected;held.restore();
    assert.equal(tuple(f.ledger),closed);assert.equal(f.ledger.status().ownerRevoked,false);assert.equal(JSON.parse(f.ledger.exportRecord().recordText).format,V1);
  }
});

test('owner cancellation: concurrent cancellations commit exactly once',async t=>{
  const f=await setup(t),held=hold(t,'verify'),first=f.ledger.applyOwnerRevocation(f.cancellation),firstRejected=assert.rejects(first,code('REVOKED'));
  await held.entered;await f.ledger.applyOwnerRevocation(f.cancellation);const once=tuple(f.ledger);held.release();await firstRejected;
  assert.equal(tuple(f.ledger),once);assert.equal(f.ledger.status().revision,1);
  assert.equal(JSON.parse(f.ledger.exportRecord().recordText).entries.length,1);
});

test('owner cancellation: v2 requires one final cancellation and v1 cannot disguise cancellation entries',async t=>{
  const f=await setup(t);await f.ledger.accept(f.packet);await f.ledger.applyOwnerRevocation(f.cancellation);
  const s=await saved(f.ledger),record=JSON.parse(s.recordText),cancellation=record.entries.at(-1),action=record.entries[0];
  const invalid=[
    {...record,format:V1}, {...record,entries:[action]}, {...record,entries:[]},
    {...record,entries:[cancellation,action]}, {...record,entries:[action,cancellation,cancellation]},
    {...record,entries:[action,cancellation,{kind:'unsigned-fixture-transfer',newController:'device-other'}]},
  ];
  for(const item of invalid){
    await assert.rejects(createLabRecordCheckpoint(JSON.stringify(item),s.canonicalText),code('INVALID_REVOCATION_RECORD'));
    await assert.rejects(recover({...s,recordText:JSON.stringify(item)}),code('INVALID_REVOCATION_RECORD'));
  }
  for(const format of ['caw-signed-lab-record-v1','caw-delegated-lab-record-v1']){
    const downgraded={format,initialHistory:record.initialHistory,...(format.includes('delegated')?{delegation:record.delegation}:{}),entries:record.entries};
    await assert.rejects(createLabRecordCheckpoint(JSON.stringify(downgraded),s.canonicalText),code('INVALID_REVOCATION_RECORD'));
  }
  await assert.rejects(verifyLabRecord(s.recordText,s.checkpoint,s.binding,s.delegation),code('OWNER_GRANT_REQUIRED'));
});

test('owner cancellation: older snapshots remain verifiable history but cannot prove absence of later cancellation',async t=>{
  const f=await setup(t);await f.ledger.accept(f.packet);const old=await saved(f.ledger);
  await f.ledger.applyOwnerRevocation(f.cancellation);const current=await saved(f.ledger);
  assert.equal(old.canonicalText,current.canonicalText);assert.notEqual(old.recordText,current.recordText);
  assert.equal(old.checkpoint.finalHistorySha256,current.checkpoint.finalHistorySha256);
  assert.notEqual(old.checkpoint.sha256,current.checkpoint.sha256);
  const historical=await recover(old),cancelled=await recover(current);
  assert.equal(historical.ownerRevoked,false);assert.equal(historical.ownerRevocations,0);
  assert.equal(cancelled.ownerRevoked,true);assert.equal(cancelled.ownerRevocations,1);
  assert.equal(historical.ownershipProven,false);assert.equal(historical.recordedTimesAreProof,false);
  await assert.rejects(recover({...old,checkpoint:current.checkpoint}),code('CHECKPOINT_MISMATCH'));
  await assert.rejects(recover({...current,checkpoint:old.checkpoint}),code('CHECKPOINT_MISMATCH'));
  // Dropping the terminal entry and restoring v1 recovers the *old* record only
  // with its old/replaced fingerprint. A history verifier has no freshness oracle.
  const stripped=JSON.parse(current.recordText);stripped.format=V1;stripped.entries.pop();
  assert.equal(JSON.stringify(stripped),old.recordText);
  assert.equal((await recheck(current,stripped)).ownerRevoked,false);
});

test('owner cancellation: 64 actual model-changing entries retain a reserved 65th terminal cancellation',async t=>{
  const f=await setup(t);
  assert.equal(LAB_RECORD_LIMITS.maxEntries,64);assert.equal(LAB_RECORD_LIMITS.maxRevokedEntries,65);
  for(let index=0;index<64;index++)f.ledger.simulateTransfer(index%2===0?'device-away':'device-alpha');
  const before=tuple(f.ledger),history=f.ledger.snapshot();
  assert.throws(()=>f.ledger.simulateTransfer('device-overflow'),code('RECORD_LIMIT'));assert.equal(tuple(f.ledger),before);
  await f.ledger.applyOwnerRevocation(f.cancellation);assert.equal(f.ledger.snapshot(),history);assert.equal(f.ledger.status().events,64);
  const s=await saved(f.ledger),record=JSON.parse(s.recordText);assert.equal(record.format,V2);assert.equal(record.entries.length,65);
  assert.equal(s.checkpoint.entryCount,65);assert.equal(record.entries.at(-1).kind,'signed-owner-revocation');
  const r=await recover(s);assert.equal(r.fixtureTransfers,64);assert.equal(r.signedActions,0);assert.equal(r.ownerRevocations,1);
  assert.equal(r.canonicalText,history);assert.equal(r.ownerRevoked,true);
});

test('owner cancellation: byte reserve admits cancellation at the ordinary 2 MiB boundary and remains bounded',async t=>{
  const f=await setup(t),s=await saved(f.ledger),record=JSON.parse(s.recordText);
  assert.equal(LAB_RECORD_LIMITS.maxBytes,2*1024*1024);assert.equal(LAB_RECORD_LIMITS.maxRevokedBytes,2*1024*1024+16*1024);
  // Structural journal fixture only: these filler packets are not signed CAWs.
  // This probes serialization capacity; the previous test verifies real replay.
  record.entries=Array.from({length:64},()=>({kind:'signed-caw',packet:'',acceptedAt:NOW}));
  let remaining=LAB_RECORD_LIMITS.maxBytes-Buffer.byteLength(JSON.stringify(record));
  for(const entry of record.entries){
    const controls=Math.min(8192,Math.floor(remaining/6));entry.packet='\0'.repeat(controls);remaining-=controls*6;
    const plain=Math.min(8192-controls,remaining);entry.packet+='x'.repeat(plain);remaining-=plain;
  }
  assert.equal(remaining,0);const full=JSON.stringify(record);assert.equal(Buffer.byteLength(full),LAB_RECORD_LIMITS.maxBytes);
  assert.throws(()=>appendLabRecord(full,{kind:'unsigned-fixture-transfer',newController:'device-overflow'}),code('RECORD_LIMIT'));
  const cancelled=appendLabRecord(full,{kind:'signed-owner-revocation',packet:f.cancellation});
  assert.ok(Buffer.byteLength(cancelled)>LAB_RECORD_LIMITS.maxBytes);assert.ok(Buffer.byteLength(cancelled)<=LAB_RECORD_LIMITS.maxRevokedBytes);
  const checkpoint=await createLabRecordCheckpoint(cancelled,s.canonicalText);assert.equal(checkpoint.entryCount,65);assert.equal(checkpoint.byteLength,Buffer.byteLength(cancelled));
  // The larger allowance belongs only to canonical v2 records, never a v1 label.
  await assert.rejects(createLabRecordCheckpoint(cancelled.replace(V2,V1),s.canonicalText),code('RECORD_LIMIT'));
  for(const oversized of [JSON.stringify({format:V2})+'x'.repeat(LAB_RECORD_LIMITS.maxRevokedBytes),
    '{"format":"'+V2+'",'+ '🐦'.repeat(LAB_RECORD_LIMITS.maxRevokedBytes/4+1)]){
    await assert.rejects(createLabRecordCheckpoint(oversized,s.canonicalText),code('RECORD_LIMIT'));
  }
});
