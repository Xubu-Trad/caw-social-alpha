# Check the supplied execution headers

Alpha.34 adds a bounded offline check of Ethereum execution-header encoding, claimed hashes and parent links. The caller explicitly selects a header format and endpoint. The module recomputes each header's Keccak hash from its ordered RLP fields and requires it to match that selection.

This is a standalone check. Alpha.35 adds an explicit [recovery adapter](HEADER_CHECKED_RECOVERY.md) that requires it before adopting history. Existing paid-history readers, action observers and provider comparison remain unchanged. Their earlier success results do not imply that this header check ran.

**25 focused checks and 582/582 full-suite tests passed.** The fixture generator also verified its retained observed vectors; no new live acquisition occurred.

## What a match establishes

The [header inspector](../reference/ethereum-execution-header.mjs) binds the supplied consensus header fields, including the state, transaction and receipt roots, to the supplied hash. Its chain interface also checks adjacent parent hashes and consecutive block numbers from the selected checkpoint through the selected endpoint.

The endpoint itself is a caller-supplied assumption. A self-consistent invented chain can pass if the caller selects its invented hashes. No beacon consensus, proof of work, fork choice, timestamp freshness, execution or finality is established. The module does not derive transaction or receipt roots from a block body, verify withdrawals or requests, or authenticate a provider.

An execution header carries no chain ID. This standalone check does not establish chain or deployment context; the existing paid manifests and observers check their supplied context separately. Endpoint authentication still requires an external policy.

Every successful result therefore keeps these flags false:

```text
endpointAuthenticated
consensusVerified
bodyCommitmentsVerified
executionVerified
finalityVerified
freshnessVerified
```

A matching header does not settle whether an observed action is final, cancelled or safe to retry. The existing [state-proof verifier](../reference/ethereum-state-proof.mjs) also retains its original unauthenticated-root flags. Composing a proof with a checked header would still require an explicit root match and a separately justified endpoint trust policy.

## Explicit header layouts

The profile chooses the exact field count and order. It does not establish when that fork is active on a particular chain.

