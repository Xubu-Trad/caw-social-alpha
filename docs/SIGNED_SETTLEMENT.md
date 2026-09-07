# One signature. One copied-ledger result.

Alpha.5 connects the [local signature format](SIGNATURE_LAB.md) to the existing synthetic accounting model. Identity lets a reader create a signed example, check it, and accept it in a separate copy of the current demo ledger. The copied balance, post, fee allocation, receipt and nonce change together. Commons does not change.

## Reproduce in the interface

1. Open Identity and expand **Test a signed action**.
2. Create an example. Inspect its copied balance, controller, epoch and next action number.
3. Verify it. Signature and accounting checks must leave the copy unchanged.
4. Accept it. The copied account pays 5,000 synthetic CAW under `appendix-demo-v1`; the existing allocation rules produce the receipt. Accept again: the old nonce must fail.
5. Create a fresh copy, change the example text and verify. The retained signature must fail.
6. Create another fresh copy, change its controller and verify. The old key must fail. This controller change is an explicit unsigned fixture control; it does not transfer an NFT.
7. Inspect the copied ledger. Leave Identity and return: the copy and temporary key are discarded. Readers still shows the original Commons history.

Creating a fresh example resets the copy to current Commons state with a fresh key and domain. It is not a continuation or recovery of the previous copy. The packet is read-only and uses fixed synthetic text.

## Acceptance boundary

`public/signed-ledger.mjs` owns a validated, rebuilt copy of the supplied state. The caller supplies a separate exact five-field test binding: domain, account, controller, ownership epoch and public key. It must match the initial copied account. This binding is assumed test authority, not a wallet proof.

For each submitted packet, the adapter captures the ledger revision and next nonce. A fresh verifier checks the native signature without consuming a second counter. Only the signed account, controller, epoch, nonce and exact text become a model CAW intent. Its identifier is deterministically `signed-<account>-<nonce>`; no unsigned caller-selected recipient, cost or identifier is appended.

The unchanged model checks funds, generated post identifiers, exact fee allocation, event limits and export bounds. Before commit, the adapter reads the local clock and checks closure, revision, current authority and expiry again. There is no asynchronous operation between those final checks and assignment of the whole candidate state. Concurrent duplicate submissions cannot both commit on one adapter. Accounting failure leaves nonce, balance, post and receipt unchanged. A concurrent controller change invalidates pending verification.

Checking returns a frozen preview. Acceptance returns a frozen receipt. Status is frozen; the canonical snapshot is a string. Caller edits to initial state, binding or returned values do not edit the owned state. A controller change increments the same revision and model nonce, but is explicitly an unsigned test control. Revocation prevents future or pending acceptance.

A successful check reserves nothing. Acceptance can still fail because of expiry, a ledger change, or the candidate's final export-size limit, which the preview does not evaluate.

## What the copy proves, and what it cannot

The active economics and accounting model are unchanged from alpha.3. Fixed stake weights, payer exclusion, dust handling, costs, pending-action order and the 420-code-point limit retain their existing provisional status. A successful signed example does not resolve any of the [15 source conflicts](../sources/SPEC_CONFLICTS.md), including C-005, C-007 and C-009.

The adapter has no wallet, NFT ownership lookup, delegated spending budget, contract-wallet support, blockchain, shared state, network, disk persistence or finality. Another independently created ledger can accept the same packet if given the same test binding and initial state. Reloading does not establish durable replay protection. A local revision is not a block height or consensus decision.

The copied export is the existing unsigned synthetic history format. It permits deterministic model reconstruction, but does **not** preserve signed packets, historical key bindings or acceptance timestamps. It cannot independently prove signature authorization of past events. The displayed count is only signatures accepted by this live adapter; inherited Commons events and controller-change events are not thereby authenticated. No claim of a signed archival log is made.

Source mapping remains partial: M-007/M-025 concern signing and account use; ownership, delegation, custody and durable reconstruction still require specified production designs and independent review. The UI creates no production authority and the protocol is not fully implemented. See [current validation](VALIDATION.md) for executed tests and browser coverage.
