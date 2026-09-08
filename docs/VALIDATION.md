# Validation boundary

Alpha.14 passed **294/294 tests across nineteen files** on Node 24.20.0. The [51-file source manifest](../evidence/CODE_SHA256SUMS.txt) identifies reviewed code and fixed fixtures. Syntax passed for both modified/new readers. The supervised static build wrote and rehashed 22 files.

The [permission reader](INDEPENDENT_PERMISSION_READER.md) independently checks delegated-domain derivation, owner-signed grants, cancellation bytes and signatures. The separate history engine checks exact terms, full action-window containment and gross spending against separately supplied trust. It imports no writer permission, accounting, replay or checkpoint helpers. Its 22 new tests compare fixed expectations and original implementations; the executable cases define exact coverage.

Cancellation is exactly one terminal record entry in owner-v2. It changes no balance, fee, model nonce or model event. The record fingerprint and entry count cover that evidence even when the final model history is unchanged. All fresh ordinary, delegated-v1 and owner-v1/v2 records are within the implemented reader scopes; inherited histories remain unsupported. The ordinary API continues to reject grant formats.

Historical grants and cancellations do not establish current NFT ownership or latest permission. [Authority and freshness](AUTHORITY_AND_FRESHNESS.md) describes proposed inputs and future acceptance cases; none of that live adapter is implemented. No live permission is restored, and recorded times remain unauthenticated historical inputs.

Original public interaction and accounting logic is unchanged; release metadata and test registration changed. Browser interactions were not rerun. Team review is not an external audit, and Node cryptographic APIs may share a provider. All 59 requirements and 15 unresolved conflicts retain their recorded status. No hosting, real wallet use, spending, application-media upload or chain deployment occurred. See [actual results](../evidence/TEST_RESULTS.json).
