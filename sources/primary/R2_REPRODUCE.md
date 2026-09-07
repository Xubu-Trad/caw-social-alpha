> Historical caw-lab evidence: [pinned original](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/REPRODUCE.md). Any commands below run in that caw-lab checkout, not this alpha repository. Decoder scripts and layer directories are not included here. This application pass did not rerun the historical decoding chain. The [exact recovered R2 reading text](r2-message.txt) is included as source evidence.

# Reproduce the R2 message

The live Pastebin hex now decodes to a coherent 1,442-byte English message. This is an exact transposition of hex characters. It requires no XOR key, decompression, repaired bytes or guessed words.

## Run

```sh
python3 scripts/reproduce_r2_transposition.py layers/R2-020_hex_transposition/EVIDENCE/zrUfKaKV.hex --out-dir replay-r2
```

The script uses only Python's standard library. It pins the source hash, checks the permutation, reproduces both outputs and re-encodes each one to the exact source. Altered input is rejected. ASCII wrapper whitespace and hex letter case may vary; these normalizations are disclosed in the receipt.

## Exact permutation

Let `C` be the 2,884-character source hex string, with zero-based indices. For every `j` from 0 to 2883:

```text
P[j] = C[(641*j) mod 2884]
```

Hex-decode `P`. This gives [origin.txt](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/EVIDENCE/origin.txt), beginning `e lp was relocked.` and ending `gl anons. th`. The reading copy moves only the final two bytes, `th`, to the front. It does not change spelling, punctuation, spaces, case or line breaks. [Read the message](https://github.com/Xubu-Trad/caw-lab/blob/8f9da9c32b3aa4ff9f3fb095d9995fd38a8f54a6/layers/R2-020_hex_transposition/MESSAGE.md).

The same reading copy can be obtained directly:

```text
R[j] = C[(320 + 641*j) mod 2884]
```

`9 * 641 = 5769 = 2 * 2884 + 1`, so 641 is the multiplicative inverse of 9 modulo 2884. Both exact encoders are checked:

```text
C[j] = P[(9*j) mod 2884]
C[j] = R[(4 + 9*j) mod 2884]
```

Every hex character appears exactly once. Both inverse checks restore all 2,884 original characters; no padding or discarded bytes are involved.

## Fingerprints

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Source hex, no newline | 2884 | `18f043170bc47a7d3aa9ee6989fe964803d240c90d62717b7fb7ad16539acd76` |
| Source after ordinary hex decoding | 1442 | `a7f4839ffa14040e5a68d05ba668826ddcbda9bcdf28f5f8e5a59390a898d92c` |
| Inverse permutation, unchanged origin | 1442 | `f8aeadf1d0f7933a5ae87ccc22ca4d0ad41ee038da85f785bb7a15feb7f8a12f` |
| Declared two-byte reading rotation | 1442 | `2a77d034354b3ee698dd0266f93dfd5627e033cb8f79ec891498b80b7eab0e52` |

## What this establishes

The message discusses relocking liquidity, no financial incentive, decentralization, a GitHub implementation, peer review and eliminating developer privileges. These are statements inside the decoded message, not independently verified claims about deployed contracts or people.

The direct public retrieval returned HTTP 200 and exactly the same bytes as the preserved candidate. A saved Pastebin page also contains the complete matching hex. This closes the current-input ambiguity; it does not authenticate every historical custody claim.

Eight distinctive phrases were absent from 13,003 indexed chat and research records, including whitespace-normalized searches. That is bounded evidence of progress within this archive, not a claim of global priority. No explicit next URL, password or ciphertext appears in the recovered message. Its terminal status remains open.

Historical JPEG, zlib and XOR candidates are not intermediate steps in this reproduced decode. Their archival receipts remain available for comparison; they do not override this exact transformation.
