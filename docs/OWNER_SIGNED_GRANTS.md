# Two keys. One limited grant.

Alpha.9 adds [signed owner cancellation](OWNER_CANCELLATION.md). The owner key remains temporarily available in Identity to cancel its exact grant. Cancellation closes the copy and is verified in owner record v2; it changes no balance or model nonce. Older snapshots cannot prove that no newer cancellation exists.

Alpha.8 lets a temporary **test-owner key** sign a permission for a separate **spending key**. Acceptance checks the grant signature against independently supplied test-owner authority, checks the spending signature, then applies the existing budget and ledger rules together. Neither test key establishes real NFT ownership.

## Try it in Identity

Open **Test a signed action → Try a limited test key → Create owner-signed permission**. The app creates two distinct non-extractable Ed25519 keys and a fresh fixture copy. The test-owner key signs a grant for two public CAWs, a gross budget of 10,000 synthetic CAW, and a five-minute window. In alpha.9 it stays temporarily available in this view to sign cancellation; cancellation, local closure, reset or leaving closes the handle. Closing it alone does not revoke an already signed grant.

Accept the first example, sign and accept the second, then sign a third to check budget rejection. **Revoke test key** closes future acceptance in this copied ledger. **Change copied controller** is an explicitly unsigned fixture control that changes the epoch and invalidates the old grant. The grant does not allow withdrawals or transfers.

**Inspect test-owner grant** shows the exact signed grant. Recovery copies the record and all populated trust fields, including **Saved test-owner authority**. Keep the fingerprint and trust values separately before relying on a later comparison. Verification after refresh inspects history; it neither activates the grant nor restores a live ledger. Existing ordinary and unsigned limited-permission examples remain available for comparison.

## Exact grant and signed domain

The canonical grant has these ordered fields:

```text
version, network, deployment, scenario, fee, ownerDomain, account,
controller, epoch, ownerKey, delegateKey, scope, budget, notBefore, expiresAt
```

Version is `1`; network `simulation`; deployment `unconnected-lab`; scenario `appendix-demo-v1`; scope `caw`; fee is the fixed 5,000 synthetic CAW in base units. Budget and times use the [existing permission bounds](DELEGATED_PERMISSIONS.md): positive canonical decimal budget at most 64 CAW fees, and a positive interval of at most 300 seconds. Keys are exact lowercase 32-byte hexadecimal and must differ. Owner domain, account, controller and epoch use the existing bounded lab-label rules.

The owner signs UTF-8 bytes consisting of `CAW_LOCAL_OWNER_GRANT_V1`, a newline, and the exact canonical grant JSON. Its packet is exactly `{grant, signature}` in that order, bounded to 8 KiB. Unknown fields, getters, alternate encodings, wrong context, and noncanonical JSON are rejected. Native WebCrypto provides Ed25519; there is no replacement cryptographic fallback.

The delegate action domain is `ownergrant-` plus lowercase SHA-256 of those same prefixed grant bytes. It commits to both keys, the test-owner session and all limits. The existing delegate action signature covers that domain and the exact CAW. Even with the same spending key and limits, changing the approving owner or owner domain changes the action domain. No owner-signature bytes need to be embedded inside the signed action.

## Independent test authority

The verifier requires a separately supplied exact record `{domain, account, controller, epoch, publicKey}`. The owner key nominated inside the grant is never sufficient by itself. Every field must agree with that independent record before native owner verification. The result then must agree exactly with the supplied delegate binding and permission.

These are caller-supplied test facts. There is no chain owner lookup, NFT proof, Ethereum wallet, contract-wallet validator, human identity check or live owner-key registry. “Test-owner signature verified” means the supplied key authorized those grant bytes. It does not prove that key belongs to the current owner of a real account.

## Acceptance and downgrade prevention

The signed ledger's optional fifth argument is `{packet, authority}`. Owner-granted domains require both the permission and this authorization. Dropping the owner evidence cannot choose the ordinary or unsigned-permission path. Conversely, supplying owner evidence with a non-owner domain is rejected. The older reserved `grant-` namespace keeps its own omission protection.

Each live check verifies the owner grant, compares its exact binding/terms, and verifies the delegated action. The final synchronous guard checks closure, revision, account controller/epoch and action time. Permission checking enforces the full action window and gross budget. Record append must succeed before model, budget, record and revision commit together. Checks reserve nothing and failures consume nothing. A transfer or closure during either native signature check cannot be overwritten by the pending post.

This remains one grant per fresh copied fixture. Existing events cannot be imported to reset a grant. Separate fresh copies still have independent counters. Signed cancellation now exists within the local copy and v2 record. There is no production grant installation, persistent spent/revoked registry, reorganization handling or durable distributed replay protection.

## Historical record

Owner-granted history uses a separate format, `caw-owner-granted-lab-record-v1`, with ordered fields:

```text
{format, initialHistory, delegation, ownerGrant, entries}
```

`ownerGrant` is the exact signed grant packet string. Entries retain exact spending packets and recorded acceptance times; fixture transfers remain explicitly unsigned. The original checkpoint format still fingerprints exact record bytes and exact final canonical model history. Older verifiers reject this new record format.

Recovery takes record, retained checkpoint, spending-key binding, retained permission and independent test-owner authority. It verifies the grant once, checks every spending signature and every recorded time/budget against its immutable terms, and compares the exact reconstructed final history. Relabeling a record as ordinary or unsigned delegated cannot bypass the reserved owner-domain rule, including for an empty record or a newly generated fingerprint.

Record time is supplied historical data, not a time attestation. A record can still verify after its live copy was closed. Owner v1 has no cancellation entry; v2 preserves and verifies one terminal signed cancellation. Neither can prove absence of a newer cancellation outside that snapshot. Replacing all independently trusted inputs can select a different internally consistent history. No successful recovery grants present-day access or proves permanent availability.

## Source and remaining work

The pinned manifesto ties account authority to NFT ownership and calls for smoother signature-based use; it does not define this grant format. This is a proposed local implementation safeguard under the existing ownership, custody and session questions. All 59 source requirements and 15 conflicts remain preserved. The recovered R2's open-review and agreed-release requirements remain production gates.

Before a real deployment: establish authoritative account ownership, a reviewed wallet/contract-wallet signature scheme, grant identity and lifecycle, signed revocation, persistent budgets/nonces, finality, custody invariants and independent review. No full-compliance, permanent-operation or production-security claim follows from these local tests.
