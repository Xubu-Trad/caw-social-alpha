# Compare supplied provider histories

Alpha.33 adds a bounded offline comparison before presenting an action observation as shared by a fixed roster of providers. The caller names two to four providers and explicitly selects a manifest. Every provider must supply a valid, matching complete history for that selection. There is no majority rule, automatic choice of the highest tip or network request.

These identifiers are caller-supplied labels, not authenticated provider identities. Matching inputs do not establish independent operators, consensus, freshness or public finality. Every snapshot states `provider_independence: 'not-established'`, `finality: 'not-established'` and `retry_safety: 'not-assessed'`.

The interface below passed 25 focused offline checks; the complete package passed 557/557. No new live provider experiment is claimed.

## One explicit comparison round

The [comparison module](../reference/paid-provider-comparison.mjs) uses the same immutable [action target](ACTION_OBSERVATION.md) as alpha.32: chain ID, registry/probe/token addresses, runtime hashes, exclusive checkpoint and exact post calldata, including its supplied signature bytes. Watching those bytes does not validate the signature.

- `createPaidProviderComparison(target, providerIds)` fixes the target and the required roster of two to four distinct IDs.
- `select(manifest)` clears all prior reports and shared observations immediately, even if the new selection is malformed. A valid selection returns an opaque token for that round.
- `submit(token, id, { manifest, history })` admits one reply from a required provider. It validates that report using a fresh action observer before comparing providers. An invalid report consumes that provider's reply and marks it invalid, then throws.
- `unavailable(token, id)` explicitly marks that provider unavailable for this round. It does not remove the provider from the roster or authorize using the remaining reports alone.
- `state()` returns an immutable snapshot. Unknown IDs, duplicate replies and stale tokens are rejected without changing it.

A fresh explicit selection is required to replace an admitted reply or retry the round. Old tokens cannot add reports to a newer selection. A previously returned snapshot is a historical value, not a live handle or proof that the current round still agrees.

## What the status means

The snapshot schema is `caw-paid-provider-comparison/1`. It includes the generation, selected manifest, per-provider records and `shared_observation`. Provider records identify their ID, status (`pending`, `valid`, `invalid` or `unavailable`), supplied manifest and individual observation where available.

Only `matching-supplied-histories` exposes a shared observation. The other outcomes do not choose a provider or settle the watched action.

| Status | Meaning |
| --- | --- |
| `unresolved` | No valid selection is active. |
| `provider-failed` | At least one required provider is invalid or explicitly unavailable. This takes precedence over missing reports. |
| `incomplete` | A required provider has not replied, and none is invalid or unavailable. |
| `endpoint-disagreement` | All reports validate individually, but their manifests differ. |
| `history-conflict` | Manifests match, but the complete supplied histories differ. |
| `selected-endpoint-mismatch` | Providers match each other, but their common manifest is not the caller's selected manifest. |
| `matching-supplied-histories` | Every required report validates and matches the full history and selected manifest. |

Different tips do not, by themselves, establish a fork or identify a lagging or faulty provider. Even unanimous agreement on another endpoint cannot silently replace the caller's selection. Individual provider observations remain attributable to their own reports; they are not a shared result while comparison is blocked.

The shared action observation retains alpha.32's narrower meaning: accepted, rejected-only or not observed within explicitly covered history. An accepted call takes precedence over a matching failed duplicate in that interval. These are not confirmation, cancellation, expiry or safe-retry decisions.

## Compare the whole envelope

Each report must independently reconstruct against its supplied manifest and the fixed target context. Providers are validated in separate observer instances so one report cannot supply another's missing evidence or overwrite its interpretation.

Agreement requires equal parsed manifests and complete history envelopes, including runtime bytes, checkpoint and endpoint headers, every included block, transaction, receipt, log and endpoint state. Object-property order is ignored. Optional metadata differences remain differences; no fields are silently dropped to manufacture agreement.

This is deliberately conservative. Two individually usable reports with different optional metadata can produce `history-conflict`; that alone proves neither dishonesty nor which report is correct. Equal tip hashes or equal reconstructed balances are insufficient when the supplied contents differ. The same unauthenticated history copied under several labels can still match.

Coverage remains exclusive at the starting checkpoint and inclusive at the selected endpoint. A matching absence applies only to that covered interval. Evidence references need block and transaction identity, plus log indices where applicable: [alpha.31](ORPHAN_INTENT_REPLAY.md) records identical transaction hashes in distinct branch inclusions.

## Try the retained fixtures

Save this example as an `.mjs` file in the repository root and run it with Node. The aliases intentionally describe simulated provider roles. Both original collectors queried the **same controlled local node**; this example does not demonstrate two independently operated providers.

```js
import { readFileSync } from 'node:fs';
import { createPaidProviderComparison } from './reference/paid-provider-comparison.mjs';

const load = name => JSON.parse(readFileSync(
  'experiments/paid-reorg/' + name, 'utf8'
));
const manifest = load('manifest-left.json');
const numberHistory = load('history-left-number.json');
const hashHistory = load('history-left-hash.json');
const posted = numberHistory.blocks.flatMap(block => block.transactions)
  .find(entry => entry.transaction.to === manifest.addresses.probe
    && entry.transaction.data.startsWith('0x62f509b3')
    && entry.receipt.status === '0x1');
if (!posted) throw new Error('Expected retained post is missing.');

const { end_block_hash, ...context } = manifest;
const comparison = createPaidProviderComparison({
  schema: 'caw-paid-action-target/1',
  context,
  calldata: posted.transaction.data
}, ['simulated-number', 'simulated-hash']);
const round = comparison.select(manifest);

comparison.submit(round, 'simulated-number', {
  manifest, history: numberHistory
});
console.log(comparison.state().status); // incomplete
comparison.submit(round, 'simulated-hash', {
  manifest, history: hashHistory
});
const view = comparison.state();
console.log({
  status: view.status,
  shared_observation: view.shared_observation,
  provider_independence: view.provider_independence,
  finality: view.finality,
  retry_safety: view.retry_safety
});
```

The manifest is selected from the fixture for reproducibility. Choosing and authenticating a public endpoint remains outside this module. Reusing these retained files is an offline check, not a new acquisition or provider-independence result.

## Bounds and remaining work

The complete report set has a weighted plain-data capture budget of 8 MiB and 100,000 values, with depth 20 and arrays of at most 2,048 entries. The byte budget is an admission measure, not an exact serialized-file size or process-memory ceiling. The fixed roster has at most four providers and the instance allows at most 1,024 selections. Existing observer and reconstruction bounds also apply. A limit failure cannot become agreement by omitting the report that exceeded it.

Capture copies own data properties and rejects accessors, cycles, sparse arrays and exotic prototypes. This is a boundary for plain data in the same process; hostile Proxy traps and replaced native built-ins are outside it. Capture shares checks with the prior readers, and separate provider instances reuse the existing observer and reconstruction code. They do not constitute independent verifier implementations.

This increment adds no persistence interface. Restart means creating a new instance and submitting the complete inputs in a fresh round; a stored status or calculated balance is not a replacement for the raw reports.

Transport timeouts, independent source operation, authenticated history, fresh acquisition, confirmation policy and production integration remain open. The [acquisition session](PAID_ACQUISITION_SESSION.md) separately checks one selected history through two collector strategies; this comparison does not convert those strategies into independent providers. See [issue #4](https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social/issues/4) and the [roadmap](ROADMAP.md).
