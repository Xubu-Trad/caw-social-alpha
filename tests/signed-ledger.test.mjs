import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,canonicalExport,rebuild} from '../public/model.mjs';
import {createDemoSigner} from '../public/signatures.mjs';
import {createSignedLedger} from '../public/signed-ledger.mjs';

const NOW=1700000000,FEE='5000000000000000000000',BALANCE='10000000000000000000000';
const code=expected=>error=>error?.code===expected;
function seed(balance=BALANCE,posts=[]){return {version:1,scenario:'appendix-demo-v1',accounts:[
  {name:'alpha',controller:'device-alpha',balance,stake:'3'},
  {name:'beta',controller:'device-beta',balance:'0',stake:'1'},
  {name:'gamma',controller:'device-gamma',balance:'0',stake:'2'}],posts};}
function action(patch={}){return {account:'alpha',controller:'device-alpha',deployment:'unconnected-lab',domain:'copied-ledger-test',
  epoch:0,expiresAt:NOW+120,fee:FEE,kind:'caw',network:'simulation',nonce:0,notBefore:NOW,
  scenario:'appendix-demo-v1',text:'Exact words: e\u0301 🐦.',version:1,...patch};}
function binding(signer,patch={}){return {domain:'copied-ledger-test',account:'alpha',controller:'device-alpha',epoch:0,publicKey:signer.publicKey,...patch};}
async function setup(t,{balance=BALANCE,posts=[],clock=()=>NOW}={}){
  const signer=await createDemoSigner();t.after(()=>signer.revoke());
  const initial=createState(seed(balance,posts)),trusted=binding(signer),ledger=createSignedLedger(initial,trusted,clock);
  t.after(()=>ledger.revoke());return {signer,initial,trusted,ledger,packet:await signer.sign(action())};
}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function holdVerify(t){
  const entered=deferred(),release=deferred(),subtle=globalThis.crypto.subtle,original=subtle.verify;
  const mock=t.mock.method(subtle,'verify',async function(...args){entered.resolve();await release.promise;return Reflect.apply(original,this,args);});
  t.after(()=>{release.resolve();mock.mock.restore();});return {entered:entered.promise,release:release.resolve};
}

test('signed ledger: checking is read-only; acceptance atomically posts, allocates and advances one nonce',async t=>{
  const {ledger,packet,initial}=await setup(t),before=canonicalExport(initial);
  const preview=await ledger.check(packet);
  assert.equal(preview.fee,FEE);assert.equal(preview.nextNonce,1);assert.ok(Object.isFrozen(preview.allocations[0]));
  assert.equal(ledger.snapshot(),before);assert.equal(ledger.status().revision,0);
  const receipt=await ledger.accept(packet),history=JSON.parse(ledger.snapshot());
  assert.equal(receipt.id,'signed-alpha-0');assert.equal(receipt.text,action().text);assert.equal(receipt.eventIndex,1);
  assert.deepEqual(receipt.allocations,[
    {account:'beta',amount:'1666666666666666666666',reason:'stake-pool'},
    {account:'gamma',amount:'3333333333333333333333',reason:'stake-pool'}]);
  assert.equal(receipt.poolDustAdded,'1');assert.equal(history.snapshot.accounts.alpha.balance,FEE);
  assert.equal(history.snapshot.poolDust,'1');assert.equal(history.snapshot.posts.at(-1).text,action().text);
  assert.equal(history.expectedEventCount,1);assert.equal(history.events[0].intent.nonce,0);
  assert.deepEqual(ledger.status(),{closed:false,revision:1,acceptedSignatures:1,account:'alpha',controller:'device-alpha',epoch:0,nextNonce:1,balance:FEE,events:1});
  const total=Object.values(history.snapshot.accounts).reduce((sum,a)=>sum+BigInt(a.balance),BigInt(history.snapshot.poolDust));
  assert.equal(total,BigInt(BALANCE));assert.equal(canonicalExport(initial),before);
  assert.equal(canonicalExport(rebuild(history.seed,history)),ledger.snapshot());
  assert.equal(Object.hasOwn(history.events[0],'signature'),false,'Model export is not a signed archival record');
});

test('signed ledger: replay fails unchanged; a newly signed next nonce succeeds',async t=>{
  const {ledger,signer,packet}=await setup(t);await ledger.accept(packet);const before=ledger.snapshot();
  await assert.rejects(ledger.accept(packet),code('STALE_NONCE'));assert.equal(ledger.snapshot(),before);
  await ledger.accept(await signer.sign(action({nonce:1,text:'Second exact action.'})));
  assert.equal(ledger.status().nextNonce,2);assert.equal(ledger.status().acceptedSignatures,2);assert.equal(ledger.status().balance,'0');
});

