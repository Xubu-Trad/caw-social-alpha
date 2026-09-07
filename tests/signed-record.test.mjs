import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createState,canonicalExport,applyAction} from '../public/model.mjs';
import {createDemoSigner} from '../public/signatures.mjs';
import {createSignedLedger} from '../public/signed-ledger.mjs';
import {createLabRecord,appendLabRecord,createLabRecordCheckpoint,verifyLabRecord,LAB_RECORD_LIMITS} from '../public/signed-record.mjs';

const NOW=1700000000,FEE='5000000000000000000000';
const code=value=>error=>error?.code===value;
function seed(balance='10000000000000000000000'){return {version:1,scenario:'appendix-demo-v1',accounts:[
  {name:'alpha',controller:'device-alpha',balance,stake:'1'},
  {name:'beta',controller:'device-beta',balance:'0',stake:'1'}],posts:[]};}
function action(nonce=0,patch={}){return {account:'alpha',controller:'device-alpha',deployment:'unconnected-lab',domain:'record-test',
  epoch:0,expiresAt:NOW+100,fee:FEE,kind:'caw',network:'simulation',nonce,notBefore:NOW,
  scenario:'appendix-demo-v1',text:'Exact words '+nonce,version:1,...patch};}
async function setup(t,{balance,initial,clock=()=>NOW}={}){
  const signer=await createDemoSigner();t.after(()=>signer.revoke());
  const binding={domain:'record-test',account:'alpha',controller:'device-alpha',epoch:0,publicKey:signer.publicKey};
  const ledger=createSignedLedger(initial??createState(seed(balance)),binding,clock);t.after(()=>ledger.revoke());
  return {signer,binding,ledger};
}
async function save(ledger){const captured=ledger.exportRecord();return {...captured,checkpoint:await createLabRecordCheckpoint(captured.recordText,captured.canonicalText)};}
async function verify(saved){return verifyLabRecord(saved.recordText,saved.checkpoint,saved.binding);}
async function recalculate(saved,record){const recordText=JSON.stringify(record);return {...saved,recordText,checkpoint:await createLabRecordCheckpoint(recordText,saved.canonicalText)};}
function hold(t,operation){
  let entered,release;const start=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const subtle=globalThis.crypto.subtle,original=subtle[operation];
  const mock=t.mock.method(subtle,operation,async function(...args){entered();await gate;return Reflect.apply(original,this,args);});
  t.after(()=>{release();mock.mock.restore();});return {entered:start,release};
}

test('signed record: empty copied history has separate exact record and final-history fingerprints',async t=>{
  const {ledger}=await setup(t),saved=await save(ledger),result=await verify(saved);
  assert.equal(result.canonicalText,saved.canonicalText);assert.equal(result.entryCount,0);assert.equal(result.signedActions,0);
  assert.equal(saved.checkpoint.sha256,createHash('sha256').update(saved.recordText).digest('hex'));
  assert.equal(saved.checkpoint.finalHistorySha256,createHash('sha256').update(saved.canonicalText).digest('hex'));
  assert.equal(saved.checkpoint.byteLength,Buffer.byteLength(saved.recordText));assert.ok(Object.isFrozen(saved.checkpoint));
  assert.ok(Object.isFrozen(ledger.exportRecord()));assert.ok(Object.isFrozen(result));
});

test('signed record: exact packets and final guard time rebuild signed actions plus an explicit unsigned transfer',async t=>{
  let clockCalls=0;const {ledger,signer}=await setup(t,{clock:()=>NOW+clockCalls++});
  const packet=await signer.sign(action());await ledger.accept(packet);
  const record=JSON.parse(ledger.exportRecord().recordText);
  assert.deepEqual(record.entries[0],{kind:'signed-caw',packet,acceptedAt:NOW+2});
  ledger.simulateTransfer('device-other');const saved=await save(ledger),result=await verify(saved);
  assert.equal(result.canonicalText,ledger.snapshot());assert.equal(result.signedActions,1);assert.equal(result.fixtureTransfers,1);
  assert.equal(result.inheritedEvents,0);assert.equal(result.ownershipProven,false);assert.equal(result.recordedTimesAreProof,false);
  assert.deepEqual(JSON.parse(saved.recordText).entries[1],{kind:'unsigned-fixture-transfer',newController:'device-other'});
});

