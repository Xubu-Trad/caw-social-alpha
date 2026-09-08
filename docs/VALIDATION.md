# Validation boundary

Alpha.12 passed **251/251 tests across seventeen files** on Node 24.20.0. The [45-file source manifest](../evidence/CODE_SHA256SUMS.txt) identifies the reviewed code and fixed fixture. Syntax passed for the new reader. The supervised static build wrote and rehashed 22 files: 21 public assets and the manifest.

The [separate reader](INDEPENDENT_ACTION_READER.md) implements the synthetic signed-action format without importing application parsing, canonicalization, replay or signature helpers. Its 20 new tests cross-check exact fixtures, original-writer output, validation boundaries and rejected alterations. Native Node signature verification uses a different API from WebCrypto, but may use the same cryptographic provider. This is team implementation diversity, not an external security audit or an independent cryptographic implementation.

This release adds reference code and tests. Existing UI and protocol-model code are byte-identical to alpha.11; only release metadata and test registration changed. Browser interactions were not rerun. Earlier alpha.11 browser checks and their omissions remain historical and are not counted as new coverage.

The reader checks one action under separately supplied test trust and time. It does not consume a nonce, reconstruct an entire history, restore permission, authenticate real NFT ownership or establish the newest state. Packet-embedded keys alone are not trusted authority. Existing whole-history reconstruction still uses the application model.

All 59 source requirements and 15 unresolved conflicts retain their recorded status. No production wallet, custody, trusted shared freshness, finality, permanent availability or private messaging claim follows from passing these tests. No hosting, wallet use, real application media upload or chain deployment occurred. See [actual results](../evidence/TEST_RESULTS.json).
