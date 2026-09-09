# C-001 · Username registration decision request

**Status: OPEN.** This packet requests a specification decision; it records no outreach, adopted alternative or community agreement. All 15 [source conflicts](../sources/SPEC_CONFLICTS.md) remain unchanged. Production username registration cannot yet claim compliance.

## Requirement and observed blocker

The [preserved manifesto](../sources/primary/manifesto-pinned.md), physical line 36, says: “This burned caw will go to 0x0.” It connects that burn to minting the NFT username. The source is pinned to commit `37399aeb55974d4b09d404014865b5ef8918e9de`; its recommended name prices are at lines 128–135. Neither recommended prices nor a working custody component resolves the destination requirement.

The investigated asset is Ethereum CAW, `0xf3b9569f82b18aef890de263b84189bd33ebe452`, with 18 observed decimals. The retained observation targets chain ID `1`, block **25,936,362** (`0x18bc1ea`):

| Commitment | Value |
| --- | --- |
| Block hash | `0xf3e3dfad2242562dbed62de90831c39eace7c7c6e88f8c509afccef9a5f73e4d` |
| State root | `0x6d530d69c70f41b4b1a57f39751336304ff7c2c5d45e4dcd946869ecce4c0152` |
| Runtime | 2,278 bytes |
| Runtime Keccak-256 | `0x6ee560d3e6b1f881a8711e0be0b30a0e8e0cf8b915ce8f75ea05002126c94256` |

Both [PublicNode](../reference/fixtures/caw-token-publicnode.json) and [dRPC](../reference/fixtures/caw-token-drpc.json) captures preserve exact requests and responses. These are historical `eth_call` observations, with no state overrides or submitted transactions. Each uses caller `0x0000000000000000000000000000000000000001`, gas limit 200,000 and the pinned block.

The following capture labels identify complete calldata, in order:

`transfer_zero_to_zero_address` — `transfer(0x0, 0)`:

```text
0xa9059cbb00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
```

`transfer_one_to_zero_address` — `transfer(0x0, 1)`; one **base unit**, not one CAW:

```text
0xa9059cbb00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001
```

`transfer_from_zero_to_zero_address` — `transferFrom(caller, 0x0, 0)`:

```text
0x23b872dd000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
```

All three return JSON-RPC error code `3`, message `execution reverted: ERC20: transfer to the zero address`, with ABI-encoded `Error(string)` data. Regular-recipient and nonzero dead-pattern zero-amount controls return ABI `true`. These controls establish neither positive settlement nor supply reduction. The `burn_zero` call, selector `0x42966c68`, reverts without a decoded reason; that single failure alone cannot exclude every mechanism.

## Meaning and evidence limits

Three effects must remain distinct:

- **Literal zero destination:** the address named by the source; the tested token operations reject it.
- **Nonzero inaccessible destination:** a claimed loss of spendability, requiring its own justification. A dead-pattern spelling alone does not prove nobody can control it.
- **Supply reduction:** a measurable decrease in `totalSupply`; ordinary transfers do not provide this effect.

The [source reproduction](CAW_TOKEN_SOURCE.md) matches the captured executable after the observed decimals immutable is applied; the original metadata hash differs. The [preserved source](../experiments/token-source/StandardERC20.sol) rejects zero recipients and exposes no public burn function; `_burn` is internal. Its nonzero transfers do not reduce supply. This is scoped evidence, not exact historical source recovery or an external audit.

The account proof commits to runtime under the supplied state root. It does not authenticate consensus, freshness or the call results. Separate [local custody execution](LOCAL_CUSTODY.md) measures isolated transitions; it does not establish a compliant registration mechanism.

## Decision requested and acceptance

Can a reproducible mechanism using the existing CAW deployment satisfy the literal zero-address requirement? If not, what exact replacement wording and economic effect should be proposed, and on what evidence should reviewers accept it?

Accept a proposed resolution only with:

1. Pinned source, token/runtime, chain state and executable reproduction instructions, including retained failures and positive controls.
2. Positive-value execution measuring sender/destination balances, allowance, custody liabilities, total supply and events; failure must leave token/accounting effects unchanged.
3. Exact integer base-unit name costs, one-payment/one-unique-NFT behavior, and atomic failure when payment or mint fails.
4. A complete authority review showing no administrator can redirect the destination, alter fixed costs or substitute the token through an upgrade path.
5. Explicit changed wording where necessary, alternatives and objections, attributable review, and a documented agreement process. Builder approval or same-team tests are not community acceptance.

A nonzero destination, supply-burning replacement asset or deferred registration would each be a separately assessed proposal. None is adopted here.

## Response to substantive critique

Prioritize one complete paid signed CAW experiment and two independent reconstructions. Fixed test NFT IDs may isolate that experiment without authentic username registration. Name every provisional fee, staking and text rule. Address reproducible objections with evidence; praise, ratings and test counts do not resolve C-001 or establish production readiness.
