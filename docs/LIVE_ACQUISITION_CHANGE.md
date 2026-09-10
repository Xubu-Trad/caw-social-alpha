# A chain change during acquisition

Alpha.30 exercises the unchanged acquisition coordinator against a fresh local node. The node changes branches between requests while acquisition is pending. Every reader response comes from that live synthetic node.

The test uses a controlled request boundary in one Python process. It does not schedule simultaneous in-flight requests, simulate public consensus or choose a canonical public branch.

## The sequence

1. Build a shared prefix and a five-block left branch, using the existing synthetic token, fixed test NFT accounts and unchanged paid-action contract.
2. Acquire the complete left history through both collectors. Publish the agreed reconstruction as the stable control.
3. Select left again. Current authority immediately becomes unresolved. Both collectors finish reading left, and both reconstructions agree.
4. Immediately before the third numeric end-header read through the number strategy (the coordinator's final boundary check), restore the shared ancestor and execute the five-block right branch. Keep the reader's selection on left.
5. Resume the pending request through a fresh right-phase read lease. The node returns the right header at the same height. The coordinator must reject it with `ACQUISITION_SESSION_FINAL_BOUNDARY`, leaving current authority unresolved.
6. Explicitly select right and collect the complete history again. Both collectors and the unchanged accounting reader must agree before publication.

The expected acquisition totals are 147 requests for the stable control, 144 for the interrupted attempt and 147 for the fresh retry. Right-branch construction is controller work and is counted separately in the node's complete RPC record. The reader's 60-second deadline continues during that work.

Old read leases expire before restoration. A deliberate probe confirms their rejection without sending a request. The pending acquisition resumes through a fresh right lease; otherwise the test would establish only lease expiry, not observation of a changed node header. Unique request IDs identify each attempt and strategy; textual lease labels may repeat.

The [retained execution](../experiments/paid-live-acquisition/execution-trace.json.gz) passed all three expected outcomes: ready left, rejected left refresh and ready right. It records 22 synthetic transactions, 797 local requests, zero remote requests and 438 acquisition calls. The node ran for 36.922 seconds and released its listener. The [summary](../experiments/paid-live-acquisition/execution-summary.json) separates controller and acquisition work.

The download uses gzip to keep transfer size small. Decompression restores the exact 2,585,935-byte JSON record, SHA-256 `c34445ecbec280a5144cbff064c39e7d7816407755ae81384f30e7bdd2499555`. The Node tests decompress it with an output bound and verify this hash before inspecting the evidence. For a standalone JSON copy, use `python -m gzip -d execution-trace.json.gz` on a separate downloaded copy; keep the repository archive for reproduction.

An [initial launch](../experiments/paid-live-acquisition/startup-attempt.json) stopped with zero RPC calls or transactions because the outer Python supervisor allowed only one process. Its correction permits the controller and its node with a combined 512 MiB cap. The historical node guard and its limits were preserved.

## Evidence and reproduction

The [runner](../experiments/paid-live-acquisition/run_live_acquisition.py) verifies its [input manifest](../experiments/paid-live-acquisition/experiment-inputs.json) before and after execution. It preserves the old node guard, collectors, coordinator, contracts and accounting reader. The record includes source pins, raw requests/responses, phase transitions, the selected configurations and state before/after each attempt.

Node evidence checks run with `npm test`. They inspect retained execution and reconstruct complete messages and accounting; they do not start a node or repeat the live experiment.

The optional live run requires Windows, Python 3.12 with `cryptography`, and the exact Anvil 1.8.1 executable pinned by the retained node guard. No wallet or remote provider is used. From the repository root, create a new output directory, obtain the SHA-256 of the input manifest and pass it explicitly:

```powershell
New-Item -ItemType Directory -Path live-acquisition-check
$inputHash = (Get-FileHash -LiteralPath experiments/paid-live-acquisition/experiment-inputs.json -Algorithm SHA256).Hash.ToLower()
python experiments/paid-live-acquisition/run_live_acquisition.py --anvil <path-to-pinned-anvil.exe> --output live-acquisition-check/execution-trace.json --expected-input-sha256 $inputHash
```

The runner refuses an existing output file. It binds only to `127.0.0.1:18545`, requires 768 MiB free memory and 2 GiB free disk at startup, limits its node to 512 MiB and 600 seconds, and retains bounded requests, responses and output. It verifies listener cleanup. The recorded run may use additional supervisory limits described in its receipt. Those controls are not a production transport.

## What remains open

One controlled local change does not establish recovery under all timings. Changes after the final read or unobserved changes away and back can escape detection. Two traversal strategies over the same node are not independently operated providers. Headers, receipts and the supplied endpoint still need authentication and a public-chain selection/finality policy.

The fixture preserves both branches for inspection. Epochs and nonces can roll back with chain state; rejecting one orphaned signature does not establish permanent orphan-intent invalidation. Registration, staking scale, wallet compatibility and the remaining specification decisions are unchanged.

Follow [issue #4](https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social/issues/4), the [acquisition session boundary](PAID_ACQUISITION_SESSION.md) and the [current gates](ROADMAP.md).
