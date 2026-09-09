> Alpha.20 revision: [one signed, paid CAW](PAID_ACTION.md) connects the fixed test registry, historical token logic, owner signatures, fees and recorded history. Registration, authenticated durable history, full combined adversarial regression and production authority remain open. This finite slice does not complete all gates below.

> Alpha.19 revision: [experimental NFT account custody](ACCOUNT_AUTHORITY.md) now has local execution evidence. Direct epoch checks are implemented; registration, signed paid actions and production authority remain open. Earlier release observations below are historical.

> Alpha.18 revision: [local custody execution](LOCAL_CUSTODY.md) completed 23 historical-token and 26 separate synthetic cases. NFT authority, production settlement and C-001 remain open. Earlier release observations below are historical.

> Alpha.17 progress: [source reproduction](CAW_TOKEN_SOURCE.md) and [depositor-keyed custody](CUSTODY_PROBE.md) provide partial Gate 0 evidence. Remote simulation is not an independent local fork, NFT identity or paid settlement; the remaining gates below still apply.

# cawmmunity.caw - decentralized - social - protocol

Proposed v0 experiment within the [shared repository](../README.md). The component name does not change the contracts, signed domains or historical evidence below.

Prepared 2026-09-08 against alpha.15. **No contract, fork run, wallet integration or deployment is implemented by this document.** The target is one complete, reproducible public-action path using the existing CAW runtime in an isolated experiment. It is not the complete protocol, a production release or a resolution of the 15 source conflicts.

The outcome must be observable: an account owner authorizes one CAW; a candidate contract validates authority and charges its declared experimental cost exactly once; complete public records allow two independently written readers to reconstruct ownership, balances and exact text without the original application's database.

## Source gates

| Requirement | Primary basis | Minimum evidence |
| --- | --- | --- |
| No privileged developer control | Manifesto M-001/M-005, [L6–11 and L27–28](../sources/primary/manifesto-pinned.md); R2-007, [L11](../sources/primary/r2-message.txt) | Full code/configuration/call graph; no upgrade, administrator, pause, confiscation, hidden recipient or builder reservation path. |
| Public, interoperable clients | M-007, manifesto L33; R2-003–005, R2 L5–7 | Published candidate format, exact source/build and objections; outside reproduction remains a separate gate. |
| Original-asset username and authority | M-008–014, manifesto L36–47 | Actual-token compatibility, unique on-chain username/NFT, current owner controls funded balance and withdrawals. |
| One paid public CAW | M-006/M-015, manifesto L32/L51–52; recommended amount at L138 | Exact message bytes, explicit length rule, fee and distribution to eligible other stakers under a disclosed experimental policy. |
| Recoverable public record | M-021/M-022, manifesto L68–73; R2-008, R2 L13 | Both independent reconstructions obtain complete records from a pinned chain history and agree; availability assumptions remain stated. |

The [conflict register](../sources/SPEC_CONFLICTS.md) remains authoritative for open questions. A candidate parameter freeze is an experimental decision, not community approval or a change to recovered words.

## Gate 0 — establish the actual asset first

Produce a compact reproducible receipt containing chain ID, address, exact block number/hash, runtime bytes/hash, verified source/compiler match where obtainable, metadata and all calls with results. Record how the block/root was obtained and the limitations of each provider; agreement between providers is not consensus verification.

Read-only calls can establish observed metadata, runtime and return/revert behavior under the stated block context. A later separately authorized isolated fork must establish actual state transitions: `transfer`, `transferFrom`, allowance consumption, deposit/withdraw round trips, zero amount, insufficient balance and zero-destination behavior. Use public disposable test identities. If a local account is impersonated or its gas balance is changed, record that explicitly. Preserve the CAW runtime and storage at the fork point; do not patch token logic to make a test pass.

