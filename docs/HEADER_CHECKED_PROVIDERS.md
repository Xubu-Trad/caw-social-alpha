# Compare provider reports with checked headers

Alpha.37 requires header integrity and accounting reconstruction for every configured provider report before presenting a shared action observation. A matching endpoint or matching balance alone is insufficient: the complete supplied histories must agree at the caller's selected endpoint.

**29 focused checks and 663/663 full-suite tests passed.** The separate build retained 22 byte-identical frontend assets. The tests reuse retained captures and synthetic mutations; no new live acquisition occurred.

This explicit mode builds on [checked action observations](HEADER_CHECKED_ACTIONS.md) and the existing [comparison rules](PROVIDER_COMPARISON.md). The earlier `createPaidProviderComparison` export keeps its original behavior and schema. New callers opt in with `createHeaderCheckedPaidProviderComparison(target, providerIds, profile)`; an omitted, null or unsupported profile fails rather than choosing an unchecked path.

## One checked round

Save this example as an `.mjs` file in the repository root. Both retained collectors queried the same controlled local node. Their labels reproduce two acquisition strategies, not independently operated providers.

```js
import { readFileSync } from 'node:fs';
import { createHeaderCheckedPaidProviderComparison } from './reference/paid-provider-comparison.mjs';

const read = name => JSON.parse(readFileSync('experiments/paid-reorg/' + name, 'utf8'));
const manifest = read('manifest-left.json');
const numberHistory = read('history-left-number.json');
const hashHistory = read('history-left-hash.json');
const entry = numberHistory.blocks.flatMap(block => block.transactions).find(item =>
  item.transaction.to === manifest.addresses.probe &&
  item.transaction.data.startsWith('0x62f509b3') && item.receipt.status === '0x1');
if (!entry) throw new Error('Expected retained post is missing.');
const context = { ...manifest };
delete context.end_block_hash;
const comparison = createHeaderCheckedPaidProviderComparison({
  schema: 'caw-paid-action-target/1', context, calldata: entry.transaction.data
}, ['simulated-number', 'simulated-hash'], 'london-16');
const round = comparison.select(manifest);
comparison.submit(round, 'simulated-number', { manifest, history: numberHistory });
console.log(comparison.state().status); // incomplete
comparison.submit(round, 'simulated-hash', { manifest, history: hashHistory });
const view = comparison.state();
console.log(view.status); // matching-supplied-histories
console.log(view.shared_observation.status); // observed-accepted
console.log(view.shared_observation.header_integrity.headerCount); // 16, including checkpoint
console.log(view.shared_observation.header_integrity.endpointAuthenticated); // false
console.log(view.provider_independence); // not-established
```

The manifest and profile are selected from the fixture for reproducibility. The code performs no network request and does not choose or authenticate a public endpoint. Target validation is restricted to the synthetic chain ID `31337` and the recorded CAW token context. The immutable target fixes context and exact calldata; matching supplied signature bytes does not verify that signature or authorize submitting it again.

## Admission and agreement

The state schema is `caw-paid-header-provider-comparison/1`, with a fixed `profile`. Each valid provider record contains a `caw-paid-header-action-observation/1` observation and its header report. `shared_observation` remains null until all required reports pass and agree. On agreement it includes the same checked observation schema and evidence. The original comparison export still returns `caw-paid-provider-comparison/1` without a profile.

| Operation | Effect |
| --- | --- |
| `select(manifest)` | Clears every previous report and shared result before validating the new selection; returns a new opaque round token. |
| `submit(round, id, { manifest, history })` | Admits one report for that provider, captures it, checks the whole resident report budget, and validates it in an isolated checked observer. |
| `unavailable(round, id)` | Consumes that provider's slot as unavailable; the remaining roster cannot establish agreement. |
| `state()` | Returns an immutable snapshot. Previous snapshots are historical values. |

Two to four unique provider labels form a fixed roster. Every label must supply one valid reply. An admitted report that fails validation or exceeds the bounds consumes its slot as invalid and throws a generic report error. There is no silent replacement, majority vote or automatic preference for the highest endpoint. To retry, explicitly select a fresh round and resubmit the complete roster. Unknown providers, consumed slots, foreign or stale round tokens cannot change the current state.

The [status table](PROVIDER_COMPARISON.md#what-the-status-means) applies unchanged: `unresolved`, `provider-failed`, `incomplete`, `endpoint-disagreement`, `history-conflict`, `selected-endpoint-mismatch` and `matching-supplied-histories`. Invalid or unavailable reports take precedence over pending replies. Unanimous agreement on a different endpoint does not replace the caller's selection.

Comparison includes the whole captured envelope, including optional metadata. Property order is ignored; metadata is not dropped to manufacture agreement. Thus two individually valid reports can yield `history-conflict` after a change to metadata excluded from header hashing. That status identifies a difference, not a dishonest provider. Conversely, an altered consensus header field retaining the original hash must fail header validation before it can enter agreement, even if every provider repeats the same alteration.

## Bounds and trust

The complete raw report set is captured within 8 MiB weighted data, 100,000 values, depth 20 and arrays of at most 2,048 entries. Each report also meets the checked observer's limits, including 128 included blocks plus the checkpoint and at most 8,192 call bytes. The instance allows 1,024 explicit selections. These are admission limits, not exact serialized sizes or operating-system memory ceilings. A failed admission cannot be converted into agreement by discarding that provider.

The explicit profile is fixed for the instance: `london-16`, `shanghai-17`, `cancun-20` or `prague-21`. Layout transitions inside an interval are unsupported. No chain fork schedule is inferred. Capture accepts own plain data and rejects accessors, cycles, sparse arrays and exotic prototypes; hostile Proxy traps and replaced native built-ins remain outside this same-process boundary.

There is no persistence interface. After restart, create a fresh comparison, select the endpoint and submit complete raw reports again. A saved status is not an admitted report.

Each report is checked using the same capture, header and accounting implementations. Isolated observer instances do not create independent verifiers. Labels do not authenticate providers, and copied or invented self-consistent histories can agree. Header integrity does not prove transaction or receipt inclusion under a header's roots. All endpoint, consensus, body-commitment, execution, freshness and finality verification flags remain false; `provider_independence` and `finality` remain `not-established`, and `retry_safety` remains `not-assessed`.

The [new tests](../tests/caw-checked-provider.test.mjs) use retained controlled captures and synthetic mutations. The Python acquisition coordinator and frontend are not connected to this mode. Authenticated acquisition, body inclusion, confirmation policy and production integration remain [open gates](ROADMAP.md).
