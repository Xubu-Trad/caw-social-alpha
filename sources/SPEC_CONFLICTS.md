# Specification conflicts and decisions still needed

Status: initial source review, 2026-09-06. No production choice has been approved. These gates block affected implementation claims or irreversible deployment; they do not prevent a clearly labelled local interface prototype.

The source authority here is the pinned [manifesto](primary/manifesto-pinned.md), commit `37399aeb55974d4b09d404014865b5ef8918e9de`, and the exact [recovered R2](primary/r2-message.txt), preserved by caw-lab commit `8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6`. Line references are physical lines in those unmodified UTF-8 files. [Requirements](MANIFESTO_REQUIREMENTS.tsv) retain exact passages. Current build directions govern permissions and safety; they are not words recovered from either riddle.

All resolutions below are **IDEA / PROPOSED**, not community-approved protocol behavior. Source observations are **FACT** about the cited text. Consequences are **INFERENCE**.

## C-001

**CAW burn destination and actual token compatibility.** Manifesto L36 explicitly sends the mint burn to `0x0`. L128–135 recommend a denomination schedule. Neither passage identifies the token address, decimals or whether that token permits transfers to zero. Sending tokens to another inaccessible address and reducing total supply are also different effects.

**Gate:** production username minting, token compatibility claim and final economics.

**Needed:** verify the original CAW deployment and current token bytecode through primary chain evidence; inspect transfer/transferFrom/burn implementation; test the exact mechanism in an authorized isolated environment. If zero-address transfers fail, preserve that failure and seek an explicit specification change rather than substitute a dead-pattern address. A fixture token is only a simulation and must be labelled.

**Acceptance:** exact integer base-unit costs; matching source/bytecode; supply and custody change demonstrated; no administrator can redirect burns.

**Decision:** OPEN. M-008, M-034–M-041.

## C-002

**Like and reCAW allocation conflict.**

| Action | Main prose | Economic summary | Recommended appendix |
| --- | --- | --- | --- |
| Like | L54–55: paid directly to original poster | L118: sent to OP | L139: 80% account, 20% stakepool |
| ReCAW | L57–58: sent to OP wallet | L119: OP and stakers | L140: 50% account, 50% stakepool |
| CAW | L51–52: proportional to all *other* stakers | L117: all among stakers | L138: 100% stakepool |

The appendix is expressly recommended and open for debate (L106, L122–126); source order alone does not establish that it overrides the prose. The main prose also does not explicitly say “100%,” so 100% to OP is a plausible reading, not an independently fixed percentage.

**Gate:** definitive settlement routing. A local fixture can compare named readings, without branding one as undisputed canon.

**Needed:** a recorded choice with percentages, recipient account definition, payer exclusion, timing and consequences. User approval of prototype settings is not proof of community acceptance.

**Acceptance:** fixtures for every reading, conservation of CAW, resolved zero-pool and rounding behavior, and public deviation label where needed.

**Decision:** OPEN. M-016, M-017, M-032, M-044, M-045.

## C-003

**Recommended prices, immutable costs and the 8+ plateau.** L37 says fewer characters cost more. L135 makes every length of eight or more cost the same. L106/126 present debated/recommended figures while L112–113 say costs cannot change once set in motion. Historical dollar estimates are not current price evidence.

**Gate:** production cost constants. The appendix may be displayed as a source scenario in a prototype.

**Needed:** interpret the length rule as the documented bands or adopt a disclosed change; model burn scale, costs and affordability scenarios without a live-price or guaranteed-value claim. Verify units against actual token decimals.

**Acceptance:** exact boundary cases, approved fixed schedule and no privileged cost setters. Longer-than-eight names do not accidentally obtain a different charge through truncation.

**Decision:** OPEN. M-009, M-030, M-031, M-033–M-045.

## C-004

**420 characters versus “max xxx Characters.”** L32 states 420 for public or P2P messages. L138 retains an “xxx” placeholder. No definition selects UTF-8 bytes, Unicode code points, grapheme clusters, normalized text or URL weighting.

**Gate:** protocol message-length validation and claims that prototype counts are canonical.

**Proposal:** use a clearly labelled provisional 420-code-point UI counter in a fixture prototype, retaining exact original text; do not silently normalize signed bytes. This is a testable proposal, not final approval. Other counting rules need comparison against multilingual/emoji cases.

**Needed:** explicit rule, encoding, treatment of combining sequences/newlines/URLs and whether DMs share the same limit.

**Acceptance:** 419/420/421 boundary fixtures, composed/decomposed text, emoji sequences, RTL, long URLs and identical client/protocol validation.