test('signed ledger: concurrent duplicate submissions commit exactly once',async t=>{
  const {ledger,packet}=await setup(t),held=holdVerify(t);
  const both=Promise.allSettled([ledger.accept(packet),ledger.accept(packet)]);
  await held.entered;held.release();const results=await both;
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.find(x=>x.status==='rejected').reason.code,'STATE_CHANGED');
  assert.equal(ledger.status().events,1);assert.equal(ledger.status().balance,FEE);assert.equal(ledger.status().nextNonce,1);
});

test('signed ledger: insufficient funds consume no nonce or revision',async t=>{
  const {ledger,packet,signer}=await setup(t,{balance:'0'}),before=ledger.snapshot();
  for(const method of ['check','accept'])await assert.rejects(ledger[method](packet),code('INSUFFICIENT_BALANCE'));
  assert.equal(ledger.snapshot(),before);assert.equal(ledger.status().nextNonce,0);assert.equal(ledger.status().revision,0);
  const funded=createSignedLedger(createState(seed()),binding(signer),()=>NOW);t.after(()=>funded.revoke());
  await funded.accept(packet);assert.equal(funded.status().nextNonce,1,'New funded fixture; not an in-place top-up');
  const transfer=ledger.simulateTransfer('device-new');assert.equal(transfer.fee,'0');assert.equal(ledger.status().nextNonce,1);
});

test('signed ledger: generated post collision rejects without unsigned identifier substitution',async t=>{
  const posts=[{id:'post-signed-alpha-0',author:'beta',text:'Existing fixture post.',time:'Fixture'}];
  const {ledger,packet}=await setup(t,{posts}),before=ledger.snapshot();
  await assert.rejects(ledger.check(packet),code('DUPLICATE_POST'));await assert.rejects(ledger.accept(packet),code('DUPLICATE_POST'));
  assert.equal(ledger.snapshot(),before);assert.equal(ledger.status().nextNonce,0);assert.equal(ledger.status().revision,0);
});

test('signed ledger: text alteration and separately untrusted key are rejected atomically',async t=>{
  const {ledger,packet}=await setup(t),before=ledger.snapshot(),altered=JSON.parse(packet);
  altered.action.text='Altered after signing.';
  await assert.rejects(ledger.accept(JSON.stringify(altered)),code('INVALID_SIGNATURE'));
  const stranger=await createDemoSigner();t.after(()=>stranger.revoke());
  await assert.rejects(ledger.accept(await stranger.sign(action())),code('WRONG_KEY'));
  assert.equal(ledger.snapshot(),before);assert.equal(ledger.status().acceptedSignatures,0);
});

test('signed ledger: valid signatures cannot select a different domain, account, authority or nonce',async t=>{
  const {ledger,signer}=await setup(t),before=ledger.snapshot();
  for(const [patch,expected] of [[{domain:'other-copy'},'WRONG_DOMAIN'],[{account:'beta'},'WRONG_AUTHORITY'],
    [{controller:'device-other'},'WRONG_AUTHORITY'],[{epoch:1},'WRONG_AUTHORITY'],[{nonce:1},'STALE_NONCE']]){
    await assert.rejects(ledger.accept(await signer.sign(action(patch))),code(expected));assert.equal(ledger.snapshot(),before);
  }
});

test('signed ledger: fixture transfer advances epoch and nonce and invalidates the old binding',async t=>{
  const {ledger,packet}=await setup(t);const receipt=ledger.simulateTransfer('device-new'),before=ledger.snapshot();
  assert.equal(receipt.newController,'device-new');assert.equal(receipt.nextEpoch,1);assert.equal(receipt.nextNonce,1);
  assert.equal(ledger.status().balance,BALANCE);assert.equal(ledger.status().acceptedSignatures,0);
  for(const method of ['check','accept'])await assert.rejects(ledger[method](packet),code('WRONG_AUTHORITY'));
  assert.equal(ledger.snapshot(),before);
});

test('signed ledger: a transfer during native verification cannot be overwritten by the pending CAW',async t=>{
  const {ledger,packet}=await setup(t),held=holdVerify(t);
  const pending=ledger.accept(packet),rejected=assert.rejects(pending,code('STATE_CHANGED'));
  await held.entered;ledger.simulateTransfer('device-new');const transferred=ledger.snapshot();held.release();await rejected;
  assert.equal(ledger.snapshot(),transferred);assert.equal(ledger.status().events,1);assert.equal(ledger.status().acceptedSignatures,0);
});

