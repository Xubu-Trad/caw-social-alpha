# Offline Ethereum state proof inspection

This module checks whether supplied Ethereum account and storage proofs agree with a separately supplied state root. It performs no RPC request, header download, wallet operation or deployment. A successful result does not establish that the root belongs to Ethereum, names a particular block, is finalized, or is current. It grants no permission to spend.

The wire format is based on [EIP-1186](https://eips.ethereum.org/EIPS/eip-1186), whose source page was marked Stagnant at review. The EIP describes account and storage proofs for offline verification using a trusted root. This implementation is a bounded compatibility profile, not a claim of complete client compatibility or production readiness.

The synchronous entry point in [ethereum-state-proof.mjs](../reference/ethereum-state-proof.mjs) takes exactly two arguments:

```js
inspectEthereumStateProof(proof, trusted)
```

| Input | Exact fields |
| --- | --- |
| `trusted` | `stateRoot`, `address`, `storageKeys` |
| `proof` | `address`, `balance`, `codeHash`, `nonce`, `storageHash`, `accountProof`, `storageProof` |
| Each storage proof | `key`, `value`, `proof` |

Supply ordinary or null-prototype data objects and dense arrays. Unknown fields, accessors, hidden properties, symbol properties and duplicate requested slots are rejected. No getter or `toJSON` method is a source of trusted data. Hostile Proxy traps or a modified JavaScript runtime are outside this boundary. This API accepts parsed objects; it does not certify the original JSON text or detect duplicate JSON keys already discarded by another parser.

Roots and hashes are lowercase `0x`-prefixed 32-byte DATA; addresses are 20-byte DATA. Requested storage keys are 32-byte DATA. A returned storage key may be canonical lowercase QUANTITY or 32-byte DATA and is normalized before matching. Quantities use the shortest representation, including `0x0` for zero. [EIP-1474](https://eips.ethereum.org/EIPS/eip-1474#quantity) distinguishes quantity encoding from byte DATA. Requiring lowercase and these exact schemas is this module's stricter interface policy.

Every requested storage key must have exactly one matching response, with no unrequested response. Storage response order does not establish identity; results follow the caller's requested key order. The proof cannot select a replacement address, root or slot.

Account lookup follows Keccak-256 of the 20-byte address. Its included value decodes as `[nonce, balance, storageRoot, codeHash]`. Storage lookup follows Keccak-256 of the normalized 32-byte slot under the storage root obtained from that account. Storage keys are raw slots, not ABI declarations: the module does not infer mapping layouts, token IDs, proxy slots or NFT ownership. Ethereum's [trie description](https://ethereum.org/developers/docs/data-structures-and-encoding/patricia-merkle-trie/#state-trie) explains the account/storage relationship.

The reader follows branch, extension and leaf nodes, including compact paths of either parity. It checks compact-path flags and padding, canonical RLP, and the encoded child-length boundary: embedded nodes are shorter than 32 bytes; nodes of 32 bytes or more are referenced by their Keccak hash. A trie root remains hash-referenced even when its node is shorter. This checks canonical encodings and local node/reference rules, without establishing global trie normalization. It uses Ethereum Keccak-256, not standardized SHA3-256. Included integer payloads must be minimal big-endian encodings; zero is represented by empty bytes where zero is permitted. See the primary [MPT encoding description](https://ethereum.org/developers/docs/data-structures-and-encoding/patricia-merkle-trie/#specification-compact-encoding-of-hex-sequence-with-optional-terminator) and [RLP rules](https://ethereum.org/developers/docs/data-structures-and-encoding/rlp/#definition).

Witnesses are treated as content-addressed sets. Reordering a complete witness set changes no result. Duplicate nodes, missing referenced nodes and unused supplied nodes are rejected. An embedded child is already in its parent and must not also be supplied as an unused standalone witness. These strict witness rules and resource limits are local policies.

| Bound | Limit |
| --- | --- |
| Requested storage slots | 16 |
| Nodes in one proof | 65 |
| Encoded bytes in one node | 1,024 |
| Total supplied node bytes across account and storage proofs | 65,536 |
| RLP nesting depth | 32 |
| RLP items across one proof witness set | 2,048 |

Account and storage value payloads receive their own bounded RLP decode. These limits describe the supported inspection scope; they do not establish that every valid Ethereum proof fits this profile.

Absence must follow from a complete path to an empty child or a divergent terminal path, or from the known empty trie root. An empty trie accepts an empty witness set or its explicit `0x80` node. Missing arbitrary proof data is not evidence of absence. An absent storage slot has value `0x0`; a stored value must be a positive canonical integer of at most 32 bytes.

A proven absent account has no account leaf. Its nonce and balance claims must be zero. For compatibility, hash claims may be either both zero hashes or the empty-code/empty-trie pair; mixed or arbitrary pairs are rejected. Output `codeHash` and `storageHash` are null in this case. Each requested slot must claim zero with an empty proof. This derives zero storage from account absence; it does not invent a storage trie. Geth's [GetProof implementation at commit 7538039](https://github.com/ethereum/go-ethereum/blob/7538039f06792da46a91165e7eda98917edcfde2/internal/ethapi/api.go) returns account metadata from StateDB and supports both storage-key representations. This is a pinned source review, with no client or live RPC execution claimed.

The frozen result contains `stateRoot`, `address`, `accountExists`, `nonce`, `balance`, `storageHash`, `codeHash`, and frozen `storage` entries `{key, value, exists}`, plus `proofVerified: true`. It always leaves these claims false:

- `rootAuthenticated`
- `blockBindingProven`
- `finalityProven`
- `freshnessProven`
- `ownershipProven`
- `livePermissionRestored`

The low-level `inspectTrieProof(root, keyHex, nodes)` helper follows a supplied path of zero to 32 bytes without hashing it first, returning frozen `{exists, value}`. Its included value is DATA and its absent value is null. It is for format tests and explicitly supplied trie paths. The separate `keccak256Hex(dataHex)` helper accepts lowercase even-length DATA up to 65,536 bytes.

[Tests](../tests/ethereum-state-proof.test.mjs) compare against [fixed vectors](../reference/fixtures/ethereum-state-proof-v1.json) from a separate Python Keccak/RLP/trie implementation, including malformed witnesses with independently calculated roots. That separates expected bytes from the JavaScript verifier. Both implementations were authored within this project; this is not an external audit or a mainnet proof capture. Consult [validation evidence](VALIDATION.md) for actual executed checks; the existence of this document or a test file is not a passing result.

To reproduce the focused checks, run the following from the release root with Node.js 24.20.0. The fixed fixture is already included; regeneration is optional. The separate [fixture generator](../reference/fixtures/generate-ethereum-proof-fixtures.py) documents its Python 3.11 construction and internal checks.

```sh
node --test tests/ethereum-state-proof.test.mjs
```

This advances proof-format handling toward independently checked account data. Live authority still requires an independently authenticated block/root, defined finality and freshness, verified contract code and storage layout, correct NFT ownership semantics, replay/revocation rules, custody and settlement designs, and independent review. The manifesto's 59 source requirements and 15 recorded conflicts remain unchanged.