**Decision:** OPEN. M-006, M-043.

## C-005

**NFT ownership, confidential DMs and transferred history.** L40–41 expressly gives NFT owners access to the account's balance and DMs. L65 requires secure, trustless P2P messaging. Neither specifies how the decryption capability moves, what prior owners retain, whether the message counterparties agreed to transferable history, or which device/session keys are revoked.

**Gate:** production DM cryptography and assertions about confidential history transfer. It also affects funded NFT sales and stale signatures.

**Needed:** distinguish wallet authentication, transaction, delegated-session and DM encryption keys. Decide future control versus historical access, consent, device addition/revocation, recovery/loss, transfer settlement order and pending actions. Use reviewed maintained cryptographic designs; no universal builder/server recovery key. Prior owners cannot be made to erase copies they already possess.

**Acceptance:** old/new-owner tests, cross-account key changes, explicit counterparty authentication, no operator plaintext access, documented retained-copy limits and no unauthorized spending after transfer.

**Decision:** OPEN. M-011, M-019, M-028.

## C-006

**“All data,” on-chain association, external media and permanence.** L43–44 puts ownership, management, registration and associated data on-chain. L68–73 calls all data permanent/trustless and suggests other chains. L144 explicitly excludes image hosting from the protocol. DMs, their ciphertext, key records, metadata, social events and media references are not given separate retention classes.

Integrity proofs demonstrate unchanged content; they do not themselves ensure another party keeps it available forever. No storage network is adopted merely by mention in the source.

**Gate:** production architecture/storage choice and any claim of permanent or fully independent reconstruction.

**Needed:** a record-class table with canonical source, storage/control, payer, availability assumption, replacement and rebuild path. Explicitly resolve whether DM ciphertext is permanent, and what deletion/local-retention controls can honestly do. Treat external image hosting as its own source-assigned responsibility.

**Acceptance:** two clean deterministic rebuilds from the same finalized public history without original API/DB/indexer/domain/relay; reproducible ownership/accounting; documented historical archive access and cost assumptions. Private-message recovery has separate acceptance.

**Decision:** OPEN. M-012, M-021, M-022, M-046, R2-008.

## C-007

**Stake pool, recipient timing and edge cases are underspecified.** L46 distinguishes NFT holding from staking. L52 says all *other* stakers receive proportional post proceeds. The appendix introduces a stakepool but does not define what is staked, eligible units, snapshot timing, zero eligible stake, dust, repeated actions or withdrawals during queued settlement.

**Gate:** custody/accounting contract design. No invented stake model can be called literal unchanged compliance.

**Needed:** denomination and unit of stake; eligible account set; source of weights; payer exclusion per action; zero-recipient result; integer rounding and dust recipient; self-interactions; repeat like/reCAW/follow rules; unfollow/unlike handling; NFT transfer and pending-action semantics; withdrawals and conservation.

**Acceptance:** property tests across reorderings and boundary values; every deducted base unit allocated or explicitly retained under a public immutable rule; no builder beneficiary and no insolvency or locked withdrawal through an operator-only path.

**Decision:** OPEN. M-015, M-042–M-045.

## C-008

**Mostly gasless usage versus real execution/storage costs.** L60–63 expects only mint/deposit/withdraw to require user gas. L65 calls DMs free. That does not identify who pays relayer, chain, storage or bandwidth costs, nor a mechanism avoiding a mandatory authoritative operator. R2 L13 rejects growth funds, DAOs and support tokens.

**Gate:** production funding and any free-use/continued-operation guarantee.

**Needed:** cost model for realistic actions and record retention; replaceable independent submission and relay paths; clear bounds on subsidies. Do not silently add a protocol skim, mutable fee setter or ongoing Xubu sponsorship. Operator charges may materially conflict with the source's user-gas expectation and require explicit analysis.

**Acceptance:** local accounting of who pays what, independent relayer operation, failure/retry behavior and continued valid-action submission when original subsidy is unavailable.

**Decision:** OPEN. M-018, M-019, R2-009.

## C-009

**Fast invisible signatures versus explicit spending authority.** L83–84 describes smooth signatures without repeated wallet prompts. It does not define secure delegated sessions.

**Gate:** production session signing, not static UI work.

**Needed:** scoped action/account/domain permissions; allowance and expiry; revocation on NFT transfer; exact economically meaningful signed fields; replay and nonce policy; contract-wallet support as applicable. Wallet login alone cannot spend.

