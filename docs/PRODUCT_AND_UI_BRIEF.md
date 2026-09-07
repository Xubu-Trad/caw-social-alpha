> Historical UI brief: its 40/44-test references describe earlier snapshots. The first alpha revision passed 51 automated tests; see [VALIDATION.md](VALIDATION.md) for the exact scope and remaining gaps.

# Product and interface brief

Updated 2026-09-07. The current local prototype uses a CAW conversation terminal with participant lanes. The implementation owner reports desktop and 390-pixel-wide mobile rendering, no horizontal overflow in those views, and successful core-action checks. These are bounded browser checks, not complete accessibility verification. Download-event verification timed out and remains unresolved; other test details belong in the run records.

## Appearance and voice

Use square borders, near-black surfaces, restrained green accents, pale readable text and local system monospace fonts. Current tokens include background `#050906`, text `#d5eed6`, muted text `#9aba9e` and accent `#b6f58b`. Short navigation labels are **Commons**, **Identity**, **Ledger**, **Readers** and **Messages**. The public alias is Xubu; the writing should be short, direct and discreet.

The Commons groups messages into stable participant lanes. On desktop each lane has an identity column and a message area, with a separate account inspector. On narrow screens the identity sits above its messages and the inspector moves below the main content. Preserve this reading order and the visual distinction between a selected identity, original messages, references and the user's own draft.

A single preserved CAW illustration appears beside the textual brand through the fixed local route `/caw-symbol.png`. Its source and reuse limits are recorded in [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md). Other interface elements and application code are original to this prototype; no Talkomatic, BitChat or Matrix UI source, cryptography, fonts or application code was copied.

Talkomatic informs the participant layout. Matrix supplies a dark/green visual reference, and BitChat informs restraint and text-first presentation. These references imply no protocol compatibility, mesh networking, encrypted messaging or live presence. Avoid fabricated activity, market statistics, official-network badges and continuous falling-code or glow effects.

## Current interaction contract

1. **Read the local record.** Keep **LOCAL DEMO**, synthetic accounts and simulated settlement visible. Commons shows seed messages and settled demo messages by author. There is no live room or remote presence.
2. **Find relevant messages.** Search this session by text, message identifier or handle. All voices, Following and Saved locally are views of local data. Bookmarks belong to the selected synthetic identity, cost nothing, create no public event and reset on refresh.
3. **Write deliberately.** Own Draft clearly identifies the selected account and `/commons` destination. Nothing is transmitted while typing. The provisional limit is 420 Unicode code points; review is disabled for empty, invalid or over-limit text and while a simulated action is pending.
4. **Keep references honest.** Reference inserts an ordinary message identifier and author into the draft. It creates no authenticated reply relationship and uses the ordinary CAW limit and cost if submitted. A settled reCAW appears as a derived entry in the actor's lane with the original author and message ID; it is not another original post.
5. **Review before simulated settlement.** Show cost and recipients before Queue demo action. Keep review, queued, submitted, confirmed and failed states distinct. Queueing and submission do not change balances. Insufficient funds and invalid actions produce a specific failure. A newer draft must survive confirmation of an earlier queued draft.
6. **Inspect the ledger.** Receipts show actor, applicable target/message, amount, scenario, synthetic event ID and status. Transfers show the new controller and resulting epoch; applicable receipts show the next nonce. Original CAW text and recipient allocations remain inspectable. A receipt is not a wallet signature, blockchain inclusion proof or proof that its text is true.
7. **Reconstruct the same record.** Readers A and B rebuild the synthetic history locally and compare canonical exports. Matching results demonstrate internal consistency, not independent operation or authenticated authorship. A JSON download control is present, but its browser download event has not yet been verified successfully.

Identity also exposes fixture balance, stake, controller and epoch, a provisional historical username-cost preview and simulated control transfer. No username mint, NFT transfer or real purchase occurs. Messages remains an explicit explanation of unresolved production messaging and cannot accept or send private correspondence.

## Verification and maintenance priorities

Preserve semantic landmarks, explicit labels, visible focus, dialog close/cancel behavior, meaningful status text, Unicode/RTL content and non-color state cues. Check focus after board/rerender changes, 200% zoom, long text and mobile actions. Reduced-motion and forced-color rules exist; their presence alone does not establish accessibility compliance. Complete keyboard and screen-reader coverage and resolve the download check before claiming broader verification.

All current assets are local. The symbol is approximately 1.19 MB and is the only reused visual asset; do not add remote fonts, tracking, automatic link previews or background AI/translation requests. Drafts and bookmarks stay in tab memory. Any future persistence needs a clear retention explanation. Groups, transport networks, media uploads, location channels and real private messaging remain outside this prototype.

## Companion website and media extension

The approved visual direction now includes imageboard-style media alongside participant lanes. A separate Media view previews a deliberately selected local file; it cannot silently add an attachment to text settlement. The associated website uses the same symbol, green palette and quiet typography, with direct links into Commons and the media preview. Source requirements and the video product extension are distinguished in [MEDIA_AND_PRODUCT_SCOPE.md](MEDIA_AND_PRODUCT_SCOPE.md).

The earlier website/media snapshot passed 44/44 automated checks. Seven browser checks in that earlier snapshot covered the companion site, PNG preview and removal, unchanged canonical data, nested-path loading and phone layouts. Actual video playback, complete accessibility and production resilience remain unverified. The [resilience plan](RESILIENCE_PLAN.md) and [portable copy notes](PORTABLE_WEB_BUILD.md) define the next concrete work.
