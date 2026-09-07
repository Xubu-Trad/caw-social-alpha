# Payment descriptions, made testable

Ledger now compares two named allocation profiles using the same pure arithmetic component as the synthetic settlement model. The active model still uses `appendix-demo-v1`. The comparison does not create an intent, charge an account, check a balance or alter its history.

The [pinned manifesto](../sources/primary/manifesto-pinned.md) describes likes as direct payments to the original poster at line 55 and reCAWs as payments to that poster's wallet at line 58. Neither passage explicitly says 100%. Line 119 also names both poster and stakers for reCAWs. The recommended appendix at lines 137–140 specifies different percentages. These observations keep C-002 open.

| Profile | Like | ReCAW | Status |
| --- | --- | --- | --- |
| Recommended appendix · current demo | 80% recipient / 20% pool | 50% recipient / 50% pool | Existing provisional fixture |
| Proposed 100% recipient interpretation | 100% recipient / 0% pool | 100% recipient / 0% pool | Interpretation for review; not an adopted prose rule |

Both examples borrow the appendix's fees. Both use 100% pool for a CAW and the appendix's 80% recipient / 20% pool for Follow. Keeping these inputs fixed isolates the Like/ReCAW allocation difference; it does not claim the prose supplied every parameter.

Stake weights remain fixed demo units, the payer is excluded from every pool, and integer division leaves a visible rounding remainder. The original poster may also receive a pool share; the UI lists that separately from direct credit. A pool payment with no eligible positive-weight recipient rejects. A proposed all-recipient payment has no pool to distribute. These are testable fixture choices, not solutions to C-007.

`public/economics.mjs` contains bounded plain-data validation, immutable fee constants and `allocateFee`. The model and comparison use the same implementation; existing literal reference tests provide separate expected arithmetic. A shared helper is not an independently implemented protocol or external peer review.

Values are exact integer base units under the synthetic 18-decimal convention. The original CAW token's compatibility, burn behavior, custody, stake timing and authorization are still unverified production requirements. No developer beneficiary, new fee, arbitrary profile or mutable production parameter is introduced.

Changing the protocol requires a cited decision and review, consistent with [R2](../sources/primary/r2-message.txt). This comparison makes alternatives reproducible; it does not decide them.
