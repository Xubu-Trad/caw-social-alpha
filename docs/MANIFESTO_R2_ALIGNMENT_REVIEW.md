> Alpha.17 revision: [token-source reproduction](CAW_TOKEN_SOURCE.md) matches executable regions with an explicit metadata difference. The [experimental custody probe](CUSTODY_PROBE.md) compiled locally and completed one remote stateful simulation. NFT authority, production settlement and the literal burn conflict remain open. Earlier reviews below are historical.

> Alpha.16 revision: [existing CAW token evidence](CAW_TOKEN_COMPATIBILITY.md) now includes two read-only RPC captures and offline account/runtime verification. The zero-address calls reject; minting, custody and settlement remain unfinished. Read the [v0 scope](PROTOCOL_V0_SCOPE.md). Earlier release reviews below are historical.

> Alpha.15 revision: the [offline Ethereum proof reader](ETHEREUM_STATE_PROOF.md) checks account/storage values or absence against a separately supplied state root. It verifies proof links and exact requested slots; it does not authenticate the root, bind a block header, establish finality/freshness or interpret CAW ownership. [Current authority](AUTHORITY_AND_FRESHNESS.md) remains a design with this bounded component. Source conflicts stay open. Earlier reviews below are historical.

> Signed recovery revision: [The copied ledger now preserves and verifies a bounded signed-action record](SIGNED_RECORD_RECOVERY.md). Inherited history and fixture transfers remain explicitly unsigned; test bindings and recorded time are not ownership or historical-time proof. Earlier reviews below are historical. [Current validation](VALIDATION.md) controls execution claims.

> Signed settlement revision: [Identity verifies and applies CAWs in an isolated copied ledger](SIGNED_SETTLEMENT.md). Commons remains unsigned and synthetic. This does not authenticate NFT ownership or preserve signed archival history. Earlier reviews below are historical; [current validation](VALIDATION.md) controls test claims. All production conflicts remain unchanged.

> Signature revision: [Identity now offers a local signature lab](SIGNATURE_LAB.md). It verifies a bounded synthetic action against a separate test-key binding; Commons settlement is still unsigned and synthetic. Earlier reviews below are historical. See [current validation](VALIDATION.md). No production conflict is resolved by this experiment.

> Economics revision: [Ledger comparison and shared allocation arithmetic](ECONOMIC_SCENARIOS.md) make competing interpretations testable. Active actions remain on the same provisional appendix profile. The earlier review below is historical; see [current validation](VALIDATION.md) and source hashes for this revision. No source conflict is resolved by displaying alternatives.

> Recovery revision: [saved-history verification](HISTORY_RECOVERY.md) now checks exact canonical exports against separately retained checkpoints. [Current validation](VALIDATION.md) records the tested code. The original review below remains a baseline; source conflicts and unimplemented production requirements remain open.

# Manifesto and recovered R2: alpha alignment review

Reviewed 2026-09-07, before the next test-deployment candidate. This is a source and implementation comparison, not an application execution, independent security audit or community release decision. It contains no private research, account identifiers, credentials or machine paths.

**The current artifact is a complementary frontend demonstration. It does not yet implement the CAW protocol described by the manifesto.** The known R1 chain reaches the manifesto; the complete ZRU/R2 cipher reaches development instructions. Those instructions call for implementation, open contribution, review and removal of special developer control. A polished interface and 44 local tests cannot substitute for those requirements.

“Follow exactly” means retain the actual wording, expose ambiguity and do not silently invent missing rules. The source contains competing economic descriptions and unspecified custody/storage details. No implementation can make those ambiguities disappear by choosing convenient defaults. The current named appendix scenario is useful when its provisional scope stays explicit.

## Evidence, scope and version

The review began with the source index and primary review. It covered the full pinned manifesto, exact 1,442-byte R2 text, the 59-row requirement register, all 15 conflicts, source/endpoint summaries, current model/fixture/UI/media files and the relevant architecture, economics, identity, media, portability, contribution and test records. The resilience document was reviewed for its control map and acceptance proposals. This does not claim a fresh review of every archived article, every third-party code file or all historical research; the source index retains those omissions.

