# Economics: source scenarios and unresolved rules

Status: provisional appendix fixture implemented and accounting tests passed; production settlement BLOCKED. Values below are historical CAW-denominated recommendations, not current prices, affordability claims or a final adopted fee schedule.

Primary reference: manifesto commit `37399aeb55974d4b09d404014865b5ef8918e9de`, lines 106–140. Exact passages and SHA-256 are retained in the requirements register.

| Username length | Recommended CAW burn |
|---|---:|
| 1 | 1,000,000,000,000 |
| 2 | 240,000,000,000 |
| 3 | 60,000,000,000 |
| 4 | 6,000,000,000 |
| 5 | 200,000,000 |
| 6 | 20,000,000 |
| 7 | 10,000,000 |
| 8 or more | 1,000,000 |

| Action | Recommended CAW cost | Appendix distribution |
|---|---:|---|
| Follow | 30,000 | 80% target account; 20% stake pool |
| CAW | 5,000 | 100% stake pool |
| Like | 2,000 | 80% target account; 20% stake pool |
| ReCAW | 4,000 | 50% target account; 50% stake pool |

Main prose directs likes to the original poster and describes reCAW payment differently; it does not explicitly fix every percentage. Post proceeds refer to other stakers, raising payer-exclusion questions. The appendix does not resolve what stake is, when weights are measured, or what happens with no eligible recipients. No production behavior should silently privilege one reading.

## Token compatibility gate

The preserved creation receipt identifies the CAW contract as `0xf3b9569f82b18aef890de263b84189bd33ebe452`; this phase has not independently queried its bytecode, decimals or transfer behavior. The manifesto specifies `0x0` for mint burns. Contract identity does not prove that the original token supports the required zero-address transfer or reduces total supply.

Before real custody: verify address, chain, creation receipt, bytecode/source correspondence, decimals, allowances and exact transfer behavior; isolate tests for zero-address transfer, transferFrom and any actual burn function. Preserve failure evidence. A different destination or substitute token requires a disclosed specification decision. No production mint/burn contract is authorized by the fixture plan.

## Fixture arithmetic

All monetary values use integers. A demo can express base units with a declared synthetic 18-decimal convention; this is not token verification. JSON exports use decimal strings, never floating-point balances. Percentage divisions retain quotient and remainder so every base unit remains explainable.

For an appendix demo like of 2,000 whole synthetic CAW, 1,600 goes to the target and 400 to an eligible stake pool. With resolved fixture weights 3:1, shares are 300 and 100. This is a chosen test example, not a definition of real stake. Separate deliberately small base-unit fixtures must reveal rounding and dust. A blocked/undefined zero-pool case must not silently donate dust to a builder.

Required production invariants include deductions equalling all credits plus explicitly modelled burns, deposits and withdrawals preserving liability backing, rejected/replayed actions changing nothing, and resolved NFT-transfer ordering. The implemented fixture uses only `appendix-demo-v1`, with fixed synthetic stake weights, payer exclusion for every action and integer division dust held in a visible reserve. Those are disclosed demo decisions, not adopted production rules. Zero eligible stake is rejected. No deposits, withdrawals, minting or real token custody are implemented.

Model and separate literal reference tests cover underfunding, duplicate events, authority changes, exact precision, conservation and remainders. Ledger now offers a [read-only scenario comparison](ECONOMIC_SCENARIOS.md): the appendix against a proposed 100% recipient interpretation for likes and reCAWs, with common fees and stake assumptions. Confirmed demo actions still use `appendix-demo-v1`. The shared allocator removes duplicated distribution arithmetic; it does not resolve C-002 or establish real token custody. Current execution evidence must identify the reviewed source revision.

## Operating cost model

Keep CAW action distribution separate from execution and retention expenses. No growth fund, support token, privileged DAO or compulsory Xubu sponsorship is proposed.

For A actions/day with B retained bytes/action and R full replicas, raw annual storage is `365 × A × B × R` bytes before indexes, backups, media and protocol overhead. At an **assumed** 768 bytes/action, 1,000 actions/day uses 280,320,000 bytes/year per replica; 10,000 uses 2,803,200,000. Three replicas triple those figures. This is workload arithmetic, not a measured encoding or hosting quote.

Monthly execution expense must be measured as batches × measured gas × scenario gas price, with each payer named. Relays also pay for monitoring, invalid submissions, retries, bandwidth and capital held for gas. Direct submissions move expense to the user and may conflict with the intended ordinary gasless experience. Cost scenarios must include zero sponsorship and unavailable default relays.

First bootstrap spending: zero. Production viability, network selection and a sustainable source-compatible funding path remain unproven.
