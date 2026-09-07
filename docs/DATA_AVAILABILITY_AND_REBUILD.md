> Recovery revision: [saved-history verification](HISTORY_RECOVERY.md) now checks exact canonical exports against separately retained checkpoints. [Current validation](VALIDATION.md) records the tested code. The original review below remains a baseline; source conflicts and unimplemented production requirements remain open.

# Data availability and reconstruction

Status: synthetic export and reconstruction tests passed. Production data design remains proposed; no permanence or builder-disappears test has passed.

## Record classes

| Class | Proposed canonical authority | Recovery requirement / unresolved point |
|---|---|---|
| Username and NFT transfer | Finalized protocol history on selected chain | Rebuild ownership without a private database; determine ordering and transfer epochs |
| Deposits, balances, withdrawals and reward allocation | Protocol execution and complete accounting events | Reproduce all liabilities and balances; public sufficient evidence cannot depend on an operator's assertion |
| Public CAWs, likes, reCAWs and follows | Signed intent plus finalized settlement and recoverable payload | Store enough data to reconstruct content, relation and authority; hash-only unavailable content fails |
| Media reference | Public record references with original target recoverable | Image hosting remains frontend responsibility; demonstrate failure behavior, not an unlimited-media permanence promise |
| DM key announcements / ciphertext / delivery metadata | Undecided | Resolve source 'all data' scope and NFT transfer/retention/privacy before selecting storage |
| Drafts and client preferences | User's local client | Disclose loss/retention; not finalized public history and not an account recovery mechanism |
| Search/feed database | Replaceable indexer cache | Rebuild from canonical input; operator filters are not protocol deletion |

## Proposed public export format

Version and identify network, contracts, code/configuration hashes, start block, finalized endpoint block/hash and canonical schema. Order chain events by block number, transaction index and log index. Specify byte encoding and integer decimal strings, reject duplicate/unknown records, and define explicit migrations before adopting a schema. Do not quietly normalize signed text.

For a later live chain, store canonical block identifiers and checkpoints. Roll back unfinalized caches on reorganization; do not label mere submission or block inclusion as finality. A different finalized hash for the agreed endpoint is a stop-and-investigate event. Arrival time, local cache IDs and wall-clock indexing duration can be excluded from deterministic exports only if declared beforehand.

The implemented fixture format contains schema/version, named economic scenario, seed, declared event count, ordered synthetic events/receipts and final snapshot. It permits at most 256 events and a 1 MiB JSON envelope. Two fresh instances of the same model reconstruct matching exports; a separately written literal accountant checks conservation. Tests reject missing, reordered, duplicated and inconsistent records. A fully self-consistent rewritten history can still pass because the format has no cryptographic provenance. These tests do not demonstrate chain availability, identity security or an independently operated implementation. The prior browser review (supporting local record omitted; see the source-coverage note) verified reader switching and exact reconstruction after five synthetic actions, and selected the complete 3,655-character export for manual copying. An actual downloaded JSON file and manual clipboard copy were not verified; the host download event timed out. Those checks do not cover the new media/portable-site phase.

## Builder-disappears acceptance plan

1. Select one exact released source/build and finalized public history, with all retrieval and operating costs disclosed.
2. Disable default frontend, API, database, indexer, relayer and domain in an authorized isolated test environment.
3. An actually independent operator obtains public source and documented tools without Xubu's credentials or private research; verifies, builds and restores the required state.
4. Two clean rebuilds against that same history produce matching canonical exports, ownership and accounting. Missing payloads or private setup records are failures.
5. Submit a valid action using a documented independent relay and the supported direct path; measure expenses and limitations separately.
6. Test maintenance/distribution succession without an exclusive Xubu release key. Assess private-message recovery separately under its final key model.

A CID or digest establishes content identity, not guaranteed retention. A database backup supplied by the original operator is not an independent public-history rebuild. Underlying network, archival nodes, storage operators, internet connectivity and actual payers remain dependencies and must be named.
