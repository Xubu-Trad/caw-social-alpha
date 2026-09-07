# Media and product scope

Updated 2026-09-07. The user has requested an associated website and application, image and video support, a futuristic imageboard/Talkomatic presentation, and a design without one party's universal shutdown control. These are approved product directions. A separate **Media** view and portable static website/application package are implemented. The prior website/media checkpoint passed 44 automated tests and seven browser checks including PNG preview/removal. Actual video playback remains unverified. Subsequent alpha changes require their own execution record. This does not implement public media posting, production infrastructure or a decentralized network.

## Primary source and new direction

The primary manifesto is [cawdevelopment/manifesto at `37399aeb55974d4b09d404014865b5ef8918e9de`](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md), preserved locally in [manifesto-pinned.md](../sources/primary/manifesto-pinned.md), SHA-256 `066b14262bd29118a8f86d75bece0d5bde96c2b665b1a3b356c3867689094761`. Recovered R2 is pinned at [caw-lab commit `8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6`](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/EVIDENCE/reading_rotation.txt), SHA-256 `2a77d034354b3ee698dd0266f93dfd5627e033cb8f79ec891498b80b7eab0e52`.

| Subject | Source evidence | Product interpretation |
| --- | --- | --- |
| Image display and hosting | Manifesto lines 142–150; M-046–M-048. Image hosting is excluded from the protocol and assigned to frontends. External URL rendering and shortening are recommended. | Image presentation fits the stated frontend role. Actual hosting, publication and durable references still require implementation and decisions. |
| Video | The complete pinned manifesto and recovered R2 contain no video specification. | Video support is the user's approved product extension. Applying the image-hosting boundary to video is a proposed design, not recovered canon. |
| Website and application | Lines 32–33 describe interoperable frontends; lines 82–84 include mobile-app and browser-extension goals. | A website and responsive application are suitable client forms. Native packaging and installable-PWA distribution remain proposals. |
| Identity | Lines 36–44 require unique NFT usernames, account activity through those identities and on-chain ownership. | Use pseudonymous handles. An imageboard-inspired interface does not replace the identity model with accountless posting or guarantee anonymity. Public activity can remain linkable. |
| Independent operation | Lines 6–11, 27–28 and 78–93 distinguish lack of controlling protocol authority from individual frontend choices. R2 line 11 rejects privileged developer control. | A frontend, domain, API, relay or storage operator may stop its own service. The complete system needs documented alternatives; a different domain alone does not establish this. |
| Storage and retention | Lines 43–44 and 68–73 describe on-chain association and permanent/trustless data; line 144 explicitly excludes protocol image hosting. | Public records, references, media bytes and private/client data need separate retention classes. C-006 remains unresolved. |

These interpretations do not alter the [59 primary requirement rows](../sources/MANIFESTO_REQUIREMENTS.tsv) or resolve any of the [15 production conflicts](../sources/SPEC_CONFLICTS.md). Source recommendations remain recommendations. The user's approval of a product feature is not community acceptance of a protocol amendment. R2 lines 6–7 require agreed changes and review before release; this local preparation does not establish either.

## Local Media view

The Media view is separate from Own Draft and simulated CAW settlement. Its purpose is to inspect a deliberately selected file in this tab. The interface should plainly say **Local preview only** and explain that selecting a file neither uploads it nor attaches it to a public record.

| Local input | Approved prototype limit |
| --- | --- |
| Raster image | PNG, JPEG or WebP; at most 4 MiB; at most 4,096 pixels on either edge and 16 megapixels total |
| Video | MP4 or WebM; at most 16 MiB; at most 60 seconds; 1,920 pixels per edge and 2,073,600 total pixels; portrait supported |
| Other content | Unsupported; no SVG, HTML, arbitrary binary rendering, remote URLs or directories |

These are provisional client limits, not manifesto requirements or a production media schedule. File-header and decoded-metadata checks reduce obvious mistakes and resource exposure. They do not certify the entire format, scan for malware, sanitize every metadata field or prove that browser decoders are invulnerable. A supported container also does not guarantee a supported video codec. Invalid, over-limit, unsupported and undecodable files need clear failure states.

