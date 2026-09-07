# Gilgamesh CAW: reference feature map

Review date: 7 September 2026. **Reference only. Our build remains governed by the pinned manifesto and its explicit decisions.** No upstream code was executed or copied into the app. No repository, issue, pull request or deployment was created. Any later contribution must target the relevant **cawdevelopment** repository, never GilgameshCaw/Caw.

## What this establishes

The reference contains substantial implementation work: public conversation flows, search, bookmarks, notifications, scheduling, session delegation, custom encrypted messaging and a username marketplace with recovery paths. It also contains old plans, changed economics and features beyond the initial manifesto. A feature existing in source does not establish that it is deployed, working end to end, secure or manifesto-compliant.

| Reference | Pinned commit | Scope |
|---|---|---|
| master (default) | [e2074718bcea293726ddfcf8764e1499e7b9217c](https://github.com/GilgameshCaw/Caw/tree/e2074718bcea293726ddfcf8764e1499e7b9217c) | Complete tree enumerated; all documentation blobs acquired; selected implementation surfaces reviewed. |
| v2 | [518b4bf1598775b677e1d22888b587892bfb812b](https://github.com/GilgameshCaw/Caw/tree/518b4bf1598775b677e1d22888b587892bfb812b) | Complete tree enumerated; all documentation blobs acquired; selected implementation surfaces reviewed. |

Other discovered branch heads: `new` = `8d9beac525d0f611d98c5fd607d11111600d46a2`; `v1` = `f624662952fcd8427a6d211ad588c515dac15693`. Their trees/bodies were not refreshed in this task. Branch heads are source snapshots, not deployment identifiers.

The requirements source is [cawdevelopment/manifesto at 37399aeb](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md). Requirement IDs below refer to the existing [requirements register](../MANIFESTO_REQUIREMENTS.tsv). Source examples and historical instructions are retained as evidence, never as permission to run them.

## Decisions that matter first

- **Unlike/unfollow.** master charges a capped 1,000-CAW baseline; v2 removes that protocol charge but retains session-tip economics. See [G-015](#g-015) and [pinned evidence](https://github.com/GilgameshCaw/Caw/blob/e2074718bcea293726ddfcf8764e1499e7b9217c/solidity/contracts/CawActions.sol#L1244).
- **Extra withdrawal conditions.** v2 adds optional time/KYC gates and sponsor repayment. These are additions to the holding-NFT withdrawal model, not an inherited requirement. See [G-048](#g-048) and [pinned evidence](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMinter.sol#L331).
- **Burn destination.** Both minters use a dead-pattern address; the primary text says 0x0. Neither source code nor this review proves compatibility with the actual CAW token. See [G-008](#g-008) and [pinned evidence](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMinter.sol#L390).
- **Retained authority.** Bounded PathwayExpander ownership is still retained authority. Current source must not be described as proof that every deployed key has been renounced. See [G-003](#g-003) and [pinned evidence](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/PathwayExpander.sol#L138).
- **DM ownership and storage.** Current source caches private keys in localStorage and keeps messages off-chain. Complete transferred-account access and permanent availability remain unproven. See [G-036](#g-036) and [pinned evidence](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/services/DmCryptoService.ts#L44).
- **Initial messaging/media scope.** Group chats and on-chain image64 hosting exceed the initial manifesto boundaries; keep both out of the baseline. See [G-040](#g-040) and [pinned evidence](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/dm-groups.ts#L38).
- **Marketplace credit.** The constructor fixes accepted tokens, there is no marketplace-owner fee mechanism, and source includes refund/escape paths. Some documentation is older than those changes. See [G-054](#g-054) and [pinned evidence](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMarketplace.sol#L18).
- **Rebuild and testing.** The historical-sync reproducer remains explicitly marked not built. No upstream test was run and no live deployment was checked by this review. See [G-064](#g-064) and [pinned evidence](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/PROOF_OF_COMPLIANCE_BACKLOG.md#L114).

The inspected B-001 baseline is deliberately smaller: synthetic feed/account selection, original composer and receipts, integer appendix-scenario accounting, authority epochs/nonces and export/replay. Its documentation records 40 passing local tests. It has no real wallet, token, contract, private messages or independent operators. Browser visual/keyboard testing was blocked in that baseline. UI work being performed concurrently by other contributors is not counted as verified production behavior here.

## Reading the map

- **REQUIRED:** the capability or boundary is in the source requirements; the reference implementation is not automatically accepted.
- **COMPATIBLE_OPTIONAL:** useful if it preserves those boundaries; this is not authorization to integrate it now.
- **CONFLICT:** an observed feature or control departs from the initial baseline and requires an explicit specification change or exclusion.
- **DEFERRED:** unresolved economics, custody, authority, retention, platform or research questions prevent adoption.

`SOURCE_SCOPED` means the cited source passage or function was read, not that the whole component was audited. `DOC_CLAIM`, `PLANNED` and `PATH_AND_DOC_DISCOVERED` must not be advertised as tested behavior. Every feature has `tests_run_by_this_review=false` and `deployed_behavior_verified=false` in the JSON map.

## Authority and scope

<a id="g-001"></a>
### G-001 — Reference provenance and licence

**REQUIRED · SOURCE_AND_DOCS.** master is the default; v2 is a distinct branch. Root repository license metadata is null and no root LICENSE was discovered; an MIT licence exists under the SP1 subpackage.

**Our position:** Use for ideas and evidence only. No code reuse without an applicable licence review. Future contributions target the relevant cawdevelopment repository, never this reference repository.

**Demo:** Original local fixture code; no upstream code copied into the app.

Requirements: M-003, M-004, M-049. Evidence: [v2: README.md:1](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/README.md#L1); [master: solidity/zk/sig-recovery/LICENSE-MIT:1](https://github.com/GilgameshCaw/Caw/blob/e2074718bcea293726ddfcf8764e1499e7b9217c/solidity/zk/sig-recovery/LICENSE-MIT#L1).

<a id="g-002"></a>
### G-002 — Community review and no official entitlement

**REQUIRED · DOC_CLAIM.** The repository offers a protocol and public review-related documentation. Its self-audit descriptions are authors' claims, not an independent audit performed here.

**Our position:** Publish reviewable candidate source through the authorized project only; distinguish tests, same-team review, independent review and community acceptance.

**Demo:** Local specification and 40-test baseline; independent review and community acceptance not achieved.

Requirements: M-002, M-003, M-004, M-049, R2-005. Evidence: [v2: docs/PROOF_OF_COMPLIANCE_BACKLOG.md:3](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/PROOF_OF_COMPLIANCE_BACKLOG.md#L3); [v2: docs/SECURITY_AUDIT_OPTIONS.md:1](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/SECURITY_AUDIT_OPTIONS.md#L1).

<a id="g-003"></a>
### G-003 — Renunciation, constrained expansion and configuration

**CONFLICT · SOURCE_AND_DOCS.** Both branches retain an Ownable PathwayExpander source. master exposes addPeer/addPeers; v2 additionally permits new pathway configuration, bounded DVN additions and new KYC slots. Documentation describes eventual full renunciation but elsewhere celebrates a retained key.

**Our position:** A constrained key is still a retained key. Do not inherit it as compliant by default; resolve final authority and verify actual owner, delegate, peers and configuration receipts before production.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-001, M-005, R2-007. Evidence: [v2: solidity/contracts/PathwayExpander.sol:138](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/PathwayExpander.sol#L138); [master: solidity/contracts/PathwayExpander.sol:63](https://github.com/GilgameshCaw/Caw/blob/e2074718bcea293726ddfcf8764e1499e7b9217c/solidity/contracts/PathwayExpander.sol#L63); [v2: docs/WHITEPAPER.md:964](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/WHITEPAPER.md#L964); [v2: docs/PROOF_OF_COMPLIANCE_BACKLOG.md:47](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/PROOF_OF_COMPLIANCE_BACKLOG.md#L47).

<a id="g-004"></a>
### G-004 — Protocol versus frontend moderation

**REQUIRED · SOURCE_AND_DOCS.** Reference APIs contain frontend hide/unhide, reports, moderator roles and audit records; this is a different control plane from contract message storage.

**Our position:** Adopt clear local display policy and portable access; never infer that an admin's frontend action deletes protocol data. Cross-operator censorship resistance needs a real demonstration.

**Demo:** Operator A/B fixture views demonstrate an explicit local policy choice; no live operator independence.

Requirements: M-023, M-024, M-026, M-027. Evidence: [v2: client/src/api/routes/moderation.ts:26](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/moderation.ts#L26); [v2: client/src/api/routes/reports.ts:12](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/reports.ts#L12); [v2: docs/DESIGN_RATIONALE.md:93](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/DESIGN_RATIONALE.md#L93).

<a id="g-005"></a>
### G-005 — Frontend admin bootstrap and role transfer

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** API admin/moderator access uses authorized profile IDs plus DB roles or ADMIN_TOKEN_IDS. v2 includes a warning-only guard for stale IDs after redeployment; that guard expressly does not change authorization.

**Our position:** A future operator console must bind roles to an explicit deployment and current ownership policy. Do not import token-ID bootstrap authority or claim the warning is enforcement.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-024, M-026, M-027. Evidence: [v2: client/src/api/middleware/auth.ts:131](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/middleware/auth.ts#L131); [v2: client/src/utils/adminTokenIdGuard.ts:13](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/utils/adminTokenIdGuard.ts#L13).

## Identity and custody

<a id="g-006"></a>
### G-006 — Username NFT and validation

**REQUIRED · SOURCE_SCOPED.** Minter source validates lowercase ASCII letters/digits and assigns IDs; CawProfile contains NFT ownership and transfer logic. v2 supports self-funded, sponsored and swap-assisted mint entrypoints.

**Our position:** Independently implement the agreed grammar and uniqueness rules; verify collisions, ownership and deployed token behavior before minting.

**Demo:** Synthetic account identifiers and name-cost illustration only; no NFT mint.

Requirements: M-008, M-009, M-010, M-012. Evidence: [v2: solidity/contracts/CawProfileMinter.sol:396](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMinter.sol#L396); [v2: solidity/contracts/CawProfile.sol:27](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfile.sol#L27).

<a id="g-007"></a>
### G-007 — Eight username burn tiers

**REQUIRED · SOURCE_SCOPED.** costOfName exists in both branches and encodes length-based CAW prices.

**Our position:** Treat the manifesto amounts as historical recommendations until community decision; use integer units and independently verify token decimals.

**Demo:** Synthetic tier display; no burn or token verification.

Requirements: M-009, M-034, M-035, M-036, M-037, M-038, M-039, M-040, M-041. Evidence: [v2: solidity/contracts/CawProfileMinter.sol:860](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMinter.sol#L860); [master: solidity/contracts/CawProfileMinter.sol:537](https://github.com/GilgameshCaw/Caw/blob/e2074718bcea293726ddfcf8764e1499e7b9217c/solidity/contracts/CawProfileMinter.sol#L537).

<a id="g-008"></a>
### G-008 — Burn destination and token compatibility

**CONFLICT · SOURCE_SCOPED.** Both minters transfer CAW to 0xdEAD000000000000000042069420694206942069. The pinned manifesto says 0x0. Source alone does not establish totalSupply reduction or actual token acceptance.

**Our position:** Resolve the literal destination mismatch openly; inspect actual CAW bytecode/decimals/transfer behavior before any real burn design.

**Demo:** No token handling; compatibility remains blocked.

Requirements: M-008. Evidence: [v2: solidity/contracts/CawProfileMinter.sol:390](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMinter.sol#L390); [master: solidity/contracts/CawProfileMinter.sol:108](https://github.com/GilgameshCaw/Caw/blob/e2074718bcea293726ddfcf8764e1499e7b9217c/solidity/contracts/CawProfileMinter.sol#L108).

<a id="g-009"></a>
### G-009 — Multiple profiles and transferable account authority

**REQUIRED · SOURCE_AND_DOCS.** Frontend routes expose profile/address views; ledger ownership updates invalidate previous wallet-scoped and token-scoped sessions on receipt of the transfer update.

**Our position:** Specify L1/L2 ordering, stale owner caches, simultaneous actions and account selection. Ownership checks from an indexed DB are not fresh on-chain reads.

**Demo:** Synthetic profile switch and control epoch changes; no wallet signatures.

Requirements: M-011, M-014. Evidence: [v2: solidity/contracts/CawProfileLedger.sol:681](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileLedger.sol#L681); [v2: client/src/api/middleware/auth.ts:354](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/middleware/auth.ts#L354); [v2: client/src/services/FrontEnd/src/routes.tsx:138](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/routes.tsx#L138).

<a id="g-010"></a>
### G-010 — Deposit, withdraw and per-profile ledger

**REQUIRED · SOURCE_SCOPED.** Reference contracts provide deposit and withdrawal paths with a profile-keyed ledger, L1/L2 messages, sponsor obligations and network fee parameters.

**Our position:** Verify custody backing, exact authorization, withdrawal liveness, replay and chain failures. Our fixture does not satisfy deposit/withdraw requirements.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-011, M-013, M-018. Evidence: [v2: solidity/contracts/CawProfileLedger.sol:1070](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileLedger.sol#L1070); [v2: solidity/contracts/CawProfile.sol:739](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfile.sol#L739).

<a id="g-011"></a>
### G-011 — NFT metadata and profile cards

**COMPATIBLE_OPTIONAL · PATH_AND_DOC_DISCOVERED.** CawProfileURI and font-data contracts plus profile/card UI paths exist; full rendering and bytecode size behavior were not reviewed.

**Our position:** Original, accessible profile presentation can be added later. Avoid copying assets and do not equate a card image with verified ownership.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-012, M-028. Evidence: [v2: docs/V1_TO_V2_CHANGES.md:375](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/V1_TO_V2_CHANGES.md#L375); [v2: docs/MARKETPLACE.md:5](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/MARKETPLACE.md#L5).

## Economics and settlement

<a id="g-012"></a>
### G-012 — Post, like, reCAW and follow allocations

**REQUIRED · SOURCE_SCOPED.** Both CawActions implementations use 5000/2000/4000/30000 baselines and appendix-style pool/recipient splits, subject to their cost cap. This selects the appendix reading rather than resolving the prose disagreement.

**Our position:** Keep the selected scenario named and retain the original textual ambiguity. Adopt production splits only after specification agreement.

**Demo:** Implemented synthetic appendix scenario with separate literal reference-accounting tests.

Requirements: M-015, M-016, M-017, M-032, M-042, M-043, M-044, M-045. Evidence: [v2: solidity/contracts/CawActions.sol:1310](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawActions.sol#L1310); [master: solidity/contracts/CawActions.sol:1204](https://github.com/GilgameshCaw/Caw/blob/e2074718bcea293726ddfcf8764e1499e7b9217c/solidity/contracts/CawActions.sol#L1204).

<a id="g-013"></a>
### G-013 — Stake definition, payer exclusion and thin-pool fallback

**DEFERRED · SOURCE_SCOPED.** v2 ledger excludes the spender from the denominator and refunds the distribution amount to the spender when the other-holder balance is too small. Documentation describes balances on L2 as stake.

**Our position:** This differs from our zero-eligible-pool rejection and fixed synthetic weights. Decide stake measurement, no/low-pool behavior, precision and remainders; do not copy a fallback silently.

**Demo:** Fixed synthetic weights, payer exclusion, explicit dust reserve and zero-eligible-pool rejection only.

Requirements: M-015, M-033. Evidence: [v2: solidity/contracts/CawProfileLedger.sol:388](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileLedger.sol#L388); [v2: docs/WHITEPAPER.md:525](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/WHITEPAPER.md#L525).

<a id="g-014"></a>
### G-014 — ETH-denominated action cost cap and TWAP

**DEFERRED · SOURCE_SCOPED.** Both branches contain an oracle-backed minimum of baseline CAW and an ETH cap; v2 also contains bootstrap cap state. This is an economic rule beyond the literal fixed schedule.

**Our position:** Record a protocol decision and oracle failure assumptions. Historical dollar figures and claimed manipulation resistance are not current financial evidence.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-030, M-031, M-033. Evidence: [v2: solidity/contracts/CawActions.sol:1267](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawActions.sol#L1267); [v2: solidity/contracts/CawActions.sol:181](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawActions.sol#L181); [v2: solidity/contracts/CawCapOracle.sol:30](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawCapOracle.sol#L30); [v2: docs/ACTION_COST_CAP.md:29](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/ACTION_COST_CAP.md#L29).

<a id="g-015"></a>
### G-015 — Unlike and unfollow branch difference

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** master applies _getCost(1000,1e11) and validator payment. v2 has no contract-side undo charge; session implicit validator tips still apply. ACTION_COST_CAP.md and older docs must not be generalized across branches.

**Our position:** If adding undo, disclose settlement semantics and exact costs separately from display removal; never call it free if a tip is required.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-031, M-033. Evidence: [master: solidity/contracts/CawActions.sol:1244](https://github.com/GilgameshCaw/Caw/blob/e2074718bcea293726ddfcf8764e1499e7b9217c/solidity/contracts/CawActions.sol#L1244); [v2: solidity/contracts/CawActions.sol:1350](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawActions.sol#L1350); [v2: docs/ACTION_COST_CAP.md:17](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/ACTION_COST_CAP.md#L17).

<a id="g-016"></a>
### G-016 — Explicit tips and implicit session tips

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** CawActions distributes user-supplied amounts and session perActionTipRate; v2 uses network tip target capped by the session ceiling. Tips are separate from baseline social-action distribution.

**Our position:** Show total debit and recipients before authorization; model fees, cancellations and limits without making validators privileged protocol beneficiaries.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-018, M-033. Evidence: [v2: solidity/contracts/CawActions.sol:1666](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawActions.sol#L1666); [v2: solidity/contracts/CawActions.sol:1705](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawActions.sol#L1705).

<a id="g-017"></a>
### G-017 — Operator fee gates, ceilings and fee locks

**DEFERRED · SOURCE_SCOPED.** Both NetworkManager variants allow per-network mint/auth/deposit/withdraw fees, ceilings that only lower, and optional locks; v2 has additional tip/sponsor configuration. These are network-owner powers, even without a single global owner.

**Our position:** Do not infer no configurable fees from 'no protocol treasury'. Decide whether each charge is allowed by our specification and show all costs.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-005, M-018, M-031, R2-009. Evidence: [v2: solidity/contracts/CawNetworkManager.sol:265](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawNetworkManager.sol#L265); [v2: solidity/contracts/CawNetworkManager.sol:366](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawNetworkManager.sol#L366); [master: solidity/contracts/CawNetworkManager.sol:266](https://github.com/GilgameshCaw/Caw/blob/e2074718bcea293726ddfcf8764e1499e7b9217c/solidity/contracts/CawNetworkManager.sol#L266).

<a id="g-018"></a>
### G-018 — Withdrawal fee lock and buy-and-burn operator split

**DEFERRED · DOC_AND_SOURCE_SCOPED.** Whitepaper describes min(locked,current) withdrawal fee and an operator/burn fee split, with displayed fees doubled relative to a per-recipient parameter. CawProfile fee paths exist; helper execution was not audited here.

**Our position:** Distinguish operator service fees from marketplace royalties and from CAW action distribution. Require conservation, slippage and chain receipts before adopting any fee model.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-013, M-018, M-029. Evidence: [v2: docs/WHITEPAPER.md:633](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/WHITEPAPER.md#L633); [v2: docs/WHITEPAPER.md:639](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/WHITEPAPER.md#L639); [v2: solidity/contracts/CawProfile.sol:434](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfile.sol#L434).

<a id="g-019"></a>
### G-019 — Prices, activity, gas and balance analytics

**COMPATIBLE_OPTIONAL · ROUTES_AND_DOCS.** Routes include wallet activity, stats, prices, validator analytics and gas displays; backlog records price/gas UI fixes. Full price-source freshness and calculations not checked.

**Our position:** Optional read-only analytics must label timestamp, source and assumptions; never imply speculative fiat values are settlement truth.

**Demo:** Synthetic balances and receipts only; no live price feed.

Requirements: M-030, M-033. Evidence: [v2: client/src/services/FrontEnd/src/routes.tsx:126](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/routes.tsx#L126); [v2: PROJECT_BACKLOG.md:540](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/PROJECT_BACKLOG.md#L540).

## Public conversation

<a id="g-020"></a>
### G-020 — Feed, explore and pending lifecycle

**REQUIRED · SOURCE_AND_DOCS.** Reference routes separate home/explore/pending; action API writes optimistic records and transaction queue entries before chain confirmation.

**Our position:** Retain explicit pending/submitted/settled/failed states. Do not call queued or scheduled records final settlement.

**Demo:** Synthetic feed and explicit settlement state transitions implemented.

Requirements: M-006, M-018. Evidence: [v2: client/src/services/FrontEnd/src/routes.tsx:124](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/routes.tsx#L124); [v2: client/src/api/routes/actions.ts:919](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/actions.ts#L919); [v2: docs/ARCHITECTURE.md:42](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/ARCHITECTURE.md#L42).

<a id="g-021"></a>
### G-021 — Replies, quotes and multi-part threads

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** actions API resolves parent pointers, creates reply rows, supports quote reCAWs and a batch endpoint for thread posts. Per-part relationships and optimistic indexing are real source surfaces.

**Our position:** Specify canonical pointers, individual 420-character limits, atomic/partial outcomes and costs per part. Conversation-lane UI work outside this review is not counted as production.

**Demo:** Reply/conversation UI additions are being handled separately; this review records only the prior baseline.

Requirements: M-006, M-007. Evidence: [v2: client/src/api/routes/actions.ts:1190](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/actions.ts#L1190); [v2: client/src/api/routes/actions.ts:1744](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/actions.ts#L1744).

<a id="g-022"></a>
### G-022 — Drafts, composer count and rich text

**COMPATIBLE_OPTIONAL · PATH_AND_DOC_DISCOVERED.** composeDraftStore and compose/formatting components are discoverable. Full draft recovery, normalization and rich-text rendering behavior was not reviewed.

**Our position:** Use safe text rendering, preserve drafts, and agree what a character means. HTML styling cannot bypass message limits.

**Demo:** 420-code-point synthetic validation, plain text rendering and draft fixes in baseline.

Requirements: M-006, M-025. Evidence: [v2: docs/ARCHITECTURE.md:53](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/ARCHITECTURE.md#L53); [v2: PROJECT_BACKLOG.md:350](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/PROJECT_BACKLOG.md#L350).

<a id="g-023"></a>
### G-023 — Bookmarks

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** GET/POST/DELETE bookmarks routes have profile authorization checks; a dedicated page/store and an upstream API test file exist.

**Our position:** Implement as a clearly local or portable preference; define export and privacy scope. Test file presence is not a passed test.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-024, M-025. Evidence: [v2: client/src/api/routes/bookmarks.ts:18](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/bookmarks.ts#L18); [v2: client/tests/api/bookmarks.test.ts:13](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/tests/api/bookmarks.test.ts#L13).

<a id="g-024"></a>
### G-024 — Notifications and grouped actors

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** Notification routes support list, unread count, grouped actor expansion, read and hide; grouping test source exists.

**Our position:** Keep notification permission and delivery optional; authorization, ownership transfer and metadata privacy need full tests.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-024, M-025. Evidence: [v2: client/src/api/routes/notifications.ts:405](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/notifications.ts#L405); [v2: client/tests/services/NotificationService/groupRollup.test.ts:153](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/tests/services/NotificationService/groupRollup.test.ts#L153).

<a id="g-025"></a>
### G-025 — Search, suggestions, hashtags and trends

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** Search supports posts/users/hashtags with Elasticsearch and Prisma fallback, suggestions and trending; sync is admin-gated.

**Our position:** Disclose local indexing/ranking and moderation scope. Avoid implying search exhausts canonical history or that a trend score is protocol truth.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-024, M-025. Evidence: [v2: client/src/api/routes/search.ts:12](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/search.ts#L12); [v2: client/src/api/routes/search.ts:349](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/search.ts#L349); [v2: client/src/api/routes/search.ts:423](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/search.ts#L423).

<a id="g-026"></a>
### G-026 — Profile metadata, pin and unpin

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** Reference processes p:/profile-update: and pi:/xpi: OTHER prefixes into profile and pin records. Contracts treat most OTHER subtypes as off-chain-interpreted no-ops apart from costs/tips.

**Our position:** Specify versioned formats and replay rules before adopting; metadata storage costs in older docs differ from current OTHER behavior.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-011, M-012, M-024. Evidence: [v2: client/src/api/routes/actions.ts:1000](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/actions.ts#L1000); [v2: client/src/api/routes/actions.ts:949](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/actions.ts#L949); [v2: solidity/contracts/CawActions.sol:1340](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawActions.sol#L1340).

<a id="g-027"></a>
### G-027 — Hide/delete semantics and muted content

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** hide:caw/hide:recaw actions affect indexed visibility; block/mute settings and local moderation exist. Persisted calldata cannot be erased through these UI controls.

**Our position:** Use 'hide on this frontend' where appropriate; distinguish local suppression, signed index instructions and immutable source data.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-023, M-026. Evidence: [v2: client/src/api/routes/actions.ts:909](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/actions.ts#L909); [v2: client/src/api/routes/blocks.ts:11](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/blocks.ts#L11); [v2: client/src/api/routes/moderation.ts:68](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/moderation.ts#L68).

<a id="g-028"></a>
### G-028 — Polls, multi-select votes and expiry

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** Action API parses poll markers, optional images, vote/unvote and multi-select changes; frontend poll components exist.

**Our position:** Treat as a social extension, not DAO governance. Define signed option identity, expiry authority, undo and costs before protocol adoption.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-024, M-025. Evidence: [v2: client/src/api/routes/actions.ts:1129](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/actions.ts#L1129); [v2: client/src/api/routes/actions.ts:1604](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/actions.ts#L1604).

<a id="g-029"></a>
### G-029 — Scheduled posts and threads

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** Authenticated scheduling stores pre-signed actions, then a minute worker queues due posts in thread order; a failed earlier chunk causes later chunks to fail. A queued row is marked published before chain settlement.

**Our position:** Optional scheduler liveness is not guaranteed. Revalidate authority/expiry/balance at execution and display queued versus settled correctly.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-018, M-025. Evidence: [v2: client/src/api/routes/scheduled.ts:52](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/scheduled.ts#L52); [v2: client/src/services/ScheduledPostProcessor/index.ts:252](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/ScheduledPostProcessor/index.ts#L252); [v2: client/src/services/ScheduledPostProcessor/index.ts:315](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/ScheduledPostProcessor/index.ts#L315).

<a id="g-030"></a>
### G-030 — Scheduled edit integrity

**DEFERRED · SOURCE_SCOPED.** PUT scheduled/:id updates visible content/time/image fields, but does not replace signedAction. The worker reads signedAction.data.text for publication.

**Our position:** Any edited signed content needs a fresh authorized signature. Add a regression comparing edited display text with executed bytes; no live exploit was attempted.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-006, M-018. Evidence: [v2: client/src/api/routes/scheduled.ts:167](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/scheduled.ts#L167); [v2: client/src/services/ScheduledPostProcessor/index.ts:101](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/ScheduledPostProcessor/index.ts#L101).

## Media and presentation

<a id="g-031"></a>
### G-031 — Frontend-hosted media and previews

**REQUIRED · DOC_AND_ROUTE_DISCOVERED.** Image/media upload, GIF picker, URL metadata, image thumbnails and previews are documented or discoverable source paths. Current storage durability and media validators not fully audited.

**Our position:** Keep hosting/filtering a frontend responsibility; use bounded uploads and explicit retention. Original app assets only, with metadata privacy checks.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-046, M-047, M-048. Evidence: [v2: docs/IMAGE_UPLOAD_SYSTEM.md:9](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/IMAGE_UPLOAD_SYSTEM.md#L9); [v2: client/src/api/routes/shorturl.ts:127](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/shorturl.ts#L127).

<a id="g-032"></a>
### G-032 — On-chain image64 payloads

**CONFLICT · DOC_AND_SOURCE_SCOPED.** Image docs explicitly advertise base64 images inside OTHER calldata. This is different from the manifesto's stated no protocol involvement in image hosting.

**Our position:** Exclude from our baseline unless the community explicitly changes the media boundary. Do not inherit it because the reference supports it.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-046. Evidence: [v2: docs/IMAGE_UPLOAD_SYSTEM.md:16](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/IMAGE_UPLOAD_SYSTEM.md#L16); [v2: docs/OTHER_ACTION_TYPES.md:50](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/OTHER_ACTION_TYPES.md#L50).

<a id="g-033"></a>
### G-033 — URL shortening, social previews and canonical pages

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** Short URL API creates single/bulk records and fetches metadata; routes include canonical username/caw paths and older aliases. SEO and share-card paths are present.

**Our position:** User-visible previews need explicit external fetch policy, SSRF/DNS-redirect review, availability and content safety; a short URL is a dependency, not permanent data.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-047, M-048. Evidence: [v2: client/src/api/routes/shorturl.ts:84](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/shorturl.ts#L84); [v2: client/src/api/routes/shorturl.ts:294](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/shorturl.ts#L294); [v2: client/src/services/FrontEnd/src/routes.tsx:143](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/routes.tsx#L143).

<a id="g-034"></a>
### G-034 — Language, responsiveness and accessibility

**COMPATIBLE_OPTIONAL · DOC_AND_PATH_DISCOVERED.** Language settings/localized routes and translation resources exist. Backlog says 19 locale translations while recording input, RTL, pre-auth language access and device coverage gaps.

**Our position:** Professional accessible UI is compatible; translations alone are not accessibility proof. Require browser, keyboard, contrast, zoom and language input verification.

**Demo:** Original responsive CSS, focus/skip fixes and safe text; browser visual/keyboard checks remain unexecuted in inspected baseline.

Requirements: M-025. Evidence: [v2: client/src/services/FrontEnd/src/routes.tsx:155](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/routes.tsx#L155); [v2: PROJECT_BACKLOG.md:369](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/PROJECT_BACKLOG.md#L369); [v2: docs/UI_CONSISTENCY_STANDARD.md:1](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/UI_CONSISTENCY_STANDARD.md#L1).

## Direct messages

<a id="g-035"></a>
### G-035 — Pairwise encrypted DMs and sender identity

**REQUIRED · SOURCE_SCOPED.** Current custom DM service registers keys and serves ciphertext; client uses secp256k1 ECDH/AES-GCM. v2 includes versioned KDF and signed sender envelopes. Old XMTP materials describe a different stage.

**Our position:** Do not copy cryptography. Require a separately reviewed protocol, peer identity binding, transfer semantics and known-answer/interoperability tests.

**Demo:** DM controls unavailable; no private messaging implemented.

Requirements: M-011, M-019. Evidence: [v2: client/src/services/FrontEnd/src/services/DmCryptoService.ts:78](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/services/DmCryptoService.ts#L78); [v2: client/src/services/FrontEnd/src/services/DmCryptoService.ts:288](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/services/DmCryptoService.ts#L288); [v2: client/src/api/routes/dm.ts:390](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/dm.ts#L390).

<a id="g-036"></a>
### G-036 — DM key storage and transfer-history gap

**DEFERRED · SOURCE_SCOPED.** Both branches persist DM private-key material in localStorage; v2 explicitly preserves it across reconnects. A new owner proving NFT ownership does not by itself derive the former owner's wallet-signature key.

**Our position:** Resolve account-transfer access to old DMs, prior-owner retention, key rotations and compromised-client recovery before release. No confidentiality or transfer-history guarantee established.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-011, M-019. Evidence: [v2: client/src/services/FrontEnd/src/services/DmCryptoService.ts:44](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/services/DmCryptoService.ts#L44); [v2: client/src/services/FrontEnd/src/services/DmCryptoService.ts:223](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/services/DmCryptoService.ts#L223); [v2: client/docs/XMTP_TOKEN_MESSAGING_PLAN.md:11](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/docs/XMTP_TOKEN_MESSAGING_PLAN.md#L11).

<a id="g-037"></a>
### G-037 — DM requests, privacy gates and shadow blocking

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** DM API includes request acceptance, follower/following privacy, rate limits and shadow-blocked messages visible only to their sender. Metadata remains server-visible.

**Our position:** Any local recipient control must be explicit and distinct from protocol censorship. Review literal follower-direction semantics and avoid misleading delivery receipts.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-019, M-023, M-026. Evidence: [v2: client/src/api/routes/dm.ts:362](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/dm.ts#L362); [v2: client/src/api/routes/dm.ts:491](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/dm.ts#L491); [v2: client/src/services/DmService/index.ts:225](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/DmService/index.ts#L225).

<a id="g-038"></a>
### G-038 — DM edits, hide/delete, reactions, files and presence

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** Routes provide edit/delete/hide/reactions/read; crypto file helpers seal per-file keys to recipients; websocket typing/read and notification hooks are documented or discovered.

**Our position:** Deletion needs a precise local/relay history definition. Attachment retention, recipient membership and metadata privacy require separate verification.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-019, M-022. Evidence: [v2: client/src/api/routes/dm.ts:687](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/dm.ts#L687); [v2: client/src/services/FrontEnd/src/services/DmCryptoService.ts:517](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/services/DmCryptoService.ts#L517); [v2: docs/DIRECT_MESSAGING.md:27](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/DIRECT_MESSAGING.md#L27).

<a id="g-039"></a>
### G-039 — DM relay fan-out and off-chain retention

**DEFERRED · SOURCE_AND_DOCS.** DmRelay source exists and docs describe signed best-effort fan-out; whitepaper explicitly says encrypted DMs cannot be recovered from chain after loss of copies.

**Our position:** Permanent/trustless data requirements remain unsatisfied by a best-effort relay claim. Define retention, recoverability, encrypted export and availability proofs.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-019, M-022, M-027. Evidence: [v2: client/src/api/routes/dm-relay.ts:74](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/dm-relay.ts#L74); [v2: docs/WHITEPAPER.md:920](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/WHITEPAPER.md#L920).

<a id="g-040"></a>
### G-040 — Group chats, invites and membership

**CONFLICT · SOURCE_SCOPED.** Group creation/member/invite endpoints, group service and per-recipient ciphertext functions are present in the reference.

**Our position:** Exclude from initial scope: the manifesto explicitly does not recommend group chats at this stage. A later extension needs agreed scope and crypto review.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-020. Evidence: [v2: client/src/api/routes/dm-groups.ts:38](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/dm-groups.ts#L38); [v2: client/src/services/FrontEnd/src/services/DmCryptoService.ts:357](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/services/DmCryptoService.ts#L357).

<a id="g-041"></a>
### G-041 — Historical XMTP implementation documents

**DEFERRED · HISTORICAL_DOC.** SECURITY_NOTICE_E2EE, XMTP test results and multi-identity plans remain in the tree while current source uses custom DmService/DmCryptoService.

**Our position:** Preserve history but do not claim all XMTP features/tests apply to current DMs. Reconcile version-specific claims before external communications.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-011, M-019. Evidence: [v2: client/SECURITY_NOTICE_E2EE.md:20](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/SECURITY_NOTICE_E2EE.md#L20); [v2: client/XMTP_TEST_RESULTS.md:1](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/XMTP_TEST_RESULTS.md#L1); [v2: client/docs/XMTP_MULTI_IDENTITY_SPEC.md:1](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/docs/XMTP_MULTI_IDENTITY_SPEC.md#L1).

## Signing and recovery

<a id="g-042"></a>
### G-042 — Wallet login and server session cookies

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** auth routes and middleware use wallet-session authorization, secure-cookie options plus legacy header migration; ownership rechecks read the indexed user address.

**Our position:** Bind chain/deployment/domain and avoid stale cached authority. An HTTP session is not an on-chain action signature or proof of present NFT ownership.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-011, M-018. Evidence: [v2: client/src/api/middleware/auth.ts:70](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/middleware/auth.ts#L70); [v2: client/src/api/middleware/auth.ts:241](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/middleware/auth.ts#L241); [v2: client/src/api/routes/auth.ts:62](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/auth.ts#L62).

<a id="g-043"></a>
### G-043 — Quick Sign scopes, expiry, revocation and spend

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** Both branches implement session registration/revocation, action scope and cumulative spend. Token-scoped sessions and transfer epochs appear in source; selected Foundry tests are present but unrun.

**Our position:** Session scope must be clear and revocable, with transfer/order/replay tests. Zero spendLimit means unlimited; a nominal maximum constant does not bound that path.

**Demo:** Synthetic authority epochs/nonces; no real delegation or key storage.

Requirements: M-018, M-025. Evidence: [v2: solidity/contracts/CawProfileLedger.sol:733](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileLedger.sol#L733); [v2: solidity/contracts/CawProfileLedger.sol:731](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileLedger.sol#L731); [v2: solidity/contracts/CawActions.sol:1377](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawActions.sol#L1377); [v2: solidity/test-foundry/SessionProfileScoping.t.sol:27](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/test-foundry/SessionProfileScoping.t.sol#L27).

<a id="g-044"></a>
### G-044 — Session keys at rest and PRF unlock

**DEFERRED · SOURCE_SCOPED.** Reference supports plaintext or encrypted session key storage; v2 adds passkey-related PRF helpers and expanded wallet-based encryption flows.

**Our position:** Do not adopt plaintext spend keys as a default. Review key wrapping, domain binding, recovery, cross-tab leakage, device compromise and unlimited-authority UX.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-025. Evidence: [v2: client/src/services/FrontEnd/src/store/sessionKeyStore.ts:6](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/store/sessionKeyStore.ts#L6); [v2: client/src/services/FrontEnd/src/services/sessionKeyEncryption.ts:73](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/services/sessionKeyEncryption.ts#L73); [v2: client/src/services/FrontEnd/src/services/identity/sessionPrf.ts:30](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/services/identity/sessionPrf.ts#L30).

<a id="g-045"></a>
### G-045 — SmartEOA, WebAuthn and ERC-1271

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** SmartEOA and an ERC-1271 action sibling exist on both branches; v2 adds extensive browser passkey onboarding and recovery APIs. Documentation records an L1-only delegation gap for root-signed L2 actions.

**Our position:** Treat user wallet delegation separately from forbidden protocol upgrade privileges. Verify each chain's delegation, recovery authority, signing display and device support before adoption.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-011, M-018, M-025. Evidence: [v2: solidity/contracts/SmartEOA.sol:29](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/SmartEOA.sol#L29); [v2: solidity/contracts/CawActionsERC1271.sol:8](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawActionsERC1271.sol#L8); [v2: docs/POPB_L2_DELEGATION_GAP.md:40](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/POPB_L2_DELEGATION_GAP.md#L40).

<a id="g-046"></a>
### G-046 — Encrypted backup blobs and browser recovery

**DEFERRED · SOURCE_SCOPED.** v2 wallet-blob route and identity/passkey source implement a browser recovery surface; native docs describe password-protected backup and passkey PRF fallback. These APIs are absent at the same paths on master.

**Our position:** Design and review recovery before real custody. A server ciphertext backup still has availability, account-linkage and offline-password-guessing risks.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-011, M-025. Evidence: [v2: client/src/api/routes/wallet-blob.ts:72](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/wallet-blob.ts#L72); [v2: client/src/services/FrontEnd/src/services/identity/passkey.ts:42](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/services/identity/passkey.ts#L42); [v2: native/docs/BROWSER_WALLET.md:61](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/native/docs/BROWSER_WALLET.md#L61).

<a id="g-047"></a>
### G-047 — Sponsored and card-funded onboarding

**DEFERRED · SOURCE_AND_DOCS.** v2 adds sponsor API/permit fields, ETH/CAW funding flows, signup routes and optional Stripe/onramp integration. Source presence does not verify third-party availability or legal framing.

**Our position:** No card, wallet or payment integration in current authorization. Define consent, payer, fees, obligations and external-service permissions before considering.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-008, M-013, M-018, R2-009. Evidence: [v2: client/src/api/routes/sponsor.ts:285](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/sponsor.ts#L285); [v2: docs/CARD_PROFILE_AND_KYC_PLAN.md:3](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/CARD_PROFILE_AND_KYC_PLAN.md#L3); [v2: client/src/services/FrontEnd/src/routes.tsx:194](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/routes.tsx#L194).

<a id="g-048"></a>
### G-048 — Optional KYC or 180-day withdrawal gates

**CONFLICT · SOURCE_SCOPED.** v2 minter level0 is ungated; level1 waits180 days; level2+ requires a configured verifier with no time fallback. These exact gates are not in master minter. Earlier card/withdraw docs give different level meanings.

**Our position:** The pinned text grants holding-NFT withdrawal authority; extra withdrawal conditions require an explicit deviation decision. The primary manifesto does not literally contain the phrase 'No KYC'; do not invent that quote or adopt legal claims.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-011, M-013, M-023. Evidence: [v2: solidity/contracts/CawProfileMinter.sol:331](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMinter.sol#L331); [v2: docs/WHITEPAPER.md:470](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/WHITEPAPER.md#L470); [v2: docs/CARD_PROFILE_AND_KYC_PLAN.md:196](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/CARD_PROFILE_AND_KYC_PLAN.md#L196).

<a id="g-049"></a>
### G-049 — Sponsor repayment and forgiveness

**DEFERRED · SOURCE_SCOPED.** v2 can attach a repayment obligation capped at twice the deposit, sweep withdrawals to a sponsor profile, and permit that sponsor's owner to forgive it. It is separate from KYC/time gating.

**Our position:** Do not silently replace a user's unconstrained account with debt-like routing. Review explicit consent, transfer behavior, economics and authorization before any extension.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-013, R2-009. Evidence: [v2: solidity/contracts/CawProfileMinter.sol:633](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMinter.sol#L633); [v2: solidity/contracts/CawProfileLedger.sol:571](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileLedger.sol#L571); [v2: solidity/contracts/CawProfileLedger.sol:595](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileLedger.sol#L595).

## Username marketplace

<a id="g-050"></a>
### G-050 — Fixed-price and Dutch sales

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** Both branches implement fixed and Dutch listings, ETH/ERC20 payment and NFT transfer+sync. Payment-token allowlist is fixed in the constructor; docs saying owner-configured are stale.

**Our position:** Feeless marketplace is recommended, not initial baseline custody work. Prove approvals, price bounds, transfer and refund behavior separately.

**Demo:** No market execution; future original presentation only.

Requirements: M-028, M-029. Evidence: [v2: solidity/contracts/CawProfileMarketplace.sol:148](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMarketplace.sol#L148); [v2: solidity/contracts/CawProfileMarketplace.sol:235](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMarketplace.sol#L235); [v2: solidity/contracts/CawProfileMarketplace.sol:123](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMarketplace.sol#L123).

<a id="g-051"></a>
### G-051 — English auctions, increments and anti-sniping

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** Auction source has bidding, minimum-increment checks, anti-sniping timing and settle paths.

**Our position:** Optional extension needs auction invariants, timestamp bounds, race handling and explicit transaction costs.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-028. Evidence: [v2: solidity/contracts/CawProfileMarketplace.sol:301](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMarketplace.sol#L301); [v2: solidity/contracts/CawProfileMarketplace.sol:380](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMarketplace.sol#L380); [v2: docs/MARKETPLACE.md:35](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/MARKETPLACE.md#L35).

<a id="g-052"></a>
### G-052 — Unlisted offers and escrow cancellation

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** Both variants include ETH/ERC20 offers, acceptance and cancellation; v2 exposes recipient-directed refund paths and sync destination choices.

**Our position:** Verify offer expiry, NFT ownership changes, stale listings, token behavior and accessible refund recovery.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-028. Evidence: [v2: solidity/contracts/CawProfileMarketplace.sol:544](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMarketplace.sol#L544); [v2: solidity/contracts/CawProfileMarketplace.sol:680](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMarketplace.sol#L680).

<a id="g-053"></a>
### G-053 — Cancellation, refunds and default escape

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** Seller can cancel an English auction with a live bid and credit pendingReturns; outbid withdrawals, seller proceeds and a 7-day default escape exist. v2 adds ERC20 payout credits for default recovery.

**Our position:** Docs saying cancellation needs no bids are stale. Distinguish a credited refund from a completed transfer; test reverting/blocklisted recipients and pull-to-another-address paths.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-028. Evidence: [v2: solidity/contracts/CawProfileMarketplace.sol:200](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMarketplace.sol#L200); [v2: solidity/contracts/CawProfileMarketplace.sol:732](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMarketplace.sol#L732); [v2: solidity/test-foundry/MarketplacePullPattern.t.sol:5](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/test-foundry/MarketplacePullPattern.t.sol#L5).

<a id="g-054"></a>
### G-054 — Market fees, royalties and cross-chain sync costs

**REQUIRED · SOURCE_SCOPED.** Marketplace source itself has no admin or fee mechanism and construction fixes accepted tokens. Sales send excess ETH/LZ fees to transferAndSync. Zero marketplace percentage does not mean zero gas or bridge expense.

**Our position:** Preserve the no-private-royalty rule; verify NFT royalty interfaces, external-market settings and exact total cost in any production design.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-028, M-029. Evidence: [v2: solidity/contracts/CawProfileMarketplace.sol:18](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMarketplace.sol#L18); [v2: solidity/contracts/CawProfileMarketplace.sol:254](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawProfileMarketplace.sol#L254).

<a id="g-055"></a>
### G-055 — Listings, history, owned profiles and offers UI

**COMPATIBLE_OPTIONAL · SOURCE_AND_DOCS.** Marketplace docs list sale/recent/my-profiles/my-offers surfaces; a dedicated indexer tracks market events and expiration/ownership changes.

**Our position:** Read views can be useful later, but stale index data must not determine transaction authority. Separate preview from live offer creation.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-028. Evidence: [v2: docs/MARKETPLACE.md:5](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/MARKETPLACE.md#L5); [v2: client/src/services/MarketplaceIndexerService/index.ts:62](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/MarketplaceIndexerService/index.ts#L62); [v2: client/src/api/routes/marketplace.ts:18](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/marketplace.ts#L18).

## Data and networks

<a id="g-056"></a>
### G-056 — Calldata event storage and indexing

**REQUIRED · SOURCE_AND_DOCS.** CawActions maintains action commitments/checkpoints; docs describe RawEventsGatherer/ActionProcessor/count/index services reconstructing public records from events and calldata.

**Our position:** A proof of a commitment is not proof that historical bytes remain available. Specify encoding, reorg behavior, anchors, independent retrieval and fresh-node rebuild tests.

**Demo:** Deterministic replay of two local exports only; no chain history or independent availability proof.

Requirements: M-007, M-012, M-022. Evidence: [v2: solidity/contracts/CawActions.sol:1427](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawActions.sol#L1427); [v2: docs/WHITEPAPER.md:916](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/WHITEPAPER.md#L916); [v2: docs/DATA_FLOW.md:1](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/DATA_FLOW.md#L1).

<a id="g-057"></a>
### G-057 — Optimistic archive, challenge and slashing

**COMPATIBLE_OPTIONAL · SOURCE_SCOPED.** Archive contract and docs describe staked replication, optimistic submissions, challenge window, incoherent-root and fraudulent-leaf modes, slashing and pending backpressure.

**Our position:** Do not adopt from claims alone; require independent watchers, challenge economics, data retrieval, LZ failure and fresh-state evidence. Upstream corruption/fraud scripts were not run.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-022, M-027. Evidence: [v2: solidity/contracts/CawActionsArchive.sol:35](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawActionsArchive.sol#L35); [v2: docs/REPLICATION_AND_SLASHING.md:114](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/REPLICATION_AND_SLASHING.md#L114); [v2: docs/REPLICATION_AND_SLASHING.md:315](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/REPLICATION_AND_SLASHING.md#L315).

<a id="g-058"></a>
### G-058 — Multiple networks versus mirrors

**COMPATIBLE_OPTIONAL · SOURCE_AND_DOCS.** Reference distinguishes separate network social spaces from mirrors of the same network; NetworkManager registers instances/fee rules while frontend fan-out and local caches are described.

**Our position:** Our operator comparison must state whether both readers share one history. Validate portability without default-operator credentials or hidden network lock-in.

**Demo:** Two readers of one synthetic event log; not two independent deployed networks.

Requirements: M-007, M-024, M-027. Evidence: [v2: docs/WHITEPAPER.md:819](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/WHITEPAPER.md#L819); [v2: docs/WHITEPAPER.md:827](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/WHITEPAPER.md#L827); [v2: solidity/contracts/CawNetworkManager.sol:162](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawNetworkManager.sol#L162).

<a id="g-059"></a>
### G-059 — Mesh failover and relay routing

**COMPATIBLE_OPTIONAL · DOC_AND_SOURCE_SCOPED.** Old mesh doc describes relay phases, reputation and future routing. Newer whitepaper specifies browser-initiated fan-out and forbids server-to-server action fan-out; DM gossip is a separate path.

**Our position:** Distinguish implemented pathways from proposed reputation/AI routing. Demonstrate liveness under mirror outage and verify replay/idempotence across peers.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-018, M-024, M-027. Evidence: [v2: docs/VALIDATOR_MESH_NETWORK.md:11](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/VALIDATOR_MESH_NETWORK.md#L11); [v2: docs/WHITEPAPER.md:889](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/WHITEPAPER.md#L889); [v2: PROJECT_BACKLOG.md:590](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/PROJECT_BACKLOG.md#L590).

<a id="g-060"></a>
### G-060 — Additional storage chains and Solana

**DEFERRED · PLANNED.** MULTI_CHAIN_STORAGE documents storage/replication axes and runtime/CLI work to add chains. SOLANA_OPTION is explicitly a future option, not a shipped implementation.

**Our position:** Do not select a chain from branding or cost estimates. Evaluate actual permanence, security, authority, exit and resource costs before adopting any venue.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-021, M-022. Evidence: [v2: docs/MULTI_CHAIN_STORAGE.md:44](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/MULTI_CHAIN_STORAGE.md#L44); [v2: docs/SOLANA_OPTION.md:1](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/SOLANA_OPTION.md#L1).

<a id="g-061"></a>
### G-061 — Cross-chain fees, message wiring and deployment state

**DEFERRED · SOURCE_AND_DOCS.** Current sources use LayerZero peers/configuration and source-scoped guards. Deploy-state claims and network addresses in docs are not freshly verified chain receipts.

**Our position:** Require bytecode-to-source correspondence, exact ownership, endpoint delegate, DVN/library configuration, custody per peer and failed-message recovery before live use.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-001, M-005, M-013, M-022. Evidence: [v2: solidity/contracts/PathwayExpander.sol:207](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/PathwayExpander.sol#L207); [v2: docs/PROOF_OF_COMPLIANCE_BACKLOG.md:75](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/PROOF_OF_COMPLIANCE_BACKLOG.md#L75); [v2: docs/PROOF_OF_COMPLIANCE_BACKLOG.md:95](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/PROOF_OF_COMPLIANCE_BACKLOG.md#L95).

<a id="g-062"></a>
### G-062 — ZK signature path and prover resource costs

**COMPATIBLE_OPTIONAL · SOURCE_AND_DOCS.** An SP1/Groth16 signature-recovery route, verifier commitments and differential test files exist. Current ValidatorService still says the proof producer is not wired; enabled flag alone does not create proofs. Docs claim large RAM/SRS costs and testnet verifier receipts.

**Our position:** ZK signature recovery is not content privacy or data permanence. Keep disabled until digest equivalence, artifact reproducibility, trusted setup/version, costs and live verifier mapping are proven.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-018, M-022. Evidence: [v2: client/src/services/ValidatorService/index.ts:55](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/ValidatorService/index.ts#L55); [v2: solidity/contracts/CawActions.sol:428](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/contracts/CawActions.sol#L428); [v2: solidity/test-foundry/SigVsZkDifferential.t.sol:44](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/test-foundry/SigVsZkDifferential.t.sol#L44); [v2: docs/ZK_SIG_PATH.md:273](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/ZK_SIG_PATH.md#L273).

<a id="g-063"></a>
### G-063 — Compression and canonical wire formats

**COMPATIBLE_OPTIONAL · SOURCE_AND_DOCS.** smltxt dictionary compression, packed actions/signatures and OTHER prefixes are documented; source uses signed compressed text bytes.

**Our position:** Specify deterministic encoding/versioning, byte limits, malformed input behavior and cross-implementation vectors. Compression must not alter signed meaning or 420-character policy.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-006, M-007, M-022. Evidence: [v2: smltxt/README.md:1](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/smltxt/README.md#L1); [v2: client/src/services/ScheduledPostProcessor/index.ts:101](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/ScheduledPostProcessor/index.ts#L101); [v2: docs/OTHER_ACTION_TYPES.md:1](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/OTHER_ACTION_TYPES.md#L1).

## Operations and tooling

<a id="g-064"></a>
### G-064 — Fresh rebuild and proof-of-compliance backlog

**REQUIRED · DOC_CLAIM_AND_OPEN_GAP.** Proof backlog explicitly labels the promised historical-sync deterministic reproducer not built; whitepaper narrows rebuild exceptions to DMs/media/in-flight transactions, while schema has other local-only preferences.

**Our position:** Do not claim every domain row is chain-recoverable. Test a clean rebuild and list every persistent record's source, retention, authority and recovery route.

**Demo:** Local export/replay fixture tests only; real reconstruction remains open.

Requirements: M-004, M-022, M-027, R2-005. Evidence: [v2: docs/PROOF_OF_COMPLIANCE_BACKLOG.md:114](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/PROOF_OF_COMPLIANCE_BACKLOG.md#L114); [v2: docs/WHITEPAPER.md:920](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/WHITEPAPER.md#L920); [v2: client/prisma/schema.prisma:898](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/prisma/schema.prisma#L898).

<a id="g-065"></a>
### G-065 — Frontend bundle verifier

**COMPATIBLE_OPTIONAL · DOC_CLAIM.** Verifier documentation compares browser-fetched asset SHA-256 to an upstream manifest and explicitly disclaims backend/contract verification.

**Our position:** Adapt the useful receipt concept, but pin reference commit and review verifier origin/build chain. Do not conflate matching an upstream bundle with safety or manifesto compliance.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-004, M-024, M-027. Evidence: [v2: client/src/services/Verifier/README.md:8](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/Verifier/README.md#L8); [v2: client/src/services/Verifier/README.md:20](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/Verifier/README.md#L20).

<a id="g-066"></a>
### G-066 — Databases, cache, search, migration and monitoring

**COMPATIBLE_OPTIONAL · DOC_AND_PATH_DISCOVERED.** PostgreSQL/Prisma, Redis, Elasticsearch, service health, migrations and scaling docs exist; sprint stories mix implemented and planned database/monitoring/cache work.

**Our position:** Only choose dependencies after resource/security review. No destructive migration, remote installer, service deployment or claimed benchmark was executed.

**Demo:** Plain Node built-ins and fixtures; no database/search/cache stack.

Requirements: M-022, M-024. Evidence: [v2: client/README.md:16](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/README.md#L16); [v2: docs/SCALING.md:1](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/SCALING.md#L1); [v2: docs/stories/PROJECT_BOARD.md:1](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/stories/PROJECT_BOARD.md#L1); [v2: docs/MIGRATIONS.md:1](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/MIGRATIONS.md#L1).

<a id="g-067"></a>
### G-067 — Installer, CLI and operator hardening

**DEFERRED · DOC_AND_PATH_DISCOVERED.** README includes a remote installer, root/service setup and manual deployment paths; backlog records unresolved host hardening, signer isolation and operator tasks.

**Our position:** Use a separately bounded and inspected bootstrap, never upstream shell snippets. Production needs key isolation, network policy, backups and rollback evidence.

**Demo:** B-001 bounded local portable runtime; upstream installer never run.

Requirements: M-004, M-024. Evidence: [v2: README.md:28](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/README.md#L28); [v2: PROJECT_BACKLOG.md:119](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/PROJECT_BACKLOG.md#L119); [v2: docs/SIGNER_SERVICE_DESIGN.md:1](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/SIGNER_SERVICE_DESIGN.md#L1).

<a id="g-068"></a>
### G-068 — Native iOS/Android and browser extension

**COMPATIBLE_OPTIONAL · PLANNED.** native/README explicitly says planning/no code yet despite goal-oriented language. Native wallet/backup/onramp/bridge roadmaps remain; no implemented iOS/Android trees discovered in scoped inventory.

**Our position:** Treat mobile app and extension as future products with platform crypto/storage/origin/device tests. Browser passkey source in v2 does not make native wrappers shipped.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-025. Evidence: [v2: native/README.md:72](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/native/README.md#L72); [v2: native/docs/ROADMAP.md:19](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/native/docs/ROADMAP.md#L19).

<a id="g-069"></a>
### G-069 — MCP read/write research/client interface

**COMPATIBLE_OPTIONAL · SOURCE_AND_DOCS.** v2 MCP source advertises eleven read tools plus create_post/like/follow/repost under a write/session configuration. Same source path is absent on master.

**Our position:** Keep read-only default, explicit per-action authority and scoped budgets if ever adopted. No agent should post, sign or spend merely because a tool is installed.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-007, M-018, M-025. Evidence: [v2: mcp-server/src/tools.ts:7](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/mcp-server/src/tools.ts#L7); [v2: mcp-server/src/tools.ts:194](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/mcp-server/src/tools.ts#L194); [v2: mcp-server/README.md:30](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/mcp-server/README.md#L30).

<a id="g-070"></a>
### G-070 — Optional AI provider and CawAI bot

**COMPATIBLE_OPTIONAL · SOURCE_AND_DOCS.** v2 CawAI docs describe RAG replies, external Claude API/key, signing key and daily spend cap; AI-proxy and provider settings exist. These are operator integrations, not protocol requirements.

**Our position:** Excluded from bootstrap. Any later use needs explicit outbound data/signer/spend scope, source/citation quality and pseudonymity review.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-024, R2-009. Evidence: [v2: client/src/services/CawAI/README.md:14](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/CawAI/README.md#L14); [v2: client/src/services/CawAI/README.md:71](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/CawAI/README.md#L71); [v2: client/src/api/routes/ai-proxy.ts:290](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/api/routes/ai-proxy.ts#L290).

<a id="g-071"></a>
### G-071 — Test suites and audit claims

**REQUIRED · TEST_FILES_AND_DOC_CLAIMS.** Selected bookmark/notification/session/market/ZK tests were acquired as text. Foundry/fuzz/Truffle/XMTP and self-audit docs claim various historical results. No upstream code or tests were executed here.

**Our position:** Track exact commit, command, environment, output and coverage for future runs; preserve failed cases. This same-team source review is not independent peer review.

**Demo:** Inspected pre-refresh baseline records 40/40 local tests; latest UI changes require root's separate verification.

Requirements: M-003, M-004, R2-005. Evidence: [v2: solidity/test-foundry/README.md:109](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/solidity/test-foundry/README.md#L109); [v2: docs/SESSION_KEY_GUARANTEES.md:223](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/docs/SESSION_KEY_GUARANTEES.md#L223); [v2: client/XMTP_TEST_RESULTS.md:1](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/XMTP_TEST_RESULTS.md#L1).

<a id="g-072"></a>
### G-072 — Explicitly proposed extras and unfinished UI work

**DEFERRED · DOC_OPEN_BACKLOG.** Backlog includes crowdfunding posts, thread boundary rendering, pre-auth language selection, connector load performance, recovery UI and remaining replication/operator work. GameFi route is commented out.

**Our position:** Do not treat backlog headings as shipped features. Prioritize core conversation readability and verified receipts; no governance/fund/extra token implied by optional UI ideas.

**Demo:** Absent from inspected B-001 baseline; no production implementation.

Requirements: M-025, M-033. Evidence: [v2: PROJECT_BACKLOG.md:824](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/PROJECT_BACKLOG.md#L824); [v2: PROJECT_BACKLOG.md:830](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/PROJECT_BACKLOG.md#L830); [v2: client/src/services/FrontEnd/src/routes.tsx:174](https://github.com/GilgameshCaw/Caw/blob/518b4bf1598775b677e1d22888b587892bfb812b/client/src/services/FrontEnd/src/routes.tsx#L174).

## Coverage and limits

The two non-truncated trees contain 1,040 master blobs and 1,357 v2 blobs. Acquisition is **199 source files / 4,110,001 declared bytes**, including 113 distinct documentation blobs, selected v2 implementation/test sources and changed master counterparts. This stays below the 256-file/20-MiB acquisition bounds. Exact stored bytes are checked against Git blob IDs and SHA-256 in provenance.json (supporting local record omitted; see the source-coverage note). Metadata, outlines and this analysis are separate from acquired source bytes.

All discovered paths are listed in COVERAGE.tsv (supporting local record omitted; see the source-coverage note), with acquisition, scoped reading/analysis and test status. DOCUMENT_OUTLINES.json (supporting local record omitted; see the source-coverage note) indexes document headings and checkboxes without claiming that every paragraph was semantically reviewed. UNREAD_PATHS.tsv (supporting local record omitted; see the source-coverage note) is the explicit remaining body-review backlog. The machine-readable feature map (supporting local record omitted; see the source-coverage note) retains exact commit/path/line evidence.

No UI interaction, unit/integration/fuzz test, installed dependency, live API mutation, exploit attempt, fresh operator rebuild, wallet connection, chain readback, gas measurement, token burn or deployment was performed. Upstream performance, testnet, audit and legal assertions remain attributed claims. Source copies do not establish production bytecode correspondence or independent review. Earlier August testnet peer-review findings must not be projected onto a later branch without matching its source and deployment.

The largest remaining implementation omissions include full ValidatorService/ActionProcessor behavior, all UI component bodies, upload and metadata-fetch security, full migration histories, all chain message paths and every test suite. Some large files were acquired and searched only at relevant entrypoints. Source comments can also be stale: the map uses code where documentation and code disagree, and records unresolved conflicts instead of choosing a convenient assertion.

## Useful first adaptations

Keep the public conversation and receipt surfaces simple. Reply context, search, bookmarks, notifications, readable profiles, clear pending states and accessible language controls fit an ordinary frontend without forcing new protocol rules. Scheduling can follow after a precise pre-signed-payload/edit and authority policy. Marketplace and private messaging need separate custody/key/retention gates. Native wallets, extra chains, ZK proving, sponsor obligations and optional AI remain separate proposals.

This catalogue is a same-team source comparison. It is not an independent security audit, a completion certificate or a claim that our prototype satisfies the whole manifesto.

