# Validation boundary

Alpha.7 passed **147/147 tests across twelve files** on Node 24.20.0. The [35-file source manifest](../evidence/CODE_SHA256SUMS.txt) identifies the reviewed code. Model/economics are unchanged from alpha.3; the native action-signature format is unchanged from alpha.4. Current test, syntax, build and browser checks cover different parts of that code.

[Limited permissions](DELEGATED_PERMISSIONS.md) bind exact terms, key, account and epoch into a signed domain. Tests cover budget boundaries, concurrency, mutation, key/domain/permission substitution, omission downgrade, expiry, revocation, transfers, failed accounting, history-import rejection, record limits and recovery. Spending, model and signed record change together. Unsigned fixture grants and transfers do not establish owner consent.

Syntax passed. The supervised static build wrote and rehashed 19 files. [Current results](../evidence/TEST_RESULTS.json) list browser checks and remaining gaps. Earlier counts are historical. Team review and shared-model reconstruction are not independent security or protocol review.

All 59 requirements and 15 conflicts remain unchanged. Commons is unsigned and synthetic. Production wallet/NFT authority, owner-signed grants, durable distributed replay, custody, historical time attestation, permanent retention and private messaging remain unfinished. No public hosting, real media upload, wallet use or chain deployment occurred.
