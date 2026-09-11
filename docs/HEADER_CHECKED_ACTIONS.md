# Observe actions in history with checked headers

Alpha.36 connects action observations to the checked recovery adapter. In this explicit mode, a current accepted, rejected-only or absent status is published only after header integrity and accounting reconstruction both pass on the same captured history.

**26 focused checks and 634/634 full-suite tests passed.** The separate build retained 22 byte-identical frontend assets. The tests reuse retained captures and synthetic mutations; no new live acquisition occurred.

The [observer](../reference/paid-action-observer.mjs) shares the existing classification logic and requires [checked recovery](HEADER_CHECKED_RECOVERY.md) before adoption. The earlier observer exports keep their original behavior and schemas for reproduction. The new mode has a distinct schema and requires an explicit header profile; omitting it cannot select the earlier behavior.

## Follow one exact call

Run this as an ES module from the repository root. It reads a retained controlled local experiment and performs no network acquisition.

```js
import { readFileSync } from 'node:fs';
import { createHeaderCheckedPaidActionObserver } from './reference/paid-action-observer.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const manifest = read('experiments/paid-reorg/manifest-left.json');
const history = read('experiments/paid-reorg/history-left-number.json');
const context = { ...manifest };
delete context.end_block_hash;
const entry = history.blocks.flatMap(block => block.transactions).find(item =>
  item.transaction.to === manifest.addresses.probe &&
  item.transaction.data.startsWith('0x62f509b3') && item.receipt.status === '0x1');
const target = { schema: 'caw-paid-action-target/1', context, calldata: entry.transaction.data };
const observer = createHeaderCheckedPaidActionObserver(target, 'london-16');
const selection = observer.select(manifest);
const prepared = observer.prepare(selection, history);
const result = observer.commit(prepared);

console.log(result.status); // observed-accepted
console.log(result.header_integrity.headerCount); // 16, including checkpoint
console.log(result.header_integrity.endpointAuthenticated); // false
console.log(result.finality); // not-established
```

The target fixes the supplied chain/deployment context, runtime hashes, exclusive checkpoint and exact call bytes. Watching those bytes does not authenticate their signature or establish that the action is executable now. The profile is fixed for the observer instance: `london-16`, `shanghai-17`, `cancun-20` or `prague-21`. No network fork schedule is inferred and intervals crossing layout transitions are not supported.

## Status and evidence

The state schema is `caw-paid-header-action-observation/1`. It retains the earlier target, generation, selected projection and historical interval fields, and adds `profile` and `header_integrity`. The header report is `null` while the selected interval is unresolved. After commit it covers the exact currently selected checkpoint and included block interval. Earlier returned snapshots and `retained_intervals` remain historical observations; they are not new current selections.

| Status | Meaning within the supplied interval |
| --- | --- |
| `unresolved` | No current complete checked result is available. |
| `observed-accepted` | At least one matching call has a successful supplied receipt. Matching failed duplicates remain listed. |
| `rejected-only-in-selected-interval` | Matching calls have only failed supplied receipts. No revert reason is inferred. |
| `not-observed-in-covered-interval` | No matching call occurs in the covered interval; this does not prove global absence. |

`select(manifest)` clears the current classification and header report before validating a new selection. This also applies to malformed or incompatible selections. `prepare(token, history)` publishes nothing. `commit(prepared)` adopts the projected action status only after checked recovery commits. Stale, cloned, foreign and consumed tokens cannot replace a newer result. Within an active selection, a failed preparation retains earlier raw evidence and permits another valid preparation; it does not invalidate an already prepared valid candidate.

Acceptance in supplied history does not imply finality or safe retry. In particular, the retained orphan-action experiment shows that the same signed call can be accepted again after rollback restores its conditions. A matching failed duplicate does not erase an accepted observation on that selected branch.

## Restart from raw evidence

`exportRetained()` returns schema `caw-paid-header-action-observer-retained/1`, containing `target` and a complete `caw-paid-header-recovery-retained/1` object in `recovery`. The fixed profile lives in that nested object. Its nested `recovery.branches` contains raw manifests and histories.

```js
import { restartHeaderCheckedPaidActionObserver } from './reference/paid-action-observer.mjs';
const resumed = restartHeaderCheckedPaidActionObserver(observer.exportRetained(), manifest, 'london-16');
console.log(resumed.state().status); // observed-accepted
```

Restart requires a separately selected manifest and explicit matching profile. It rechecks every raw retained branch, including unselected branches, then rebuilds the selected observation. Earlier observer exports cannot be relabeled as checked results without successfully reconstructing their raw evidence in the new mode. Duplicate branches, missing selected history and records that fail either check reject restart. Optional bounded `calculated_cache` fields at the supported saved-wrapper layers are ignored; they cannot establish status or trust.

The complete prospective saved export, including its target and nested wrappers, must fit the reload budget before preparation is admitted. Limits include 128 included blocks plus the checkpoint, eight retained intervals, four pending preparations, 1,024 selections, 256 matching observations across retained intervals, and at most 8,192 call bytes. Capture limits remain 8 MiB weighted data, 100,000 values, depth 20 and arrays of 2,048 entries, with the header inspector's additional per-header and RLP bounds. These are admission limits rather than exact memory-use guarantees. Capture and reconstruction are shared implementations. Hostile Proxy traps and replaced native built-ins remain outside the same-process plain-data boundary.

## Verification boundary

All header trust flags remain false: endpoint authentication, consensus, body commitments, execution, freshness and finality. Every observation retains `finality: not-established` and `retry_safety: not-assessed`. Header integrity binds the supplied fields to selected hashes; it does not prove that a supplied transaction or receipt belongs to the corresponding root. Permitted optional metadata can change without invalidating a header hash. Self-consistent invented records can pass if their own endpoints are selected and their supplied accounting is consistent.

The [integration tests](../tests/caw-checked-observer.test.mjs) reuse retained controlled local captures and explicitly synthetic mutations. No new live acquisition, provider independence, public-chain consensus or external audit is claimed. The provider comparison and Python acquisition coordinator still use their earlier paths; the frontend remains a simulation. [Authentication, body inclusion and live integration](ROADMAP.md) remain open gates.
