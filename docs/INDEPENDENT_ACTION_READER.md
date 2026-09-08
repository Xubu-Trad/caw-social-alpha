# Signed-action v1: a second reader

This is a read-only M-007 interoperability slice for the local simulation. The [reader](../reference/independent-action-reader.mjs) implements its own input checks, canonical reconstruction and trust matching. It imports no application, writer, replay or canonicalization helpers. It uses Node's synchronous Ed25519 API rather than the application's WebCrypto API. Both APIs may share a cryptographic provider; this is not an independent cryptographic implementation or external peer review.

M-007 comes from the [pinned manifesto, line 33](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md#L33): independently made frontends need an interface specification. This document describes the current synthetic signed-action wire, not an agreed production protocol. All 59 source requirements and 15 unresolved conflicts keep their historical pinned statuses.

## API and independent inputs

`inspectSignedAction(packetText, trusted, now)` is synchronous. On success it returns frozen `{action, canonical:true, signatureVerified:true, authorityMatched:true, nonceMatched:true, timeValid:true}`; `action` is also frozen. Failure throws an `Error` with a stable `READER_*` code. Error precedence for input with several faults is not a protocol guarantee.

The caller supplies an exact six-field trust record: `domain`, `account`, `controller`, `epoch`, `nextNonce`, `publicKey`. Its key order is irrelevant, but every field must be an enumerable own data property. Extra fields, symbols, accessors, arrays and custom prototypes are rejected; a null prototype is allowed. Ordinary records are copied using property descriptors, without getter or `toJSON` invocation. Hostile Proxy traps and a compromised runtime are outside this boundary. All inputs are captured before cryptographic work; there are no awaits.

`now` is an independently supplied integer Unix second. The reader obtains neither time nor trust from the submitted packet, a network service or a saved application state. It matches packet key, domain, account, controller, epoch and nonce against the supplied record. These matches establish only agreement with that caller-selected trust. `nextNonce` can be 0–256; action nonces end at 255, so 256 means no action can match. Inspection does not consume or store a nonce. Repeating the same valid input succeeds while the same supplied time and trust remain valid.

## Exact wire

The packet is a string whose UTF-8 encoding is at most **8,192 bytes**, with well-formed Unicode. It has exactly these keys in order: `action`, `publicKey`, `signature`. No BOM, surrounding whitespace or trailing newline is permitted.

The action has exactly these keys in order:

`account, controller, deployment, domain, epoch, expiresAt, fee, kind, network, nonce, notBefore, scenario, text, version`

| Field | Exact bound or value |
|---|---|
| `account` | 1–32 lowercase ASCII letters or digits |
| `controller` | `device-` followed by 1–40 lowercase ASCII letters/digits/hyphens; first suffix character is a letter or digit |
| `domain` | 1–96 lowercase ASCII letters/digits/hyphens; first character is a letter or digit |
| `epoch` | Integer 0–4,294,967,295 |
| `nonce` | Integer 0–255 |
| `notBefore`, `expiresAt`, supplied `now` | Integers 0–253,402,300,799; negative zero forbidden |
| Validity window | `1 <= expiresAt - notBefore <= 300`; accepted time is `notBefore <= now < expiresAt` |
| `version` | Number `1` |
| `network` | String `simulation` |
| `deployment` | String `unconnected-lab` |
| `scenario` | String `appendix-demo-v1` |
| `kind` | String `caw` |
| `fee` | String `5000000000000000000000`; the fixed synthetic amount, not a numeric JSON value |
| `text` | Nonblank under ECMAScript `trim`; at most 420 Unicode scalar values and 840 UTF-16 units; no unpaired surrogates |
| `publicKey` | Exactly 64 lowercase hex characters, representing 32 raw Ed25519 public-key bytes |
| `signature` | Exactly 128 lowercase hex characters, representing 64 signature bytes |

Every integer must be a safe JavaScript integer, without negative zero or fractional values. Text is not normalized or trimmed before signing: whitespace, case, combining marks and line breaks inside a nonblank message remain exact. Counting uses Unicode scalar values, not visible grapheme clusters. Control characters that satisfy the text rule are not separately prohibited by this wire.

Canonical encoding is ECMAScript `JSON.stringify` of a freshly constructed action in the order above, inside the packet in its stated order. It uses no pretty-print spacing. The reader parses JSON, validates the decoded scalars and reconstructs this spelling, then requires exact input equality. Duplicate keys, including escaped duplicates; reordered keys; alternate Unicode/slash escapes; alternate number spellings; extra fields; and whitespace variations are rejected. This is a fixed-format encoding, not a general JSON canonicalization standard.

## Signature bytes

Verify Ed25519 over UTF-8 bytes of the literal ASCII prefix `CAW_LOCAL_SIGNED_ACTION_V1` followed by one LF byte (`0a`), immediately followed by the canonical **action JSON only**. The packet wrapper, public-key text and signature text are not part of the signed message. The public key is separately matched against trusted input.

The reader wraps the 32 raw public-key bytes in DER SubjectPublicKeyInfo by prefixing hex `302a300506032b6570032100`. This represents the Ed25519 OID `1.3.101.112`, absent algorithm parameters and a BIT STRING with zero unused bits, as specified in [RFC 8410, sections 3–4](https://www.rfc-editor.org/rfc/rfc8410.html#section-3). It imports that public key with `createPublicKey({format:'der',type:'spki'})` and calls `verify(null, signingBytes, key, signatureBytes)`, using the Ed25519 behavior documented in [Node 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoverifyalgorithm-data-key-signature-callback). References checked for this implementation; execution results belong in the release validation record.

## Rejection codes

All codes begin `READER_`: `PACKET` for malformed/oversized packet text; `SCHEMA` for record shape or descriptors; `CANONICAL` for a different JSON spelling; `INTEGER`, `LABEL`, `ENCODING`, `WINDOW`, `UNSUPPORTED`, `TEXT` for wire constraints; `KEY`, `DOMAIN`, `AUTHORITY`, `NONCE`, `TIME` for disagreement with supplied trust/time; `SIGNATURE` for a verification result of false; and `CRYPTO` for a native key-import or verification error. Success booleans are returned together only after all checks succeed.

## What this does not verify

The reader neither verifies full ledgers, anchor packages, owner grants or delegations nor changes balances, grants, replay counters or storage. It does not sign, manage private keys, use wallets, consult NFT ownership or submit transactions. Supplied trust could itself be wrong or stale. A valid signature does not prove real account ownership, available funds, latest authority, absence of cancellation, global nonce use, finality, censorship resistance or availability.

The fixture and differential tests should compare independent expected bytes and outcomes against the existing writer/verifier. Passing them is scoped evidence that these two consumers agree on the exercised signed-action v1 cases. They share JavaScript JSON semantics and may share Node's crypto provider. Broader independent-client interoperability, durable authority and authenticated freshness remain separate requirements. No execution or complete M-007 satisfaction is claimed by this document alone.
