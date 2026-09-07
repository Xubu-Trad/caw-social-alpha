# Test deployment plan — preparation only

Prepared 2026-09-07. **Nothing is deployed by this plan.** No host/account/project has been selected or created, no site tooling initialized, and no wallet, signature, testnet, mainnet, contract or real media upload is involved. Existing authority covers the original bounded local fixture work; external publication must follow the user's actual destination/scope authorization. Do not repeat approvals already given for exact artifacts and actions.

The next suitable target is a **hosted synthetic website/app preview**, after the gates below. It would demonstrate navigation, local actions, accounting/replay and deliberately selected local media previews. It would not be a decentralized network, a functioning CAW protocol or a financial product. Contract/testnet deployment is a separate later phase with presently missing implementation and specifications.

Read the [manifesto/R2 alignment review](MANIFESTO_R2_ALIGNMENT_REVIEW.md), [portable build](PORTABLE_WEB_BUILD.md), [resilience plan](RESILIENCE_PLAN.md) and [media scope](MEDIA_AND_PRODUCT_SCOPE.md). The 59 primary requirement rows and 15 production conflicts remain in force; hosting a fixture does not resolve them.

## Release decision record

Before requesting or exercising a publication decision, prepare these concrete fields in the release receipt:

| Field | Current state / required value |
|---|---|
| Purpose | Synthetic review preview; no real custody, messages, media uploads or protocol settlement |
| Destination and audience | OPEN: exact provider/project and URL or hostname; public versus controlled access must be explicit |
| Artifact | New final public allowlist, exact member hashes, deterministic archive hash/size and source version; prior package remains historical |
| Spending | No spend authorized by this preparation; record provider pricing/limits and exact intended maximum before any paid operation |
| Public identity | Reviewed Xubu/project attribution; no personal filesystem/device/account metadata |
| Included artwork | Existing selected CAW PNG and its recorded user authorization/provenance, or a deliberately reviewed replacement; no new blanket license claim |
| Host behavior | HTTPS, MIME, CSP/security headers, redirects, error pages, injected scripts, analytics/logging and caching reviewed on the selected host |
| Operator and rollback | Exact person/account able to change/remove this preview, version restoration path and retained artifact; this does not control future protocol accounts |
| Evidence | Final syntax/automated/browser/package results for the outgoing artifact, plus explicitly untested cases |
| Authorization boundary | Confirm the requested destination and visibility against the user's instructions; no implicit permission for a new repository, PR, domain purchase, native app or chain action |

Upstream contributions belong in the relevant cawdevelopment repository. Verify its target and base branch before an actual submission. Destination eligibility does not imply write access or interoperability.

## Stage A — finish the local release candidate

1. Freeze the intended code/assets after concurrent edits finish. Record hashes and exact files before the final checks. The prior completed suite passed 44/44; a planned larger suite is not a result. Read the new run receipt for actual completion.
2. Review each added/changed module and configuration as data before execution. Keep original code, fixed synthetic fixtures and explicit file allowlists. No remote dependencies, wallet connection, runtime proxy, user-media upload endpoint or third-party code execution is needed for this preview.
3. Run only the already approved bounded local checks under B-001's supervisor and resource limits. Retain failures, corrections and actual exit status. This plan itself executes no commands and expands no execution limits.
4. Reconcile the README, website, scope documents and release summary with the final artifact. Describe the hostable build as synthetic preview/alpha; clearly distinguish public hosting of the app from publishing user posts to a protocol. Show reset/local-only behavior where users make choices.
5. Build a new archive twice from the reviewed public allowlist, with deterministic metadata/order. Verify both archive digests and every expected member. Confirm omissions of runtime, app tests, private configuration, research/source archives, logs, absolute paths and browser-selected media. Keep prior packages as versioned evidence.

Stage A can continue as authorized local development. Publication remains a separate mutation; this document is not a command to upload the workspace.

## Stage B — bounded fixture acceptance

These checks are proposed requirements. The implementing run record must say PASS, FAIL, PARTIAL or NOT RUN with version, environment and evidence; this table contains no new pass claims.

| ID | Check and finite scope | Acceptance / limitation |
|---|---|---|
| PRE-01 | Final local syntax and all applicable tests, once after the last relevant changes; repeat only for a new failure/change | Preserve exact source hashes and actual test counts. No transfer of an old pass to modified code. |
| PRE-02 | One core journey: choose synthetic identity, type/review/queue/submit/confirm, inspect recipients/receipt; one stale-owner and one duplicate-action case | Typing/queueing do not settle balances; failed actions leave state unchanged; synthetic finality remains labeled. |
| PRE-03 | Export/rebuild a bounded history, save one actual downloaded file when available and compare with displayed JSON | Missing/reordered/duplicate/inconsistent records reject; state/export limits hold. Select-for-copy is a fallback, not proof a download or clipboard write succeeded. |
| PRE-04 | Known-safe, small PNG/JPEG/WebP and MP4/WebM; one unsupported file and representative limit cases | Actual decoding/playback tested for offered formats; no autoplay, no network upload; canonical export unchanged. Untested codecs/formats remain qualified. |
| PRE-05 | Replace selection while loading; remove during playback; change view; reload/back-forward lifecycle; one timeout/decode failure | No stale file returns, playback stops, object URLs release, selected metadata never enters canonical state. Browser/OS secure erasure is not claimed. |
| PRE-06 | Website → app → media → website at `/` and exact nested `/mirror/`; one desktop and phone-width view; keyboard navigation/dialog escape | Own assets resolve relative to the delivered release; no horizontal overflow in tested views; focus and action states remain understandable. Same server is not independent hosting. |
| PRE-07 | Inspect the final archive manifest/member list and compare current public files to package hashes | Exact allowed public files only. A content hash proves byte consistency with its reference, not official authorship or full application security. |
| PRE-08 | Inspect release guard/configuration behavior using fixed local cases: expected config, missing file and changed critical field | Release fails clearly when required configuration is invalid; do not silently fall back to an unintended network. Any unsigned or same-origin-supplied digest has an explicit trust limit. No chain connection is introduced. |

