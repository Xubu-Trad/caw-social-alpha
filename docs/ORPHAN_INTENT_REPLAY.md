# A signed action after rollback

Alpha.31 checks a narrow question: can a signed action accepted only on a discarded branch become valid on the selected branch? In this local experiment, **yes**. Restoring the earlier state restores its unused action nonce. When the same account owner, epoch and other signed conditions return, the exact request and signature are accepted again.

Each branch accepts the action once. A second submission on that same branch fails with `InvalidNonce()`. There are two recorded branch executions, but only one accepted copy in either selected history. This does not establish a double charge in the surviving state or an arbitrary-signature bypass.

## The controlled sequence

1. Build the shared ten-transaction interval after the exclusive checkpoint, using the unchanged synthetic token, three test accounts and paid-action contract. Its final post is `common-prefix`.
2. Snapshot the ancestor. On left, transfer account 1 from A to B, sign `orphan-replay` as B with account epoch 1 and action nonce 1, and submit it successfully. Submit the exact action again; it must fail with `InvalidNonce()` and leave all observed protocol accounting unchanged.
3. Collect the full left history through both existing collectors and reconstruct it with the unchanged Python reader. Preserve its endpoint and complete result.
4. Restore the shared ancestor. On right, A deposits one additional base unit into account 1, then transfers that account to B. The deposit creates a different history and balance while retaining the signed action's conditions.
5. Submit the **same request, signature and contract calldata**. No new signature is generated for the right replay. It succeeds. Repeat it on right; it must fail with `InvalidNonce()` and leave protocol accounting unchanged.
6. Acquire and reconstruct the complete right history. Verify all messages, ownership, nonces, stake, credit, dust and token backing against explicit expected results.

The branches have three and four suffix transactions. Equal height is not needed for this test. Both full histories contain only `common-prefix` and one `orphan-replay` message. Failed submissions consume transaction gas and an Ethereum sender nonce; those are distinct from the protocol action nonce and accounting.

In this run, the accepted transaction hash is also identical across branches, while its block hash and height differ. The duplicate transaction likewise has one hash and two distinct branch inclusions. Evidence checks identify the branch and block as well as the transaction; a transaction hash alone does not identify which inclusion is being described.

## Why the action is valid again

The existing signed digest commits to chain ID, verifying contract, account ID, ownership epoch, action nonce, validity window, stake distribution, exact message bytes, fee and the experiment profile. It does not commit to a block hash or an exact credit balance. The signature still has to match the current owner, and available credit and token backing must satisfy execution checks.

After restoration and the new transfer, owner B, epoch 1 and action nonce 1 match the signed request. Stakes and the distribution commitment are unchanged; the time remains inside the signed window. The extra base unit changes available credit without invalidating the signature. The same-branch duplicate sees nonce 2 and fails.

This complements [alpha.28's owner-mismatch rejection](PAID_REORG_RECOVERY.md): that fixture rejected the left signature on right because owner A was current. Neither epochs nor nonces are permanent records outside the chain state that stores them. This new test preserves the existing signed domain and makes no new protocol decision about orphaned actions.

## Complete accounting

Let `F = 5000000000000000000000`, `q1 = floor(F/3)` and `q2 = floor(2F/3)`.

| Endpoint field | Left | Right |
| --- | --- | --- |
| Account owners | B, A, B | B, A, B |
| Ownership epochs / action nonces | `[1,0,0]` / `[2,0,0]` | `[1,0,0]` / `[2,0,0]` |
| Stakes | `[0,1,2]` | `[0,1,2]` |
| Account 1 credit | `18F` | `18F + 1` |
| Account 2 / 3 credit | `10 + 2q1` / `10 + 2q2` | `10 + 2q1` / `10 + 2q2` |
| Total credits / dust / token backing | `20F + 18` / `2` / `20F + 20` | `20F + 19` / `2` / `20F + 21` |
| Accepted message count | 2 | 2 |

The [execution record](../experiments/paid-orphan-replay/execution-trace.json.gz) preserves raw requests and responses, all four submitted copies, pre/post getters, source pins and both complete collector histories. [Its summary](../experiments/paid-orphan-replay/execution-summary.json) records 19 synthetic transactions, 632 local requests and zero remote requests. The node ran for 28.312 seconds and released its listener.

Gzip decompression restores exactly 2,184,365 JSON bytes, SHA-256 `ebad7bf35c45bc4fcc0ec0d192a8313bbcf2b2d56e572a11ffdd656de86c3e49`. The offline tests verify bounded decompression, retained RPC bindings, complete reconstructions and altered-evidence rejection. A matching hash proves byte identity, not public-chain truth.

## Reproduce and review

`npm test` checks the retained evidence without starting a node. The [runner](../experiments/paid-orphan-replay/run_orphan_replay.py) is a separate optional Windows execution using Python 3.12 with `cryptography` and the exact Anvil 1.8.1 binary pinned by the existing guard. From the repository root, use a new output directory:

```powershell
New-Item -ItemType Directory -Path orphan-replay-check
$inputHash = (Get-FileHash -LiteralPath experiments/paid-orphan-replay/experiment-inputs.json -Algorithm SHA256).Hash.ToLower()
python experiments/paid-orphan-replay/run_orphan_replay.py --anvil <path-to-pinned-anvil.exe> --output orphan-replay-check/execution-trace.json --expected-input-sha256 $inputHash
```

The runner checks [input hashes](../experiments/paid-orphan-replay/experiment-inputs.json) before and after execution, refuses an existing output file and retains the original loopback-only node controls, startup floors and resource caps. No wallet or public provider is used. Signatures, timestamps and block hashes may differ between fresh executions; the action identity within a run, expected rejection and complete accounting must hold.

## The remaining decision

Applications must distinguish a retained observation from settlement on the currently selected history. A locally remembered success on an abandoned branch does not permanently consume the chain's action nonce. A still-valid signed action may execute again if the required state returns. Confirmation policy and how clients describe such pending actions require review.

This test does not adopt branch-specific signing, change the manifesto, authenticate headers, choose a public canonical branch or establish public finality. Both collectors query the same controlled node. Independent providers, broader live acquisition timings and the existing registration, scale and wallet gates remain open in [issue #4](https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social/issues/4) and the [roadmap](ROADMAP.md). The frontend remains the approved simulation.
