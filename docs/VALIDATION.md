# Validation boundary

Alpha.6 passed **128/128 tests across eleven files** on Node 24.20.0. The [33-file source manifest](../evidence/CODE_SHA256SUMS.txt) identifies the executed code. Model/economics are unchanged from alpha.3; the native signature format is unchanged from alpha.4.

The [recovery record](SIGNED_RECORD_RECOVERY.md) preserves exact signed packets and recorded local acceptance times. Verification checks separate retained record/final-history fingerprints, supplied test-key bindings and every added model event. Tests cover altered, missing, duplicate and reordered evidence, bounds, trust-input mutation and atomic record/state failures. Inherited events and fixture-controller changes remain unsigned. Recorded time and real ownership are not proven.

Syntax passed. The supervised static build wrote and rehashed 18 files. [Current results](../evidence/TEST_RESULTS.json) separate browser coverage from unverified cases. Team review and shared-model reconstruction are not independent cryptographic or protocol review. Earlier test totals remain historical.

All 59 requirements and 15 conflicts remain unchanged. Commons is unsigned and synthetic. No wallet/NFT authority, delegated budget, durable distributed replay protection, production custody, historical time attestation, permanent retention or private messaging is implemented. No public hosting, real upload, wallet or chain deployment occurred.
