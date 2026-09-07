> Historical caw-lab evidence: [pinned original](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/docs/ENDPOINT_ASSESSMENT.md). Any commands below run in that caw-lab checkout, not this alpha repository. Decoder scripts and layer directories are not included here. This application pass did not rerun the historical decoding chain. The [exact recovered R2 reading text](r2-message.txt) is included as source evidence.

# Where the riddles lead

September 5, 2026 · XUBU research note

**Both known decoding chains have been reproduced. R1 yields the manifesto. R2 yields a complete message directing the community to build from it. The evidence strongly favors these as the intended outputs. No further layer has been verified.**

That is a stronger conclusion than “another layer might exist.” Possibility alone does not make a recovered cipher unsolved. It is still an inference about the intended ending, rather than proof that no other hidden message could exist.

| Question | R1 | R2 |
| --- | --- | --- |
| Is the known decoding chain reproducible? | Yes: tablet → book coordinates → IPFS content → audio → Enkidu → manifesto. | Yes: all 2,884 hex characters → the complete 1,442-byte message, with an exact inverse. |
| What is the best-supported endpoint? | The manifesto as a development proposal. | The instructions to implement it, ending with `gl anons.` |
| Is a further cipher established? | No. Remaining suspicions have not produced a verified continuation. | No. Neither the plaintext nor its checked source wrapper supplies one. |
| Has absolute finality been authenticated by the riddle-announcement account? | Not in the evidence reviewed. | Not in the evidence reviewed. |

## The missing link in R1 is now closed

The book cipher returns `QmddMfUi8AgsRyqa8MdsWqoCLYmV6kVJ4PYm6uo3iQ7WCV`. A new independent encoder rebuilds that **exact IPFS identifier from the preserved audio file**. It uses 35 fixed-size dag-pb chunks and the documented historical UnixFS settings. The official empty-file vector passes, and a one-bit change to the audio changes its identifier. This establishes the content match; a currently working gateway is not required to establish it. [R1 reproduction and receipt](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/docs/R1_DETERMINISM_STATUS.md).

