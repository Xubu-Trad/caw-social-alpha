// Signed synthetic settlement on an owned copy. No wallet, chain or persistence.
import { applyAction, previewAction, canonicalExport, rebuild } from './model.mjs';
import { createActionVerifier } from './signatures.mjs';
import {copyLabBinding,createLabRecord,appendLabRecord} from './signed-record.mjs';
import {copyDelegation,checkDelegation,bindDelegation} from './delegation.mjs';

function ensure(condition, code, message) {
  if (condition) return;
  const error = new Error(message); error.code = code; throw error;
}
function freeze(value) {
  if(value && typeof value==='object') { for(const child of Object.values(value))freeze(child);Object.freeze(value); }
  return value;
}

export function createSignedLedger(initialState, binding, clock=()=>Math.floor(Date.now()/1000), delegation) {
  // Validate and rebuild before owning a private copy; no caller can edit it.
  const initialHistory=canonicalExport(initialState),envelope=JSON.parse(initialHistory);
  let state=rebuild(envelope.seed,envelope),revision=0,closed=false,acceptedSignatures=0;
  const permission=delegation===undefined?undefined:copyDelegation(delegation);
  ensure(!permission||state.events.length===0,'PERMISSION_HISTORY','A permission starts only on a fresh fixture; importing history cannot reset its budget.');
  let spent='0',recordText=createLabRecord(initialHistory,permission);
  const trusted=copyLabBinding(binding);
  ensure(permission||!trusted.domain.startsWith('grant-'),'PERMISSION_REQUIRED','A grant-domain key cannot become unrestricted by omitting its permission.');
  // Reuse the exact signature format's identity/key/nonce/clock validation.
  const validation=createActionVerifier({...trusted,nextNonce:0},clock);validation.revoke();
  ensure(Object.hasOwn(state.accounts,trusted.account),'UNKNOWN_ACCOUNT','The bound account is absent from this copied ledger.');
  const initial=state.accounts[trusted.account];
  ensure(initial.controller===trusted.controller && initial.epoch===trusted.epoch,'WRONG_AUTHORITY','The binding does not match the copied account.');
  function active(){ensure(!closed,'REVOKED','This copied ledger has been closed.');}
  function authority(account){
    ensure(account.controller===trusted.controller && account.epoch===trusted.epoch,
      'WRONG_AUTHORITY','The test key belongs to a previous controller or ownership epoch.');
  }
  function finalCheck(expectedRevision,action){
    // Read a supplied clock before checking state: even a reentrant clock cannot
    // transfer/close the ledger after the final revision/closed guards.
    const now=clock();
    ensure(Number.isSafeInteger(now) && !Object.is(now,-0) && now>=0 && now<=253402300799,'INVALID_CLOCK','Use a bounded integer clock.');
    active();
    ensure(revision===expectedRevision,'STATE_CHANGED','The copied ledger changed during verification. Review the current state and try again.');
    authority(state.accounts[trusted.account]);
    ensure(now>=action.notBefore && now<action.expiresAt,'OUTSIDE_WINDOW','This signed action is not yet valid or has expired.');
    return now;
  }
  async function process(text,commit){
    active();authority(state.accounts[trusted.account]);
    const before=state,expectedRevision=revision;
    if(permission)ensure((await bindDelegation(trusted,permission)).domain===trusted.domain,'PERMISSION_BINDING','The signed domain must commit to this exact permission and test key.');
    const verifier=createActionVerifier({...trusted,nextNonce:before.accounts[trusted.account].nonce},clock);
    let action;
    try{action=await verifier.check(text);}finally{verifier.revoke();}
    const intent={id:'signed-'+action.account+'-'+action.nonce,kind:'caw',actor:action.account,
      controller:action.controller,epoch:action.epoch,nonce:action.nonce,text:action.text};
    // Everything that can reject the accounting result happens before commit.
    const candidate=commit?applyAction(before,intent):null;
    const result=freeze(commit?JSON.parse(JSON.stringify(candidate.receipts.at(-1))):previewAction(before,intent));
    const acceptedAt=finalCheck(expectedRevision,action);
    const nextSpent=permission?checkDelegation(permission,spent,action,acceptedAt):spent;
    const nextRecord=commit?appendLabRecord(recordText,{kind:'signed-caw',packet:text,acceptedAt}):null;
    // One synchronous commit owns post, fee allocation, receipt and next nonce.
    // There is no second signature counter to consume on an accounting failure.
    if(commit){state=candidate;recordText=nextRecord;spent=nextSpent;revision+=1;acceptedSignatures+=1;}
    return result;
  }
  return Object.freeze({
    check(text){return process(text,false);},
    accept(text){return process(text,true);},
    snapshot(){return canonicalExport(state);},
    exportRecord(){return Object.freeze({recordText,canonicalText:canonicalExport(state),binding:trusted,...(permission?{delegation:permission}:{})});},
    status(){const account=state.accounts[trusted.account];return Object.freeze({closed,revision,acceptedSignatures,
      account:account.name,controller:account.controller,epoch:account.epoch,nextNonce:account.nonce,
      balance:account.balance,events:state.events.length,...(permission?{delegation:Object.freeze({permission,spent,remaining:(BigInt(permission.budget)-BigInt(spent)).toString()})}:{})});},
    // Explicit fixture control, never a signed transfer or NFT ownership proof.
    simulateTransfer(newController){
      active();const account=state.accounts[trusted.account];
      const candidate=applyAction(state,{id:'transfer-'+account.name+'-'+account.nonce,kind:'transfer',actor:account.name,
        controller:account.controller,epoch:account.epoch,nonce:account.nonce,newController});
      const receipt=freeze(JSON.parse(JSON.stringify(candidate.receipts.at(-1))));
      const nextRecord=appendLabRecord(recordText,{kind:'unsigned-fixture-transfer',newController});
      state=candidate;recordText=nextRecord;revision+=1;return receipt;
    },
    revoke(){closed=true;}
  });
}