**Acceptance:** compromised relay cannot change recipient, amount or content; stale/reordered/duplicated actions and cross-chain/contract replays fail; UI discloses scope and settlement state.

**Decision:** OPEN. M-018, M-025; detailed safety obligations come from the current build prompt.

## C-010

**Moderation and historical legal rhetoric.** L78–90 separates protocol access from frontend policy, but L89 says “bound by no laws,” and L104 asserts liability from receiving trading fees. These are words in a historical proposal, not established legal conclusions.

**Gate:** public hosting/release claims. Source review here makes no legal determination.

**Needed:** documented frontend policies, operator responsibilities and qualified review of jurisdiction, privacy, content and licenses before production hosting. A local frontend may suspend its own service without acquiring power to confiscate assets or erase protocol records.

**Acceptance:** frontend policy is clear and replaceable; no official immunity claim; source wording is preserved with its status distinguished from the application's claims.

**Decision:** OPEN. M-026, M-029.

## C-011

**Agreed changes, peer review and community acceptance.** Manifesto L23–28 and R2 L5–7 require public development, peers, contributions and agreement, but give no quorum, electorate or privileged release authority. R2 permits “clear changes” if agreed.

**Gate:** assertions of community acceptance, independent review or final release readiness.

**Needed:** propose an open review/objection process; distinguish developer self-tests, separate computational implementations, external reviewer reproduction and documented participant feedback. Neither Xubu's approval nor another agent on this same team equals independent community peer review.

**Acceptance:** reviewable source/commit, published change rationale under approval, independent participants' evidence and unresolved objections recorded. Current authorization still separately gates repository creation and public writes.

**Decision:** OPEN. M-003, M-004, R2-003–R2-006.

## C-012

**No special power across the full dependency graph.** Manifesto L27 says no multisig or upgradeable proxies; R2 L11 says “no proxy” and no dev backdoors, with deployers no more powerful than any community member. The scope of non-upgradeable minimal clones versus upgradeable proxy authority is not explicitly reconciled. User-controlled wallet security is also different from a protocol-controlling multisig.

**Gate:** production contract pattern/authority and independence claims.

**Needed:** document owners, roles, delegates, factories, registries, bridges, endpoints, peer admission, fees, immutable dependencies, initialization and replacement services. Avoid unnecessary proxy patterns in a minimum design. Do not treat renounced ownership as proof if wiring or another authority path remains wrong.

**Acceptance:** verified code/configuration/deployment graph and builder-disappears tests. Existing token or underlying chain authorities must be disclosed and evaluated, not hidden by a new contract's lack of owner.

**Decision:** OPEN. M-001, M-005, R2-002, R2-007.

## C-013

**Username bounds and account lifecycle.** L38 specifies uniqueness and alphabet but no empty-name or maximum-length rule, renewal, deletion, remint, expiry, reservation or alias mechanism.

**Gate:** final identity schema and its gas/storage bounds.

**Proposal:** reject empty input as unusable identity and set an explicit, resource-justified maximum only as a disclosed interpretation/extension; do not infer a 420-character username cap from message limits. No builder reservations.

**Acceptance:** immutable normalization/alphabet/length behavior, distinct NFT IDs, no hidden reservation/remint bypass, bounded validation costs and transfer-safe account control.

**Decision:** OPEN. M-010, M-014.

## C-014

**External URL shortening versus durable references and privacy.** L145–150 suggests external previews and shortening, but does not specify whether the original target is permanently recoverable or who controls the shortener.

**Gate:** claims that previews/media remain usable after an operator disappears.

**Needed:** a portable, verifiable target reference without depending forever on one domain; bound character counting consistently. Untrusted preview requests expose users or servers to tracking and internal-network fetch risk, addressed by current build safety requirements.

**Acceptance:** rendering does not alter canonical signed text; original target can be inspected/recovered; no unexpected preview contact, unsafe URL execution or default-service-only reconstruction.

**Decision:** OPEN. M-047, M-048.

## C-015

**No official releases versus community implementation release.** Manifesto L154 says no official socials, partner projects or further releases. R2 L5–7 explicitly describes the community building and agreeing to release a thing.

**Interpretation proposed:** the postscript disclaims official author-led services and partnerships; it does not prohibit the community implementation the sources explicitly request. This project remains a community implementation under review, not an official succession claim.

**Gate:** product naming and release communications.

**Acceptance:** no official partnership badge, privileged creator identity or claim that publication alone proves community acceptance.

**Decision:** OPEN interpretation; safe local naming follows the user's current instruction. M-049, R2-003–R2-005.
