import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createState,canonicalExport} from '../public/model.mjs';
import {DEMO_FEES} from '../public/economics.mjs';
import {createDemoSigner} from '../public/signatures.mjs';
import {bindDelegation} from '../public/delegation.mjs';
import {createSignedLedger} from '../public/signed-ledger.mjs';
import {createLabRecordCheckpoint,LAB_RECORD_LIMITS} from '../public/signed-record.mjs';
import {createOwnerGrantSigner,makeOwnerGrant,verifyOwnerGrant,makeOwnerRevocation} from '../public/owner-grant.mjs';
import {createAnchorPackage,importAnchorPackage,ANCHOR_PACKAGE_FORMAT,ANCHOR_PACKAGE_LIMITS} from '../public/anchor-package.mjs';

const NOW=1700000000,FEE=DEMO_FEES.caw;
const code=expected=>error=>error?.code===expected;
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');
const state=(balance=(5n*BigInt(FEE)).toString())=>createState({version:1,scenario:'appendix-demo-v1',accounts:[
  {name:'alpha',controller:'device-alpha',balance,stake:'1'},
  {name:'beta',controller:'device-beta',balance:'0',stake:'1'}],posts:[]});
const permission=()=>({scope:'caw',budget:(2n*BigInt(FEE)).toString(),notBefore:NOW,expiresAt:NOW+120});
async function setup(t,{mode='ordinary'}={}){
  const signer=await createDemoSigner();t.after(()=>signer.revoke());
  let binding={domain:'portable-anchor-a',account:'alpha',controller:'device-alpha',epoch:0,publicKey:signer.publicKey};
  let delegation,owner,ownerAuthority,authorization;
  if(mode==='delegated'){
    delegation=permission();binding=await bindDelegation(binding,delegation);
  }else if(mode==='owner'){
    delegation=permission();owner=await createOwnerGrantSigner();t.after(()=>owner.revoke());
    ownerAuthority={domain:'portable-owner-a',account:'alpha',controller:'device-alpha',epoch:0,publicKey:owner.publicKey};
    const packet=await owner.sign(makeOwnerGrant(ownerAuthority,signer.publicKey,delegation));
    binding=(await verifyOwnerGrant(packet,ownerAuthority)).binding;authorization={packet,authority:ownerAuthority};
  }
  function newLedger(initial=state()){
    const ledger=createSignedLedger(initial,binding,()=>NOW,delegation,authorization);t.after(()=>ledger.revoke());return ledger;
  }
  const packet=(nonce=0,text='Portable evidence '+nonce)=>signer.sign({account:'alpha',controller:'device-alpha',deployment:'unconnected-lab',domain:binding.domain,
    epoch:0,expiresAt:NOW+120,fee:FEE,kind:'caw',network:'simulation',nonce,notBefore:NOW,scenario:'appendix-demo-v1',text,version:1});
  return {signer,binding,delegation,owner,ownerAuthority,newLedger,ledger:newLedger(),packet,
    cancellation:()=>owner.signRevocation(makeOwnerRevocation(ownerAuthority,binding.domain))};
}
async function saved(ledger){const captured=ledger.exportRecord();return {...captured,
  checkpoint:await createLabRecordCheckpoint(captured.recordText,captured.canonicalText)};}
async function unpack(t,packed,expected=packed.sha256){
  const imported=await importAnchorPackage(packed.packageText,expected);t.after(()=>imported.tracker.close());return imported;
}
const trackerTuple=tracker=>JSON.stringify([tracker.status(),tracker.exportAnchor()]);
const ledgerTuple=ledger=>JSON.stringify([ledger.status(),ledger.exportRecord(),ledger.snapshot()]);
async function changedRecord(anchor,record){const recordText=JSON.stringify(record);return {...anchor,recordText,
  checkpoint:await createLabRecordCheckpoint(recordText,anchor.canonicalText)};}
