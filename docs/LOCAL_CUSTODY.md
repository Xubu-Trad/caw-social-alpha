# Local custody · alpha.18

**Local execution completed: 23 real-token cases and 26 separate synthetic cases.** Independent offline assertions check the saved requests, effects and failures for the unchanged [custody probe](../experiments/custody/CawCustodyProbe.sol). This advances the component evidence; the website remains a simulation and the full protocol is unfinished.

| Experiment | Execution and independent result review |
| --- | --- |
| Historical CAW runtime and storage | 23 cases passed their stated expectations; 24 local transactions including probe creation; [full receipt](../experiments/local-custody/fork-result.json) |
| Synthetic token failures | 26 cases characterized; 143 local setup/action/recovery transactions; [full receipt](../experiments/local-custody/synthetic-result.json) |

## Two environments

**Historical asset:** an isolated Anvil fork starts at Ethereum block **25,936,362**. The runner checks the recorded block hash/state root and CAW runtime before changes. Upstream requests pass through a pinned, read-only proxy; token code and historical storage are retained. Transactions go only to the owned loopback node.

Three public test addresses are impersonated and receive fabricated local native currency for gas. No real key or ownership of those addresses is claimed. The local chain uses ID **31337** and explicit **London execution rules**. Its generated blocks are an experiment, not a replay of the full historical Ethereum block or evidence of Ethereum finality. This is not a public deployment or transfer of real CAW.

**Synthetic failures:** the first node stops; a separate empty local chain starts without a fork/provider. The original [AdversarialToken fixture](../experiments/local-custody/AdversarialToken.sol) replaces the token at the CAW address **only in this synthetic environment**. Test controls set balances, losses, return behavior and callbacks. These controls are not features of CAW or the proposed protocol.

## Evidence and reproduction

The [token source review](CAW_TOKEN_SOURCE.md) records the reproduced executable match, observed decimals immutable and differing original metadata. That compilation result does not establish constructor execution or historical state provenance.

Inspect the [scenario runner](../experiments/local-custody/run_local_custody.py), [local-node controls](../experiments/local-custody/local_node.py), [fixture compiler input](../experiments/local-custody/compile-standard.json) and [fixture build](../experiments/local-custody/fixture-build.json). The [toolchain record](../experiments/local-custody/toolchain.json) records checksum-pinned Anvil used by the Python helper on Windows: **v1.8.1**; source compilation uses the pinned Solidity **0.8.10** toolchain. No runtime binary is distributed in this alpha.

Reproduction requires separately verified executable/source hashes, an explicit `fork` or `synthetic` mode and a fresh output destination. The helper retains exact calls, receipts, before/after state and failures. Each node has a ten-minute limit and bounded requests, transactions, gas and output. Anvil receives a Windows Job Object with a 512 MiB committed-memory cap and kill-on-close. Other sampled memory, deadline, output and startup checks are monitored safeguards; they do not cap total machine memory. Both nodes and test listeners were confirmed stopped. See [validation](VALIDATION.md) and the [offline assertions](../tests/caw-local-custody.test.mjs).

## What is measured

The custody oracle compares caller/probe balances, both callers' allowances and credits, total credits, supply and events. It checks positive deposits/withdrawals, foreign and excessive withdrawal rejection, allowance failures, rollback and uncredited donation surplus. Failed token/accounting state must roll back; native transaction nonce and gas expenditure are outside that claim.

Synthetic cases exercise false/reverting/malformed returns, trailing-return compatibility, wrong incoming/outgoing deltas, and callbacks into both probe entrypoints with caught or propagated failure. They characterize the probe and compiler, not real CAW's behavior or exhaustive adversarial safety.

Two limits must stay visible:

- Deposit checks exact vault intake, but does not independently constrain the sender's debit. The sender-fee case credited 2 units while debiting the sender 3; the deposit succeeded. Do not describe the probe as universally safe for fee-charging tokens.
- Backing loss blocks operations that leave liabilities underfunded. New credited deposits do not repair that deficit; the measured one-unit uncredited replenishment restored withdrawals. The probe has no loss-sharing or guaranteed recovery mechanism. A dishonest token can also misreport balances.

Next comes current **NFT account authority**, with isolated accounts and transfer-safe permissions; depositor addresses are not transferable username accounts. Registration remains blocked by [C-001](../sources/SPEC_CONFLICTS.md#c-001) and the observed zero-address rejection. Custody results cannot supply a replacement burn rule.

## Reproduce

After reviewing and verifying the separately acquired Anvil executable and the two Python files against the source manifest, run each mode with a new output filename:

```sh
python experiments/local-custody/run_local_custody.py --mode fork --anvil /path/to/anvil.exe --output fork-recheck.json --expected-script-sha256 2a9def217b099c9649006ebe80c1f468c602d886df5cc6788f639acb0e2d13f1 --expected-node-sha256 aa3a878c10508134b4869751df5f951aecb051ab5873ecf0299899fa512cb5ea
```

For the separate empty-chain suite, use `--mode synthetic --output synthetic-recheck.json`. The example reproduction outputs are excluded from Git tracking. The recorded runner is Windows-specific. Ordinary `npm test` only reads retained evidence and never launches an EVM or connects to a provider. Fork retrieval still depends on provider availability and a trusted historical state input.

Initial startup attempts exposed supported client request forms: omitted empty identity parameters, an optional node-info probe, full historical blocks and [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898) hash selectors. Those failed attempts remain in the local evidence archive. The final proxy records every normalization and locally refused capability; state reads still target only the pinned block. No failed attempt is counted as a completed run.