test('signed ledger: revocation during verification prevents commit and closes all mutation methods',async t=>{
  const {ledger,packet}=await setup(t),before=ledger.snapshot(),held=holdVerify(t);
  const pending=ledger.accept(packet),rejected=assert.rejects(pending,code('REVOKED'));
  await held.entered;ledger.revoke();ledger.revoke();held.release();await rejected;
  assert.equal(ledger.snapshot(),before);assert.equal(ledger.status().closed,true);
  await assert.rejects(ledger.check(packet),code('REVOKED'));await assert.rejects(ledger.accept(packet),code('REVOKED'));
  assert.throws(()=>ledger.simulateTransfer('device-new'),code('REVOKED'));
});

test('signed ledger: expiry during verification prevents all accounting effects',async t=>{
  let now=NOW;const {ledger,packet}=await setup(t,{clock:()=>now}),before=ledger.snapshot(),held=holdVerify(t);
  const pending=ledger.accept(packet),rejected=assert.rejects(pending,code('OUTSIDE_WINDOW'));
  await held.entered;now=NOW+120;held.release();await rejected;
  assert.equal(ledger.snapshot(),before);assert.equal(ledger.status().revision,0);
});

test('signed ledger: a final clock callback cannot close or transfer the copy and then allow a stale commit',async t=>{
  for(const mutation of ['close','transfer']){
    let calls=0,ledger;const clock=()=>{calls+=1;if(calls===3){if(mutation==='close')ledger.revoke();else ledger.simulateTransfer('device-new');}return NOW;};
    const fixture=await setup(t,{clock});ledger=fixture.ledger;
    await assert.rejects(ledger.accept(fixture.packet),code(mutation==='close'?'REVOKED':'STATE_CHANGED'));
    assert.equal(ledger.status().acceptedSignatures,0);assert.equal(ledger.status().balance,BALANCE);
    assert.equal(ledger.status().events,mutation==='close'?0:1);
  }
});

test('signed ledger: caller state, binding, parsed snapshots and returned records cannot mutate owned state',async t=>{
  const {ledger,initial,trusted,packet}=await setup(t),before=ledger.snapshot();
  initial.accounts.alpha.balance='0';initial.seed.accounts[0].balance='0';trusted.domain='changed';
  const parsed=JSON.parse(ledger.snapshot());parsed.snapshot.accounts.alpha.balance='0';
  assert.equal(ledger.snapshot(),before);assert.ok(Object.isFrozen(ledger.status()));
  const receipt=await ledger.accept(packet);assert.ok(Object.isFrozen(receipt));assert.ok(Object.isFrozen(receipt.allocations[0]));
  assert.throws(()=>{receipt.allocations[0].amount='0';},TypeError);assert.equal(ledger.status().balance,FEE);
});

test('signed ledger: malformed bindings and inconsistent initial states fail without invoking getters',async t=>{
  const {signer,initial}=await setup(t);let called=0;
  const accessor=binding(signer);Object.defineProperty(accessor,'publicKey',{enumerable:true,get(){called++;return signer.publicKey;}});
  const malformed=[accessor,null,[],{...binding(signer),nonce:0},Object.assign(Object.create({extra:1}),binding(signer))];
  for(const value of malformed)assert.throws(()=>createSignedLedger(initial,value,()=>NOW),code('INVALID_BINDING'));
  assert.equal(called,0);
  assert.throws(()=>createSignedLedger(initial,binding(signer,{account:'absent'}),()=>NOW),code('UNKNOWN_ACCOUNT'));
  assert.throws(()=>createSignedLedger(initial,binding(signer,{controller:'device-other'}),()=>NOW),code('WRONG_AUTHORITY'));
  const invalid=JSON.parse(JSON.stringify(initial));invalid.accounts.alpha.balance='0';
  assert.throws(()=>createSignedLedger(invalid,binding(signer),()=>NOW),code('STATE_MISMATCH'));
});

test('signed ledger: invalid unsigned transfer leaves the copy unchanged',async t=>{
  const {ledger}=await setup(t),before=ledger.snapshot();
  for(const controller of ['device-alpha','device-new\n','',null])assert.throws(()=>ledger.simulateTransfer(controller));
  assert.equal(ledger.snapshot(),before);assert.equal(ledger.status().revision,0);
});

test('signed ledger: separate ledgers do not share replay protection',async t=>{
  const {ledger,initial,signer,packet}=await setup(t),other=createSignedLedger(initial,binding(signer),()=>NOW);t.after(()=>other.revoke());
  await ledger.accept(packet);await other.accept(packet);assert.equal(ledger.snapshot(),other.snapshot());
  assert.equal(ledger.status().acceptedSignatures,1);assert.equal(other.status().acceptedSignatures,1);
});
