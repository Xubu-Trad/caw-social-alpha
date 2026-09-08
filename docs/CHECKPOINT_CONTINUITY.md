# Compare the history. Keep the checkpoint.

Alpha.10 compares a candidate record against a verified snapshot you retain as an anchor. It verifies signatures, accounting and exact ordered history under the anchor's original trust values. An older or conflicting record cannot replace that anchor. This is a local inspection tool; it restores no signing key, ledger or permission to spend.

## Four outcomes

| Outcome | Evidence | Effect |
|---|---|---|
| Same | Same initial context and all exact record entries | No change |
| Extension | Same context and every anchor entry appears unchanged at the start | May explicitly advance the anchor |
| Rollback | Candidate is a strict earlier prefix of the retained record | Cannot advance |
| Conflict | Different initial context or any divergent ordered entry | Cannot advance; no winning branch selected |

Every candidate must first pass full historical verification against its supplied fingerprint and the anchor's original binding, permission and owner authority. A new fingerprint cannot rescue an invalid signature. Entry comparison includes recorded acceptance times and unsigned fixture transfers, not just signed packets or final balances. Different histories may have the same model hash.

An owner-v1 record may extend to owner-v2 through its verified terminal cancellation. Cancellation changes no accounting, but its new record entry must be preserved. A cancelled anchor cannot be advanced to an older v1 snapshot. Signed CAWs, unsigned control changes and inherited events remain separate counts; verified continuity does not authenticate every fixture event.

## Use the alpha

1. In Identity, expand **Test a signed action → Save and verify a signed record**.
2. Paste your retained record, independently saved fingerprint and original trust values, or prepare a snapshot of the synthetic copy. Expand **Compare with a retained checkpoint** and choose **Keep as comparison anchor**.
3. Replace the record and fingerprint with a candidate, or perform another lab action and prepare its record. Choose **Compare with anchor**.
4. Inspect the outcome and counts. **Advance to verified extension** repeats verification and accepts only an exact match or extension. It preserves replayed spending and cancellation; it does not reinstall a grant.
5. Keep the newly accepted record, fingerprint and original trust values separately if you need the anchor after leaving. No file is saved automatically. Clearing the anchor, creating a new example or leaving Identity discards the baseline.

Comparison keeps the original trust values even if the binding/permission/owner fields above change. Those fields select trust only when explicitly creating a new anchor. Editing recovery inputs invalidates pending comparison work so an outdated result cannot silently advance the anchor.

## Implementation contract

`public/checkpoint-continuity.mjs` exposes the async factory `createCheckpointTracker(recordText, checkpoint, binding, delegation?, ownerAuthority?)`. It copies independent trust before awaiting and fully verifies the initial anchor. The frozen handle provides `inspect`, `advance`, `status`, `exportAnchor`, `invalidatePending` and `close`.

Both inspect and advance capture the anchor and internal revision before verifying a candidate. A final closure/revision check rejects intervening changes. Two competing advances cannot both commit from one revision. Same is an idempotent no-op; rollback, conflict and invalid candidates preserve the anchor. A successful extension assigns one immutable candidate including its replayed spending, cancellation, record and fingerprints. `invalidatePending` changes only the internal guard revision; it preserves the exported anchor. It is not a chain height, durable sequence or consensus signal.

Exact roots include initial model history, permission and owner-grant packet. Exact ordered entries include all fields. Only the validated owner-v1/v2 relationship crosses formats. Existing bounded recovery schemas remain unchanged. The helper exports `readLabRecord` and `copyLabCheckpoint` expose immutable validated data; parsing and fingerprint creation alone do not certify signatures or ownership.

## What remains outside this check

Trust starts with the anchor and fingerprint you select. If that anchor is already stale, omitted, replaced or rolled back, this tool cannot discover an unseen newer post or cancellation. A malicious source can offer a valid extension while withholding a competing one. Two independent readers given the same inputs should reach the same result; this is shared-code determinism, not independent implementation or proof of global freshness.

No anchor survives reload automatically, and no network publishes or reconciles it. Durable storage, authenticated latest-state discovery, fork choice, distributed replay/spending continuity, NFT/wallet authority and finality require separate designs and review. Explicitly clearing and selecting an older baseline gives up the previous comparison protection. All 59 source requirements and 15 conflicts retain their status. See [validation](VALIDATION.md) for executed checks.
