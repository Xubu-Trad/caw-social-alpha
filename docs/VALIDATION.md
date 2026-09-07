# Validation boundary

Alpha.4 passed **97/97 automated tests across nine files** on Node 24.20.0. The [29-file source manifest](../evidence/CODE_SHA256SUMS.txt) identifies this revision. The synthetic accounting model is unchanged from alpha.3. Its established settlement, history and economic reference tests remain in the suite.

The [signature lab](SIGNATURE_LAB.md) adds native Ed25519 signing/verification, strict canonical bytes, independent test-key binding, expiry, nonce and revocation checks. Its counter is local to one verifier; it is not durable or distributed replay protection. Test coverage and current browser checks are recorded in [TEST_RESULTS.json](../evidence/TEST_RESULTS.json). Native Node/WebCrypto interoperability checks use distinct APIs and may share a provider; this is not independent cryptographic review.

The supervised static build wrote and rehashed 16 files. Earlier 76-test, 61-test and 51-test snapshots remain historical; browser results from them do not automatically verify changed UI code.

All 59 source requirements and 15 conflicts remain unchanged. This revision does not establish wallet/NFT authentication, delegated spending, token custody, private-message encryption, chain finality, permanent retention or community acceptance. Commons still uses unsigned synthetic settlement. No real wallet, media upload, public hosting or chain deployment was performed.
