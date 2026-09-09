# Paid-action regression

Keep the contract fixed. Challenge the interactions.

Alpha.21 adds **72 local regression cases** against the unchanged alpha.20 `CawPaidActionProbe`. The fresh synthetic chain completed 208 transactions, including 11 accepted paid posts and 47 deliberately rejected case transactions. All 72 expected state transitions matched. [Issue #2](https://github.com/Xubu-Trad/caw-social-alpha/issues/2) remains open for review and further coverage.

This run uses an openly configurable synthetic token at the test token address. It is **not another execution of historical CAW token logic**. The [alpha.20 historical-token experiment](PAID_ACTION.md) remains separate and unchanged. Neither run is a production audit.

## Evidence

| Record | What it contains |
| --- | --- |
| [Execution summary](../experiments/paid-adversarial/execution-summary.json) | Counts, final balances, resource use and explicit limits |
| [Complete trace](../experiments/paid-adversarial/execution-trace.json) | Local requests/responses, transaction receipts, before/after snapshots, public disposable signing material and fixture deployments |
| [Input pins](../experiments/paid-adversarial/experiment-inputs.json) | Exact hashes of the 16 runner, contract, fixture and build inputs |
| [Compiler input](../experiments/paid-adversarial/compile-standard.json) and [receipt](../experiments/paid-adversarial/compiler-receipt.json) | Inline source, Solidity 0.8.10 / optimizer 200 / London settings and successful bounded compilation |
| [Offline checker](../reference/paid-adversarial-evidence.mjs) and [mutation tests](../tests/caw-paid-adversarial.test.mjs) | Independent accounting/receipt consistency checks; no runner accounting imports |
| [First attempt](../experiments/paid-adversarial/first-attempt.json) | Retained harness funding failure and the reason for the correction |

The unchanged probe source SHA-256 is `e48f8f8f816aae21e0e9865a8be0aa2e47204ea04b4c12b4124e5b0452412da1`, from the [initial alpha.20 review target](REVIEW_BASELINE.md). New contracts are test instruments: an entry-point callback adapter, a hostile signature-response fixture and a read-only state snapshot helper. Their public configuration controls are not proposed protocol powers or wallet policy.

## What was checked

| Interaction | Observed result |
| --- | --- |
| Token returns false, reverts, returns short/empty/invalid Boolean data, or moves unexpected amounts | The outer deposit/withdrawal reverted with token, allowance, NFT and accounting state unchanged |
| Valid Boolean with a trailing word | Accepted with exact expected movement; this is the compiler's observed compatibility behavior |
| Deposit/withdraw callbacks try each of deposit, withdraw, stake, unstake and post | Every nested attempt rejected with `Reentrant()`; caught failure permitted the outer move, propagated failure reverted it |
| Previously approved hook transfers the payer NFT away, or away and back, during token movement | `AuthorityChanged()` rejected the outer action; owner, epoch, approval, allowance and balances rolled back |
| Synthetic vault balance deliberately falls one base unit below liabilities | Deposit, withdrawal, stake, unstake and signed posting rejected; valid withdrawal worked after test backing was restored |
| Contract-owner response has wrong magic, four-byte output, explicit revert or exhausts its gas allowance | Posting rejected without fee or nonce consumption |
| Contract-owner response returns valid magic plus 64 KiB of data | Accepted with one settlement; the probe copies one word under its fixed verification-gas cap |
| Synthetic length-only signature policy | Lengths 0 and 4,096 accepted under that deliberately permissive fixture policy; 4,097 rejected by the probe. This is not evidence that empty signatures are generally safe |
| Contract-owner callback tries a nested paid action or registry transfer during static signature verification | Nested state change was absent. Catching rejection and returning a valid signature allowed one outer post; propagating rejection prevented it |
| Repeated intent, ownership transfer and later recovery | A second submitter's duplicate and old-epoch actions rejected; after the wallet fixture returned the NFT, the current owner could unstake and withdraw |

Every case compares 40 observed values: ownership, epochs, approvals, credits, stakes, nonces, aggregate liabilities, dust, message count, token balances/allowances/supply, callback telemetry and NFT balances. Rejected receipts contain no logs. Successful posts check exact fee allocation and a single post event. Native gas and transaction nonces are outside rollback: failed transactions still pay gas.

Final token holdings are `150000000000000000000018` base units: `150000000000000000000007` in credits plus `11` dust. The checker recomputes every successful allocation; no builder or relay receives a protocol share.

## Reproduce

With Node.js 24.20.0, run the retained-evidence checks from the repository root:

```sh
node --max-old-space-size=256 --test --test-isolation=none --test-concurrency=1 tests/caw-paid-adversarial.test.mjs
```

All 14 tests passed, including coordinated mutations of both summaries and raw observations. The full suite passed 380 tests across 26 files. These offline tests check the retained evidence; they do not execute an EVM, authenticate consensus or acquire independent history.

For fresh execution, review [run_paid_adversarial.py](../experiments/paid-adversarial/run_paid_adversarial.py) and [synthetic_node.py](../experiments/paid-adversarial/synthetic_node.py). Use the retained Python signing dependencies and hash-pinned Anvil 1.8.1 described in [the paid-action guide](PAID_ACTION.md). The new adapter forces a fresh synthetic chain, permits only the exact retained synthetic token runtime installation, and disables the remote proxy. Supply `--anvil`, a fresh `--output` filename in an existing directory, and `--expected-input-sha256` equal to the independently checked SHA-256 of `experiments/paid-adversarial/experiment-inputs.json`. Review that manifest and its input files before trusting it.

The Windows runner retains the existing 768 MiB free-memory / 2 GiB disk startup thresholds, hard 512 MiB node cap, 600-second deadline, 4-million-gas transaction limit, 250-transaction / 1,800-request limits and 4 MiB compact RPC trace bound. This run used 970 local requests, no remote calls, 38.094 seconds and a measured peak of 26,873,856 bytes. Its owned node stopped before offline validation.

Disposable native gas balances and local account impersonation are test controls, fully recorded. The first attempt stopped because a read checked its maximum upfront gas cost against an exhausted test balance. The corrected runner refills only fabricated native gas after two million gas spent; each refill stays within the existing one-ETH local override limit. No token/accounting rule or resource guard was relaxed. Signature randomness and local timestamps mean fresh transaction hashes need not match the retained capture.

## Remaining boundary

This finite case set found no unexpected state transition. It does not establish that no vulnerability exists. The checker trusts the supplied capture and fixture code; it does not independently reacquire history or verify chain consensus. The registry mutation cases show rejection under signature `STATICCALL`, not an execution trace proving the precise internal exception or a bounded non-static positive control.

Standalone NFT receiver callbacks, broader registry/token behavior, fuzzed call sequences, current-EVM delegated-wallet compatibility, reorg recovery and independent acquisition remain further work. Source decisions, authentic registration, scalable distribution and production review remain open. No interface behavior, real wallet connection, public-chain deployment or permanence claim is added.