test('signed record: inherited events remain unsigned even with signed-looking identifiers',async t=>{
  const initial=applyAction(createState(seed()),{id:'signed-alpha-0',kind:'caw',actor:'alpha',controller:'device-alpha',epoch:0,nonce:0,text:'Unsigned fixture event.'});
  const {ledger,signer}=await setup(t,{initial});await ledger.accept(await signer.sign(action(1)));
  const result=await verify(await save(ledger));assert.equal(result.inheritedEvents,1);assert.equal(result.signedActions,1);assert.equal(result.entryCount,1);
  assert.equal(JSON.parse(result.canonicalText).expectedEventCount,2);
});

test('signed record: altered bytes are rejected against the retained fingerprint',async t=>{
  const {ledger,signer}=await setup(t);await ledger.accept(await signer.sign(action()));const saved=await save(ledger);
  const changed=saved.recordText.replace('Exact words','Other words');assert.notEqual(changed,saved.recordText);
  await assert.rejects(verifyLabRecord(changed,saved.checkpoint,saved.binding),code('CHECKPOINT_MISMATCH'));
});

test('signed record: a refreshed fingerprint cannot make an altered signature valid',async t=>{
  const {ledger,signer}=await setup(t);await ledger.accept(await signer.sign(action()));const saved=await save(ledger),record=JSON.parse(saved.recordText);
  const packet=JSON.parse(record.entries[0].packet);packet.action.text='Changed words.';record.entries[0].packet=JSON.stringify(packet);
  await assert.rejects(verify(await recalculate(saved,record)),code('INVALID_SIGNATURE'));
});

test('signed record: recorded time must be inside the signed window but is not historical time proof',async t=>{
  const {ledger,signer}=await setup(t);await ledger.accept(await signer.sign(action()));const saved=await save(ledger),record=JSON.parse(saved.recordText);
  record.entries[0].acceptedAt=NOW+100;
  await assert.rejects(verify(await recalculate(saved,record)),code('OUTSIDE_WINDOW'));
  record.entries[0].acceptedAt=NOW+10;
  const result=await verify(await recalculate(saved,record));assert.equal(result.recordedTimesAreProof,false);
  assert.equal(result.canonicalText,saved.canonicalText,'A newly supplied fingerprint cannot establish when the action actually happened');
});

test('signed record: reordering and duplicated signed entries fail nonce replay',async t=>{
  const {ledger,signer}=await setup(t);await ledger.accept(await signer.sign(action()));await ledger.accept(await signer.sign(action(1)));
  const saved=await save(ledger),record=JSON.parse(saved.recordText);
  await assert.rejects(verify(await recalculate(saved,{...record,entries:[record.entries[1],record.entries[0]]})),code('STALE_NONCE'));
  await assert.rejects(verify(await recalculate(saved,{...record,entries:[record.entries[0],record.entries[0]]})),code('STALE_NONCE'));
});

test('signed record: omitted suffix fails retained record or final-history fingerprints',async t=>{
  const {ledger,signer}=await setup(t);await ledger.accept(await signer.sign(action()));await ledger.accept(await signer.sign(action(1)));
  const saved=await save(ledger),record=JSON.parse(saved.recordText);record.entries.pop();
  await assert.rejects(verifyLabRecord(JSON.stringify(record),saved.checkpoint,saved.binding),code('CHECKPOINT_MISMATCH'));
  await assert.rejects(verify(await recalculate(saved,record)),code('FINAL_HISTORY_MISMATCH'));
});

test('signed record: unsigned starting balances are covered by the retained fingerprint',async t=>{
  const {ledger,signer}=await setup(t);await ledger.accept(await signer.sign(action()));const saved=await save(ledger),record=JSON.parse(saved.recordText);
  record.initialHistory=canonicalExport(createState(seed('20000000000000000000000')));
  await assert.rejects(verifyLabRecord(JSON.stringify(record),saved.checkpoint,saved.binding),code('CHECKPOINT_MISMATCH'));
  await assert.rejects(verify(await recalculate(saved,record)),code('FINAL_HISTORY_MISMATCH'));
});

test('signed record: unsigned transfer cannot grant new key authority or revive an old epoch',async t=>{
  const {ledger,signer}=await setup(t);ledger.simulateTransfer('device-other');ledger.simulateTransfer('device-alpha');
  const saved=await save(ledger),record=JSON.parse(saved.recordText);
  record.entries.push({kind:'signed-caw',packet:await signer.sign(action(2,{epoch:2})),acceptedAt:NOW});
  await assert.rejects(verify(await recalculate(saved,record)),code('WRONG_AUTHORITY'));
});

