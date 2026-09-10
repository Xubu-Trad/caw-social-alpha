# Review the alpha

The review target is a synthetic frontend and reference model. It includes a separate compiled local experiment joining fixed test NFT authority, signed paid posting and record reconstruction. Authentic registration and production settlement remain unfinished. It contains no wallet connector or production backend. Application code is in public/, server.mjs and scripts/; the separate Node readers and fixed fixtures are in reference/; 32 test files are in tests/.

## Reproduce

With Node 24.20.0, from the repository root:

```sh
node --max-old-space-size=256 --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 tests/model.test.mjs tests/reference.test.mjs tests/server.test.mjs tests/media.test.mjs tests/deployment.test.mjs tests/build.test.mjs tests/history.test.mjs tests/economics.test.mjs tests/signatures.test.mjs tests/signed-ledger.test.mjs tests/signed-record.test.mjs tests/delegation.test.mjs tests/owner-grant.test.mjs tests/owner-revocation.test.mjs tests/checkpoint-continuity.test.mjs tests/anchor-package.test.mjs tests/independent-action-reader.test.mjs tests/independent-history-reader.test.mjs tests/independent-permission-reader.test.mjs tests/ethereum-state-proof.test.mjs tests/caw-token-capture.test.mjs tests/caw-custody-probe.test.mjs tests/caw-local-custody.test.mjs tests/caw-account-authority.test.mjs tests/caw-paid-action.test.mjs tests/caw-paid-adversarial.test.mjs tests/caw-paid-acquisition.test.mjs tests/caw-paid-reorg.test.mjs tests/caw-paid-reorg-evidence.test.mjs tests/caw-acquisition-session.test.mjs tests/caw-live-acquisition.test.mjs tests/caw-orphan-replay.test.mjs
node --max-old-space-size=128 scripts/build.mjs
node --max-old-space-size=128 server.mjs
```

No dependency installation is required. The preview is at http://127.0.0.1:4173/website.html; use that exact loopback hostname. Stop with Ctrl+C. Runtime heap caps are not hard operating-system memory limits. Local recorded checks used additional supervisory limits; those private operational controls are not a dependency of this public package. Other operating systems and runtimes have not been independently tested.

Try a CAW through cost review, queue, submission and confirmation. Check that each pre-confirmation step leaves balances unchanged. Inspect receipts and switch identities. In Readers, compare synthetic reconstructions and export/copy the record. Refresh resets all demo data. Real signed-history authenticity is not provided by a self-consistent JSON export.

The build writes only 21 explicit public assets plus SHA256SUMS.txt into dist/. It rejects unexpected existing output entries rather than deleting them. Run twice and compare the manifest. No wallet, host credentials, private research, runtime executable or selected media is packaged. Serve dist/ with an independently reviewed static host; ES modules are not a file:// installation.

The optional Python [token capture tool](../scripts/capture-caw-token.py) is separate from the website and offline tests. Its two preserved provider captures are historical network observations, not a live adapter. Follow [token compatibility](CAW_TOKEN_COMPATIBILITY.md) to reproduce their exact requests and understand what the account proof does and does not establish.

The [source reproduction](CAW_TOKEN_SOURCE.md) and [custody experiment](CUSTODY_PROBE.md) include compiler inputs and explicit read-only acquisition commands. Their compiler and remote-simulation steps are not part of npm test or the website. The preserved network results replay offline; only one provider completed the custody sequence.

The later [history-acquisition experiment](PAID_HISTORY_ACQUISITION.md) collects one fresh local run through two live query paths, then checks each with the existing readers. Its ordinary Node checks are offline. The separately invoked Python checker and optional Windows acquisition runner have explicit commands and limits in that guide. Shared-node trust remains.

## Highest-value review

1. Resolve the 15 source conflicts with cited alternatives and explicit decisions.
2. Challenge conservation, stale authority, repeat actions, integer rounding and malformed/reordered history.
3. Examine media header parsing, browser decoding, lifecycle races and privacy boundaries.
4. Reproduce build bytes and environment rejection. Changing deployment.json cannot activate a real network in this alpha.
5. Challenge the [integrated paid-action experiment](PAID_ACTION.md), including its source conflicts, wallet compatibility and unauthenticated capture boundaries before connecting a wallet.

The ten public review issues collect the requested evidence and decisions. Follow the pinned review baseline when reporting ordinary findings; for sensitive discoveries, follow SECURITY.md.

Read [local custody](LOCAL_CUSTODY.md) for the separately invoked Windows experiment. Its native EVM, network retrieval and synthetic substitution are outside application, build and ordinary offline test execution.

Read [account authority](ACCOUNT_AUTHORITY.md) for the explicit Windows-only EVM experiment and its fixed-registry trust boundary. Its native runtime and historical retrieval remain outside normal application/build/offline-test execution.

Read [one signed, paid CAW](PAID_ACTION.md) for the complete local slice, two offline reader commands, failed attempts and remaining adversarial/recovery work. The independent Python reader needs only the standard library; the separate Windows signing runner also requires the recorded `cryptography` version and pinned Anvil. Neither optional experiment runs during `npm test`.

Read [paid-action regression](PAID_ACTION_REGRESSION.md) for the separate synthetic execution against the unchanged alpha.20 contract. Its offline checker is part of the test suite; fresh EVM execution is explicitly invoked and remains separate.

Read [controlled branch recovery](PAID_REORG_RECOVERY.md) for the four retained histories, independent Python reconstruction, replacement/restart tests and optional local Windows run. The caller supplies the selected checkpoint; public finality and provider agreement remain open.

Read [selected-history acquisition](PAID_ACQUISITION_SESSION.md) for the bounded Python coordinator and recorded-response switching checks. Its separate standard-library command exercises selection invalidation and fresh retries; the Node checks verify retained provenance and accounting. No new live-node run or independent-provider result is claimed.

Read [live acquisition change](LIVE_ACQUISITION_CHANGE.md) for a real synthetic branch replacement while acquisition is pending. The ordinary Node checks verify its retained record; the separate Windows runner starts a bounded local node. This one controlled request boundary does not establish public-chain finality.

Read [action replay after rollback](ORPHAN_INTENT_REPLAY.md) for acceptance of an identical signed action on alternative branches, same-branch duplicate rejection and complete accounting. The test adds evidence without changing the signed domain.