| Evidence | Immutable reference / identity |
| --- | --- |
| Primary manifesto | [README at 37399aeb…](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md); SHA-256 `066b14262bd29118a8f86d75bece0d5bde96c2b665b1a3b356c3867689094761` |
| Exact R2 | [Reading copy at 8f9da9c3…](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/EVIDENCE/reading_rotation.txt); SHA-256 `2a77d034354b3ee698dd0266f93dfd5627e033cb8f79ec891498b80b7eab0e52` |
| Requirements register | 59 records; SHA-256 `13687fb5b9b8b7ad034b0398f16c7befa0a0ac2189a58e168862f8ec08ef6eac` |
| Production conflict register | 15 open items; SHA-256 `eaafcc3c6bb7aeb0209f220a794ae343084f2db7130d04d033bdfcfac3354b1c` |
| [Model](../public/model.mjs) | SHA-256 `ea33376af6ebfe8cc80e415e372aee65d5a2804791a28efb36963b7c0e18a27a` |
| [Interface](../public/app.mjs) | SHA-256 `6bae481d045a4054657bcff4ee7ced311801444a416a9716674e1d29bd484e18` |
| [Media policy](../public/media.mjs) | SHA-256 `86d9c210e37342fe1f85ad9ba1eb9589dfe6e47873e5bb537cab28bed4e28267` |
| [Companion site](../public/website.html) | SHA-256 `94226b31584a64d0734a306f94d63d2d23046a37740cd3c39e807cbad8ceff3d` |

These are inspected snapshots. Subsequent alpha naming, configuration or UI edits need their own source checks and execution evidence; this report does not automatically certify later bytes. Primary rows and conflicts are preserved, not rewritten here. Their original production row states remain 33 PROPOSED and 26 BLOCKED; the newer frontend coverage below is a separate review overlay.

## Riddle layers and their application meaning

| Layer | Evidence-supported result | What the alpha should carry forward |
| --- | --- | --- |
| R1 tablet / coordinates | Preserved extraction yields the poem and 46 coordinates. | Source provenance, not a new application capability or invented rule from ambiguous artwork. |
| R1 book cipher | Pinned corpus selection yields the historical IPFS identifier. | Preserve deterministic source selection and the exact recovered target. |
| R1 IPFS / APE | The independently computed content identifier matches the preserved canonical audio bytes. | Integrity and availability are distinct. A correct CID does not guarantee a live gateway or retention. |
| R1 audio / Enkidu | The recorded extraction recovers exact Enkidu pseudohex. | These are verified research transformations, not software modules needed in the frontend. |
| R1 Enkidu / manifesto | Declared substitution, hex decoding and 60-tab normalization reproduce the manifesto body. Historical README versions match that body under the declared normalization. | The manifesto is the application specification baseline. Preserve its wording rather than “correcting” clues into new requirements. |
| R2 source / transposition | All 2,884 hex characters are permuted, decoded and inverted exactly. Reading copy has 1,442 bytes. | Use the complete recovered development message; old XOR/JPEG/zlib candidates are not its verified intermediate layers. |
| R2 development / release | Build on GitHub, contribute according to the manifesto or clear agreed changes, seek review and release agreement, eliminate privileged developer control. | A traceable development process and verified production authority matter as much as visual presentation. |

The layer evidence is summarized in the [pinned endpoint assessment](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/docs/ENDPOINT_ASSESSMENT.md), [R1 determinism status](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/docs/R1_DETERMINISM_STATUS.md) and [R2 reproduction](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/REPRODUCE.md). This review inspected those records; it did not rerun the decoding chain. Their best-supported endpoints are the manifesto and development message. Neither an authenticated claim of absolute finality nor a further verified layer is supplied. Liquidity, incentives, human authorship and historical motives are separate claims.

## Priority fixes before a test preview

