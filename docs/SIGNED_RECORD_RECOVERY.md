# Keep the words. Rebuild the receipt.

Alpha.9 adds [signed owner cancellation](OWNER_CANCELLATION.md). The owner key remains temporarily available in Identity to cancel its exact grant. Cancellation closes the copy and is verified in owner record v2; it changes no balance or model nonce. Older snapshots cannot prove that no newer cancellation exists.

Alpha.8 adds [owner-granted records](OWNER_SIGNED_GRANTS.md) with the exact signed test-owner grant and a fifth, separately retained owner-authority input. It verifies owner approval by that supplied test key, not real NFT ownership or later revocation. The earlier two formats below retain their distinct verification rules.

## Alpha.7 permission extension

[Delegated records](DELEGATED_PERMISSIONS.md) use the separate `caw-delegated-lab-record-v1` format and require a separately retained permission as a fourth trust input. Verification recomputes its signed domain and gross spending. Ordinary records below keep their original format. Any `grant-` binding requires a permission; dropping it cannot select the ordinary path. Input edits invalidate prior and pending verification results. Later revocation and owner approval remain unproven.

Alpha.6 preserves the copied ledger's exact signed packets and recorded local acceptance times. A separate verifier checks those signatures, replays every added event in order and compares the rebuilt model history with a separately saved fingerprint. Verification produces an inspection result; it never restores authority or changes Commons.

## Use the recovery panel

In Identity, create and accept a signed example. Expand **Save and verify a signed record**, then choose **Prepare recovery record**. Copy all populated fields before leaving: record, fingerprint, spending-key binding, permission when present, and test-owner authority when present. Keep the fingerprint and trust values separately from the record; values obtained from the same untrusted source are not independent evidence.

Choose **Verify saved record** and inspect the rebuilt result. To check a previous session, paste the record and every applicable separately retained value into its corresponding field. Ordinary records use three fields, delegated records add permission, and owner-granted records also require test-owner authority. No live signer or active copied ledger is required for verification. A new example or leaving Identity clears the form. No file is saved automatically, and later actions are not silently added to an already prepared snapshot.

The result reports signed CAWs, unsigned fixture-controller changes and inherited events separately. A controller-change button never becomes proof of a wallet transaction or NFT transfer.

## Exact record and fingerprint

`public/signed-record.mjs` defines canonical JSON in this field order:

```text
record:     format, initialHistory, entries
signed CAW: kind, packet, acceptedAt
transfer:   kind, newController
fingerprint: format, entryCount, byteLength, sha256, finalHistorySha256
```

The record format is `caw-signed-lab-record-v1`. `initialHistory` is the exact canonical **unsigned** model-export string. `entries` is an ordered array. A `signed-caw` entry preserves the entire canonical signed packet string and the integer local-clock value used by the writer's final acceptance guard. An `unsigned-fixture-transfer` entry preserves its controller label. It has no signature. No timestamps are sorted or inferred for fixture changes.

The fingerprint format is `caw-signed-lab-checkpoint-v1`. Native SHA-256 covers both the exact UTF-8 record bytes and the exact final canonical model history, separately. It also retains record byte length and added-entry count. Generating a fingerprint does not certify the record; verification still checks structure, signatures, bindings, validity windows, nonce order, accounting and the rebuilt final fingerprint.

The independent test binding contains only `domain`, `account`, `controller`, `epoch` and `publicKey`. Both the binding and fingerprint are copied before asynchronous verification begins. The imported record cannot nominate its own trusted key or replace that captured binding midway through verification.

Ordinary record bounds are local implementation choices: at most 64 model-changing entries, 2 MiB of UTF-8 record JSON, 1 MiB per underlying model history and the existing 8 KiB signed-packet bound. Owner v2 reserves a 65th terminal cancellation entry and 16 KiB for it. Escaping the initial history inside the record counts toward its byte limit. Canonical encoding, exact fields, dense ordered entries and valid Unicode are required. These limits do not change the manifesto.

## Atomic capture and replay

The live adapter validates the next model result and next record before assigning either. Signed acceptance records the same clock value returned by its final authority/revision/expiry check. No asynchronous digest occurs between that check and assignment. A record limit or serialization failure therefore leaves balance, nonce, post, receipt and record unchanged. Fingerprints are computed afterward from an immutable captured record/final-history pair.

Replay starts with the unsigned initial model history. It checks every signed CAW under the externally supplied test key, current model nonce, original domain, controller and epoch. It evaluates the signed validity window at the **recorded local acceptance time**, rather than treating an expired historical packet as a new live request. The corresponding model CAW must reproduce its deterministic identifier and accounting effect.

Unsigned fixture transfers are replayed as explicit test controls and counted separately. They advance the model's epoch and nonce. The same initial key binding cannot authorize a subsequent CAW after such an epoch change, even if a later fixture transfer restores the original controller label. Every added model event has one ordered record entry; the final canonical history must match its separately saved fingerprint.

## Trust that still has to come from elsewhere

A valid signature establishes that the supplied key signed those bytes. It does not establish who owned that key, who owned an NFT, or whether initial balances, stake weights and inherited events describe a real chain. Even an inherited event named `signed-...` remains part of the unsigned prefix.

A recorded time inside a signed validity window is not proof that acceptance actually happened at that historical time. Someone who supplies a different internally consistent record **and a newly trusted fingerprint** can change unsigned assumptions or omit history. Retaining the original fingerprint separately is essential to detecting changes relative to that original snapshot. Neither a hash nor this lab guarantees completeness, publication, permanence or consensus.

This is an in-memory, synthetic recovery format, with no file persistence, encrypted storage, wallet/NFT authentication, production delegated spending, production custody or distributed replay protection. It uses the same accounting model as the writer and is not an independent implementation. All 59 requirements and 15 source conflicts retain their existing status. See [validation](VALIDATION.md) for executed checks and omissions.
