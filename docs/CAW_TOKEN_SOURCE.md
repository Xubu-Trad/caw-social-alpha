# CAW source · reproduced executable match

The published `StandardERC20` source compiles to the captured CAW executable code when its decimals immutable is set to the observed value **18**. The original metadata hash differs. This is stronger than relying on an explorer label, but it is not a claim that the exact historical source-file or metadata bytes were recovered.

## Evidence

The [Sourcify record](https://sourcify.dev/server/v2/contract/1/0xf3b9569f82b18aef890de263b84189bd33ebe452?fields=all) supplied the flattened source, compiler settings, ABI and declared transformations. Its status is `match`, which Sourcify distinguishes from [`exact_match`](https://docs.sourcify.dev/blog/apiv2-lookup-endpoints/). The source is preserved with its own license and third-party notices.

The local reproduction used Solidity **0.8.10+commit.fc410830**, optimizer enabled with 200 runs, London EVM, IPFS metadata and no external libraries or imports. The Windows compiler was obtained from [Solidity's official compiler repository](https://github.com/ethereum/solc-bin/tree/gh-pages/windows-amd64) and matched its listed SHA-256 `ec9feb83ff291ae74805b38cc6834502fb31be690f325de59dff8e60d8432d66`. Both the token and the experimental custody probe compiled without error diagnostics under the recorded resource limits. The old compiler is used for this reproduction; no production toolchain is selected here.

| Comparison | Result |
| --- | --- |
| Local token compiler output versus Sourcify recompiled runtime | Exact byte agreement |
| Captured token runtime length | 2,278 bytes |
| Decimals immutable | 32 bytes at offset 283; compiled placeholder zero, observed value 18 |
| Metadata | 53-byte CBOR trailer at offset 2225; only its 32-byte IPFS hash differs |
| Other runtime differences | None |
| Exact unmodified runtime / original metadata match | Not established |

Byte offsets are zero-based. The [machine-readable comparison](../experiments/token-source/compilation-review.json) retains hashes and the full list of differences. The [account-proof evidence](CAW_TOKEN_COMPATIBILITY.md) separately commits to the captured runtime under the previously pinned state root. Source compilation does not authenticate that root or establish chain consensus.

## What this clarifies

- The source rejects a zero recipient before testing the sender balance. The earlier `0x0` rejection is consistent with the reproduced code.
- `transferFrom` moves tokens, checks allowance and then subtracts the amount. If the allowance check fails, EVM rollback must undo the earlier movement; this needs execution evidence.
- Even the maximum uint256 allowance is reduced by a positive spend. Do not assume an infinite-allowance exception from a newer token implementation.
- `_burn` is internal, and this complete source exposes no public burn function. Sending tokens to a nonzero dead-pattern address is an ordinary transfer in this code; it does not reduce total supply.
- The source's service payment occurs during construction. No runtime owner, public mint, upgrade, fee redirection or pause entry point is exposed by this source. This is a scoped source observation, not an audit.

The source's metadata and creation transaction remain separately qualified. Bounded retrieval attempts did not recover the original metadata CID `QmSatbFkp7TXQZELLSRYnQY5AcMnWbd48iM8T6C9FvsyGP`; that does not prove it is unavailable everywhere. The constructor was not independently executed in this source-comparison step. [C-001](../sources/SPEC_CONFLICTS.md#c-001) remains open: a source match does not make the required zero-address transfer possible.

## Reproduce

Inspect [StandardERC20.sol](../experiments/token-source/StandardERC20.sol), the complete [compiler input](../experiments/token-source/compile-standard.json) and your compiler's provenance. With the same compiler/settings, run:

```sh
solc --standard-json < experiments/token-source/compile-standard.json > token-compiler-output.json
python experiments/token-source/verify-compilation.py token-compiler-output.json
```

The comparison script reads saved files only. The shell redirection shown works in a POSIX shell or Windows Command Prompt; a PowerShell caller can provide the same UTF-8 JSON on standard input and save standard output. Reusing the supplied input makes source/settings explicit. Verification success is limited to the declared immutable and metadata treatment, not permission to replace any token code or deploy a protocol.
