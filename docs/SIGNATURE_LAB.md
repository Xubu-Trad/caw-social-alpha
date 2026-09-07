# A signed action, checked before acceptance

The Identity view contains a separate local signature lab. It signs a fixed synthetic CAW and checks it against a separately held test-key binding. Alpha.5 adds a [copied ledger](SIGNED_SETTLEMENT.md): acceptance updates its synthetic balance, post, receipt and action number together. Commons remains unchanged. This is a proposed authorization experiment, not the CAW wallet format or an adopted protocol rule.

## What the signature covers

`public/signatures.mjs` uses native WebCrypto Ed25519. Signed bytes are UTF-8 of `CAW_LOCAL_SIGNED_ACTION_V1` followed by one LF and the exact canonical action JSON. The packet is canonical JSON with `action`, `publicKey`, `signature`, in that order. Keys and signatures are fixed-length lowercase hex. The action fields are ordered as follows:

```text
account, controller, deployment, domain, epoch, expiresAt, fee,
kind, network, nonce, notBefore, scenario, text, version
```

The network is `simulation`, deployment is `unconnected-lab`, version is `1`, kind is `caw`, scenario is `appendix-demo-v1`, and fee is the fixed synthetic CAW fee. The domain is a local session label, not a verified website origin. The UI generates a fresh label and key when explicitly requested. Only CAW examples are supported: Like, ReCAW, Follow, transfers, deposits and withdrawals are outside this lab.

Text retains exact valid Unicode, with the existing provisional 420-code-point limit. Noncanonical JSON whitespace, reordered fields, duplicate fields, alternate JSON encodings, unknown fields and malformed strings are rejected at the packet boundary. Whitespace inside the signed text is preserved. The packet cap is 8 KiB; a validity interval is at most five minutes. Validity uses `notBefore <= now < expiresAt`. Action numbers are 0–255, with 256 representing an exhausted verifier. Those bounds are local choices, not manifesto constants.

## A valid signature is only one check

The verifier receives the expected public key, account, controller, epoch, next action number and domain separately. A packet cannot grant itself authority by supplying its own key. The verifier checks all bindings and the time interval before and after asynchronous cryptographic verification. No asynchronous step separates the final checks from consuming the next action number, so simultaneous duplicate calls on the same verifier cannot both accept. Failed checks consume nothing. Revocation closes the verifier, including pending checks.

That counter lives in one JavaScript object. A new verifier, another tab, reload or another process does not share it. Distributed replay protection requires an authoritative durable state transition; this lab provides none. The clock is local and cannot establish chain time. The supplied binding is an assumption, not evidence of NFT ownership, a delegated allowance or real account authority.

The copied-ledger adapter calls the non-consuming `check` operation, then uses the accounting model's nonce as its single acceptance counter. Failed accounting must not consume a separate verifier nonce. It rechecks its owned ledger revision, current authority, closure and time before committing. Its unsigned controller-change control is a fixture mutation for testing stale keys, not a signed transfer.

Alpha.6 also captures exact packets and recorded local acceptance times in a [bounded recovery record](SIGNED_RECORD_RECOVERY.md). That record is committed with the copied model state. Its verifier checks supplied test-key signatures and reconstructed accounting against separately retained fingerprints; it does not prove real account ownership or historical wall time.

## Keys and lifecycle

The native API creates a fresh Ed25519 private key with export disabled. The module exposes only its public key and bounded signing operation; no private-key export, user-key import, wallet call, persistence or network transmission is implemented. Closing/replacing the lab revokes its verifier and signer and drops references to its key. Pending results cannot restore a closed view.

Non-extractability restricts API export; it does not promise secure hardware, browser/OS erasure, protection from malicious same-origin code, or an uncompromised device. This is signatures only, with no private-message encryption. Native cryptography unavailable or unsupported means the lab fails visibly; it does not substitute a fake signature.

## Source and protocol boundary

The [manifesto](../sources/primary/manifesto-pinned.md) associates account authority with NFT ownership at lines 40–41 and calls for smooth signing at lines 83–84. This experiment exercises parts of M-007/M-025. C-005, C-007 and C-009 remain unresolved: actual ownership, pending-action/transfer rules, scoped delegation, allowances, revocation and DM keys still need agreed designs and independent review. All 59 requirements and 15 conflicts remain intact.

Ed25519 here is not EIP-712 or an Ethereum wallet implementation. A future Ethereum format requires its own exact typed-data encoding, chain/contract binding, ownership authority and contract-wallet support. No production verifier should accept this lab format. [EIP-712's security section](https://eips.ethereum.org/EIPS/eip-712#security-considerations) also treats replay behavior as the application's responsibility.

Cryptographic operations use the [W3C Web Cryptography Level 2 draft](https://www.w3.org/TR/webcrypto/#ed25519), rather than custom curve arithmetic. The draft's [key interface](https://www.w3.org/TR/webcrypto/#cryptokey-interface) describes the extractability flag. This is an implementation choice for the local lab, not W3C endorsement or a complete security assessment. Sources accessed 2026-09-07.

Current execution results belong in [validation](VALIDATION.md). Planned or written tests are not a pass until the reviewed revision runs. Cross-checking through Node's separate crypto API tests interoperability between APIs, not independence of their underlying cryptographic provider.
