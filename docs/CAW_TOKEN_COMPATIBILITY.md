> Alpha.17 follow-up: [local token compilation](CAW_TOKEN_SOURCE.md) reproduced the executable match with a metadata qualification. [One remote custody experiment](CUSTODY_PROBE.md) now records positive deposit/withdrawal and allowance effects in temporary state. The alpha.16 observations below remain historical and the zero-address conflict stays open.

# Existing CAW · token compatibility

**Alpha.16 found a concrete blocker for literal zero-address burning.** At the pinned Ethereum block below, two public RPC services return the same zero-address rejection for the specified CAW calls. The positive control calls succeed. Username minting cannot claim compliance with that rule yet.

This is a read-only observation and offline account-proof check. No transaction, local fork, token-source recompilation, custody transition or deployment was performed. The website remains a simulation.

## What was observed

The [CAW project site](https://caw.is/) links the Ethereum token below. The [pinned cawdevelopment reference](https://github.com/cawdevelopment/CawUsernames/blob/fbb07cd971fb33e18d4018162c39311dc57a30af/contracts/CawNameMinter.sol#L28) uses a nonzero dead-pattern destination; its test implementation does not resolve the manifesto's literal `0x0` wording.

| Field | Pinned value |
| --- | --- |
| Network / block | Ethereum, chain ID `1`, block `25,936,362` (`0x18bc1ea`) |
| Token | `0xf3b9569f82b18aef890de263b84189bd33ebe452` |
| Block hash | `0xf3e3dfad2242562dbed62de90831c39eace7c7c6e88f8c509afccef9a5f73e4d` |
| State root | `0x6d530d69c70f41b4b1a57f39751336304ff7c2c5d45e4dcd946869ecce4c0152` |
| Runtime | 2,278 bytes, Keccak-256 `0x6ee560d3e6b1f881a8711e0be0b30a0e8e0cf8b915ce8f75ea05002126c94256` |
| Observed metadata | `A Hunters Dream`, `CAW`, 18 decimals |

Each provider was queried 18 times. Chain, block number/hash/root and runtime agree, with the pinned block checked before and after calls. Each call specifies this historical block, caller `0x0000000000000000000000000000000000000001` and a 200,000-gas limit; no state overrides are used. That public address has at least one base unit in the observed state and zero self-allowance. It is a simulation caller only; no key or control of it is claimed.

| Exact call | Both providers observed |
| --- | --- |
| `transfer(0x0000000000000000000000000000000000000002, 0)` | ABI `true` |
| `transfer(0x0000000000000000000000000000000000000000, 0)` | Revert: `ERC20: transfer to the zero address` |
| `transfer(0x0000000000000000000000000000000000000000, 1)` | Same revert; amount is one base unit |
| `transfer(0x000000000000000000000000000000000000dead, 0)` | ABI `true` |
| `transferFrom(caller, 0x0000000000000000000000000000000000000002, 0)` | ABI `true` with observed zero self-allowance |
| `transferFrom(caller, 0x0000000000000000000000000000000000000000, 0)` | Same zero-address revert |
| `burn(0)` selector `0x42966c68` | Revert without a decoded reason; this does not prove all burn mechanisms absent |

Exact calldata, result/error envelopes, metadata, runtime and headers are retained in the [PublicNode capture](../reference/fixtures/caw-token-publicnode.json) and [dRPC capture](../reference/fixtures/caw-token-drpc.json). Zero-amount success is a control, not evidence of positive-value settlement, events, consumed allowance or reduced supply. No approval was simulated and then incorrectly treated as persistent state.

## What the proof establishes

dRPC returned a nine-node account witness. The existing [offline Ethereum reader](ETHEREUM_STATE_PROOF.md) verifies it under the separately pinned state root and recovers a code hash matching the runtime returned by both providers. No token storage slots were requested. PublicNode rejected proof acquisition because the block exceeded its proof window; that failure is retained, not converted to an empty account or zero balance.

The [six offline checks](../tests/caw-token-capture.test.mjs) pin every request independently, check exact call outcomes, verify the real account witness/runtime, and reject a changed account claim, missing node and wrong root. These extend the prior synthetic fixtures with a captured network witness. [EIP-1186](https://eips.ethereum.org/EIPS/eip-1186) describes the proof format.

Provider agreement does not authenticate Ethereum consensus, prove freshness or verify the hash of the block header. The account proof commits to code under the supplied root; it does **not** prove `eth_call` outputs by locally executing that code. Exact compiler/source correspondence, storage interpretation, current authority and balance/supply transitions remain unverified. The original verifier's authority flags remain false.

## Reproduce and continue

`npm test` checks the preserved observations offline; it makes no RPC calls. To acquire fresh observations of this same pinned block, inspect [capture-caw-token.py](../scripts/capture-caw-token.py), then explicitly run it with Python 3:

```sh
python scripts/capture-caw-token.py --provider publicnode --output publicnode-recheck.json
python scripts/capture-caw-token.py --provider drpc --output drpc-recheck.json
```

The script refuses existing output files, redirects and non-read methods. Requests have response-size/time limits; unavailable historical state remains a recorded failure. It is a research tool and is not connected to Commons, the build or the offline tests.

Keep [C-001](../sources/SPEC_CONFLICTS.md#c-001) open. Obtain exact source/runtime correspondence and execute a disclosed isolated experiment that measures positive transfers, allowance use, deposit/withdraw balances and supply separately. The observed zero-address failure must be resolved explicitly; a nonzero dead-pattern address is not silently equivalent. [Protocol v0](PROTOCOL_V0_SCOPE.md) defines the next complete action path and its remaining source decisions.
