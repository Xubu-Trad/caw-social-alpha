# One signature. One copied-ledger result.

Alpha.8's [owner-granted path](OWNER_SIGNED_GRANTS.md) checks two signatures: a test owner approves the grant and a separate key signs the post. Both checks precede the existing atomic commit. The ordinary single-action and unsigned limited-permission paths below remain supported.

## Alpha.7 limited permission

An optional [limited test-key permission](DELEGATED_PERMISSIONS.md) now joins the same synchronous model/record commit. Its gross spending advances only on successful acceptance. It starts on a fresh fixture, binds terms into the signed domain, and remains an unsigned local grant control. Ordinary copied-ledger behavior below is preserved.

Alpha.5 connected the [local signature format](SIGNATURE_LAB.md) to the existing synthetic accounting model. Alpha.6 also preserves a [separate recovery record](SIGNED_RECORD_RECOVERY.md). Identity lets a reader create a signed example, check it, and accept it in a separate copy of the current demo ledger. The copied balance, post, fee allocation, receipt, nonce and recovery record change together. Commons does not change.

## Reproduce in the interface

1. Open Identity and expand **Test a signed action**.
2. Create an example. Inspect its copied balance, controller, epoch and next action number.
3. Verify it. Signature and accounting checks must leave the copy unchanged.
4. Accept it. The copied account pays 5,000 synthetic CAW under `appendix-demo-v1`; the existing allocation rules produce the receipt. Accept again: the old nonce must fail.
5. Create a fresh copy, change the example text and verify. The retained signature must fail.
6. Create another fresh copy, change its controller and verify. The old key must fail. This controller change is an explicit unsigned fixture control; it does not transfer an NFT.
7. Inspect the copied ledger. Leave Identity and return: the copy and temporary key are discarded. Readers still shows the original Commons history.

The ordinary **Create signed example** button resets the copy to current Commons state with a fresh key and domain. Both limited-permission modes instead start from the original fixture. None continues or recovers the previous copy. The packet is read-only and uses fixed synthetic text.

## Acceptance boundary

`public/signed-ledger.mjs` owns a validated, rebuilt copy of the supplied state. The caller supplies a separate exact five-field test binding: domain, account, controller, ownership epoch and public key. It must match the initial copied account. This binding is assumed test authority, not a wallet proof.

For each submitted packet, the adapter captures the ledger revision and next nonce. A fresh verifier checks the native signature without consuming a second counter. Only the signed account, controller, epoch, nonce and exact text become a model CAW intent. Its identifier is deterministically `signed-<account>-<nonce>`; no unsigned caller-selected recipient, cost or identifier is appended.

The unchanged model checks funds, generated post identifiers, exact fee allocation, event limits and export bounds. Before commit, the adapter reads the local clock and checks closure, revision, current authority and expiry again. There is no asynchronous operation between those final checks and assignment of the whole candidate state. Concurrent duplicate submissions cannot both commit on one adapter. Accounting failure leaves nonce, balance, post and receipt unchanged. A concurrent controller change invalidates pending verification.

Checking returns a frozen preview. Acceptance returns a frozen receipt. Status is frozen; the canonical snapshot is a string. Caller edits to initial state, binding or returned values do not edit the owned state. A controller change increments the same revision and model nonce, but is explicitly an unsigned test control. Revocation prevents future or pending acceptance.

A successful check reserves nothing. Acceptance can still fail because of expiry, a ledger change, or the candidate's final export or recovery-record limits, which the preview does not evaluate.

## What the copy proves, and what it cannot

The active economics and accounting model are unchanged from alpha.3. Fixed stake weights, payer exclusion, dust handling, costs, pending-action order and the 420-code-point limit retain their existing provisional status. A successful signed example does not resolve any of the [15 source conflicts](../sources/SPEC_CONFLICTS.md), including C-005, C-007 and C-009.

The adapter has no wallet, NFT ownership lookup, contract-wallet support, blockchain, shared state, network, disk persistence or finality. Its delegated budgets apply only within each local copy. Another independently created ledger can accept the same packet if given the same test binding, applicable grant evidence and initial state. Reloading does not establish durable replay protection. A local revision is not a block height or consensus decision.

The ordinary copied export remains unsigned synthetic model history. The new, separately versioned [recovery record](SIGNED_RECORD_RECOVERY.md) preserves exact signed packets and recorded local times alongside explicit unsigned fixture changes. It is checked against a separately retained fingerprint and externally supplied test binding. It does not prove historical time or real ownership. The live signature count excludes inherited Commons events and unsigned controller changes; those events are not authenticated by replay.

Source mapping remains partial: M-007/M-025 concern signing and account use; ownership, delegation, custody and durable reconstruction still require specified production designs and independent review. The UI creates no production authority and the protocol is not fully implemented. See [current validation](VALIDATION.md) for executed tests and browser coverage.
