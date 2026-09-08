# Limited test keys

Alpha.9 adds [signed owner cancellation](OWNER_CANCELLATION.md). The owner key remains temporarily available in Identity to cancel its exact grant. Cancellation closes the copy and is verified in owner record v2; it changes no balance or model nonce. Older snapshots cannot prove that no newer cancellation exists.

Alpha.8 also provides a separate [test-owner-signed grant path](OWNER_SIGNED_GRANTS.md), with both-key verification and its own record/domain format. The unsigned local permission experiment described below remains supported; it must not be treated as owner approval.

Status: alpha.7 local experiment. A permission limits a temporary test key to public CAWs, a total gross-fee budget and a validity interval. It is created by an **unsigned local fixture control**, not by an authenticated NFT owner. No real funds, wallet, chain or external authority provider is involved.

## Source and proposal

The pinned [manifesto](../sources/primary/manifesto-pinned.md) ties account access and its contract wallet to NFT ownership (L40–47), calls for mostly gasless signing (L60–63), and asks for smoother signing (L83–84). It does not define delegated keys, their budgets, expiration or revocation rules. Those are proposed safeguards under [C-009](../sources/SPEC_CONFLICTS.md#c-009). Ownership, custody and transfer questions remain open. The [recovered R2](../sources/primary/r2-message.txt) requires open contribution and peer review before an agreed release; this experiment does not satisfy that production release gate.

## Try it

Open Identity → Test a signed action → Try a limited test key. **Create limited permission** starts a fresh fixture copy with the selected synthetic account. It does not copy pending or settled Commons history. The displayed permission allows two 5,000-CAW public posts, for a total of 10,000 synthetic CAW, and expires after five minutes.

Accept the first example, sign the next example and accept it. Sign a third and try accepting: it must fail with no change to the budget, post, balance, receipt or action number. Verification previews never consume budget. **Revoke test key** closes acceptance in this copy. **Change copied controller** is an unsigned fixture control outside the key's permissions; it invalidates the old key by changing the account epoch. No NFT moves.

Each new copy has independent counters. Restarting a copy is not durable replay protection. There is no grant reinstall or live-state import API. The module rejects a delegated ledger starting with existing events, so an imported model history cannot silently reset its allowance. This is a local boundary, not a distributed solution.

## Bound signed domain

The immutable permission contains exactly `scope`, `budget`, `notBefore` and `expiresAt`, in that canonical order. Scope is the string `caw`; budget is a positive canonical decimal base-unit string, at most 64 fixed CAW fees. Times are bounded integer seconds with a positive interval of at most 300 seconds. Grant terms cannot be edited in place.

`bindDelegation(binding, permission)` uses native SHA-256 to commit to this exact ordered JSON object:

```text
{account, controller, epoch, publicKey, network, deployment, scenario,
 fee, scope, budget, notBefore, expiresAt}
```

The prefix is `CAW_LOCAL_DELEGATION_V1` followed by a newline. Network is `simulation`, deployment `unconnected-lab`, scenario `appendix-demo-v1`, and fee the fixed 5,000 synthetic CAW in base units. The signed action domain is `grant-` followed by the lowercase 64-character digest. An ordinary caller-supplied domain is replaced; it is not an additional grant identifier. Fresh UI grants generate distinct temporary keys. These bytes are a proposed local format, not an Ethereum signature standard.

The existing Ed25519 action signature covers that domain and the exact action. Changing budget, window, key, account or epoch changes the domain. Live acceptance and recovery recompute the commitment. The reserved `grant-` domain cannot be accepted as ordinary unrestricted authority by dropping the permission. A primitive signature check alone still does not establish authorization.

## One acceptance boundary

The signed ledger owns the permission, spending total, model and record. It checks the native signature and current model nonce, prepares all accounting, and then checks closure, revision, controller/epoch and local time. The action's entire signed window must fit the permission. The gross fee is charged against the budget; pool credits cannot refill it. The next record is validated before one synchronous assignment updates model, record, spending and revision. Failures consume none of them.

There is no external owner provider, wallet approval, deposit, withdrawal, arbitrary transaction or permission-management action available to a delegated packet. Key revocation is local closure of the copied ledger. Transfer away and back cannot revive the original epoch. Concurrent acceptance is serialized at the final revision check, not through a second consumed action counter.

## Recovery has a separate format

Ordinary `caw-signed-lab-record-v1` remains supported. A permission-controlled copy uses **`caw-delegated-lab-record-v1`** with exact ordered fields:

```text
{format, initialHistory, delegation, entries}
```

Initial history must contain zero events. Each signed CAW retains its original packet and local acceptance time; unsigned fixture transfers remain explicit. The permission is covered by the separately retained record fingerprint. The checkpoint shape stays `caw-signed-lab-checkpoint-v1`, because it fingerprints exact record bytes and exact final canonical history independently of the record format.

Recovery requires a fourth, separately retained permission argument as well as the record, fingerprint and test-key binding. It compares the exact permission, recomputes its signed domain, checks every action's grant window and accumulates every gross fee before comparing the final history. Old verifiers reject the new record format. New verification never silently converts a delegated record into an ordinary record.

The UI has a **Saved permission** field; leave it empty for an ordinary signed record. Keep the fingerprint, binding and permission separately from the record before relying on a later comparison. Editing any input clears prior results and invalidates pending feedback. A successful result is an inspection of saved history, not permission activation or a restoration of the live ledger.

## What remains unproven

Neither the supplied key nor the unsigned permission proves NFT ownership or owner consent. Recorded acceptance times do not establish historical clock accuracy. Revocation after a saved action is not recorded or attested; an old record may verify after its live key is closed. Replacing all independent trust inputs can produce a different internally consistent history. Fresh copies do not share spending or replay protection.

Production work still needs authoritative ownership, owner-signed grants, wallet/contract-wallet validation, persistent grant identities and spent/revoked state, finality and reorganization rules, custody invariants and independent review. No source conflict was resolved by adding this demonstration. No claim of full manifesto compliance or permanent operation follows from it.
