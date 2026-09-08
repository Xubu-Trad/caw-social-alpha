# Validation boundary

Alpha.13 passed **272/272 tests across eighteen files** on Node 24.20.0. The [48-file source manifest](../evidence/CODE_SHA256SUMS.txt) identifies the reviewed code and fixed fixtures. Syntax passed for the new history reader; the supervised static build wrote and rehashed 22 files.

The [separate history reader](INDEPENDENT_HISTORY_READER.md) reconstructs the supported ordinary record-v1 format from a fresh fixture. It independently calculates settlement, dust, counters, posts, receipts and canonical history, then checks the separately supplied record/final fingerprints. It uses the alpha.12 independent action reader for signatures, and imports no writer model, accounting, replay or checkpoint helpers. Its 21 new tests include fixed expected outcomes and comparisons with the original implementation; see the executable cases for exact coverage.

Inherited events, delegated records and owner-granted records remain unsupported by this reader. Unsigned fixture transfers are simulations. Recorded acceptance times are inputs, not historical proof. Caller-supplied bindings and fingerprints cannot establish real NFT ownership, complete/latest history, finality, trusted revocation or permanent availability. No live permission is restored.

Original interaction and accounting logic is unchanged; release metadata and test registration changed. Browser interactions were not rerun, and earlier browser evidence remains historical. Team implementation review is not an external security audit. Both signature APIs may share a cryptographic provider.

All 59 source requirements and 15 unresolved conflicts retain their recorded status. Provisional demo accounting has not become an adopted production specification. No hosting, real wallet use, spending, application-media upload or chain deployment occurred. See [actual results](../evidence/TEST_RESULTS.json).
