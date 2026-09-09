> Alpha.19 revision: [experimental NFT account custody](ACCOUNT_AUTHORITY.md) now has local execution evidence. Direct epoch checks are implemented; registration, signed paid actions and production authority remain open. Earlier release observations below are historical.

> Alpha.18 revision: [local custody execution](LOCAL_CUSTODY.md) completed 23 historical-token and 26 separate synthetic cases. NFT authority, production settlement and C-001 remain open. Earlier release observations below are historical.

# CAW custody · isolated experiment

**One remote simulation completed the actual-token deposit and withdrawal sequence.** The original custody probe compiled locally; dRPC executed its creation and calls in temporary state above the pinned Ethereum block. No wallet was connected, no transaction was broadcast, and no contract remains deployed by this experiment.

This is a small depositor-keyed component. It does not implement NFT usernames, paid CAWs, staking, signature authority or the completed manifesto protocol. The website remains a simulation. [The zero-address burn conflict](CAW_TOKEN_COMPATIBILITY.md) still gates username registration.

## The component

[CawCustodyProbe.sol](../experiments/custody/CawCustodyProbe.sol) fixes the existing CAW token address. A depositor can add their own credit and withdraw only to their own address. Deposits require the exact incoming balance increase; withdrawals require exact custody and recipient balance changes. Both entry points reject zero amounts and reentrancy. Credit and total liabilities must remain backed.

There is no administrator, upgrade, rescue, arbitrary-call or fee-redirection entry point. Unsolicited token transfers remain surplus; they do not create a withdrawal entitlement. These are source properties of this small probe, not a production security audit. The probe itself does not authenticate the token runtime; the experiment checks it separately against the [reproduced token evidence](CAW_TOKEN_SOURCE.md).

## Observed sequence

All amounts below are **integer base units**, not whole CAW or proposed protocol prices. The caller's observed starting balance was 698,790,077,736 base units, enough for every intended branch. No token balances, allowances, nonce, bytecode or block fields were overridden.

| After step | Custody balance | Caller credit / total credits | Remaining allowance |
| --- | ---: | ---: | ---: |
| Approve 13 | 0 | 0 | 13 |
| Deposit 1 | 1 | 1 | 12 |
| Deposit 7 | 8 | 8 | 5 |
| Rejected calls | 8 | 8 | 5 |
| Withdraw 3 | 5 | 5 | 5 |
| Withdraw 5 | 0 | 0 | 5 |
| Direct donation 2 | 2 | 0 | 5 |
| Rejected surplus withdrawal | 2 | 0 | 5 |

The caller lost exactly the deposited units and regained exactly the withdrawals. Total supply stayed unchanged. Foreign and deployer withdrawals, zero amounts, an over-credit withdrawal and an over-allowance deposit reverted. The over-allowance case reached the token's exact allowance error and left no movement or events behind; later withdrawals succeeded. A separate maximum-allowance branch spent one unit and observed `MaxUint256 - 1`, consistent with this token's source.

The [raw dRPC receipt](../experiments/custody/drpc-simulation.json) contains 25 outer read-only requests and 80 calls inside one ephemeral block. The [offline tests](../tests/caw-custody-probe.test.mjs) separately check exact requests, decoded values, successful token/probe events, failed-call bytes, rollback and surplus. The acquisition script's own expected values are not the independent test oracle.

The predicted temporary probe address is `0x997c6adf27316ddd51446350df99ebfc6b1d9365`. Its deployer and address had no code or nonce at the pinned block. Pinned persistent reads before and after the sequence agree; the temporary probe does not appear in those reads. The record's generated block/transaction hashes belong to the simulation and must not be presented as mined receipts.

PublicNode rejected the second-provider attempt at the runtime read, requiring authenticated archive access. Its [failure receipt](../experiments/custody/publicnode-simulation.json) is preserved. No two-provider custody agreement is claimed. An earlier acquisition preflight also rejected a malformed disposable address; it was corrected with local address validation before the successful run.

## Reproduce and assess

The [compiler input](../experiments/custody/compile-standard.json) and [build](../experiments/custody/probe-build.json) identify the original probe. Solidity 0.8.10, optimizer 200 and London were used to keep this experiment alongside the token reproduction; this is not a production compiler recommendation. Standard-JSON compilation and diagnostic review are required before replacing any build.

The [capture script](../experiments/custody/simulate-custody.py) accepts only the two fixed public providers, a new output path and separately retained build/script hashes. The recorded build SHA-256 is `c939cea1d6bb8e75a3dc1f4809bb3b7fdd7358ed2c244f67e480148690e6d06a`; script SHA-256 is `9ab5583d369bb47f31370606ab38a7b1ae09fbd156e35bbb9be1bf0c29c81eec`.

```sh
python experiments/custody/simulate-custody.py --provider drpc --output custody-recheck.json --expected-build-sha256 c939cea1d6bb8e75a3dc1f4809bb3b7fdd7358ed2c244f67e480148690e6d06a --expected-script-sha256 9ab5583d369bb47f31370606ab38a7b1ae09fbd156e35bbb9be1bf0c29c81eec
```

It uses [`eth_simulateV1`](https://geth.ethereum.org/docs/interacting-with-geth/rpc/ns-eth#eth_simulatev1), with validation disabled and no signatures. Calls carry no native-value field. A request is bounded to 30 seconds and a capture to 300 seconds; the fixed sequence's gas limits total 10,400,000, below its 20,000,000 bound. This script is separate from the app and offline test runner. Provider availability or archive policies may change, and a later failure must remain a failure.

Remote execution is provider-reported evidence. It does not prove owner authorization, Ethereum consensus, latest state, persistent custody or independent local EVM execution. The retained header/root is still an external trust input. Reentrancy and malformed/false-return token defenses are implemented but adversarial token implementations were not executed in this sequence. The next custody gate is an independently run local experiment with those cases, then an explicitly specified NFT-account authority model. None of the 15 source conflicts is silently closed.
