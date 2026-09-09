# Historical proof and current authority

**Authority design proposal, with a bounded offline state-proof component. No production authority source or finality rule is implemented or adopted here.** This document separates the evidence the alpha can check from the inputs a live protocol would need. It changes none of the 59 requirements or 15 open specification conflicts.

## What the source asks for

The pinned manifesto gives control of an account to its NFT owner (M-011), calls for independently usable frontend interfaces (M-007), and requires permanent, independently reconstructible data (M-022). See the exact [requirements](../sources/MANIFESTO_REQUIREMENTS.tsv), [manifesto](../sources/primary/manifesto-pinned.md) and [open conflicts](../sources/SPEC_CONFLICTS.md). The tables below are proposed engineering consequences, not additional words decoded from either riddle.

## What the alpha can establish

| Checked evidence | What follows | What remains unknown |
| --- | --- | --- |
| Exact signed action and a separately supplied test key | That key verifies the exact action bytes | Whether that key belongs to the current NFT owner |
| Matching record and reconstructed accounting | The supported record is consistent with its selected fixture and fingerprints | Whether the source fixture is authentic or later records are missing |
| Owner-signed test grant, separate owner key and permission | The selected key authorized those exact delegate terms | Current on-chain ownership, real balances or a live spending entitlement |
| Valid cancellation for the same grant | Cancellation is present in this verified historical record | Whether an older record omitted a later cancellation, or when an untimed cancellation was published |
| Retained comparison anchor | A candidate can be compared with that retained history | Whether either history is the canonical latest one |
| Account/storage Merkle-Patricia proof and separately supplied state root | The selected values or their absence match that root under the supported proof profile | Whether the root is authentic, current, finalized, tied to a chosen deployment or describes the CAW NFT owner |

The alpha's recorded acceptance time is an input checked against signed validity windows. A local clock label, a packet timestamp and a matching hash do not authenticate historical time. Its unsigned fixture transfer demonstrates consequences of changed control; it is not a real NFT transfer authorization.

## Proposed inputs before any live permission restoration

A future verifier must receive evidence through a defined trust path, rather than letting the record choose its own authority. The [offline proof reader](ETHEREUM_STATE_PROOF.md) checks a bounded Ethereum account/storage proof against a separate root. It makes no network request and implements none of the live authority adapter or root-acceptance policy described below.

| Input | Required binding and check | Current status |
| --- | --- | --- |
| Deployment identity | Agreed network/genesis, contract addresses, verified code and any upgrade authority | Unselected for this alpha |
| Accepted chain anchor | An independently validated block/state commitment under an explicit finality and fork policy | Not implemented |
| NFT account authority | Correct token/account mapping and ownership evidence at that accepted state | Not implemented |
| Permission and cancellation state | Exact grant identity, delegate key, scope, limits and cancellation status tied to the same accepted state | Historical synthetic evidence only |
| Spending and replay state | Nonces and spent budget reconstructed in the accepted event order through that state | Bounded synthetic reconstruction only |
| Validity time | One agreed protocol time rule and explicit expiry boundaries | Recorded test times only |
| Available history | Enough authenticated history/state to reconstruct without a particular website, API or indexer | Local archives and fixtures only |

A response from an RPC service is a data source; the design must specify why its claimed state is accepted. Several matching services may detect disagreements without removing a shared trust assumption. A locally validated node or independently verified consensus/state proof would also require an explicit bootstrap, update and finality policy. This document selects no technology or trust root.

## Decision behavior to implement and test

Until that trust path exists, imported records remain inspection-only. The proposed live verifier should return a reasoned failure when ownership evidence is missing, inputs refer to different anchors, a candidate is older than a retained anchor, histories conflict, required history is unavailable, permission is cancelled, scope/time/budget is exceeded or a prior ownership epoch attempts to act. Unknown freshness must never be converted into permission merely because the historical signature is valid.

Successful restoration would require matching deployment, anchor, current owner, grant, cancellation, spending and nonce evidence under the adopted rules. It must not restore a private key from a public record. A fresh check immediately before acceptance and an atomic state transition must address changes between inspection and settlement; the current offline readers perform no settlement.

The acceptance table should include: old and new owners around a transfer; cancellation before and after an action in the accepted order; two competing same-height histories; withheld suffixes; a rollback after restart; conflicting providers; expired or unavailable anchor evidence; a changed deployment; and simultaneous spends against one remaining budget. Compare accepted/rejected outcomes with separate implementations and preserve failures as evidence. These are planned cases for the future authority adapter, not claimed alpha test coverage.

## Decisions still required

Source conflicts C-005, C-006 and C-009 address transferred account access, storage/reconstruction and delegated spending authority. Production token behavior, economics and related conflicts also remain open. Resolve and record those choices before assigning final contracts, settlement rules or permission semantics. Prototype settings are not community approval.

Availability needs a retention plan, independent copies, retrieval paths and a stated funding assumption. Integrity alone cannot make a website, domain, relay, application store or storage provider permanent. Describe the loss of each dependency and the recovery path; do not claim that no participant or infrastructure can ever fail.

This proposal provides a boundary for further work. It does not authenticate real ownership, restore live authority, deploy contracts or establish perpetual service.

## Implemented component and next boundary

Alpha.15 introduces a separate Ethereum proof reader, fixed synthetic witnesses and an independently written Python construction oracle. It checks Keccak-256 links, canonical RLP, inclusion/absence, exact requested slots and RPC claims against values recovered from the authenticated paths. The [reader specification](ETHEREUM_STATE_PROOF.md) states strict local limits and supported input forms. Its examples are constructed tries, not observations of a deployed contract, and no live client interoperability run is claimed.

That component does not accept a chain header, select a finality rule, determine the current block, interpret a contract storage layout or infer an NFT owner. Supplying a root for an older state can still yield a valid proof. A changed root without a matching witness fails, but an authentic latest root requires the separate trust path above. Next work must bind a root to a separately accepted header and deployment before interpreting its slots as CAW authority; freshness and simultaneous-spend rules remain later, distinct requirements.
