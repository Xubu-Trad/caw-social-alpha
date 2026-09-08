# Validation boundary

Alpha.15 passed **320/320 tests across twenty files** on Node 24.20.0. The [56-file source manifest](../evidence/CODE_SHA256SUMS.txt) identifies reviewed sources and fixtures. Both new JavaScript modules passed syntax checks; the supervised static build wrote and rehashed 22 files.

The [offline proof reader](ETHEREUM_STATE_PROOF.md) checks Ethereum Keccak-256 links, canonical RLP and Merkle-Patricia inclusion or absence. Account claims must match the recovered leaf; slot proofs use its storage root and exactly match separately requested keys. Missing nodes fail rather than returning zero. Present empty accounts remain distinct from proved account absence.

Its 26 new tests use fixed positive and independently rooted malformed examples. The [Python fixture generator](../reference/fixtures/generate-ethereum-proof-fixtures.py) independently constructs the witnesses without importing the JavaScript verifier. It checks its SHA3 padding variant against Python hashlib and fixed Ethereum empty/abc Keccak results. Fixtures are synthetic; no live RPC or deployed CAW contract interoperability run is claimed. Tests establish their executable cases, not an external security audit or exhaustive correctness.

Passing a proof establishes values under the supplied root. It does not authenticate that root, bind it to a header/network, establish finality or freshness, interpret a storage layout as NFT ownership, or restore live permission. [Authority and freshness](AUTHORITY_AND_FRESHNESS.md) identifies the remaining trust path. No live adapter or contract deployment is implemented in this release.

Existing application interaction/accounting logic and earlier readers are unchanged; only release metadata and test registration changed. Browser interactions were not rerun. All 59 requirements and 15 unresolved conflicts retain their pinned status. No hosting, wallet use, spending, media upload, research offload/deletion or chain deployment occurred. See [actual results](../evidence/TEST_RESULTS.json).
