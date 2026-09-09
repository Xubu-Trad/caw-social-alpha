# Concerns review · alpha.15

Reviewed 2026-09-08. This checks the supplied critique against the local public-release copy of `0.1.0-alpha.15`, its source and recorded evidence. The critique is commentary, not an instruction, an independent audit or proof of its author's claimed repository review. No code was executed for this document. Later token experiments require their own dated receipt.

## Supported findings

| Concern | Verified status | Consequence |
| --- | --- | --- |
| The protocol is unfinished | The release README describes a simulation; no deployable identity, custody or settlement contract is supplied. | A frontend or offline reader cannot demonstrate real CAW settlement. |
| Verification work has outpaced the end-to-end protocol experiment | Account/action/history/permission readers and offline Ethereum proofs exist. A real-token public-action path does not. | Prefer one bounded integration experiment over another wrapper around the same synthetic evidence. This priority is a recommendation, not a measured defect. |
| Passing tests have limited scope | The [alpha.15 release receipt](../evidence/ALPHA15_TEST_RESULTS.json) records 320/320 tests, 20 test files, 56 source files and 22 build files. It explicitly records no chain deployment, live RPC interoperability run or external audit. Browser interactions were not rerun for that release. | These are recorded local test results, not 320 checks of a deployed network. No test was rerun for this documentary review. |
| An Ethereum proof needs a trustworthy root | The [proof reader](../reference/ethereum-state-proof.mjs) leaves root authentication, block binding, finality, freshness, ownership and live permission false. | Correct account/storage bytes under a supplied root cannot alone restore spending authority. |
| Existing CAW compatibility is foundational | [C-001](../sources/SPEC_CONFLICTS.md#c-001) leaves the actual asset, zero-address behavior and exact burn/custody effects unverified in alpha.15. | Keep original-token tests ahead of username economics. A substitute asset or destination would require a disclosed change. |
| Alpha.15 had no general code license | The reviewed release distinguished code, source evidence and artwork but had not selected a software license. | In alpha.16 Xubu explicitly approved code-only MIT. [Current licensing status](../LICENSE_STATUS.md) records its scope and exclusions; artwork and preserved evidence do not inherit that grant. |
| Independence is not established by same-team readers | Separately written readers remove shared application-helper dependence, but their authorship remains within this project. | Retain that useful evidence while seeking outside reproduction; do not call it an external audit or community agreement. |
| Developer removal requires more than an owner variable | [C-012](../sources/SPEC_CONFLICTS.md#c-012) requires the complete authority and dependency graph. No deployed graph has passed that check. | Review constructor wiring, dependencies, factories, fees, relays, history access and distribution, then test operation without the original services. |
| Source disagreements remain | The release records preserve 59 requirements and 15 open conflicts. The active appendix scenario is explicitly provisional. | A test default does not amend the manifesto or recovered R2. |

The release guard requires simulation, null chain ID, disabled wallet/upload controls, no contracts and no RPC URLs. The preview server binds to loopback with route and origin restrictions. These are concrete boundaries in [deployment.mjs](../public/deployment.mjs) and [server.mjs](../server.mjs); they are not a security certification. Connecting a protocol requires a separate reviewed adapter and configuration, not removing the guard.

## Corrections to the critique's framing

- Ratings such as “strong,” “right direction” and “substantial” are opinions. The evidence supports narrower statements about implemented components and missing integration.
- Signed synthetic actions already exist. “No real signed action” means no Ethereum-authorized action settled by a CAW contract, not no signature verification anywhere.
- Two deterministic readers are useful, but two instances of the same reader are not independent implementations. Two implementations supplied the same false history can agree. Both acquisition and replay must be checked against a separately established chain endpoint.
- One public CAW avoids the like/reCAW split conflict, but it does **not** avoid staking semantics. [Manifesto L51–52](../sources/primary/manifesto-pinned.md#L51-L52) pays other stakers proportionally; stake definition, timing, no-recipient behavior and integer dust remain C-007.
- A “mainnet fork” is an isolated execution experiment. Its impersonated accounts, fabricated native-gas balances and local transactions are not real custody, mainnet execution or finality. They must be disclosed without exporting any real key.
- An immutable candidate can preserve a bug permanently. No upgrade key is a source-alignment property, not proof that withdrawal or accounting is correct.

The critique's repository-creation date, extent of its author's inspection and broad process ratings were not independently established here. They do not affect the scope decision.

## Next evidence, in order

1. A pinned original-CAW compatibility receipt: runtime, source match, units, zero-address results, transfer/allowance behavior and custody effects. Failed or ambiguous evidence stops the affected integration claim.
2. An explicit experimental decision record for only the rules needed by one public CAW. Preserve production conflicts and mark deviations.
3. An immutable local candidate with current NFT ownership, backed custody, withdrawal, a single signed public action and sufficient public data to reconstruct it.
4. Two independently written reconstructions, followed by an outside operator's reproduction without the original frontend, cache or relay.
5. A concrete license and review decision before broader redistribution or a separately authorized public-chain test.

[Protocol v0 scope](PROTOCOL_V0_SCOPE.md) defines these gates. The subsequent [alpha.16 token experiment](CAW_TOKEN_COMPATIBILITY.md) records actual read-only observations and a zero-address rejection; it does not complete the custody or source-match gates. Xubu subsequently approved the scoped code-only MIT license. No production source conflict is resolved.