function packageWith(packed,patch){const packageText=JSON.stringify({...JSON.parse(packed.packageText),...patch});return {packageText,sha256:hash(packageText)};}
function hold(t,operation='verify',call=1){
  let entered,release,count=0;const start=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const subtle=crypto.subtle,original=subtle[operation];
  const mock=t.mock.method(subtle,operation,async function(...args){if(++count===call){entered();await gate;}return Reflect.apply(original,this,args);});
  t.after(()=>{release();mock.mock.restore();});return {entered:start,release,restore:()=>mock.mock.restore()};
}

test('anchor package: exact versioned bytes round-trip and match a separate SHA-256 API',async t=>{
  const f=await setup(t),anchor=await saved(f.ledger),packed=await createAnchorPackage(anchor),parsed=JSON.parse(packed.packageText);
  assert.equal(ANCHOR_PACKAGE_FORMAT,'caw-retained-anchor-package-v1');assert.ok(Object.isFrozen(ANCHOR_PACKAGE_LIMITS));
  assert.equal(ANCHOR_PACKAGE_LIMITS.maxBytes,4243456);assert.equal(ANCHOR_PACKAGE_LIMITS.maxDepth,2);
  assert.deepEqual(Object.keys(parsed),['format','recordText','checkpoint','binding']);assert.equal(Object.hasOwn(parsed,'canonicalText'),false);
  assert.equal(Object.hasOwn(parsed,'sha256'),false);assert.equal(packed.format,ANCHOR_PACKAGE_FORMAT);
  assert.equal(packed.packageText,JSON.stringify(parsed));assert.equal(packed.byteLength,Buffer.byteLength(packed.packageText));
  assert.equal(packed.sha256,hash(packed.packageText));assert.ok(Object.isFrozen(packed));
  assert.deepEqual(await createAnchorPackage(anchor),packed);
  const imported=await unpack(t,packed);assert.ok(Object.isFrozen(imported));assert.ok(Object.isFrozen(imported.tracker));
  assert.equal(imported.format,packed.format);assert.equal(imported.sha256,packed.sha256);assert.equal(imported.byteLength,packed.byteLength);
  assert.deepEqual(imported.tracker.exportAnchor(),anchor);assert.equal(imported.tracker.status().entryCount,0);
  for(const method of ['sign','accept','applyOwnerRevocation','simulateTransfer'])assert.equal(Object.hasOwn(imported.tracker,method),false);
});

test('anchor package: signed history, Unicode, escaping and fixture counts survive re-export unchanged',async t=>{
  const f=await setup(t);await f.ledger.accept(await f.packet(0,'A \\ path, "quoted" {braces}, and 🐦 evidence.'));
  f.ledger.simulateTransfer('device-other');const anchor=await saved(f.ledger),before=ledgerTuple(f.ledger),packed=await createAnchorPackage(anchor);
  const imported=await unpack(t,packed),status=imported.tracker.status();assert.equal(status.signedActions,1);assert.equal(status.fixtureTransfers,1);assert.equal(status.entryCount,2);
  assert.equal(imported.tracker.exportAnchor().canonicalText,anchor.canonicalText);
  assert.deepEqual(await createAnchorPackage(imported.tracker.exportAnchor()),packed);assert.equal(ledgerTuple(f.ledger),before);
});

test('anchor package: delegated spending and owner cancellation survive import without restoring a live grant',async t=>{
  for(const mode of ['delegated','owner']){
    const f=await setup(t,{mode});await f.ledger.accept(await f.packet());const earlier=await saved(f.ledger);
    await f.ledger.accept(await f.packet(1));if(mode==='owner')await f.ledger.applyOwnerRevocation(await f.cancellation());
    const anchor=await saved(f.ledger),before=ledgerTuple(f.ledger),packed=await createAnchorPackage(anchor),imported=await unpack(t,packed),reader=imported.tracker;
    const parsed=JSON.parse(packed.packageText);assert.deepEqual(parsed.delegation,f.delegation);
    assert.equal(reader.status().delegation.spent,(2n*BigInt(FEE)).toString());assert.equal(reader.status().delegation.remaining,'0');assert.equal(reader.status().signedActions,2);
    if(mode==='owner'){
      assert.deepEqual(parsed.ownerAuthority,f.ownerAuthority);assert.equal(reader.status().ownerRevoked,true);assert.equal(reader.status().entryCount,3);
      assert.equal(JSON.parse(parsed.recordText).format,'caw-owner-granted-lab-record-v2');
    }else assert.equal(Object.hasOwn(reader.status(),'ownerRevoked'),false);
    const retained=trackerTuple(reader);assert.equal((await reader.inspect(earlier.recordText,earlier.checkpoint)).relation,'rollback');
    await assert.rejects(reader.advance(earlier.recordText,earlier.checkpoint),code('CHECKPOINT_ROLLBACK'));
    assert.equal(trackerTuple(reader),retained);assert.equal(ledgerTuple(f.ledger),before);
    assert.deepEqual(await createAnchorPackage(reader.exportAnchor()),packed);
  }
});

