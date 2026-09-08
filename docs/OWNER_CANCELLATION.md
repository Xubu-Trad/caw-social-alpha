# Permission can end. Keep the evidence.

Alpha.9 adds signed cancellation to the local two-key experiment. The test owner can cancel one exact grant. The copied ledger verifies the owner grant and cancellation, records the cancellation, then refuses future posts. Cancellation spends no CAW and changes no model nonce, post, balance or fee allocation.

This is supplied test-key authority. It does not prove NFT ownership or publish cancellation to a network. Old snapshots cannot reveal a cancellation added later. A valid snapshot with no cancellation is not proof that the grant remains active.

## Try it

1. In Identity, expand **Test a signed action** and **Try a limited test key**.
2. Choose **Create owner-signed permission**. One temporary key approves the grant; the other signs posts.
3. Accept a post, then choose **Sign owner cancellation**. Check that the copied balance, spending and action number are unchanged by cancellation.
4. Try accepting another example. The copy is closed. Inspect the signed cancellation beside the grant.
5. Prepare a new recovery record and retain all five populated fields. After reload, paste them and verify: cancellation must be reported explicitly.

The owner signing handle stays in this Identity view so it can sign cancellation. It is non-extractable, never saved, and closed after successful cancellation, local key closure, a new example or leaving the view. Closing the handle alone does not revoke an issued signature. **Revoke test key** remains an unsigned local closure control; it cannot produce portable owner-cancellation evidence.

## Exact signed bytes

The UTF-8 signing prefix is `CAW_LOCAL_OWNER_REVOCATION_V1\n`. It precedes canonical JSON in this field order:

```text
version, network, deployment, scenario, ownerDomain, account,
controller, epoch, ownerKey, grantDomain
```

Version is 1. The fixed context is `simulation`, `unconnected-lab`, `appendix-demo-v1`. The complete `ownergrant-<SHA-256>` domain commits the grant's two keys, owner session, account epoch, permission and economics. Exact owner authority and grant domain come from independently supplied trust and a verified grant. The packet is canonical `{revocation,signature}` JSON with a lowercase 64-byte Ed25519 signature. No cancellation timestamp or backdated effectiveness is claimed. Plain exact data fields, bounded identifiers and an 8 KiB packet limit apply; getters and extra fields are rejected.

`owner-grant.mjs` exposes `makeOwnerRevocation`, `readOwnerRevocation` and `verifyOwnerRevocation`. The existing owner signer adds `signRevocation`. Separate prefixes prevent using a grant signature as a cancellation signature.

## Acceptance and races

`ledger.applyOwnerRevocation(packet)` captures the current revision, verifies the grant and exact cancellation, then checks closure and revision again. It builds the candidate record before assigning the record, cancellation status, closure and incremented local revision together. There is no asynchronous operation in that final commit.

If cancellation commits while a post is being checked, the post's final guard rejects. If a post or fixture transfer commits first, cancellation returns `STATE_CHANGED`; the exact signed cancellation can be retried against the newer record. Failure does not consume the owner key. Two concurrent cancellations cannot both append. Expiry or a completed fixture transfer does not prevent cancelling the old grant: cancellation authorizes no action by the new controller and changes no account state.

## Recovery format and capacity

On cancellation, the existing owner record upgrades to `caw-owner-granted-lab-record-v2`. Field order remains `format, initialHistory, delegation, ownerGrant, entries`. Version 2 requires exactly one final `{kind:"signed-owner-revocation",packet}` entry. Every subsequent post, transfer or second cancellation is rejected. Owner v1, ordinary and unsigned delegated formats reject cancellation entries.

The ordinary bound remains 64 model-changing entries and 2 MiB. Version 2 reserves a 65th entry and 16 KiB for the terminal cancellation. Cancellation changes record bytes, fingerprint and entry count; canonical model history and its fingerprint stay unchanged. Recovery verifies the owner signature, reports cancellation separately from CAWs and transfers, and never restores live authority.

The newest retained fingerprint can detect a removed cancellation relative to that snapshot. An older genuine snapshot still verifies as its older history. A user who newly trusts an altered record and new fingerprint may conceal history; this lab has no trusted freshness registry, shared revocation service, durable replay/spending continuity or chain finality. Signed cancellation is evidence in the supplied record, not proof that all readers have seen the latest state.

All 59 source requirements and 15 conflicts retain their status. This safeguard does not settle production delegation, wallet/contract-wallet support, NFT authority or permanent protocol operation. See [validation](VALIDATION.md) for executed checks and limitations.