| Priority | Concrete change | Acceptance threshold |
| --- | --- | --- |
| P0: identify the test | Call the delivered artifact a synthetic alpha frontend. Keep website hosting, local simulation and protocol/testnet deployment distinct. Make mode/network status readable at every entry point. | The release cannot appear to accept wallet funds, sign real actions, upload media or claim chain finality. A strict simulation-only configuration may enforce the intended build mode; it must not be presented as cryptographic protocol authority. |
| P0: disclose the source choices | Put the pinned manifesto, exact R2, this alignment summary and the current scenario/deviations within easy reach of the alpha reader. | A reader can distinguish literal source wording, recommendations, current fixture rules and unfinished protocol work without searching historical chats. |
| P0: avoid false economic fidelity | Keep `appendix-demo-v1` explicit. Show that like/reCAW allocation is a selected appendix interpretation and that stake/rounding/repeat rules are provisional. | No “exact protocol economics implemented” label. A decision/fixture comparison exposes competing readings before real settlement. |
| P0: separate public alpha from protocol release | Review exact outgoing bytes, artwork rights, dependency/license scope, origin/headers and the chosen test destination. | A static test site's approval does not silently approve a wallet, contract deployment, storage provider or community protocol release. Record each artifact and actual check. |
| P1: state the neutral-frontend policy | Describe what this alpha displays, what users can locally hide, how future hosted content would be handled and what alternate clients can still do. | Frontend policy is intelligible and cannot be mistaken for protocol-wide censorship, custody or immunity from applicable rules. |
| P1: finish visible media claims | Either exercise supported JPEG/WebP and real MP4/WebM playback or clearly retain those format/decode limits as unverified. Test cleanup/race fixes in a browser. | Valid files and bounded invalid cases produce accurate states; preview never changes the canonical record or makes a network upload. |
| P1: reconcile evidence labels | Refresh current coverage overlays that still say all browser work is blocked, while preserving historical failed checks. | New labels point to current scoped evidence; 44 tests never become a claim that 59 requirements or every browser path passed. |
| P2: define the first real protocol adapter | Specify network/contract identity, ownership discovery, canonical signed intent, fees, finality and complete-history retrieval before connecting a wallet. | Real behavior has exact source/decision references, adversarial tests and separately reviewed scope. The demo model is not silently promoted to the authoritative protocol. |

The inspected website already qualifies its aspirational account/media language and its proposed independence section. Strengthen discoverability and precision rather than replacing those limits with marketing. CAW's participant lanes, restrained green palette and concise presentation do not supply accountless identity, live keystroke transport, mesh networking or encryption.

## Complete primary requirement coverage

Classifications below are copied from the existing analyst table. They remain interpretations of source wording, not community ratification. LOCAL TESTED means only the indicated synthetic/local behavior has execution evidence. DISPLAY means a recommendation is shown, not executed. SCOPE ALIGNED describes a current boundary, not proven production conformance. BLOCKED/OPEN describes the missing production decision or capability. No blanket compliance percentage is calculated.

### Identity, authority and client boundary

