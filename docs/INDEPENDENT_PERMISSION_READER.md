# Permissions, grants and cancellation: a second reader

This extends the M-007 interoperability experiment to fresh delegated and owner-granted synthetic records. The [permission reader](../reference/independent-permission-reader.mjs) implements its own schemas, fixed JSON encoding, SHA-256 domain derivation and Ed25519 checks. The [history reader](../reference/independent-history-reader.mjs) reuses its separate settlement implementation and action reader. Neither imports application permission, owner-grant, model, allocation, replay or checkpoint helpers. JavaScript semantics and Node crypto remain shared dependencies; this is same-team work, not independent external security review.

## APIs and separate trust

All APIs are synchronous, require the stated argument count and return frozen data. There is no signer, private key, callback, network lookup, persistence or live permission restoration.

| API | Result on success |
|---|---|
| `copyPermissionTerms(value)` | Validated `{scope,budget,notBefore,expiresAt}`; copying does not authorize it |
| `copyPermissionAuthority(value)` | Validated `{domain,account,controller,epoch,publicKey}`; copying does not prove ownership |
| `inspectDelegatedPermission(binding,permission)` | `{binding,permission,domainMatched:true,...limits}` |
| `inspectOwnerGrant(packetText,ownerAuthority)` | `{binding,permission,authority,ownerGrantVerified:true,...limits}` |
| `inspectOwnerCancellation(packetText,ownerAuthority,expectedGrantDomain)` | `{revocation,ownerRevocationVerified:true,...limits}` |

Here `limits` means `authorityProven:false`, `freshnessProven:false` and `livePermissionRestored:false`. Binding/permission/authority/revocation nested records are also frozen. `ownerGrantVerified` or `ownerRevocationVerified` records a signature and supplied-trust match, not real NFT authority.

The existing `inspectSignedHistory(recordText,checkpoint,binding)` stays ordinary-only with exactly three arguments. New `inspectGrantedHistory(recordText,checkpoint,binding,permission)` accepts exactly four arguments for delegated v1. Owner v1/v2 require exactly five arguments, adding `ownerAuthority`. An explicitly supplied fifth `undefined` argument is not an omitted authority. Formats and trust presence cannot be interchanged or downgraded.

History success retains the ordinary result fields and false ownership/time/authority/freshness/live-permission flags. It adds frozen `delegation:{permission,spent,remaining}`. Owner records additionally return `ownerGrantVerified:true`, `ownerRevoked:boolean`, and `ownerRevocations:0|1`. `inheritedEvents` remains zero. A true cancellation flag describes this supplied historical record only.

All separate trust objects must have the exact enumerable own data fields. Unknown, hidden, symbol or accessor properties and custom prototypes are rejected without invoking ordinary getters or `toJSON`; null-prototype records are allowed. Inputs are captured before hashing or signature work. Hostile Proxy traps and compromised built-ins are outside this boundary.

## Permission and unsigned domain bytes

Permission keys, in canonical order, are `scope,budget,notBefore,expiresAt`. Scope is exactly `caw`. Budget is a positive canonical decimal string, at most 24 digits and at most `320000000000000000000000` base units: 64 fixed synthetic CAW fees. A budget smaller than one fee or not divisible by a fee is valid, but can prevent the next action. No currency decimals or token integration are established here.

Both times are nonnegative safe integer Unix seconds, excluding negative zero, at most `253402300799`. The permission duration is positive and at most 300 seconds. Every signed action's entire window must lie within it; its recorded accepted time must lie in both windows. Gross signed fees accumulate even when model balances receive credits. Transfers and cancellation consume no budget. The reader does not check the present wall clock or prove a recorded time.

Delegated domain is `grant-` followed by lowercase SHA-256 over UTF-8 of prefix `CAW_LOCAL_DELEGATION_V1`, one LF byte, then exact compact JSON with these keys in order:

`account,controller,epoch,publicKey,network,deployment,scenario,fee,scope,budget,notBefore,expiresAt`

The first four fields come from separately supplied binding; the last four from permission. Fixed fields are `network:'simulation'`, `deployment:'unconnected-lab'`, `scenario:'appendix-demo-v1'`, and string fee `5000000000000000000000`. The binding's input domain is validated but deliberately excluded from the digest body; inspection requires it to equal the derived domain. No signature or real owner approval is implied by an unsigned domain hash.

## Owner grant bytes

The grant packet has exactly `{grant,signature}` in that order. Grant fields are:

`version,network,deployment,scenario,fee,ownerDomain,account,controller,epoch,ownerKey,delegateKey,scope,budget,notBefore,expiresAt`

Version is number `1`; the fixed context and fee are those above. Owner fields must match separately supplied authority's domain, account, controller, epoch and publicKey exactly. Delegate and owner keys are distinct 32-byte lowercase hex public keys. The resulting spending binding uses the delegate key. Generic owner authority labels may start with `grant-` or `ownergrant-`; spending-domain mode rules do not prohibit those owner labels.

