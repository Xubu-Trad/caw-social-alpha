# Ordinary history: a separate settlement reader

This M-007 slice independently recalculates the ordinary synthetic signed-history format. The [reader](../reference/independent-history-reader.mjs) imports only Node built-ins and the separately written [signed-action reader](INDEPENDENT_ACTION_READER.md). It uses no application model, fee allocator, replay, canonical-export or checkpoint helper. This is same-team implementation and review; Node crypto and JavaScript behavior remain shared dependencies.

## API and supported scope

`inspectSignedHistory(recordText, expectedCheckpoint, binding)` is synchronous and accepts exactly three arguments. It returns frozen `{canonicalText, checkpoint, signedActions, fixtureTransfers, inheritedEvents:0, entryCount, recordedTimesAreProof:false, ownershipProven:false, authorityProven:false, freshnessProven:false, livePermissionRestored:false}`. The copied checkpoint is frozen. It changes no caller object or live ledger, saves nothing and consumes no permission or nonce.

Only `caw-signed-lab-record-v1` is supported: exactly `{format,initialHistory,entries}` in that order. The initial model must have zero events and an event count of zero. Existing seed posts are allowed; they remain unsigned fixture content. Delegated and owner-granted formats, cancellation entries, `grant-`/`ownergrant-` binding domains and inherited events are rejected. This is a deliberately narrower scope than the application's history verifier.

Separate binding has exactly `domain,account,controller,epoch,publicKey`. Label, epoch and raw public-key rules match signed-action v1. Separate checkpoint has exactly `format,entryCount,byteLength,sha256,finalHistorySha256`, with format `caw-signed-lab-checkpoint-v1` and two lowercase 64-character SHA-256 digests. Descriptor capture rejects accessors, hidden/extra fields, symbols and custom prototypes without invoking ordinary getters. Null-prototype records are supported. Proxy traps or compromised built-ins are outside this API boundary. No input object supplies executable callbacks, clock services or network access.

Record text is capped at 2 MiB UTF-8 and 64 entries. The initial history and every resulting canonical model export are capped at 1 MiB; signed packets at 8,192 bytes. Unicode must be well formed. Checkpoint counts/lengths have the ordinary-format caps. Nonnegative integer fields reject fractions, unsafe integers and negative zero. Canonical model construction retains the existing 32-depth, 100,000-value and 8,192-element generic structural bounds.

## Reconstructed fixture and wire bytes

Seed has `version:1`, `scenario:'appendix-demo-v1'`, 2–32 unique accounts and at most 128 posts. Optional description and policies are preserved, with their 2,000-code-point description, 20-policy and 500-code-point policy limits. Account names are 1–32 lowercase ASCII letters/digits; `constructor` and numeric names are valid. Each account has exactly name, controller, canonical decimal balance and fixed stake weight. Balances are at most `2^256-1`; weights are 0–1,000,000. Initial nonce and epoch are zero and initial dust is zero. Sum of balances is not restricted to one uint256.

Seed posts have exactly id, author, text and time; IDs are unique ASCII identifiers up to 96 characters, authors must exist, text is nonblank and at most 420 Unicode scalar values, and display time is at most 80 scalar values. Descriptions, policies, seed/post array order and exact text are retained. Text is not normalized or counted as grapheme clusters.

The entire initial snapshot must equal reconstruction from the seed: accounts, posts, empty follows/likes/reCAWs, zero dust and empty receipts. A newly calculated outer hash cannot excuse a fabricated initial snapshot. Canonical model output has exactly version, scenario, seed, expectedEventCount, events and snapshot. Object keys use the writer's lexical sorting followed by ECMAScript integer-index enumeration: account keys `2` and `10` appear numerically in the object, while seed array order remains untouched. Allocation arrays use lexical names, so recipient `10` precedes `2`. Native JSON string spelling and array order remain exact. The reader implements this ordering itself.

Outer records and entries use their fixed insertion order, rather than model key sorting. A signed entry is `{kind:'signed-caw',packet,acceptedAt}`. An unsigned transfer is `{kind:'unsigned-fixture-transfer',newController}`. Exact reconstructed text equality rejects alternate whitespace, reordered or duplicate keys, escaped duplicate keys and alternate scalar spellings. The expected record hash, byte length and entry count must match before replay; the expected final-history hash must match the recomputed canonical export.

## Settlement rules checked

Each signed CAW must pass the separate action reader under the retained binding, the reconstructed next nonce and that entry's recorded `acceptedAt`. The time must fall in the signed window, but it need not be monotonic across entries and is not proof of real historical time.

The fee is exactly `5000000000000000000000` synthetic base units. The payer must cover it. The full fee goes to the pool; the payer is excluded regardless of stake. Other positive-weight accounts receive `floor(fee × weight / eligibleWeight)` in lexical name order. Zero credits are omitted. The remainder is added to visible dust. No eligible other staker rejects the action. Every resulting balance and cumulative dust must fit uint256. This integer schedule is the provisional appendix demo, not verified token behavior or an adopted protocol decision.

A CAW creates intent `signed-{account}-{nonce}`, post `post-{intentId}`, increments the payer nonce and leaves its epoch unchanged. A seed/generated post collision is rejected. Post text and `Local session` display time, allocations, dust, counters, event sequence, intent, receipt and snapshot are reconstructed in full.

An unsigned fixture transfer creates `transfer-{account}-{nonce}` using current simulated control. It has zero fee/pool/dust, empty allocations and zero character count; no positive-staker requirement applies. It increments nonce and epoch, requires a different controller and preserves balances, weights and posts. Every subsequent signed CAW under the original binding is rejected, including after a transfer back to the original controller label. Further unsigned fixture transfers are permitted. These entries do not prove an authorized real transfer.

## Failure and evidence limits

Reader failures have `HISTORY_*` codes: `SCHEMA`, `LIMIT`, `FORMAT`, `INHERITED`, `CANONICAL`, `INTEGER`, `AMOUNT`, `TEXT`, `SEED`, `BINDING`, `CHECKPOINT`, `INITIAL_HISTORY`, `AUTHORITY`, `TRANSFER`, `SETTLEMENT`, `FINAL_HISTORY` or `CRYPTO`. Signed-action failures retain their `READER_*` codes. Several faults may exist in one input; error precedence is not a protocol guarantee.

Expected fingerprints and binding are caller-selected assumptions. Replacing record, seed, checkpoint and trust together can define another valid fixture. A valid old history does not prove latest authority or absence of later cancellation. The reader establishes neither real NFT ownership, available token balances, current permission, chain finality, history availability nor consensus. Its result is inspection only.

Literal fixtures and differential tests should compare complete canonical bytes and independently expected settlement against the application writer/verifier. Actual execution results belong in the release validation record. This document alone claims neither executed tests nor complete M-007 interoperability. All 59 requirements and 15 conflicts retain their historical pinned statuses; independent ownership/freshness design remains separate work.