test('anchor package: optional supplied final history is checked and excluded from the wire format',async t=>{
  const f=await setup(t),anchor=await saved(f.ledger),packed=await createAnchorPackage(anchor),withoutHistory={...anchor};delete withoutHistory.canonicalText;
  assert.deepEqual(await createAnchorPackage(withoutHistory),packed);
  const differentHistory=canonicalExport(state((6n*BigInt(FEE)).toString()));
  await assert.rejects(createAnchorPackage({...anchor,canonicalText:differentHistory}),code('ANCHOR_HISTORY_MISMATCH'));
  await assert.rejects(createAnchorPackage({...anchor,canonicalText:undefined}),code('PACKAGE_LIMIT'));
});

test('anchor package: export fully verifies signatures, checkpoints and supplied binding before issuing a package',async t=>{
  const f=await setup(t);await f.ledger.accept(await f.packet());const anchor=await saved(f.ledger),record=JSON.parse(anchor.recordText),packet=JSON.parse(record.entries[0].packet);
  packet.action.text='Altered after signing';record.entries[0].packet=JSON.stringify(packet);const changed=await changedRecord(anchor,record);
  await assert.rejects(createAnchorPackage(changed),code('INVALID_SIGNATURE'));
  await assert.rejects(createAnchorPackage({...anchor,checkpoint:{...anchor.checkpoint,sha256:'0'.repeat(64)}}),code('CHECKPOINT_MISMATCH'));
  await assert.rejects(createAnchorPackage({...anchor,binding:{...anchor.binding,publicKey:'01'.repeat(32)}}),code('WRONG_KEY'));
});

test('anchor package: a retained outer digest rejects substituted record, checkpoint or public trust fields',async t=>{
  const f=await setup(t,{mode:'owner'}),anchor=await saved(f.ledger),packed=await createAnchorPackage(anchor),wire=JSON.parse(packed.packageText);
  const patches=[{binding:{...wire.binding,domain:'another-session'}},{ownerAuthority:{...wire.ownerAuthority,account:'beta'}},
    {delegation:{...wire.delegation,budget:FEE}},{checkpoint:{...wire.checkpoint,sha256:'0'.repeat(64)}}];
  for(const patch of patches){const changed=packageWith(packed,patch);await assert.rejects(importAnchorPackage(changed.packageText,packed.sha256),code('PACKAGE_DIGEST_MISMATCH'));}
  const other=f.newLedger(state((6n*BigInt(FEE)).toString())),otherPackage=await createAnchorPackage(await saved(other));
  await assert.rejects(importAnchorPackage(otherPackage.packageText,packed.sha256),code('PACKAGE_DIGEST_MISMATCH'));
});

test('anchor package: fingerprint mismatch rejects before any inner signature verification',async t=>{
  const f=await setup(t);await f.ledger.accept(await f.packet());const packed=await createAnchorPackage(await saved(f.ledger));
  const subtle=crypto.subtle,original=subtle.verify;let calls=0;
  t.mock.method(subtle,'verify',async function(...args){calls++;return Reflect.apply(original,this,args);});
  await assert.rejects(importAnchorPackage(packed.packageText,'0'.repeat(64)),code('PACKAGE_DIGEST_MISMATCH'));assert.equal(calls,0);
});