Measure sender/recipient/custody balance deltas, allowance and total supply separately. Sending to an inaccessible address, sending to zero and reducing supply are distinct outcomes. The [ERC-20 specification](https://eips.ethereum.org/EIPS/eip-20) defines the interface, including handling false returns; it does not prove this deployment's behavior. Decimals must come from this asset's evidence before converting recommended CAW amounts to base units.

**Stop:** zero-address mint burn cannot execute as specified; source/runtime identity is ambiguous; token behavior can underback custody; or a relevant token authority remains unexplained. Preserve the failure. Do not substitute another address, mock asset, bridge or burn method and call it compatible. In that case, keep username registration gated while continuing separate read-only analysis and explicitly synthetic component tests.

## Gate 1 — freeze only the experimental choices needed

Before contract coding, record one versioned candidate schedule and wire format, its source basis, alternatives and unresolved production objections:

- **Identity:** unique lowercase `a-z0-9`; explicit nonempty and maximum-length rule; exact immutable mint-cost bands after Gate 0; no reserved names. The maximum and 8+ pricing interpretation remain C-003/C-013 proposals. No renewals, alias market or marketplace fee feature.
- **Custody:** liabilities belong to the NFT account, with deposit and owner-authorized withdrawal. Transfer changes authority, not the account's balance. Define atomic owner/nonce/epoch transitions so transferring away and back cannot revive a pending old signature.
- **Public text:** propose preserving exact valid UTF-8 text with no normalization and a 420-Unicode-scalar limit, plus a derived byte bound. Reject malformed encodings and test composed/decomposed text, emoji and 419/420/421 boundaries. This is still C-004's experimental interpretation.
- **Posting economics:** only the public CAW action. The recommended 5,000 CAW fee can be a named immutable experimental amount after decimal verification. Stake denomination, eligible units, payer exclusion, snapshot timing, withdrawals, zero eligible stake and rounding/dust treatment must be specified under C-007. A fixed builder-selected list of recipients or synthetic weights cannot stand in for real staking. Avoid an unbounded loop over all accounts; bound and justify settlement/claim costs without an administrator allowlist.
- **Submission:** test both unchanged relayed submission and a documented direct route. Identify who pays gas. A finite experiment sponsor is not a perpetual gasless funding model; no added protocol skim or builder treasury silently closes C-008.

If these choices cannot be made reviewable, narrow the milestone to compatibility and custody tests. Do not rename a free, unpaid post or a deposit transfer as the manifesto's paid CAW.

## Gate 2 — one immutable candidate, one action

Use a small directly deployed candidate or a minimal set of directly deployed components. Freeze the exact token address, constructor inputs, ABI, compiler/settings, runtime hashes, configuration and deployment graph. No proxy, upgrade hook, privileged initializer, mutable fee recipient or emergency seizure mechanism belongs in this candidate. User-controlled wallet authority must be distinguished from protocol administrator authority. No library, compiler version or license is selected by this plan.

Propose an Ethereum typed action with version/domain, chain ID, verifying contract, NFT/account ID, current ownership epoch, sequential nonce, validity interval, exact content digest and immutable schedule commitment. Bind every economically meaningful choice. Use a reviewed implementation of [EIP-712](https://eips.ethereum.org/EIPS/eip-712); the standard itself does not supply replay protection. The contract must enforce ownership, nonce/epoch, expiry and one-time atomic settlement. Do not treat the alpha's Ed25519 lab packet as an Ethereum wallet authorization format.

Declare wallet coverage. If contract owners are supported, verify their signatures using the [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) interface at execution and test rejection, revert, wrong return value and changed authority. An EOA-only local candidate must say so; it does not establish compatibility with every NFT owner. Delegation and invisible session signing are deferred, not inferred from wallet login.

Emit sufficient versioned public data for every identity, ownership, deposit, withdrawal, stake and settlement transition. The public CAW's complete text and its signed commitments must be recoverable from the chosen chain data; a content hash with a missing external payload fails. Document exactly which fields come from logs, transaction input, contract state or verified block context. No local cache supplies missing canonical facts.

## Gate 3 — two independent reconstructions

Build reader A and reader B independently from the documented ABI and state rules. They must not import each other's parser, accounting or application replay helpers. Shared public standards and byte fixtures are allowed; shared implementations must be disclosed. Prefer different implementation languages or libraries where that materially reduces common failure modes, without calling that an outside audit.

Both start empty from a manifest naming chain, deployment block, all contract/runtime hashes, configuration and an exact endpoint block/hash. Obtain full records, order them by block/transaction/log position, reject gaps and duplicate identities, and recompute ownership, nonces, stake claims, liabilities, reserve/dust and exact CAW text. Compare a canonical export byte for byte and cross-check reconstructed state with the candidate at that same endpoint.

An omitted log must not become an apparently valid shorter history: verify acquisition completeness against the selected block/receipt evidence and independently retrieved ranges. Reordering network responses is harmless after canonical ordering; a conflicting or incomplete chain record is not. Demonstrate reorganization rollback in the isolated environment and pin a stable endpoint for comparison. A local fork's stable endpoint is not Ethereum finality.

Disable the original frontend, relay, indexer and cache. Reader B must rebuild from the documented public inputs, and another submission path must still accept a valid action. Document node/archive access, retention, costs and failure assumptions. This is a bounded recovery result, never a guarantee of permanent data availability.

## Acceptance receipt

Later acquisition evidence: [alpha.22 recovery](PAID_HISTORY_ACQUISITION.md) independently traverses one fresh local history through two code paths and reconstructs both with the existing readers. Shared node/transport trust, authenticated acquisition and reorg recovery remain open.

Earlier bounded evidence: [alpha.21 paid-action regression](PAID_ACTION_REGRESSION.md), 72 expected cases on a separate synthetic chain against the unchanged alpha.20 contract. This advances callback coverage; it does not close the broader gates below or establish current-EVM delegated-wallet compatibility.

| Gate | Required finite check | Failure condition |
| --- | --- | --- |
| Asset | Original-runtime identity; balance/allowance/supply deltas; exact zero-destination outcome | Substituted or modified asset, ambiguous runtime, unexplained burn or custody mismatch |
| Identity/custody | Duplicate/invalid names; mint cost boundaries; deposit, withdrawal, transfer and transfer-back | Unauthorized withdrawal, insolvent liabilities, old signature revived, privileged account path |
| Action | One successful CAW plus altered text/cost/domain/nonce/owner/window, duplicate and underfunded cases | Any unintended debit, credit, content change or partial failure state |
| Stake accounting | Conservation, eligibility transitions, payer exclusion, zero-recipient case, rounding and bounded gas | Lost unit, hidden recipient, unbounded settlement or unbacked claim |
| Authority | Two relays race the same signed intent; direct submission; original services unavailable | Repeated charge, relay-selected economics, mandatory builder key or endpoint |
| Reconstruction | Two clean independent exports; missing/changed/reordered data; endpoint conflict and rollback | Silent partial history, different balances/text, reliance on private cache or unproved endpoint |
| Review | Exact candidate, known deviations, license status, dependency list and open objections | Claimed external audit, community approval or production readiness without corresponding evidence |

Record PASS, FAIL or NOT RUN for each check with exact artifacts and retained failures. A separately approved experiment plan must name toolchain, chain/fork, disposable keys, transaction/gas/time/resource caps and stop conditions before execution. The existing simulation app and guard remain intact.

Likes, reCAWs, follows, DM cryptography/history transfer and durable public-data retention are beyond this first complete action path. These required behaviors remain deferred. Optional client media previews, bridges, delegation, marketplace features and website hosting are separate extensions; this plan does not promote them to manifesto requirements. Public-chain testing and production release remain later decisions.
