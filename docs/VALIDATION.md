# Validation boundary

Alpha.5 passed **113/113 automated tests across ten files** on Node 24.20.0. The [31-file source manifest](../evidence/CODE_SHA256SUMS.txt) identifies this revision. Accounting and economic modules are unchanged from alpha.3; the native signature module is unchanged from alpha.4.

The [copied-ledger adapter](SIGNED_SETTLEMENT.md) verifies exact signed CAWs and commits balance, post, receipt and nonce together. Tests exercise failure atomicity, duplicates, stale authority, concurrent state changes and the underlying model. Current browser checks and omissions are recorded in [TEST_RESULTS.json](../evidence/TEST_RESULTS.json). Team source/test review is not independent peer review. Native Node/WebCrypto checks may share a cryptographic provider.

Syntax passed. The supervised build wrote and rehashed 17 files: 16 static assets plus their manifest. Older test totals and UI results remain historical; they do not automatically verify changed code.

All 59 requirements and 15 conflicts remain unchanged. Commons uses unsigned synthetic settlement. The copied export does not preserve signature authorization evidence. Wallet/NFT authority, delegation, custody, durable replay protection, signed archive reconstruction, chain finality, permanent retention and private messaging remain unfinished. No real wallet, public hosting, upload or chain deployment occurred.