| ID | Exact-source location / classification | Current review status | Coverage and remaining work |
| --- | --- | --- | --- |
| M-001 | [L6-L11](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L6-L11) · mandatory behavior | PROPOSED | Portable client and synthetic replay illustrate replacement. No independent operator, complete issuance/control graph, storage or authority-failure test exists; C-012. |
| M-002 | [L22](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L22) · mandatory behavior | SCOPE ALIGNED | Current app/site describe a community build and simulation. Keep this distinction visible in any alpha deployment; no official-status claim. |
| M-003 | [L23-L26](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L23-L26) · recommendation | PROPOSED | Same-team source/accounting reviews exist. An open external peer group and independent review process have not been demonstrated; C-011. |
| M-004 | [L26](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L26) · mandatory behavior | BLOCKED | No reviewed public implementation/release agreement is established for this candidate. A static preview is not community acceptance; C-011. |
| M-005 | [L27-L28](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L27-L28) · mandatory behavior | BLOCKED | No candidate contract deployment or complete authority graph exists. JavaScript constants and synthetic controllers cannot establish renounced contract privileges; C-012. |
| M-006 | [L32](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L32) · mandatory behavior | LOCAL TESTED / BLOCKED | 420 Unicode code points, exact text and malformed-surrogate rejection are implemented and tested. No chain or P2P messages; counting semantics remain C-004. |
| M-007 | [L33](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L33) · mandatory behavior | LOCAL PARTIAL | Strict synthetic intents and replay format exist. No actual protocol adapter, canonical signed-action format or independently implemented interoperable frontend. |
| M-008 | [L36](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L36) · mandatory behavior | BLOCKED | Historical burn preview only. No token integration, burn or NFT mint. Original-token zero-address compatibility and units require C-001. |
| M-009 | [L37](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L37) · mandatory behavior | DISPLAY / OPEN | All eight source burn bands are displayed, including the 8+ plateau. No mint occurs; resolve the strict length wording versus plateau under C-003. |
| M-010 | [L38](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L38) · mandatory behavior | LOCAL PARTIAL | Unique lowercase alphanumeric fixture names are validated. No global registry; the 1–32 length cap is a demo choice, not source wording; C-013. |
| M-011 | [L40-L41](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L40-L41) · mandatory behavior | LOCAL TESTED / BLOCKED | Synthetic controller/epoch transfer rejects stale intents and preserves balances. It is neither NFT ownership nor transferred DM access; C-005. |
| M-012 | [L43-L44](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L43-L44) · mandatory behavior | BLOCKED | Accounts, events and export are local JSON. No on-chain registration, ownership or associated-data commitment; define record classes under C-006. |
| M-013 | [L46-L47](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L46-L47) · mandatory behavior | NOT IMPLEMENTED | No token deposit, withdrawal or contract wallet. Synthetic balance arithmetic does not demonstrate custody; holding versus staking must stay distinct. |
| M-014 | [L47](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L47) · mandatory behavior | LOCAL PARTIAL | Selector separates fixture accounts and their balances/nonces. No actual NFT identifiers, wallet ownership discovery or multi-NFT authority. |

### Messaging, settlement, storage and frontends

| ID | Exact-source location / classification | Current review status | Coverage and remaining work |
| --- | --- | --- | --- |
| M-015 | [L51-L52](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L51-L52) · mandatory behavior | LOCAL TESTED / BLOCKED | CAW fee reaches eligible other fixed weights, with visible remainder and zero-pool rejection. Real stake, timing and remainder handling remain C-007. |
| M-016 | [L54-L55](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L54-L55) · ambiguity | LOCAL TESTED / OPEN | The demo uses appendix 80/20 for likes. Main prose and summary describe direct OP payment; no precedence is assumed; C-002. |
| M-017 | [L57-L58](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L57-L58) · ambiguity | LOCAL TESTED / OPEN | The demo uses appendix 50/50 for reCAWs. Main prose and summary differ; a displayed reCAW reference does not settle economics; C-002. |
| M-018 | [L60-L63](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L60-L63) · mandatory behavior | BLOCKED | Review/queue/submit/confirm are local steps. No real signatures, relayer, gas or sponsored execution; funding and direct-path tradeoffs remain C-008. |
| M-019 | [L65](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L65) · mandatory behavior | BLOCKED | Messages is explanatory and accepts no correspondence. No trustless handshake, authenticated keys, E2EE transport or confidential-history transfer; C-005. |
| M-020 | [L66](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L66) · recommendation | SCOPE ALIGNED | No group messaging exists. Participant lanes and /commons are presentation, not an implemented group-chat transport. |
| M-021 | [L68-L69](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L68-L69) · recommendation | PROPOSED | No storage/settlement network is adopted. Arweave and migration language remain conditional recommendations, not deployed capabilities; C-006. |
| M-022 | [L68-L73](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L68-L73) · mandatory behavior | BLOCKED | Replay checks local consistency and refresh resets the fixture. No permanent trustless public storage or independent complete-history acquisition; C-006. |
| M-023 | [L75-L80](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L75-L80) · mandatory behavior | PROPOSED | Local filters do not mutate canonical fixture state. No production protocol exists to verify absence of discretionary blocking or quarantine. |
| M-024 | [L82-L84](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L82-L84) · mandatory behavior | LOCAL PARTIAL | Relative assets and a fixed-prefix copy support client portability. Source/build distribution, rights and independent operation still need evidence. |
| M-025 | [L83-L84](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L83-L84) · recommendation | LOCAL PARTIAL | Responsive browser layouts and explicit action review are checked within scope. Native app, extension and smooth scoped signing are not implemented; C-009. |
| M-026 | [L86-L90](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L86-L90) · recommendation | PROPOSED | Synthetic content and local filters exist. A stated neutral-alpha content policy and real hosted-content enforcement are not yet implemented; C-010. |
| M-027 | [L93](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L93) · mandatory behavior | PROPOSED | Same-process alternate paths and same-model readers do not prove protocol access after a frontend refuses service. No alternate real submission path. |