Use only the user's explicit file selection. Do not enumerate local folders or upload media to a scanner, provider or gateway. A temporary browser object URL may supply the preview. Video must have user controls, no autoplay, and no assumed background playback. Removing or replacing a preview should stop playback, detach the source and release its object URL; changing views and ending the session need defined cleanup behavior.

File bytes, filenames, local paths, file metadata and object URLs do not enter model state, intents, receipts, bookmarks or canonical JSON. There is no new media fee or canonical attachment field. The existing CAW workflow remains text-only. Reloading or removing a preview is not an instruction to delete the original file. The application must not claim secure erasure of browser or operating-system memory/cache.

If a filename is shown by the file chooser, it is local UI information, not publication content. Do not turn it into an automatic caption, public name or export field. Public anonymity review would need to consider both embedded metadata and visible/audible content; this preview does not remove identity clues.

## Website and portable distribution

The current preparation includes an associated `website.html`, paths that work under a hosting prefix, and a deterministic static ZIP intended to contain only reviewed application assets. They require their own construction and verification evidence. A ZIP, portable path or local website does not demonstrate offline operation, permanent hosting, a successfully installed app or public deployment.

Native-app and installable-PWA distribution remain proposed. No installation, service worker, push service, background media access or offline guarantee is part of this phase. Name registration, hosting accounts, storage purchases, uploads and production deployment are separate actions; no provider is selected by this document.

Future contributions may target only the relevant **cawdevelopment** repository. **GilgameshCaw/Caw remains reference only and must never be a pull-request target.** The destination rule does not itself authorize a public write; see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Production gates

1. **Define what is authoritative.** Keep NFT ownership and accounting tied to the eventual reviewed protocol. Specify which public text and media references are recoverable from finalized history, and where image/video bytes reside. Do not imply that a content hash or reference stores those bytes on-chain. C-006 remains open.
2. **Define media posting explicitly.** Select and version a recoverable media-reference format, original target, integrity commitment, MIME/codec handling, captions and accessibility fields. Resolve how references and accompanying text count toward the message limit before adding protocol metadata. The current 420-code-point rule remains provisional under C-004.
3. **Separate integrity from availability.** Record storage operators, replication, retrieval, retention, payment and replacement assumptions. Demonstrate the original reference and required payload can be retrieved after a default host or shortener disappears. A CID or hash alone is insufficient. Preserve C-006/C-014.
4. **Describe deletion honestly.** Distinguish discarding a draft, clearing a local preview, hiding content in one frontend, removing a copy from one host and removing already-distributed copies. Do not promise erasure of permanent public records or copies held by others. DM retention and transferable history remain separate C-005 decisions.
5. **Make publication deliberate.** Before any real upload, disclose destination, visibility, file/metadata handling, size/cost and retention. Avoid automatic third-party media contact while reading or drafting. Review remote-fetch boundaries, active content, decoder/resource limits and applicable frontend content rules. No safety or anonymity certification follows from header checks.
6. **Test loss of the original operator.** Remove the default frontend/domain/API/indexer/relay in an authorized test environment. An independent operator must obtain reviewed source and public history without Xubu's credentials, rebuild the required state and use a documented alternate submission path. Assess media retrieval and costs separately. C-008/C-012 remain open.
7. **Map every control point.** Review domain/resolver control, gateways, hosts, release/update signing, app stores, storage, relays, chain/RPC access and contract authority. A decentralized naming option is one component, not proof of universal availability. Disclose remaining dependencies and distinguish one service's content policy from protocol-wide blocking powers.
8. **Verify the interface that ships.** Test exact size/duration/dimension boundaries, spoofed/truncated headers, decoding failures, file replacement during loading, playback cleanup, keyboard operation, small screens and unchanged canonical exports. Verify the portable package's content allowlist, paths and reproducibility. Mark only executed checks tested; independent review and production readiness require stronger evidence.

The design uses imageboard density and participant lanes as presentation influences. It retains explicit paid-action review, short language and pseudonymous identities. It makes no claim of live rooms, anonymous transport, encrypted private messages, installed native software, permanent media or immunity from infrastructure failure.
