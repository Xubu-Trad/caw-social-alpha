# Keep the record. Keep the fingerprint separately.

Alpha.11 adds a portable package for a verified comparison anchor. The package carries exact record bytes, the record checkpoint and the public test authority needed to replay it. A separate SHA-256 fingerprint identifies the package bytes you chose to retain. Import checks both the package fingerprint and the complete inner evidence before returning a new comparison tracker.

This is synthetic history inspection. No private key, live ledger, restored spending permission, wallet connection, network request or automatic storage is created. A valid older package is still older evidence. Its fingerprint does not establish freshness.

## Use the alpha

1. Open **Identity → Test a signed action → Save and verify a signed record → Compare with a retained checkpoint → Carry anchor**.
2. Keep a verified comparison anchor, then prepare its package. Download the exact package and its separate fingerprint. Nothing is saved automatically.
3. After a reload, paste the package text and your independently retained expected fingerprint, then choose **Import**. There is no automatic load or live grant restoration.
4. If an anchor already exists, Import is disabled. Export it first if you need it again, then explicitly choose **Clear** before importing another package. Clearing deliberately gives up that in-memory baseline; a failed import will not restore a baseline you already cleared.

## API

`public/anchor-package.mjs` exports:

| API | Result |
|---|---|
| `createAnchorPackage(anchorData)` | Async, frozen `{format, packageText, sha256, byteLength}` |
| `importAnchorPackage(packageText, expectedSha256)` | Async, frozen `{format, tracker, sha256, byteLength}` |
| `ANCHOR_PACKAGE_FORMAT` | `caw-retained-anchor-package-v1` |
| `ANCHOR_PACKAGE_LIMITS` | Frozen byte and outer-nesting limits |

Export accepts exactly `recordText`, `checkpoint` and `binding`, with optional `canonicalText`, `delegation` and `ownerAuthority`. This includes the result of `tracker.exportAnchor()`. Optional fields that are absent must be omitted; explicit `undefined` is not accepted as a field value. All records must be plain enumerable data, with no accessors, unknown fields or symbols. Existing recovery validators retain their bounds and authority rules.

Export fully verifies the record under captured copies of the checkpoint and supplied authority. If `canonicalText` is present, it must equal the final history reconstructed by replay. The package omits that redundant text; import reconstructs it again. Creating a fingerprint alone never certifies a signature.

Import requires the exact lowercase 64-character expected digest as a separate argument. It cannot take a fingerprint embedded in the package. After canonical parsing and the outer digest check, it creates a fresh `createCheckpointTracker` under the package's digest-anchored authority. That tracker offers historical `inspect` and `advance` operations described in [checkpoint continuity](CHECKPOINT_CONTINUITY.md). It has no signing or spending methods.

The package is plain text, not encrypted. It includes public test keys, account/controller labels and the research fixture's history. Review those contents before sharing a file.

## Exact format and bounds

The canonical outer JSON field order is:

1. `format`
2. `recordText`
3. `checkpoint`
4. `binding`
5. `delegation`, when present
6. `ownerAuthority`, when present

Nested checkpoint and authority objects use the existing validators' fixed field order. `recordText` remains an exact string containing canonical record JSON. No package digest or reconstructed history is embedded. Whitespace, reordered fields, duplicate keys, escaped duplicate keys, unknown versions and alternate serializations are rejected, even if someone recalculates their outer digest.

The maximum package size is **4,243,456 UTF-8 bytes**: twice the maximum revoked-record byte size, plus 16 KiB for bounded context. JSON escaping may double a canonical record string's byte size. Outer JSON nesting is limited to two levels before parsing; nested record history is inside a string and is separately bounded and validated. Lone UTF-16 surrogates are rejected instead of being replaced during UTF-8 encoding. Existing record limits remain 64 model-changing entries, with one reserved terminal owner cancellation and the corresponding v2 byte allowance.

The implementation copies every supplied data descriptor and validates nested trust before the first asynchronous operation. It does not call supplied getters, conversion hooks or `toJSON`. This is a plain-data API; hostile JavaScript proxies or a compromised runtime are outside that boundary.

Useful failure codes include `INVALID_ANCHOR_PACKAGE`, `NON_CANONICAL_PACKAGE`, `PACKAGE_LIMIT`, `INVALID_PACKAGE_UNICODE`, `INVALID_PACKAGE_DIGEST`, `PACKAGE_DIGEST_MISMATCH` and `ANCHOR_HISTORY_MISMATCH`. Inner recovery errors, such as an invalid signature, checkpoint mismatch, overspend or invalid cancellation, remain visible and reject the operation.

## Replacement belongs to the caller

Import returns a new tracker and receives no existing tracker to modify. The general API can verify a replacement while a caller retains another tracker; a failed import itself does not replace or close that tracker. The alpha UI instead requires the user to clear an existing anchor first. Its explicit Clear operation discards the old baseline before import starts, so failed import leaves that already-cleared state unchanged. Export the old anchor before Clear if you need to retain it.

Capture a UI input revision before starting; if inputs change while verification waits, close the newly returned tracker and discard the stale result. No file or browser storage is written automatically.

Export is a snapshot of the anchor data passed to it. Later advancement of the original tracker does not update a pending or previously exported package. Retain the package and expected fingerprint as separate artifacts. When checking a possibly replaced package, use the expected fingerprint already retained through a trusted reference; calculating it from the replacement package supplies new trust.

## What this proves, and what remains open

Matching the retained digest establishes equality with the selected package bytes. Full replay then checks the inner signatures, account history, spending limits and any terminal owner cancellation under that package's test authority. Import preserves spent budget and cancellation status in the comparison tracker; it does not reinstall a permission with a fresh spending allowance.

An attacker who can replace both the package and the expected fingerprint can select another internally valid baseline. An old package and its original fingerprint can also pass after a newer cancellation exists elsewhere. Different readers may import conflicting valid branches. No timestamp, global latest-state discovery, fork choice, NFT ownership, consensus, finality, availability or independent implementation is established here. Explicit replacement of a current tracker with an older package gives up the current comparison baseline.

The new test source covers ordinary, delegated and cancelled-owner round trips; separate SHA-256 API comparison; altered public trust; valid outer hashes with invalid inner signatures or final-history fingerprints; canonical-byte, Unicode, size and schema rejection; getter avoidance and before-await capture; failed-import isolation; and stale/competing packages. Tests are prepared for the supervised B-001 run. This document makes no execution claim; [validation](VALIDATION.md) records completed runs and their limits. All 59 source requirements and 15 unresolved conflicts retain their existing status.
