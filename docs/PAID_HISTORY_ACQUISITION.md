# Recover the record

The writer can stop. The record must still be readable.

Alpha.22 adds two separately authored collectors to the unchanged experimental paid-action contract. One fetches full blocks by number. The other walks parent hashes backward and fetches each transaction by hash. Both obtain receipts, cross-check unfiltered logs, read endpoint state and recheck the selected endpoints. Their collected histories agree exactly.

This is a controlled local recovery result. Both collectors share one synthetic node, one bounded transport and one orchestrating Python process. It establishes recovery without the writer's saved transaction list; independent public providers, authenticated consensus and reorg recovery remain open under [issue #3](https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social/issues/3) and [issue #4](https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social/issues/4).

## What ran

The [summary](../experiments/paid-acquisition/execution-summary.json) names the exact chain, contract addresses, runtime hashes and endpoint hashes. The [raw trace](../experiments/paid-acquisition/execution-trace.json) preserves every request and response, including the writer and each collector. No external provider was contacted.

| Evidence | Result |
| --- | --- |
| Chain | Fresh synthetic chain 31337, London rules, Anvil 1.8.1 |
| Included history | Blocks 3 through 22; block 2 is the exclusive start checkpoint |
| Transactions | 20 in the reader interval; two earlier synthetic funding calls |
| Accepted posts | Four, including distinct composed and decomposed Unicode bytes |
| Expected rejections | Empty pool, duplicate nonce, stale ownership epoch |
| Acquisition | 67 forward-collector requests; 104 backward-collector requests |
| Reconstruction | Existing JavaScript and Python readers each process both acquired datasets |
| Accounting | Credits `100000000000000000000015` + dust `4` = vault balance `100000000000000000000019` base units |
| Ownership | Account 1 transfers away and returns; epoch 2, nonce 4; a current-owner withdrawal succeeds |

The token is the previously retained synthetic fixture in its ordinary transfer mode. The exact alpha.20 paid-action contract and fixed three-account registry are reused. Synthetic balances are installed before the reader interval; there is no historical-token or public-chain execution claim for this run. The separate [historical-token experiment](PAID_ACTION.md) retains its original evidence.

## The handoff

The writer finishes its finite sequence, clears its transaction, intent and deployment lists, and its object is deleted. The node adapter switches permanently to an allowlist of read requests and exact endpoint getters. A write is rejected before transport. No frontend, indexer or application cache is started.

Each collector receives only an RPC callable and explicit trust inputs: chain ID, three addresses, runtime hashes, start/end numbers and hashes. The callable performs a fresh loopback request each time. It does not return entries from the writer trace or another collector's output. Raw observations remain retained in the shared orchestrator for review; object deletion is not a separate-process security boundary or erasure of the trace.

The forward collector checks receipts/logs for the checkpoint block as well as the included interval. The backward collector collects the checkpoint header and checks receipts/logs for the included interval. Both emit the same reader interval. Different request counts therefore have an explicit cause.

After both collectors finish, the owned node is stopped and its port is independently checked as released. The two existing accounting readers then run offline. They reconstruct exact post bytes, owners, epochs, nonces, credits, stakes, allocations and dust. Both readers reject each dataset after an omitted block, missing paid-post log, duplicate transaction or conflicting endpoint is introduced. The Python outcomes are retained in [reconstruction checks](../experiments/paid-acquisition/reconstruction-checks.json); ordinary Node tests exercise JavaScript rejection and raw-acquisition evidence binding.

## Reproduce offline

From the repository root, use the pinned Node 24.20.0 runtime:

```sh
node --max-old-space-size=256 --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 tests/caw-paid-acquisition.test.mjs
```

The separately authored Python reader needs no installed third-party package. With Python 3.12, select a new output directory:

```sh
python -B experiments/paid-acquisition/check_reconstruction.py --output recovered-history-check
```

The helper reads both retained histories, writes each reconstructed result and records four negative checks per dataset. It does not start a node or perform network calls. Compare the results with [Python by number](../experiments/paid-acquisition/reconstruction-python-number.json) and [Python by hash](../experiments/paid-acquisition/reconstruction-python-hash.json).

## Repeat acquisition locally

The optional live runner is separate from the app and ordinary tests. Review [the runner](../experiments/paid-acquisition/run_acquisition.py), [the write-to-read handoff](../experiments/paid-acquisition/acquisition_node.py), [forward collector](../experiments/paid-acquisition/collect_by_number.py), [backward collector](../experiments/paid-acquisition/collect_by_hash.py) and [input pins](../experiments/paid-acquisition/experiment-inputs.json) first.

It requires Windows, Python 3.12 with separately supplied `cryptography` (recorded environment: 50.0.1), and the exact Anvil 1.8.1 executable pinned in the retained node guard. Supply its path and a new result filename in an existing output directory. Compute and pass the SHA-256 of `experiment-inputs.json` after independently checking its source pins:

```sh
python -B experiments/paid-acquisition/run_acquisition.py --anvil PATH_TO_PINNED_ANVIL --output NEW_RESULT_JSON --expected-input-sha256 REVIEWED_INPUT_MANIFEST_SHA256
```

No executable is downloaded by this command. Existing guard limits remain: 768 MiB available memory and 2 GiB disk at startup; 512 MiB owned node process; 600 seconds; 250 transactions; 1,800 RPC requests; 4 MiB raw RPC trace; 4 million gas per transaction. Collectors add their own interval, response and output bounds. Hash queries are format/budget bounded in transport and checked for interval membership by each collector. Native gas is fabricated for disposable public test actors. No wallet or public deployment is involved.

The first run completed, but a collector edit overlapped execution and its final source no longer matched the initial pin. It was rejected for publication as source-attributed evidence. The [first-attempt note](../experiments/paid-acquisition/first-attempt.json) records the mismatch. The retained result is a second fresh run with finished source pins and a new execution-time check of the exact collector bytes.

## What remains unproved

- Shared-node agreement cannot establish that the provider told the truth. Endpoint/runtime pins are supplied trust, even though each collector checks observations against them.
- Hash links and receipt/log agreement are not authenticated block headers, transaction/receipt trie proofs, signature verification, consensus or finality.
- This run does not test provider outage, long-term archive retention, reorg rollback, an independently operated client or a production history volume.
- The writer object and collectors share a process and transport. Their code paths and requests are separate; they are not isolated from a malicious host.
- The fixed registry, three-account distribution and scalar-counting rule remain experimental. All 15 source conflicts remain open. The frontend remains a simulation.

The initial community review target stays at [alpha.20](REVIEW_BASELINE.md). This later evidence adds a recovery check, not production approval.
