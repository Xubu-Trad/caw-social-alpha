// In-memory comparison against independently retained history; no freshness oracle.
import {copyLabBinding,copyLabCheckpoint,readLabRecord,verifyLabRecord} from './signed-record.mjs';
import {copyDelegation} from './delegation.mjs';
import {copyOwnerAuthority} from './owner-grant.mjs';

function ensure(ok,code,message){if(ok)return;const error=new Error(message);error.code=code;throw error;}
function summary(checked){
  return Object.freeze({entryCount:checked.entryCount,checkpoint:checked.checkpoint,signedActions:checked.signedActions,
    fixtureTransfers:checked.fixtureTransfers,inheritedEvents:checked.inheritedEvents,
    ...(checked.ownerGrantVerified?{ownerRevoked:checked.ownerRevoked}:{}),
    ...(checked.delegation?{delegation:checked.delegation}:{})});
}
function compare(before,next){
  const a=before.record,b=next.record;
  const sameRoot=a.initialHistory===b.initialHistory&&a.ownerGrant===b.ownerGrant&&JSON.stringify(a.delegation)===JSON.stringify(b.delegation);
  const formatCompatible=a.format===b.format||
    (a.format==='caw-owner-granted-lab-record-v1'&&b.format==='caw-owner-granted-lab-record-v2')||
    (b.format==='caw-owner-granted-lab-record-v1'&&a.format==='caw-owner-granted-lab-record-v2');
  let commonPrefixEntries=0,relation='conflict';
  if(sameRoot&&formatCompatible){
    while(commonPrefixEntries<Math.min(a.entries.length,b.entries.length)&&
      JSON.stringify(a.entries[commonPrefixEntries])===JSON.stringify(b.entries[commonPrefixEntries]))commonPrefixEntries+=1;
    if(commonPrefixEntries===Math.min(a.entries.length,b.entries.length)){
      relation=a.entries.length===b.entries.length?'same':a.entries.length<b.entries.length?'extension':'rollback';
    }
  }
  return Object.freeze({relation,commonPrefixEntries,anchorEntries:a.entries.length,candidateEntries:b.entries.length,
    anchor:summary(before.checked),candidate:summary(next.checked)});
}
export async function createCheckpointTracker(recordText,expectedCheckpoint,binding,delegation,ownerAuthority){
  // Capture trust before the factory yields; imported records never nominate it.
  const trusted=copyLabBinding(binding),permission=delegation===undefined?undefined:copyDelegation(delegation),
    owner=ownerAuthority===undefined?undefined:copyOwnerAuthority(ownerAuthority);
  async function verifyInput(text,checkpoint){
    const copiedCheckpoint=copyLabCheckpoint(checkpoint),record=readLabRecord(text);
    const checked=await verifyLabRecord(text,copiedCheckpoint,trusted,permission,owner);
    return Object.freeze({recordText:text,record,checked,checkpoint:copiedCheckpoint});
  }
  let anchor=await verifyInput(recordText,expectedCheckpoint),revision=0,closed=false;
  function active(){ensure(!closed,'TRACKER_CLOSED','This comparison anchor has been cleared.');}
  async function process(text,checkpoint,commit){
    active();const before=anchor,expectedRevision=revision;
    const candidate=await verifyInput(text,checkpoint),result=compare(before,candidate);
    active();ensure(revision===expectedRevision,'ANCHOR_CHANGED','The anchor or comparison inputs changed during verification. Compare again.');
    if(commit){
      ensure(result.relation!=='rollback','CHECKPOINT_ROLLBACK','This record is older than the retained anchor. The anchor is unchanged.');
      ensure(result.relation!=='conflict','CHECKPOINT_CONFLICT','This record conflicts with the retained history. The anchor is unchanged.');
      // The full candidate, including spending/cancellation, becomes one anchor.
      if(result.relation==='extension'){anchor=candidate;revision+=1;}
    }
    return Object.freeze({...result,advanced:commit&&result.relation==='extension'});
  }
  return Object.freeze({
    inspect(text,checkpoint){return process(text,checkpoint,false);},
    advance(text,checkpoint){return process(text,checkpoint,true);},
    status(){return Object.freeze({revision,...summary(anchor.checked)});},
    exportAnchor(){return Object.freeze({recordText:anchor.recordText,checkpoint:anchor.checkpoint,canonicalText:anchor.checked.canonicalText,
      binding:trusted,...(permission?{delegation:permission}:{}),...(owner?{ownerAuthority:owner}:{})});},
    invalidatePending(){active();revision+=1;},
    close(){closed=true;revision+=1;}
  });
}