### Marketplace, economics and historical schedules

The direct shares below are not always the recipient's final total: an eligible target can also receive a stake-pool share. The pool excludes the payer for every demo action; only the post's “other stakers” wording is explicit in that source passage.

| ID | Exact-source location / classification | Current review status | Coverage and remaining work |
| --- | --- | --- | --- |
| M-028 | [L97-L100](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L97-L100) · recommendation | NOT IMPLEMENTED | The feeless marketplace remains a recommendation. Synthetic controller transfer is not an NFT sale, escrow or marketplace; C-005. |
| M-029 | [L102-L104](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L102-L104) · mandatory behavior | PROPOSED | No real marketplace royalty or trading-fee configuration exists. Inspect every production fee recipient and mutable authority; do not adopt the liability rhetoric as law. |
| M-030 | [L106-L110](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L106-L110) · example | CONTEXT PRESERVED | Historical market-cap/USD figures are not displayed as current prices or verified affordability. No live valuation or operating-cost proof. |
| M-031 | [L112-L113](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L112-L113) · mandatory behavior | BLOCKED | Named JavaScript fee constants are editable source, not immutable deployed protocol costs. Final price choice and scaling remain C-003. |
| M-032 | [L115-L120](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L115-L120) · ambiguity | OPEN | Only the appendix scenario is executable. Economic-summary and prose interpretations remain documented rather than silently reconciled; C-002. |
| M-033 | [L122-L126](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L122-L126) · recommendation | DISPLAY / OPEN | The schedule is explicitly provisional/recommended. No measured production affordability, gas/storage funding or agreed final schedule; C-003/C-008. |
| M-034 | [L128](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L128) · recommendation | DISPLAY / BLOCKED | 1 character: 1,000,000,000,000 CAW recommendation is displayed. Actual units, burn/mint and immutable adoption are unimplemented; C-001/C-003. |
| M-035 | [L129](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L129) · recommendation | DISPLAY / BLOCKED | 2 characters: 240,000,000,000 CAW recommendation is displayed. Actual units, burn/mint and immutable adoption are unimplemented; C-001/C-003. |
| M-036 | [L130](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L130) · recommendation | DISPLAY / BLOCKED | 3 characters: 60,000,000,000 CAW recommendation is displayed. Actual units, burn/mint and immutable adoption are unimplemented; C-001/C-003. |
| M-037 | [L131](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L131) · recommendation | DISPLAY / BLOCKED | 4 characters: 6,000,000,000 CAW recommendation is displayed. Actual units, burn/mint and immutable adoption are unimplemented; C-001/C-003. |
| M-038 | [L132](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L132) · recommendation | DISPLAY / BLOCKED | 5 characters: 200,000,000 CAW recommendation is displayed. Actual units, burn/mint and immutable adoption are unimplemented; C-001/C-003. |
| M-039 | [L133](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L133) · recommendation | DISPLAY / BLOCKED | 6 characters: 20,000,000 CAW recommendation is displayed. Actual units, burn/mint and immutable adoption are unimplemented; C-001/C-003. |
| M-040 | [L134](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L134) · recommendation | DISPLAY / BLOCKED | 7 characters: 10,000,000 CAW recommendation is displayed. Actual units, burn/mint and immutable adoption are unimplemented; C-001/C-003. |
| M-041 | [L135](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L135) · recommendation | DISPLAY / BLOCKED | 8+ characters: 1,000,000 CAW recommendation is displayed. No truncation-based new tier; actual burn/mint and production bounds remain C-001/C-003/C-013. |
| M-042 | [L137](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L137) · recommendation | LOCAL TESTED / OPEN | Follow costs 30,000 synthetic CAW, split 24,000 direct and 6,000 pool. Real follow/repeat/stake semantics and timing remain C-007. |
| M-043 | [L138](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L138) · recommendation | LOCAL TESTED / OPEN | CAW costs 5,000 synthetic CAW to eligible other stake weights plus held dust. The appendix xxx field and production counting remain C-004. |
| M-044 | [L139](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L139) · recommendation | LOCAL TESTED / OPEN | Like costs 2,000 synthetic CAW: 1,600 direct, 400 pool. This implements one appendix scenario, not all competing wording; C-002. |
| M-045 | [L140](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L140) · recommendation | LOCAL TESTED / OPEN | ReCAW costs 4,000 synthetic CAW: 2,000 direct, 2,000 pool. Production OP ownership timing and source interpretation remain C-002/C-007. |