Use the established local 768 MiB free-memory and 2 GiB free-disk launch gates, one loopback preview, approved per-file/media bounds, serial tests and bounded logs. Do not close unrelated applications to force a run. The selected-media size limits constrain accepted files; they do not establish a hard process-wide decoder memory quota. No unbounded fuzzing, watcher or outside crawl is needed.

## Stage C — configure the chosen preview host, after scope is concrete

The Node loopback server is a local test component and rejects public Host/Origin values by design. Do not widen its listener or weaken checks as a shortcut. Use a separately reviewed static-host configuration for only the release artifacts.

Preserve the intended response policy at that host: correct HTML/CSS/module/JSON/image MIME; restrictive `default-src`, script/style/connect sources; local `blob:` only where needed for selected media; no objects, framing, forms or arbitrary base URL; no-referrer and no-sniff behavior; explicit permissions and origin isolation. A static ZIP does not configure these headers. A CSP meta tag alone cannot replace all response-header controls, including framing policy. Review any provider-injected analytics/script, custom error page or redirect separately. Retain no-store for the first preview unless caching is deliberately reviewed against its release-update model.

The CSP specification explicitly excludes `frame-ancestors` from meta-delivered policy. This is why host response verification remains a separate acceptance check. [W3C CSP Level 3, sections 3.3 and 6.4.2, Working Draft dated 2026-08-13; accessed 2026-09-07](https://www.w3.org/TR/2026/WD-CSP3-20260813/#directive-frame-ancestors).

Use a distinct origin with no valuable existing session/account context. Do not share it with arbitrary user-uploaded HTML/SVG or private material. Read the host's actual request-log/analytics behavior before claiming anonymity or absence of data collection. Local media selection must cause no upload; ordinary page requests will still reach the hosting service.

Provider access controls, expiration, retention, rate limits and cost are OPEN until a provider is selected. For this small preview, propose one upload of the exact reviewed package, at most two sequential browser sessions and a finite checklist: each required asset once, one request per intentionally invalid path, and the short journeys above. Set the actual transferred-byte and request/time caps in the provider plan before execution. No paid load testing, scans of unrelated paths or denial-of-service testing.

## Stage D — verify the actual deployed preview, only after authorized publication

1. Retrieve each allowed asset from the actual destination and compare its bytes to the signed/reviewed release record as applicable. Record redirects and MIME/security response headers. Check no private/source listing or unlisted file becomes available. Do not accept transformed/injected content as an unchanged release.
2. Repeat the short host-specific browser journeys and verify selected media remains local. Check failure states with blocked fixture/config retrieval. Do not treat local `/mirror/` evidence as an actual provider-outage test.
3. Confirm the site's visible status, synthetic values, reset behavior, source links and lack of wallet/network publication affordances. Record actual browser/runtime environment and remaining limitations.
4. If a blocking difference appears, stop announcing the preview as ready; preserve evidence and restore the last reviewed preview artifact or remove only the newly created preview as authorized. Do not delete source originals, unrelated sites or public research repositories.
5. Deliver the actual URL, exact release identifier, executed checks and residual limits. Hosting success is not NFT/token interoperability, protocol security, permanent storage, independent review or community acceptance.

## Stage E — protocol test deployment remains separate

There is currently no deployable CAW protocol implementation in this original fixture. Before selecting a test chain, complete the disputed specification, original-token compatibility model, authorization/signature design, custody backing and withdrawal behavior, source/license review of any chosen dependencies, deployment authority/call graph and public-history serializer/rebuild path. Resolve relayer funding and DM/media scope without granting a builder privileged control.

An eventual separate test plan must name exact chain, code/configuration, test assets, disposable keys, transaction/gas/count limits, funding source, stop conditions, expected receipts and rollback/migration limits. Mock tokens must never be presented as the real CAW asset. The user must know whether any public chain or external service receives information. No real wallet seed, mainnet transaction, custody migration or upstream installer belongs in this fixture publication plan.

An immutable funds core is still a candidate, not a tested contract. Bugs can persist in immutable code; a new reviewed version and voluntary migration do not guarantee recovery if the old contract cannot release funds. The [resilience plan](RESILIENCE_PLAN.md) defines the later operator-loss and reconstruction tests. Passing a hosted fixture checklist cannot substitute for them.
