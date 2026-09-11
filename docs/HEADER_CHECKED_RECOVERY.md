# Rebuild history with checked headers

Alpha.35 adds a recovery adapter that checks execution-header hashes before accepting a reconstructed paid-action interval. Both checks receive the same captured history. A successful result contains the accounting reconstruction and the checked header chain together.

**26 focused checks and 608/608 full-suite tests passed.** The separate build retained 22 byte-identical frontend assets. The tests reuse retained captures and synthetic mutations; no new live acquisition occurred.

The [adapter](../reference/paid-header-recovery.mjs) composes the existing [branch reader](../reference/paid-reorg-reader.mjs) and [header inspector](../reference/ethereum-execution-header.mjs). It does not replace their implementations. Applications must explicitly use this adapter. Alpha.36 adds an [action observation mode](HEADER_CHECKED_ACTIONS.md) that requires it. Alpha.37 adds a [provider comparison mode](HEADER_CHECKED_PROVIDERS.md) through that checked observer. The earlier observer and comparison exports and Python acquisition coordinator retain their existing behavior.

## Read a selected interval

This example runs from the repository root as an ES module. It reads a retained local experiment and makes no network request.

```js
import { readFileSync } from 'node:fs';
import { createPaidHeaderRecovery } from './reference/paid-header-recovery.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const manifest = read('experiments/paid-reorg/manifest-left.json');
const history = read('experiments/paid-reorg/history-left-number.json');
const reader = createPaidHeaderRecovery('london-16');
const selection = reader.select(manifest);
const prepared = reader.prepare(selection, history);
const result = reader.commit(prepared);

console.log(result.status); // ready
console.log(result.recovery.current.result); // reconstructed accounting
console.log(result.header_integrity.headerCount); // 16, including checkpoint
console.log(result.header_integrity.endpointAuthenticated); // false
```

The caller supplies the manifest and one immutable layout for the reader. The retained experiment uses London headers. The other supported layouts are `shanghai-17`, `cancun-20` and `prague-21`; choosing a layout does not establish a network's fork schedule. Intervals crossing layout transitions are outside this adapter.

The manifest binds the fixed local experiment's supplied chain/deployment context, runtime hashes and endpoint hashes. The adapter hashes the exclusive checkpoint and each included header, checks parent links and consecutive block numbers, and retains the original reader's full endpoint-field and accounting checks. It admits at most 128 included blocks, plus their checkpoint.

## Selection, publication and restart

`select(manifest)` immediately clears the current result and header report, including when the new input is malformed. Returned snapshots remain immutable historical values. A later branch choice requires a fresh selection and a complete reconstruction.

`prepare(selectionToken, history)` captures bounded plain data, checks headers and prepares accounting. It publishes nothing. `commit(preparedToken)` adopts both results together. Tokens are bound to the reader and selection by object identity; stale, cloned, foreign and consumed tokens cannot commit. Within an active selection, failed preparation leaves the selected interval unresolved and adds no retained history. A failed preparation can be retried while that selection remains active; a successful commit consumes it and invalidates the remaining prepared tokens.

`state()` reports `unresolved` or `ready`, the fixed `profile`, the base `recovery` state, and either a complete `header_integrity` report or `null`. `exportRetained()` saves raw manifests and histories with the explicit profile. Its schema is `caw-paid-header-recovery-retained/1`; the nested recovery schema remains `caw-paid-reorg-retained/1`.

To restart, pass the retained export, a separately selected manifest and the explicit profile:

```js
import { restartPaidHeaderRecovery } from './reference/paid-header-recovery.mjs';
const resumed = restartPaidHeaderRecovery(reader.exportRetained(), manifest, 'london-16');
console.log(resumed.state().status); // ready
```

Restart requires the saved and requested profiles to match. It rechecks every retained branch, including unselected branches, before returning the chosen result. Duplicate entries, missing selected history, empty exports and records that fail either check reject the whole restart. Optional bounded `calculated_cache` data is ignored; it cannot restore a ready status or verification claim.

The base reader's `transition` after restart describes the local replay order of retained branches and the final selection. It is not evidence that a new chain reorganization was observed while restarting. The separately selected manifest determines the returned current record regardless of save order.

The whole prospective export must fit the reader's capture budget before preparation is admitted, so several individually small histories cannot produce an export that exceeds its reload limit. Bounds include eight retained branches, four pending preparations, 1,024 selections, 8 MiB of weighted captured data, 100,000 values, depth 20 and arrays of at most 2,048 entries. The header inspector also retains its per-header and encoded-header limits. These admission limits are not exact process-memory guarantees. Capture and reconstruction are shared implementations; this is not another independent verifier. Hostile Proxy traps and replaced native built-ins remain outside the same-process plain-data boundary.

## What remains unproved

A ready result means that the supplied headers match the selected hashes and that the supplied action history satisfies the existing reconstruction rules. Endpoint authentication, consensus, transaction/receipt body inclusion, execution validity, freshness and finality remain unestablished. These flags stay false in the header report.

In particular, matching a header's receipt root does not prove that the supplied receipt belongs to that root. Accounting checks can reject inconsistent action records, but they do not replace transaction or receipt inclusion proofs. Self-consistent fabricated records remain possible when the caller selects fabricated endpoints. The adapter does not establish signature validity, choose a canonical branch, connect a wallet, submit a transaction, or decide whether an orphaned action is safe to retry.

The [tests](../tests/caw-header-recovery.test.mjs) reuse retained local histories and synthetic mutations. No new live acquisition or public-chain run occurs. Historical captures, contracts, signed domains, primary sources and frontend remain unchanged. [Endpoint authentication and recovery policy](ROADMAP.md) remain open review gates.
