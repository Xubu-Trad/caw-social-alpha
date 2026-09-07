# Validation boundary

Alpha.3 passed **76/76 automated tests across eight files**, using Node 24.20.0. [Current source hashes](../evidence/CODE_SHA256SUMS.txt) include the shared allocator and its tests. Existing literal reference cases continue checking the appendix's expected balances, credits and dust after the model refactor. The original model source has changed; its established appendix settlement policy remains the active policy.

New allocation checks cover both fixed profiles, separate direct and pool credits, exact conservation, rounding, input ordering, zero-pool cases, uint256 bounds, plain-data validation and unchanged inputs. Canonical names, device labels, identifiers and amounts reject trailing line terminators before settlement, with a regression test for each field. The alternative profile is read-only in Ledger. No transaction/profile switch is exposed. History verification still uses the same canonical synthetic scenario.

The supervised static build produced and rehashed 15 files. Current browser checks and known gaps are listed in [TEST_RESULTS.json](../evidence/TEST_RESULTS.json). The earlier 61-test recovery and 51-test first-alpha snapshots remain historical evidence, not automatic passes for changed code.

These checks do not establish live token compatibility, NFT/custody contracts, signatures, chain finality, permanent retention, independent reproduction or community acceptance. The 59 source requirements and 15 conflicts remain unchanged. No wallet, real upload, public hosting or chain deployment was performed.