test('anchor package: matching outer digest cannot rescue a bad signature or incorrect final-history fingerprint',async t=>{
  const f=await setup(t);await f.ledger.accept(await f.packet());const anchor=await saved(f.ledger),packed=await createAnchorPackage(anchor);
  const record=JSON.parse(anchor.recordText),packet=JSON.parse(record.entries[0].packet);packet.action.text='Unverified rewrite';record.entries[0].packet=JSON.stringify(packet);
  const changed=await changedRecord(anchor,record),badSignature=packageWith(packed,{recordText:changed.recordText,checkpoint:changed.checkpoint});
  await assert.rejects(importAnchorPackage(badSignature.packageText,badSignature.sha256),code('INVALID_SIGNATURE'));
  const badFinal=packageWith(packed,{checkpoint:{...anchor.checkpoint,finalHistorySha256:'0'.repeat(64)}});
  await assert.rejects(importAnchorPackage(badFinal.packageText,badFinal.sha256),code('FINAL_HISTORY_MISMATCH'));
  const badCount=packageWith(packed,{checkpoint:{...anchor.checkpoint,entryCount:0}});
  await assert.rejects(importAnchorPackage(badCount.packageText,badCount.sha256),code('CHECKPOINT_MISMATCH'));
});

test('anchor package: matching outer digest cannot conceal an invalid signed cancellation',async t=>{
  const f=await setup(t,{mode:'owner'});await f.ledger.applyOwnerRevocation(await f.cancellation());
  const anchor=await saved(f.ledger),packed=await createAnchorPackage(anchor),record=JSON.parse(anchor.recordText),packet=JSON.parse(record.entries[0].packet);
  packet.signature='00'.repeat(64);record.entries[0].packet=JSON.stringify(packet);const changed=await changedRecord(anchor,record);
  const altered=packageWith(packed,{recordText:changed.recordText,checkpoint:changed.checkpoint});
  await assert.rejects(importAnchorPackage(altered.packageText,altered.sha256),code('INVALID_REVOCATION_SIGNATURE'));
});

test('anchor package: exact serialization rejects whitespace, reordered fields and duplicate or escaped keys',async t=>{
  const f=await setup(t),packed=await createAnchorPackage(await saved(f.ledger)),wire=JSON.parse(packed.packageText);
  const variants=[packed.packageText+'\n',JSON.stringify(wire,null,2),
    JSON.stringify({recordText:wire.recordText,format:wire.format,checkpoint:wire.checkpoint,binding:wire.binding}),
    packed.packageText.replace('"format":','"format":"discarded","format":'),
    packed.packageText.replace('"format":','"for\\u006dat":"discarded","format":'),
    packed.packageText.replace('"entryCount":','"entryCount":99,"entryCount":')];
  for(const text of variants)await assert.rejects(importAnchorPackage(text,hash(text)),code('NON_CANONICAL_PACKAGE'));
  await assert.rejects(importAnchorPackage('\uFEFF'+packed.packageText,hash('\uFEFF'+packed.packageText)),code('INVALID_ANCHOR_PACKAGE'));
  for(const patch of [{format:'caw-retained-anchor-package-v2'},{extra:true},{canonicalText:'excluded'},{sha256:packed.sha256}]){
    const changed=packageWith(packed,patch);await assert.rejects(importAnchorPackage(changed.packageText,changed.sha256),code('INVALID_ANCHOR_PACKAGE'));
  }
  const missing={...wire};delete missing.checkpoint;const text=JSON.stringify(missing);
  await assert.rejects(importAnchorPackage(text,hash(text)),code('INVALID_ANCHOR_PACKAGE'));
});