### Media and project status

| ID | Exact-source location / classification | Current review status | Coverage and remaining work |
| --- | --- | --- | --- |
| M-046 | [L144](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L144) · mandatory behavior | LOCAL PARTIAL / BLOCKED | Separate Media view previews chosen local files. No upload, image-hosting service, publication policy or permanent media reference; C-006. |
| M-047 | [L145-L146](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L145-L146) · recommendation | NOT IMPLEMENTED | External URL rendering and shortening are not connected. A durable original target, consent/fetch policy and character treatment remain C-014. |
| M-048 | [L148-L150](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L148-L150) · example | CONTEXT PRESERVED | The fish post and example hostname are examples. They neither mandate that domain nor establish another cipher or native mention primitive. |
| M-049 | [L154-L156](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L154-L156) · mandatory behavior | SCOPE ALIGNED / OPEN | Community-build labels avoid official or exclusive status. The no-further-releases wording must be read alongside R2's community-release direction; C-015. |

### Complete recovered R2

| ID | Exact-source location / classification | Current review status | Coverage and remaining work |
| --- | --- | --- | --- |
| R2-001 | [L1](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/EVIDENCE/reading_rotation.txt#L1) · example | CONTEXT PRESERVED | Liquidity relocking and motive assertions are historical message content. This build does not certify or act on them. |
| R2-002 | [L3](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/EVIDENCE/reading_rotation.txt#L3) · mandatory behavior | PROPOSED | Source, portable assets and replay help replace contributors. They do not prove operation without the original team or hidden dependencies; C-012. |
| R2-003 | [L5](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/EVIDENCE/reading_rotation.txt#L5) · mandatory behavior | NOT IMPLEMENTED | The implementation is prepared locally. A reviewable public GitHub contribution at the appropriate destination remains a separate release step. |
| R2-004 | [L6](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/EVIDENCE/reading_rotation.txt#L6) · mandatory behavior | OPEN | Primary passages and 15 conflicts are retained. Local fixture/product choices must be disclosed; user direction does not establish community agreement; C-011. |
| R2-005 | [L7](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/EVIDENCE/reading_rotation.txt#L7) · mandatory behavior | BLOCKED | 44 synthetic/local tests and same-team review do not establish a solid production protocol, independent peer review, many contributors or release agreement; C-011. |
| R2-006 | [L9](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/EVIDENCE/reading_rotation.txt#L9) · recommendation | LOCAL PARTIAL | Readable source/build and contribution directions support participation. Public independent contribution/reproduction has not yet been demonstrated. |
| R2-007 | [L11](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/EVIDENCE/reading_rotation.txt#L11) · mandatory behavior | BLOCKED | No deployed contracts or complete privilege graph are verified. No proxy/backdoor/multisig equivalence claim follows from this frontend; C-012. |
| R2-008 | [L13](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/EVIDENCE/reading_rotation.txt#L13) · mandatory behavior | PROPOSED | The resilience plan names failures and alternatives. No independently operated outage/rebuild/submission exercise has passed; C-006/C-012. |
| R2-009 | [L13](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/EVIDENCE/reading_rotation.txt#L13) · mandatory behavior | SCOPE ALIGNED | No support token, growth fund, DAO or special builder recipient is added. Local dust is visible synthetic accounting, not a real treasury. Operating funding remains open. |
| R2-010 | [L15](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/EVIDENCE/reading_rotation.txt#L15) · example | CONTEXT PRESERVED | The salutation marks the recovered text's end. It is not a new protocol instruction, proof of anonymity or authenticated finality. |

## All fifteen production conflicts remain open

| Conflict | Decision still required | What can be done in the alpha now |
| --- | --- | --- |
| C-001: zero-address burn | Verify original CAW contract, decimals and the literal zero-address mechanism. Do not silently substitute another burn destination or token. | Show historical costs with no mint/burn transaction. |
| C-002: allocation descriptions | Resolve prose/summary/appendix precedence, OP definition and direct/pool percentages. Main prose does not independently specify every percentage. | Compare named readings and retain the provisional appendix label. |
| C-003: prices and immutability | Adopt exact fixed schedule, 8+ plateau interpretation and measured scale/cost assumptions. | Inspect recommendations with exact integers; no USD or affordability guarantee. |
| C-004: characters | Decide bytes/code points/graphemes, normalization, URLs, newlines and DM applicability. | Keep the provisional 420-code-point counter and exact text. |
| C-005: NFT and DM history | Specify current/future authority, consent, historical access, key changes and retained copies. | Demonstrate synthetic controller expiry; accept no private correspondence. |
| C-006: all data / permanence | Define record classes, canonical sources, media exception, retention, payment and independent full recovery. | Export/replay synthetic history; label local media and reset behavior. |
| C-007: stake and lifecycle | Define eligibility/snapshots, payer exclusion, zero-pool behavior, dust, repeats, self-actions and ownership timing. | Keep fixed weights, visible dust and rejection policies as fixture choices. |
| C-008: mostly gasless operation | Identify sustainable execution/storage payers and sponsorship-loss behavior without special builder funds or control. | Show intent costs; do not claim free real execution. |
| C-009: smooth signing | Define delegated scope, budget, expiry, revocation and consent. | Retain explicit synthetic review; no invisible real permissions. |
| C-010: frontend policy and rhetoric | Define actual service policy and responsible hosting practices; do not convert historical legal assertions into law. | Publish a readable neutral-alpha policy and preserve protocol/frontend distinction. |
| C-011: accepted changes/release | Define an open contribution, independent review, objection and release-agreement process. | Preserve decisions and failures; user approval and same-team review are not consensus. |
| C-012: complete authority graph | Reconcile no-proxy scope and enumerate contracts, roles, dependencies, keys, service control and replacements. | Prepare authority/control maps; no claim of a passed builder-disappears exercise. |
| C-013: username lifecycle | Resolve maximum/minimum/empty behavior, bounds and lifecycle beyond the alphabet rule. | Label the provisional 1–32 fixture cap and local-only availability. |
| C-014: media URLs | Recover original targets without one shortener/domain; resolve tracking/fetch and character rules. | Keep media preview local and avoid automatic remote fetches. |
| C-015: no official releases versus community build | Distinguish an unofficial community implementation/release from exclusive or official entitlement. | Say community alpha under review; retain R2 release requirements. |

See [ECONOMICS.md](ECONOMICS.md), [AUTH_AND_KEY_MODEL.md](AUTH_AND_KEY_MODEL.md), [DATA_AVAILABILITY_AND_REBUILD.md](DATA_AVAILABILITY_AND_REBUILD.md), [MEDIA_AND_PRODUCT_SCOPE.md](MEDIA_AND_PRODUCT_SCOPE.md) and [RESILIENCE_PLAN.md](RESILIENCE_PLAN.md) for the proposed consequences. Those proposals do not supersede the primary sources.

## Product extensions and exactness

| Current choice | Relationship to source | Boundary to retain |
| --- | --- | --- |
| Participant lanes, /commons, search and Following | Frontend display choice under M-007/M-024. | No real room, membership, live presence or unsubmitted keystroke publication. |
| Session bookmarks | User-facing local reading aid, not a named protocol primitive. | No fee or canonical event; do not imply transfer/sync/permanence. |
| Reference in a draft | Ordinary CAW text; no source-defined authenticated reply/quote field. | Count all inserted text and use normal explicit settlement. |
| Derived reCAW entry | Presentation of an existing paid reCAW and original post reference. | Preserve original authorship; no extra post, extra fee or comment primitive. |
| Video preview | User-approved product extension; video is not specified by the primary text. | Separate local preview from media posting and permanent storage. |
| Website / portable bundle | A frontend distribution aid. | Same-process /mirror is path portability, not independent hosting. PWA/native installation remains proposed. |
| Simulation-only deployment profile | Build-mode protection and clarity, not recovered protocol wording. | No live endpoints, wallets, contracts or uploads in that profile; configuration validation is not actual authorization or cryptography. |

Rejecting real chain configuration for a synthetic alpha is appropriate scope control. It does not prove that a later live build would satisfy the manifesto. Conversely, a finished protocol need not reproduce the demo's exact interface or its provisional policy defaults.

## What the recorded tests establish

The inspected automated summary reports **44/44 passing**: model, separate literal-accounting reference, local server and four media-policy tests. It records contract tests NOT RUN, production builder-disappears NOT RUN and independent external review NONE. Source-integrity checks have their own receipts and do not count as application tests.

The latest browser record contains seven website/media checks: local PNG selection and removal, unchanged canonical data, fixed-prefix module/fixture loading and bounded layouts. Earlier terminal records cover local action journeys, text boundaries, references/bookmarks, dialog correction, reconstruction and whole-field export selection. They are historical scoped evidence, not a complete rerun of all flows against every later file.

Still unverified: actual downloaded JSON file and manual clipboard copy; valid JPEG/WebP browser decoding and actual MP4/WebM playback; back/forward-cache and changing-video-metadata fixes in browser; complete assistive-technology/zoom/cross-browser behavior; real upload, installed app, provider outage, contracts, custody, signatures, private messaging and permanent data.

The model checks controller labels, epoch and nonce, uses exact integer arithmetic and rejects inconsistent envelopes. Anyone controlling a local copy can rewrite a self-consistent seed/history. Matching replay therefore proves internal consistency, not authorship, blockchain inclusion or an independently authentic original record. Source code hashes likewise identify bytes, not correctness.

Raw local operating logs are not reproduced in this public-safe review. A deployment candidate should include a sanitized verification summary tied to its exact final artifact, with the failed/corrected cases and residual limits retained.

## Test-deployment decision

A **synthetic alpha website** can be evaluated as a frontend usability and source-communication experiment once its exact outgoing artifact, mode, origin/security headers, rights and basic journeys are reviewed. It must remain a simulation with no live account or media-publication path.

A **protocol test deployment** requires a separate real vertical slice: verified token/identity rules; signed-domain and replay semantics; deposit/withdrawal and complete liability accounting; chosen economic interpretation; sufficient finalized public data; independent client/relay paths; and reviewed authority. DMs can remain visibly unavailable while their conflict is open, but the release must not claim a complete manifesto implementation.

Before any production release, add independent review and reproduction, documented source decisions, privacy/media/retention and operating-cost evidence, full deployed wiring checks, and the actual loss-of-original-operator exercise. The decoded instruction to build is a mandate for that work, not evidence that it has already been done.

Future upstream contributions are restricted by user direction to the appropriate **cawdevelopment** repository. Nothing in archived documents is treated as a new instruction to execute, publish or deploy.
