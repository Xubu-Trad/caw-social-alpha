# An action in the selected history

Alpha.32 adds an offline observation layer over the [existing recovery reader](../reference/paid-reorg-reader.mjs). Its purpose is to describe where an exact watched call appears after the caller selects and rebuilds a complete history. The interface below passed 33 focused offline checks; the complete package passed 532/532. This work adds no live run, confirmation policy, wallet integration or frontend change.

An observation is evidence within a supplied interval. It is not settlement, a signature decision or permission to submit again. Every state carries `finality: 'not-established'` and `retry_safety: 'not-assessed'`.

| Status | Meaning |
| --- | --- |
| `unresolved` | No complete interval is currently committed for the selection. Prior observations cannot answer the current query. |
| `observed-accepted` | A matching call has an accepted post in the selected interval. Matching failed duplicates remain visible alongside it. |
| `rejected-only-in-selected-interval` | Matching failed receipts exist, with no matching acceptance in that interval. |
| `not-observed-in-covered-interval` | No matching call appears between the stated exclusive checkpoint and inclusive endpoint. |

A failed receipt supplies no revert reason here. It does not establish an invalid signature, permanent cancellation or safe retry. Absence from this interval does not establish absence from another interval, another branch, or a transaction pool. This observer does not inspect a transaction pool or assess present-time validity.

## What is being watched

The [observer](../reference/paid-action-observer.mjs) takes one immutable target:

```js
{
  schema: 'caw-paid-action-target/1',
  context: {
    chain_id,
    addresses, // registry, probe and token
    registry_runtime_sha256,
    probe_runtime_sha256,
    start_block_hash
  },
  calldata // exact lowercase post call bytes, including its signature
}
```

The context is the fixed experiment's manifest without `end_block_hash`. A selected manifest must match that context exactly. Another deployment or checkpoint is not a valid basis for reporting this target absent. Calldata is bounded to 8,192 bytes and the fixed post selector `0x62f509b3`; registering those bytes does not authenticate the signature or establish that the call can execute.

Matching uses the selected deployment's probe and exact calldata. It does not require the same relayer or gas envelope. A different signature for the same message is different watched calldata. Text, account nonce, message ID and transaction hash alone are insufficient action or inclusion identifiers.

Each inclusion records block hash and number, transaction hash and index, receipt status, outcome and log indices. In [alpha.31](ORPHAN_INTENT_REPLAY.md), the exact signed call succeeds on both recorded branches, while its duplicate fails on each. The successful transaction hash itself repeats across branches; the block identities differ. `observed-accepted` therefore takes precedence over the matching failed duplicate without hiding either observation.

The [alpha.28 histories](PAID_REORG_RECOVERY.md) provide different checks: one left acceptance is a rejected call on right, and another left acceptance is absent on right. These retained fixtures exercise status changes without generating another EVM capture.

## Selection and retained observations

`select(manifest)` immediately clears current classifications, including when the supplied selection is malformed. `prepare(token, history)` validates and rebuilds the complete interval; `commit(prepared)` publishes it atomically. A new selection invalidates delayed prepared tokens.

The state has schema `caw-paid-action-observation/1`. Its `selected` projection is null while unresolved. Otherwise it contains the selected manifest, explicit `start_exclusive` and `end_inclusive` coverage, and all matching observations. The generation identifies the selection, not a confirmation count.

`retained_intervals` describes other committed intervals; while unresolved it includes all retained intervals. They are not automatically orphaned: they can share blocks, or one can extend another. A prior accepted observation remains historical evidence and cannot override the selected interval's classification.

`exportRetained()` preserves the target and recovery histories. `restartPaidActionObserver(retained, selectedManifest)` requires an explicit selection, revalidates the raw histories and rebuilds the observation. An optional bounded `calculated_cache` is ignored. Retention is limited to eight branches and 256 matching observations across them.

The prospective complete export must also fit the shared plain-data capture budget: 8 MiB of weighted data, 100,000 nodes and depth 20. That aggregate check runs before adoption, so adding individually valid intervals cannot silently make the saved state too large to reload. Limits can be reached before eight branches. Accessor properties, cycles and exotic prototypes are rejected; hostile Proxy traps or replaced native built-ins remain outside this same-process boundary.

## Inspect the retained replay fixture

Save this example as an `.mjs` file in the repository root and run it with Node. It uses the already retained alpha.31 gzip file and performs no network or signing operation.

```js
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  createPaidActionObserver,
  restartPaidActionObserver
} from './reference/paid-action-observer.mjs';

const record = JSON.parse(gunzipSync(
  readFileSync('experiments/paid-orphan-replay/execution-trace.json.gz'),
  { maxOutputLength: 4 * 1024 * 1024 }
).toString('utf8'));
const left = record.branches.left.collectors.number;
const right = record.branches.right.collectors.number;
const { end_block_hash, ...context } = left.manifest;
const observer = createPaidActionObserver({
  schema: 'caw-paid-action-target/1',
  context,
  calldata: record.shared_transaction.data
});

let selection = observer.select(left.manifest);
observer.commit(observer.prepare(selection, left.history));
selection = observer.select(right.manifest);
console.log(observer.state().status); // unresolved until the rebuild commits
observer.commit(observer.prepare(selection, right.history));

const restarted = restartPaidActionObserver(
  observer.exportRetained(), right.manifest
);
const view = restarted.state();
console.log({
  status: view.status,
  coverage: view.selected.coverage,
  observations: view.selected.observations,
  finality: view.finality,
  retry_safety: view.retry_safety
});
```

This demonstration selects the fixture's stored right manifest. That is an explicit fixture choice, not an independently authenticated canonical endpoint. The two collection strategies used the same controlled node. Consistent histories and reconstructed accounting do not prove consensus, receipt-trie inclusion, signature validity, freshness or public finality.

Clients still need reviewed rules for choosing a history and explaining settlement. The observer supplies no automatic retry, expiry, cancellation or confirmation decision. [Issue #4](https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social/issues/4) and the [roadmap](ROADMAP.md) track the remaining work.