The audio's verified DeepSound extraction yields Enkidu. Its substitution yields the full manifesto. We compared that text against all four commits in the public manifesto repository's main history. The three substantial versions, dated August 25, 2022, have exactly the same 10,596-byte body as the recovered manifesto after the explicitly documented conversion of 60 tabs to spaces. The first commit is only a short stub. Later changes affect the Markdown heading alone. No spelling correction or invented letter is needed. [Pinned historical text](https://github.com/cawdevelopment/manifesto/blob/37399aeb55974d4b09d404014865b5ef8918e9de/README.md), [comparison receipt](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/docs/evidence/endpoint_2026-09-05/manifesto_history_receipt.json).

Git commit dates are repository metadata, not an independent timestamp certificate. The exact text correspondence is the primary finding. It strongly corroborates the document reached by R1; it does not identify the human author.

## A direct project link to the endpoint

Fresh transaction, block and receipt checks establish two separate address groups:

| Address role | Verified action |
| --- | --- |
| `0xbaeedcccbfb112d4a921daa635ac2276307a1705` | Announced R1 on May 9, 2022 and R2 on July 17, 2022. The entire transaction inputs are `58bZfQ1` and `zrUfKaKV`. |
| `0x36b59455afeedf0866fe6e775fe7651bbbe3e005` | Created the CAW contract on April 14, 2022, then explicitly linked the manifesto and development GitHub on October 31, 2022. |

The October message contains the manifesto destination `https://pastebin.com/yhcajZq0` and `https://github.com/cawdevelopment`. This is positive evidence that the contract creator endorsed the same operational destination. It supports the recovered messages' development context. It does **not** establish that the two addresses have the same controller, or that the sender acknowledged the R2 decode. [R1 announcement](https://etherscan.io/tx/0xfbbcf5338b4a9c35073ac7253afc1a8ee81770d8d3285b80497bbd9c2186ed5b), [R2 announcement](https://etherscan.io/tx/0xcae4b15350b3ccc2b37fec5caa718560241ec181bc49741d5d1199d1d32412d4), [creation receipt](https://etherscan.io/tx/0x4d160f76cdacbffc4f7302d4fb180317e15d19080cbbaded4ef0197e71ba515c), [October message](https://etherscan.io/tx/0x7903adbb7ab03521da9951d63cc9050ee005dfa871ba3f6d3e20d0bb941f5c37).

The public notes previously contained a malformed creation hash. It has been corrected from the successful creation receipt, with the correction recorded in [On-chain trace](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/docs/ONCHAIN_TRACE.md). Assertions in the recovered text about liquidity, motives or finances remain historical claims, not an audit of those claims.

## Why R2 reads as a finished message

R2's entire input is consumed without dropping a prefix, suffix or awkward section. The documented two-byte reading rotation is reversible. A separate implementation and independent ranking check support the same full plaintext. It gives three development steps, calls for implementation and closes with a salutation. It supplies no next ciphertext, key, CID or extraction instruction. [Read the complete message](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/MESSAGE.md), [replay the recovery](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/REPRODUCE.md).

A fresh inspection of the [Pastebin source](https://pastebin.com/zrUfKaKV) found one uninterrupted hex text node matching the raw source. All 285 alphabetic hex characters are lowercase. There is no varying case channel, source whitespace or additional author-supplied title or comment in the checked page. Service-generated page markup is not counted as authored clues. These findings concern the checked copies, not every historical version. [Wrapper receipt](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/docs/evidence/endpoint_2026-09-05/wrapper_audit.json).

## What the suspicious details actually establish

The remaining doubts deserve a record, but each needs a reproducible next step.

- **Misspellings and capitals:** the recovered manifesto preserves the original wording. The prior extraction of an N from `moonning` fails because the source says `mooning`. The bounded case, indentation and typo checks produced no verified continuation. That excludes those tested recipes, not every imaginable word cipher. [Formatting evidence](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R1-050_manifesto_final_payload/EVIDENCE/formatting_2026-09-05/README.md).
- **Image and audio leftovers:** the APE's declared regions end exactly at EOF; no unexplained suffix or tag was found. The PNG compressed streams have no unused tail. Its remaining low-bit pixels do contain a separate seven-line raster poem and a tiny uninterpreted mark. The poem is distinct from the exact IEND text beginning `The archievest`; a perfect new transcription and a meaning for the tiny mark have not been established. These are explicit limits, not proof of a new cipher. [Carrier receipts](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/docs/evidence/endpoint_2026-09-05/README.md).
- **The fish link:** the linked image belongs to an ordinary 2013 fried-fish recipe, which identifies white pomfret. In the manifesto it illustrates a social post. A symbolic red-herring joke remains possible; the image's existence does not establish that the manifesto is a decoy or tell us how to decode another layer. [Original recipe](https://www.savoryandsweetfood.com/2013/10/20/fried-fish-masala/).
- **Early disagreement:** the expanded Telegram scan read 2,546 HTML files across 85 exports and selected 31,096 relevant message bodies. Both completion claims and May 2022 doubts were preserved. These counts include repeated messages across exports. Participant suspicions about extra audio or a second sequence are historical evidence of disagreement; they are not validated payloads. Raw chats and personal source mappings remain outside the public repository.

The June 9, 2022 community walkthrough follows the same chain to the manifesto and ends with building/community participation. It corroborates the historical interpretation, while remaining community testimony rather than a signed author declaration. [Preserved walkthrough](https://threadreaderapp.com/thread/1534892255730966529.html).

## Working verdict

**R1: the known chain is solved through the manifesto; the evidence favors that document as its intended output. R2: the full supplied cipher is solved; the evidence favors the development message as its intended output.**

Calling them incomplete solely because another layer is imaginable would overstate what is missing. Calling every possible hidden channel exhausted would overstate what has been checked. The useful next threshold is concrete: an authenticated continuation, a reproducible unused payload, or a source-grounded extraction rule yielding coherent new information. None was established in this review. Building the proposed system is a separate task from decoding its instructions.

[Methods and receipts](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/docs/evidence/endpoint_2026-09-05/README.md) · [Recovery exposé](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/docs/R2_RECOVERY_EXPOSE.md) · [Layer index](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/LAYER_INDEX.md)