test('anchor package: malformed JSON, deep structures and UTF-8 byte bounds reject before reconstruction',async t=>{
  const expected='0'.repeat(64),maximum=ANCHOR_PACKAGE_LIMITS.maxBytes;
  for(const text of ['not json','{','[]','null'])await assert.rejects(importAnchorPackage(text,expected),code('INVALID_ANCHOR_PACKAGE'));
  for(const text of ['x'.repeat(maximum+1),'🐦'.repeat(Math.floor(maximum/4)+1),'{"nested":{"nested":{}}}']){
    await assert.rejects(importAnchorPackage(text,expected),code('PACKAGE_LIMIT'));
  }
  for(const text of ['\uD800','\uDC00','x\uD800y'])await assert.rejects(importAnchorPackage(text,expected),code('INVALID_PACKAGE_UNICODE'));
  const f=await setup(t),anchor=await saved(f.ledger),packed=await createAnchorPackage(anchor);
  const escaped=packageWith(packed,{recordText:'\uD800'});await assert.rejects(importAnchorPackage(escaped.packageText,escaped.sha256),code('INVALID_PACKAGE_UNICODE'));
  await assert.rejects(createAnchorPackage({...anchor,recordText:'x'.repeat(LAB_RECORD_LIMITS.maxRevokedBytes+1)}),code('PACKAGE_LIMIT'));
  await assert.rejects(createAnchorPackage({...anchor,canonicalText:'x'.repeat(1024*1024+1)}),code('PACKAGE_LIMIT'));
});

test('anchor package: the independently expected digest is a primitive exact lowercase SHA-256 string',async t=>{
  const f=await setup(t),packed=await createAnchorPackage(await saved(f.ledger));let coercions=0;
  const invalid=['','a'.repeat(63),'a'.repeat(65),'A'.repeat(64),packed.sha256+'\n',null,undefined,1,{},new String(packed.sha256),
    {toString(){coercions++;return packed.sha256;}}];
  for(const expected of invalid)await assert.rejects(importAnchorPackage(packed.packageText,expected),code('INVALID_PACKAGE_DIGEST'));
  assert.equal(coercions,0);
});

test('anchor package: export schema and nested trust accessors are rejected without invoking getters or hooks',async t=>{
  const f=await setup(t,{mode:'owner'}),anchor=await saved(f.ledger);let calls=0;
  const getter=(record,key)=>{const copy={...record};Object.defineProperty(copy,key,{enumerable:true,get(){calls++;return record[key];}});return copy;};
  for(const field of ['recordText','checkpoint','binding','canonicalText','delegation','ownerAuthority']){
    await assert.rejects(createAnchorPackage(getter(anchor,field)),code('INVALID_ANCHOR_PACKAGE'));
  }
  for(const [field,key,expected] of [['checkpoint','sha256','INVALID_CHECKPOINT'],['binding','publicKey','INVALID_BINDING'],
    ['delegation','budget','INVALID_PERMISSION'],['ownerAuthority','publicKey','INVALID_OWNER_GRANT']]){
    await assert.rejects(createAnchorPackage({...anchor,[field]:getter(anchor[field],key)}),code(expected));
  }
  for(const value of [null,[],Object.create(anchor),{...anchor,extra:1},{...anchor,[Symbol('extra')]:1},
    {...anchor,toJSON(){calls++;return anchor;}}])await assert.rejects(createAnchorPackage(value),code('INVALID_ANCHOR_PACKAGE'));
  const hidden={...anchor};Object.defineProperty(hidden,'binding',{enumerable:false});await assert.rejects(createAnchorPackage(hidden),code('INVALID_ANCHOR_PACKAGE'));
  await assert.rejects(importAnchorPackage({toString(){calls++;return '{}';}},'0'.repeat(64)),code('PACKAGE_LIMIT'));
  assert.equal(calls,0);
});

test('anchor package: export captures nested trust and final history before verification or hashing awaits',async t=>{
  const f=await setup(t,{mode:'owner'});await f.ledger.accept(await f.packet());const anchor=await saved(f.ledger),expected=await createAnchorPackage(anchor);
  for(const operation of ['verify','digest']){
    const mutable={...anchor,checkpoint:{...anchor.checkpoint},binding:{...anchor.binding},delegation:{...anchor.delegation},ownerAuthority:{...anchor.ownerAuthority}};
    const held=hold(t,operation),pending=createAnchorPackage(mutable);await held.entered;
    mutable.recordText='changed';mutable.canonicalText='changed';mutable.checkpoint.sha256='0'.repeat(64);mutable.binding.publicKey='01'.repeat(32);
    mutable.delegation.budget=FEE;mutable.ownerAuthority.domain='changed';held.release();
    assert.deepEqual(await pending,expected);held.restore();
  }
});