test('signed record: checkpoint and binding mutations during native hashing cannot replace captured trust',async t=>{
  const {ledger,signer}=await setup(t);await ledger.accept(await signer.sign(action()));const saved=await save(ledger);
  const checkpoint={...saved.checkpoint},binding={...saved.binding},held=hold(t,'digest');
  const pending=verifyLabRecord(saved.recordText,checkpoint,binding);await held.entered;
  checkpoint.sha256='0'.repeat(64);checkpoint.finalHistorySha256='0'.repeat(64);binding.domain='other-record';held.release();
  assert.equal((await pending).canonicalText,saved.canonicalText);
});

test('signed record: noncanonical records, unknown fields and accessor trust are rejected',async t=>{
  const {ledger}=await setup(t),saved=await save(ledger),record=JSON.parse(saved.recordText);
  for(const text of [JSON.stringify(record,null,2),saved.recordText.replace('{','{"format":"extra",'),JSON.stringify({...record,extra:1})]){
    await assert.rejects(createLabRecordCheckpoint(text,saved.canonicalText));
  }
  let calls=0;const checkpoint={...saved.checkpoint};Object.defineProperty(checkpoint,'sha256',{enumerable:true,get(){calls++;return saved.checkpoint.sha256;}});
  await assert.rejects(verifyLabRecord(saved.recordText,checkpoint,saved.binding),code('INVALID_CHECKPOINT'));
  const binding={...saved.binding};Object.defineProperty(binding,'publicKey',{enumerable:true,get(){calls++;return saved.binding.publicKey;}});
  await assert.rejects(verifyLabRecord(saved.recordText,saved.checkpoint,binding),code('INVALID_BINDING'));assert.equal(calls,0);
  assert.throws(()=>appendLabRecord(saved.recordText,{kind:'unsigned-fixture-transfer',newController:'device-other',publicKey:saved.binding.publicKey}));
});

test('signed record: text and UTF-8 bounds reject oversized input before reconstruction',async t=>{
  const {ledger}=await setup(t),saved=await save(ledger);
  for(const value of ['x'.repeat(LAB_RECORD_LIMITS.maxBytes+1),'🐦'.repeat(LAB_RECORD_LIMITS.maxBytes/4+1)]){
    await assert.rejects(verifyLabRecord(value,saved.checkpoint,saved.binding),code('RECORD_LIMIT'));
  }
  assert.throws(()=>createLabRecord('{}'));assert.throws(()=>appendLabRecord(saved.recordText,{kind:'unsupported'}));
});

test('signed record: the 65th added event cannot advance state or evidence beyond the 64-entry bound',async t=>{
  const {ledger,signer}=await setup(t,{balance:'1000000000000000000000000'});
  for(let nonce=0;nonce<64;nonce++)await ledger.accept(await signer.sign(action(nonce)));
  const before=ledger.exportRecord(),status=ledger.status(),packet=await signer.sign(action(64));
  await ledger.check(packet);await assert.rejects(ledger.accept(packet),code('RECORD_LIMIT'));
  assert.deepEqual(ledger.exportRecord(),before);assert.deepEqual(ledger.status(),status);
  assert.throws(()=>ledger.simulateTransfer('device-other'),code('RECORD_LIMIT'));assert.deepEqual(ledger.exportRecord(),before);
  assert.equal((await verify(await save(ledger))).signedActions,64);
});

test('signed record: accounting and pending-expiry rejection preserve the evidence tuple',async t=>{
  const empty=await setup(t,{balance:'0'}),before=empty.ledger.exportRecord();
  await assert.rejects(empty.ledger.accept(await empty.signer.sign(action())),code('INSUFFICIENT_BALANCE'));assert.deepEqual(empty.ledger.exportRecord(),before);
  let now=NOW;const active=await setup(t,{clock:()=>now}),packet=await active.signer.sign(action()),original=active.ledger.exportRecord(),held=hold(t,'verify');
  const pending=active.ledger.accept(packet),rejected=assert.rejects(pending,code('OUTSIDE_WINDOW'));
  await held.entered;now=NOW+100;held.release();await rejected;assert.deepEqual(active.ledger.exportRecord(),original);
});
