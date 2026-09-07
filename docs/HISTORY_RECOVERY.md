# Saved history and recovery

The next protocol-facing component is a portable checkpoint verifier, shared by the alpha's Readers view and the test suite. It advances the manifesto's reconstructable-account and replaceable-client requirements without choosing disputed settlement rules.

Source basis: the [pinned manifesto](../sources/primary/manifesto-pinned.md), lines 43–44, 68–73 and 82–93; and [recovered R2](../sources/primary/r2-message.txt), lines 5–7 and 11–13. The storage, authority and release requirements remain broader than this local component.

`createCheckpoint(state)` records the exact canonical export's SHA-256, scenario and event count. Save that checkpoint separately from the export. `verifyHistory(text, checkpoint)` checks exact UTF-8 bytes, schema, digest, event count, replay and final state, then returns a reconstructed synthetic state. The alpha displays the result without changing the active session.

The version-one checkpoint is an original experimental format, not recovered canon or an agreed network standard. It uses the existing provisional appendix scenario. Input is limited to 1 MiB, with the model's existing 256-event bound. Reformatting JSON changes bytes and is rejected; preserve the downloaded export exactly. Duplicate keys, unsafe checkpoint objects, invalid Unicode and extra fields reject.

A separately retained checkpoint detects rewrites and truncation relative to that saved version. A matching hash does not prove a record was originally true or complete. Replacing both record and checkpoint can pass. This module does not implement signatures, consensus, source discovery, chain finality, permanent storage or independent retention. Both local reader buttons still use the same model implementation.

## Try it

In Readers, choose **Prepare this session**. Save the exact record and fingerprint separately. Paste them into **Recover a saved record**, then choose **Verify and rebuild**. A valid pair reports reconstructed accounts, posts and events. A mismatch leaves the active session unchanged. The form performs no network upload and clears when the view is replaced.

## What remains for the protocol

Resolve the source conflicts before fixing production economics or ownership semantics. Then implement and review NFT mint/burn, token custody and exits, signed-action validation and finalized public history. Add two independently written readers and recovery from another operator's retained data before claiming operator independence. DM key transfer and externally hosted media remain separate requirements.

R2 remains the release constraint: public source, open contribution and review, agreed release, and no privileged developer mechanism, proxy or multisig. This local component establishes none of those deployment properties by itself.
