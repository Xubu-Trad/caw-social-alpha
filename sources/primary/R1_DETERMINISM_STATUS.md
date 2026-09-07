> Historical caw-lab evidence: [pinned original](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/docs/R1_DETERMINISM_STATUS.md). Any commands below run in that caw-lab checkout, not this alpha repository. Decoder scripts and layer directories are not included here. This application pass did not rerun the historical decoding chain. The [exact recovered R2 reading text](r2-message.txt) is included as source evidence.

# R1 determinism status

The tablet clues, book cipher, APE content address, audio extraction and Enkidu text conversion reproduce against pinned inputs. The APE's independently computed CID exactly matches the book cipher. This closes the content identity gap; live availability, historical custody and a terminal riddle answer remain separate questions.

## Stable artifact constants
- R1 transaction ID: `0xfbbcf5338b4a9c35073ac7253afc1a8ee81770d8d3285b80497bbd9c2186ed5b`
- Public short code: `58bZfQ1`
- Public image URL: `https://ibb.co/58bZfQ1`
- Historical target CID: `QmddMfUi8AgsRyqa8MdsWqoCLYmV6kVJ4PYm6uo3iQ7WCV`
- Canonical uploaded APE sha256: `57674107710cdac58fe68b30cb3c05e3334ece55bc0d71deba84ccd2a8fb3575`
- Non-canonical stripped / zip-copy sha256: `ea7c96accf476e389aade152efca89bdb92c4c4852e257cb6fe4da8e05b1d263`
- Enkidu pseudo-hex sha256: `4f4edfdece802b300aeab48932b115d83eb04575753bfd128a3cc47c5cc25b19`
- Manifesto before tab normalization sha256: `03fa37cfe06c7d06d590020e9fcf8c67b4131671c10d48a6f1ef0283df8cfb22`
- Manifesto recovered sha256: `e5816ee2a75a1c939543773983f8b6d2b9eb05afee8d4f9ac91336e8ab6c01fa`
- Manifesto English sha256: `836c98641fd1222156d49c68d210d9860319b323f890b5af82860ac14aba366c`


The recovered/English manifesto hashes identify separate preserved variants. The reproducible text conversion produces the English hash `836c9864…`.

## Reproduced steps

| Step | Result | Replay |
| --- | --- | --- |
| Tablet | Exact 46 coordinates and literal poem | [Image extraction](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R1-010_friderici_poem_coords/REPRODUCE.md) |
| Book cipher | Exact historical CID from the pinned OCR edition; no fallback | [Corpus selection](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R1-020_book_cipher_gilgamesh/REPRODUCE.md) |
| APE content address | Exact same CID independently computed from the 8,968,236 canonical APE bytes | [CID receipt](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R1-030_ipfs_ape_audio/EVIDENCE/endpoint_2026-09-05/cid_receipt.json) |
| Canonical APE | Exact 21,192-byte Enkidu pseudohex; password verifier, declared length and footer checked | [Audio extraction](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R1-040_deepsound_enkidu/REPRODUCE.md#canonical-ape-to-enkidu-2026-09-05) |
| Enkidu text | Translate `UVWXYZ` to `fedcba`, hex-decode, replace exactly 60 tabs with single spaces | [Text conversion](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R1-040_deepsound_enkidu/REPRODUCE.md#enkidu-text-to-manifesto) |

The audio replay uses normal-quality DeepSound LSB decoding and AES-256-ECB with ASCII `enkidu` zero-padded to 32 bytes. It reads the file length from the decrypted header before checking the expected output. [Machine-readable receipt](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R1-040_deepsound_enkidu/EVIDENCE/ape_to_enkidu_replay.json).

## Reproduce the APE content address

From the repository root, with the canonical APE available locally:

```sh
python3 scripts/reproduce_r1_cid.py canonical.ape --out-dir replay-cid
```

The standard-library script checks the input hash, constructs 35 DAG-PB File leaves with 262,144-byte chunks, then hashes the balanced root. Its fixed settings include present empty legacy link names and no directory wrapper, mode or modification time. The result is `QmddMfUi8AgsRyqa8MdsWqoCLYmV6kVJ4PYm6uo3iQ7WCV`. Encoding follows the [UnixFS specification](https://specs.ipfs.tech/unixfs/) and [DAG-PB specification](https://ipld.io/specs/codecs/dag-pb/spec/).

The official empty-file test vector passes. Flipping only the last input byte's low bit produces a different CID, `QmacgnYpjkPGGkkq9EyCM8oZ4JPcA664ehXpy3q2xZDxC8`. Both checks run before receipts are written. [Negative control](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R1-030_ipfs_ape_audio/EVIDENCE/endpoint_2026-09-05/cid_negative_control.json).

## Remaining boundary

The independent APE-to-Enkidu extraction and CID content identity gaps are closed. The fresh CID computation uses preserved APE bytes and does not depend on a historical hashing receipt. It establishes that those bytes, under the recorded importer settings, have the address recovered by the book cipher. It does not establish current IPFS availability or the historical chain of custody.

The replay verifies transformations between artifacts. It does not establish who authored them, authenticate every historical claim, or prove that no further layer exists. Follow [current riddle progress](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/docs/RIDDLE_PROGRESS.md) for work beyond these reproduced R1 stages.