The signature is 64 bytes represented by exactly 128 lowercase hex characters. Verify Ed25519 over UTF-8 of `CAW_LOCAL_OWNER_GRANT_V1`, one LF byte, and canonical grant JSON only. Domain is `ownergrant-` plus SHA-256 of those same signing bytes. The wrapper and signature are excluded from this digest. History inspection requires both independently supplied delegate binding and permission to match the verified grant in full.

## Cancellation bytes and record limits

Cancellation packet is exactly `{revocation,signature}`. Its payload field order is:

`version,network,deployment,scenario,ownerDomain,account,controller,epoch,ownerKey,grantDomain`

The context is version `1` and the same simulation/deployment/scenario. `grantDomain` must be `ownergrant-` followed by exactly 64 lowercase hex digits. Every payload field must match the separately trusted original owner and the already verified grant domain. It contains no fee, timestamp, action nonce or permission window. Signature input is UTF-8 of `CAW_LOCAL_OWNER_REVOCATION_V1`, one LF byte, and canonical revocation JSON only. Direct callers of the cancellation helper must establish the expected grant domain separately; the history path verifies its owner grant first.

Owner packets are bounded to 8,192 UTF-8 bytes. They use compact ECMAScript JSON spelling and the fixed orders above. Reconstructing exact text rejects alternate whitespace, reordered/duplicate keys, escaped duplicate keys, unknown fields, alternate hex case and invalid scalars. Public-key, label and integer rules match the signed-action wire. Ed25519 verification uses Node `createPublicKey`/`verify` with the RFC 8410 SPKI prefix documented in [the action reader specification](INDEPENDENT_ACTION_READER.md), rather than application WebCrypto helpers. This does not establish a separate cryptographic provider.

| Record format | Exact outer key order | Cancellation and size bounds |
|---|---|---|
| `caw-delegated-lab-record-v1` | format, initialHistory, delegation, entries | No cancellation; at most 64 entries and 2 MiB |
| `caw-owner-granted-lab-record-v1` | format, initialHistory, delegation, ownerGrant, entries | No cancellation; at most 64 entries and 2 MiB |
| `caw-owner-granted-lab-record-v2` | format, initialHistory, delegation, ownerGrant, entries | Exactly one final cancellation; at most 64 model changes plus that cancellation, 65 total entries and 2 MiB + 16 KiB |

Only exact canonical owner-v2 text receives the reserved outer byte allowance. A cancellation entry is exactly `{kind:'signed-owner-revocation',packet}`. It appends no model event, receipt, fee or nonce and may occur before any CAW, after a fixture transfer or after the permission window. It still verifies original retained owner/grant authority. Nothing may follow it in the record. Ordinary/delegated/owner-v1 formats cannot carry it, and owner-v2 cannot omit or duplicate it.

Every supported initial model still has zero inherited events and a fully verified seed snapshot. Existing seed posts and metadata remain allowed. All signed CAWs retain the separate reader's signature, nonce, exact fee, settlement and transfer-invalidation checks. Changing a controller away and back does not restore the original binding. Further unsigned fixture transfers are allowed before terminal cancellation. Each resulting model export remains bounded to 1 MiB.

The checkpoint format remains `caw-signed-lab-checkpoint-v1`. Its expected record hash, byte length and entry count cover cancellation as well as actions. Cancellation leaves final model bytes unchanged, so the final-history hash alone cannot establish whether it is present.

## Rejections and remaining work

Permission-module errors use `PERMISSION_SCHEMA`, `TERMS`, `AUTHORITY`, `PACKET`, `CANONICAL`, `CONTEXT`, `KEYS`, `DOMAIN`, `OWNER`, `SIGNATURE`, `CANCELLATION` or `CRYPTO`, with the same `PERMISSION_` prefix on each name. Granted history retains `HISTORY_*` and `READER_*` errors and adds `HISTORY_PERMISSION_SCOPE`, `HISTORY_PERMISSION_WINDOW`, `HISTORY_PERMISSION_BUDGET`, `HISTORY_PERMISSION_MISMATCH`, `HISTORY_OWNER_GRANT` and `HISTORY_CANCELLATION`. Error precedence for multiply invalid input is not a protocol guarantee.

Valid old grants and records can remain verifiable after unseen transfers, cancellations or later activity. Replacing package, fingerprint and trust together can select a different valid historical baseline. The reader performs no real NFT lookup, authority discovery, chain finality check, distributed replay protection, live restoration or latest-state selection. Independently authenticated current authority and freshness remain separate design work. Actual test results belong in the release validation record; this document alone claims no execution, external review, community acceptance or complete M-007 satisfaction. All 59 requirements and 15 conflicts retain their pinned historical statuses.
