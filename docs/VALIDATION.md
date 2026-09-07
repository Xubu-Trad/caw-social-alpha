# Validation boundary

The CAW-focused recovery revision passed **61/61 automated tests across seven files**, using Node 24.20.0. The current source hashes are in [CODE_SHA256SUMS.txt](../evidence/CODE_SHA256SUMS.txt). Tests cover synthetic accounting, invalid authority/actions/history, HTTP asset restrictions, media header limits, strict simulation configuration, deterministic build collection and retained-checkpoint recovery. The supervised build writes and rehashes 14 static files.

Recovery tests compare SHA-256 with Node's separate hashing API, reject self-consistent rewrites and truncated records against an unchanged checkpoint, reject invalid or noncanonical JSON and invalid schemas, enforce byte limits, and preserve inputs. The canonical record is verified against a separately supplied checkpoint. Someone able to replace both can create a passing pair; no chain finality, source authorship, independent implementation or permanent availability is proven.

The prior alpha revision passed 51 tests and browser checks for configuration, website/app navigation, Commons startup and phone layouts. Earlier media checks covered PNG preview/removal. These are historical results; current browser status is recorded in [TEST_RESULTS.json](../evidence/TEST_RESULTS.json). Actual video playback, media lifecycle races, downloaded files, full accessibility and independent review remain gaps.

No production contracts, wallet or public-chain network behavior were tested. The alpha remains a simulation. Public code publication is not public website hosting, testnet deployment or community acceptance.