test('anchor package: export accepts exact null-prototype data and leaves caller snapshots unchanged',async t=>{
  const f=await setup(t,{mode:'owner'}),anchor=await saved(f.ledger),before=JSON.stringify(anchor),expected=await createAnchorPackage(anchor);
  const copy=Object.assign(Object.create(null),anchor);
  for(const key of ['checkpoint','binding','delegation','ownerAuthority'])copy[key]=Object.freeze(Object.assign(Object.create(null),anchor[key]));
  Object.freeze(copy);assert.deepEqual(await createAnchorPackage(copy),expected);assert.equal(JSON.stringify(anchor),before);
});

test('anchor package: failed imports never replace or close an existing tracker',async t=>{
  const f=await setup(t),anchor=await saved(f.ledger),packed=await createAnchorPackage(anchor),existing=(await unpack(t,packed)).tracker,before=trackerTuple(existing);
  await assert.rejects(importAnchorPackage(packed.packageText,'0'.repeat(64)),code('PACKAGE_DIGEST_MISMATCH'));
  await assert.rejects(importAnchorPackage(packed.packageText.slice(0,-1),packed.sha256),code('INVALID_ANCHOR_PACKAGE'));
  assert.equal(trackerTuple(existing),before);assert.equal((await existing.inspect(anchor.recordText,anchor.checkpoint)).relation,'same');
});

test('anchor package: replacing both package and expected digest selects new trust and does not resolve a competing branch',async t=>{
  const f=await setup(t),a=await saved(f.ledger),other=f.newLedger(state((6n*BigInt(FEE)).toString())),b=await saved(other);
  const packageA=await createAnchorPackage(a),packageB=await createAnchorPackage(b),readerA=(await unpack(t,packageA)).tracker,before=trackerTuple(readerA);
  await assert.rejects(importAnchorPackage(packageB.packageText,packageA.sha256),code('PACKAGE_DIGEST_MISMATCH'));
  const readerB=(await unpack(t,packageB)).tracker;assert.deepEqual(readerB.exportAnchor(),b);
  assert.equal((await readerA.inspect(b.recordText,b.checkpoint)).relation,'conflict');assert.equal((await readerB.inspect(a.recordText,a.checkpoint)).relation,'conflict');
  assert.equal(trackerTuple(readerA),before);
});

test('anchor package: a separately retained older package remains valid history and cannot reveal an unseen cancellation',async t=>{
  const f=await setup(t,{mode:'owner'});await f.ledger.accept(await f.packet());const old=await saved(f.ledger),oldPackage=await createAnchorPackage(old);
  await f.ledger.applyOwnerRevocation(await f.cancellation());const current=await saved(f.ledger),currentPackage=await createAnchorPackage(current);
  assert.equal(old.canonicalText,current.canonicalText);assert.notEqual(oldPackage.sha256,currentPackage.sha256);
  const historical=(await unpack(t,oldPackage)).tracker,currentReader=(await unpack(t,currentPackage)).tracker;
  assert.equal(historical.status().ownerRevoked,false);assert.equal(currentReader.status().ownerRevoked,true);
  assert.equal(historical.status().delegation.spent,FEE);assert.equal(currentReader.status().delegation.spent,FEE);
  await assert.rejects(importAnchorPackage(oldPackage.packageText,currentPackage.sha256),code('PACKAGE_DIGEST_MISMATCH'));
  await assert.rejects(currentReader.advance(old.recordText,old.checkpoint),code('CHECKPOINT_ROLLBACK'));
  // File portability and successful replay preserve the chosen baseline; they
  // cannot establish that an older baseline is the newest externally available.
});
