# Validation boundary

Alpha.11 passed **231/231 tests across sixteen files** on Node 24.20.0. The [42-file source manifest](../evidence/CODE_SHA256SUMS.txt) identifies the reviewed code. Model/economics retain alpha.3 behavior, and action signatures retain alpha.4 bytes. Current tests, syntax, build and browser checks have distinct coverage.

[Portable anchor packages](ANCHOR_PACKAGE.md) require exact versioned package bytes and a separately retained expected SHA-256 digest. Export and import fully verify the inner record, signatures, accounting and supplied public trust. The 18 new tests cover ordinary/delegated/cancelled-owner round trips, SHA-256 comparison through a separate runtime API, trust substitution, valid outer hashes with invalid inner signatures or final-history fingerprints, canonical serialization, Unicode and resource bounds, accessors, captured input, failed-import isolation, and stale or competing packages. The digest APIs use the same runtime/provider; this is not independent cryptographic implementation review.

Syntax passed. The supervised static build wrote and rehashed **22 files: 21 public assets plus the manifest**. Browser checks below come from the separately supplied current browser receipt; the helper does not generate that evidence. [Current results](../evidence/TEST_RESULTS.json) retain its findings and receipt fingerprint.

## Recorded browser checks

- Owner fixture accepted one signed CAW, recorded cancellation, retained and packaged its verified anchor
- Package prepared with a 64-character separate fingerprint; importing disabled while an existing anchor is retained
- Reload cleared package and anchor; wrong expected fingerprint rejected without restoring an anchor
- Correct pasted package restored identical anchor fingerprint, 5000 CAW spending and signed cancellation; signing and acceptance stayed disabled
- Imported record compared as identical; re-exported package text was byte-for-character identical to the original browser field
- Package edits disabled prepared downloads while leaving current anchor available; explicit clear then whitespace-altered package rejected
- Owner package import succeeded at 390px; desktop,390px,320px screenshots inspected with no horizontal document overflow
- Commons canonical export unchanged; no warn/error console entries observed
- Download prepared package click saved caw-anchor.json,8136 bytes,at the observed test time; browser download-event observer timed out

## Browser checks not run

- Independent comparison of downloaded file bytes against the complete browser-field digest; fingerprint download button not exercised
- Browser asynchronous import/export race injection and ordinary/delegated package round trips; unit tests cover module cases

The supplied cleanup receipt records zero remaining preview listeners and a closed QA tab. Multi-agent source review is not independent external security review; recovery uses the same model as the writer. No application execution or browser coverage beyond the supplied reports is inferred.

All 59 requirements and 15 conflicts remain unchanged. These are public test keys, not proof of NFT ownership. The alpha requires explicit Clear before importing another anchor; clearing gives up the prior in-memory baseline. A failed import itself does not replace state, but cannot recover a baseline the user already cleared. No file is loaded or saved automatically and no signing permission is restored. An older package and its original fingerprint can remain valid after unseen later activity, including cancellation. Replacing both package and fingerprint chooses new trust. Production owner lookup, wallet/contract-wallet support, durable grant/spending/replay continuity, trusted shared freshness, custody, finality, permanent retention and private messaging remain unfinished. No hosting, wallet use, real media upload or chain deployment occurred. Earlier results are historical.
