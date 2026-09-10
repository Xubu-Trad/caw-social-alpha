# Acquiring the selected paid history

Alpha.29 adds a bounded acquisition session for the fixed synthetic paid-action profile on chain 31337. The caller supplies the selected interval and deployment pins. The session publishes a complete reconstruction only after both collectors agree and the final boundary reads still match.

This is experimental protocol work. Recorded-response switching exercises the coordinator around a known local capture; it is not a new live reorganization or evidence from independently operated providers.

## Selection, acquisition and publication

The [session coordinator](../reference/paid_acquisition_session.py) exposes `AcquisitionSession()`, `select(config)`, `acquire(token, number_rpc, hash_rpc)` and `state()`.

1. **Select.** Supply chain ID, registry/probe/token addresses, start and end block numbers and hashes, and both runtime SHA-256 pins. The selection is copied and validated. Calling `select` immediately clears current authority, including when the new configuration is malformed. A valid selection returns an opaque token, compared by object identity.
2. **Acquire.** Pass that token and two read-only RPC callbacks. The source-pinned, unchanged collectors traverse by block number and parent hash, in sequence. The coordinator accepts one acquisition at a time.
3. **Compare and reconstruct.** Both manifests must match the supplied selection. Both complete histories must agree, including the full duplicated endpoint header. The unchanged Python paid-action reader reconstructs each history, and the complete results must agree.
4. **Recheck.** After reconstruction, both callbacks receive an additional chain-ID query and full start/end header reads. Each answer must match the selected history.
5. **Publish.** Only then does the coordinator replace its current-state pointer. Returned results and `state()` are detached, bounded copies; mutating a caller's copy cannot alter the session.

Selection may change while a transport callback is executing. Metadata transitions use a lock; callbacks run outside it. The coordinator checks generation and token identity before a request, after its response, after copying that response and before publication. A response already in flight cannot be cancelled, but superseded work cannot publish or clear a newer selection.

An admitted attempt consumes its token on success or failure. Partial collector results remain local to the attempt and are discarded on failure. A retry needs a fresh explicit selection after the previous attempt exits. Fresh request leases are enforced; the caller remains responsible for the supplied transports. Cancellation also consumes the active token. A returned result describes that completed attempt; a later selection can invalidate current authority. There is no automatic retry, highest-block rule or provider-selection algorithm.

## Finite work

Quotas accumulate across selections in one session.

| Session boundary | Limit |
| --- | --- |
| Admitted acquisition attempts | 4 |
| Explicit selections | 32 |
| RPC requests | 1,800 |
| Accepted response bytes (reencoded JSON, not wire traffic) | 32 MiB |
| Individual copied response | 1 MiB |
| Acquisition elapsed time | 60 seconds, checked at request/response/publication boundaries |
| Selected interval | At most 128 blocks including the exclusive start checkpoint |

Input capture accepts bounded, exact plain JSON types. It rejects cycles, custom container subclasses and excessive depth, size or collection lengths. These checks do not isolate hostile code running in the same Python process.

The elapsed-time check is cooperative. It cannot interrupt a blocked callback. A real transport must enforce its own I/O timeout, parse duplicate JSON keys safely and provide the caller's intended canonical-node view. The coordinator does not create that transport.

## What the replay transport supplies

The [replay transport](../experiments/paid-acquisition-race/replay_transport.py) reads the published [controlled-branch RPC capture](../experiments/paid-reorg/execution-trace.json), requiring SHA-256:

```text
b12d2eeebd281e3f4b041ba5467b2de768494866ad73024966e802bea12dcd2f
```

Only `collector.left/right.number/hash.*` observations are eligible. Tables are separated by branch and strategy, then indexed by canonical method and parameters. Repeated matching source requests must have identical results. The same transaction hash can have different inclusion data on the two branches; those responses remain separate.

`ReplayTransport(strategy, initial_branch='left', switch_before_call=None, after_response=None)` returns recorded RPC results through its callable interface. A scheduled switch uses a one-based call number. The controller may also call `set_branch`.

The trusted `after_response(transport, observation_copy)` hook runs after the current result has been selected and recorded, before it is returned. Changing the replay branch or session selection there cannot change those already captured response bytes. Recursive RPC calls through the same replay transport are rejected.

Compact observations preserve method, parameters, selected branch, matching original RPC request IDs and a response digest. The digest covers sorted, compact ASCII JSON of the RPC **result**, not the original JSON-RPC envelope or request ID. Extra replay reads may reference the same source IDs. Reports also retain numeric boundary observations and explicit switches.

An unrecorded query fails with `REPLAY_MISSING_RESPONSE`. In particular, a missing orphan-hash response is not evidence that a live node would return null or discard that block. The transport never invents a response or borrows one from writer rows or another strategy.

Replay has its own bounds: a 4 MiB source-file read, 512 calls, 8 MiB returned result bytes, 256 KiB compact observations and 16 branch changes per instance. It opens no network connection and starts no EVM.

## Reproduce and inspect

From the repository root, replace `<new-directory>` with a new, unused output path:

```sh
python experiments/paid-acquisition-race/check_race.py --output-dir <new-directory>
```

The Python checker uses the standard library. The [retained report](../experiments/paid-acquisition-race/replay-report.json) records 22 passing cases, with separate [execution limits and timing](../experiments/paid-acquisition-race/python-execution.json). Coverage includes:

- Stable left and right selections.
- Response changes before initial reads, within traversal and during final boundary reads.
- A new session selection accompanying an already selected response.
- A late transport exception, followed by a fresh explicit retry.
- Refresh from ready state, failed refresh and complete retry.
- Four-attempt and 32-selection limits, cancellation cleanup, bounded input and mutation isolation.

Stable left and right controls each make 147 replay calls: 60 by number and 87 by hash, including the coordinator's additional final checks. Complete accounting matches the historical reconstruction. The orphan-query case checks missing-response handling only. Call, byte and elapsed-time caps are implemented but are not all exhausted by these fixtures. See [current validation](VALIDATION.md) for the complete package checks.

Separately, with the repository's pinned Node 24.20.0 runtime:

```sh
npm test
```

The JavaScript retained-result checks inspect published evidence and its consistency. They do not turn the recorded replay into another live acquisition.

## Remaining uncertainty

The underlying [branch experiment](PAID_REORG_RECOVERY.md) used one synthetic node. Its two collector strategies provide different traversal checks over that source; agreement does not establish independent-provider trust, authenticated headers or receipts, consensus, freshness or public finality.

A branch can change away and back between observations—an unobserved ABA change—or change after the last boundary read. Those changes can escape this check. Atomic local publication protects the coordinator's state transition, not the chain's future stability.

Live changes during acquisition, independently operated disagreeing providers, authenticated history and a public-chain confirmation policy remain open work under [issue #4](https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social/issues/4).

