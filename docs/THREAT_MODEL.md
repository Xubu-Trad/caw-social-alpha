# Initial threat model

Status: initial model updated after the 40-test B-001 suite. Fixture validation and server isolation have execution evidence. The prior browser review (supporting local record omitted; see the source-coverage note) records bounded core journeys, desktop/narrow layouts, literal text rendering and corrected dialog keyboard behavior; full accessibility, cross-browser coverage and production controls remain unverified. That review does not test the new media/portable-site phase. Self-review and other agents on this team are not independent security review.

| Threat / boundary | Concrete failure | Initial control / required evidence | Status |
|---|---|---|---|
| Research to application | Private paths/chat/credentials copied into fixtures or build | Public-only sources, synthetic fixtures, separate private directory, full artifact/history review before publication | Boundary established; future artifacts untested |
| Download to local execution | Compromised runtime or lifecycle code executes with user access | Exact official binary pin, bounded download, content review, no package installation or upstream code execution | Approved binary hash/version verified and executed; no audit or PGP verification |
| Web request to filesystem | Preview exposes research files or serves traversal requests | Fixed public-file allowlist, loopback bind, Host/method checks, no generic workspace server | Server tests passed; exact loopback listener observed |
| Text to browser | Script-bearing CAW or misleading link executes | Safe text rendering, restrictive CSP, no HTML/URL preview execution; preserve raw canonical text separately | Static code review and CSP header tests; prior bounded browser check preserved literal text with zero img/script/iframe children; this does not verify new media handling or every browser/content case |
| UI to accounting | Client changes amount, target, balance or settlement state | Deterministic model now; authoritative protocol checks later; reject unknown/changed fields | Fixture schema/tampering tests passed; synthetic authority only |
| Relay to protocol | Replay, reorder, drop or alter signed action | Domain, current owner, nonce, expiry and exact intent validation; independent submission paths | Production design unresolved |
| NFT transfer to account | Old owner spends pending balance or reads new DMs | Explicit transfer/order and key/session rules; tests for old/new authority | Production gate C-005/C-007/C-009 |
| Protocol to token | Burn fails; unexpected token callbacks or accounting mismatch | Verify original token and source/bytecode; isolated custody tests and invariant checks | Production gate C-001 |
| Pool distribution | Zero recipient, dust loss, payer self-reward or repeated charges | Explicit source interpretation; integer arithmetic and conservation/property tests | Production gate C-002/C-007 |
| Deployment to authority | Immutable wrong address or hidden owner/delegate/proxy controls | Full authority graph, code hashes, wiring/chain/peer validation before irreversible steps | No deployment authorized |
| Indexer to user | Fabricated feed/ownership/balance or irreplaceable private DB | Receipt verification; reconstruct from complete public history; compare fresh independent operators | Proposed; fixture rebuild has narrower meaning |
| Storage to continuity | Content hash retained but payload gone | Recoverability/retention/payer analysis and full builder-disappears exercise | Production gate C-006/C-008 |
| Operator to DM | Plaintext recovery key, metadata collection or wrong recipient | Reviewed E2EE design, authenticated key changes, explicit retention/recovery limits | DM implementation blocked |
| Frontend policy to protocol | Service moderation becomes universal ban/confiscation | Independent clients and direct/alternate submission; no protocol admin ban | Proposed, full graph must prove |
| Hosting/publication | Identity exposure or unsupported security/compliance claim | Exact approval, metadata/license review, qualified production questions, no official/immunity claim | Publication blocked |
| Device/browser | Extensions, stolen session or endpoint compromise | Dedicated context where practical; user verification of protection settings; no secrets used in demo | Residual risk; not a device audit |

The initial prototype has no custody or cryptography to certify. Record failures and limitations; do not turn an empty exploit surface into a claim that production would be safe.