| Profile | Fields added to the preceding layout | Encoding source |
| --- | --- | --- |
| `london-16` | The original fifteen fields followed by `baseFeePerGas`. | [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559) |
| `shanghai-17` | `withdrawalsRoot`. | [EIP-4895](https://eips.ethereum.org/EIPS/eip-4895) |
| `cancun-20` | `blobGasUsed`, `excessBlobGas`, `parentBeaconBlockRoot`. | [EIP-4844](https://eips.ethereum.org/EIPS/eip-4844), [EIP-4788](https://eips.ethereum.org/EIPS/eip-4788) |
| `prague-21` | `requestsHash`. | [EIP-7685](https://eips.ethereum.org/EIPS/eip-7685) |

The first fifteen RPC field names, in order, are `parentHash`, `sha3Uncles`, `miner`, `stateRoot`, `transactionsRoot`, `receiptsRoot`, `logsBloom`, `difficulty`, `number`, `gasLimit`, `gasUsed`, `timestamp`, `extraData`, `mixHash` and `nonce`. Post-merge RPC `mixHash` occupies the randomness slot; this checker does not validate its consensus meaning.

Required fields must be present. Fields from another profile and unknown future extensions are rejected. Legacy fifteen-field headers and intervals crossing a format transition are outside this increment. The caller must select one fixed profile for the entire supplied interval.

DATA is lowercase, even-length hex with its specified byte width; `extraData` permits zero through 32 bytes. QUANTITY is lowercase minimal hex, with `0x0` for zero. Integer zero becomes an empty byte string before RLP; the eight-byte `nonce` remains eight bytes, including when all zero. This follows Ethereum's [RLP integer encoding](https://ethereum.org/developers/docs/data-structures-and-encoding/rlp/). Blob quantities are bounded to uint64; the other supported quantities are bounded to uint256. These ranges are encoding admission caps, not full execution-validity rules.

Optional RPC `totalDifficulty`, `size`, `uncles`, `transactions` and `withdrawals` are bounded plain data but excluded from header RLP. Their contents are not checked against the roots. Gas accounting, base-fee progression, blob accounting, timestamp rules and consensus-specific difficulty or nonce rules are also outside this check.

## Inspect a retained interval

Run the following as an ES module from the repository root. It uses an existing controlled local London capture and performs no network request. The checkpoint is included in the header check even though paid-action reconstruction excludes its transactions.

```js
import { readFileSync } from 'node:fs';
import { inspectExecutionHeaderChain } from './reference/ethereum-execution-header.mjs';
import { reconstruct } from './reference/paid-action-reader.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const history = read('experiments/paid-reorg/history-left-number.json');
const manifest = read('experiments/paid-reorg/manifest-left.json');

const headers = [history.start_block, ...history.blocks.map(block => block.header)];
const integrity = inspectExecutionHeaderChain(headers, {
  schema: 'caw-execution-header-chain-selection/1',
  profile: 'london-16',
  startHash: manifest.start_block_hash,
  endHash: manifest.end_block_hash
});

// A separate existing reader checks the supplied action history.
const actions = reconstruct(history, manifest);
console.log({ headerCount: integrity.headerCount, actions });
```

The manifest pins the example's endpoints; it does not authenticate them. The local experiment's documented format justifies the explicit London selection. Reading a format from arbitrary untrusted metadata would not establish a network's fork schedule.

For one header, call `inspectExecutionHeader(header, { schema: 'caw-execution-header-selection/1', profile, hash })`. The single result uses schema `caw-execution-header-integrity/1` and returns the profile, computed hash, parent hash, block number, three execution roots and encoded `rlp`, with `headerHashVerified` and `selectedHashMatched` true.

The chain result uses schema `caw-execution-header-chain-integrity/1`. It returns `startHash`, `endHash`, `headerCount`, each single-header result, `parentLinksVerified` and `numberSequenceVerified`. An exception returns no partial chain result. Outputs are deeply frozen snapshots; inputs are captured before inspection.

## Bounds and evidence

A chain must contain two through 129 headers, inclusive of the checkpoint: at most 128 subsequent blocks. Each header has a 64 KiB weighted plain-data capture cap and a 2,048-byte RLP cap. Chain capture is bounded to 8 MiB weighted data, 100,000 values, depth 20 and arrays of at most 2,048 entries. These are capture accounting limits, not exact serialized size or process-memory guarantees.

Capture rejects accessors, cycles, sparse arrays, exotic prototypes and unsupported values. It does not invoke supplied getters or `toJSON`. Hostile Proxy traps and replaced native built-ins are outside this same-process boundary. The capture approach and JavaScript Keccak primitive are shared with prior modules; they are not independent verifiers.

The [fixture generator](../reference/fixtures/generate-execution-header-fixtures.py) assembles header fields in Python without importing the JavaScript inspector. It reuses pinned, previously reviewed Python RLP and Keccak primitives. Its synthetic vectors cover all four profiles, integer boundaries 0, 1, 127, 128, 255 and 256, maximum-width difficulty/base fee and blob quantities, empty and 32-byte extra data, and the fixed-width zero nonce. These are encoding cases, not claimed consensus-valid blocks.

The generated [fixture](../reference/fixtures/execution-header-v1.json) also contains a three-header chain for each profile, a 129-header London boundary chain, and a linked, correctly hashed chain with a number gap for rejection. Two retained Prague header responses are rehashed from the earlier [PublicNode](../reference/fixtures/caw-token-publicnode.json) and [dRPC](../reference/fixtures/caw-token-drpc.json) captures. Their original bytes stay unchanged. Reusing those records is not a new provider query or independent consensus observation.

To reproduce the fixture, run `python reference/fixtures/generate-execution-header-fixtures.py` under the project's existing resource limits, then run the header tests through `npm test`. Source hashes and expected RLP/hash bytes are retained in the fixture. No wallet connection, transaction submission or automatic adoption by the frontend occurs in this increment.
