# Review the alpha

The review target is a synthetic frontend and reference model. It contains no Solidity implementation, wallet connector, signing service or production backend. Application code is in public/, server.mjs and scripts/; the separate Node readers and fixed fixtures are in reference/; twenty test files are in tests/.

## Reproduce

With Node 24.20.0, from the repository root:

```sh
node --max-old-space-size=256 --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 tests/model.test.mjs tests/reference.test.mjs tests/server.test.mjs tests/media.test.mjs tests/deployment.test.mjs tests/build.test.mjs tests/history.test.mjs tests/economics.test.mjs tests/signatures.test.mjs tests/signed-ledger.test.mjs tests/signed-record.test.mjs tests/delegation.test.mjs tests/owner-grant.test.mjs tests/owner-revocation.test.mjs tests/checkpoint-continuity.test.mjs tests/anchor-package.test.mjs tests/independent-action-reader.test.mjs tests/independent-history-reader.test.mjs tests/independent-permission-reader.test.mjs tests/ethereum-state-proof.test.mjs
node --max-old-space-size=128 scripts/build.mjs
node --max-old-space-size=128 server.mjs
```

No dependency installation is required. The preview is at http://127.0.0.1:4173/website.html; use that exact loopback hostname. Stop with Ctrl+C. Runtime heap caps are not hard operating-system memory limits. Local recorded checks used additional supervisory limits; those private operational controls are not a dependency of this public package. Other operating systems and runtimes have not been independently tested.

Try a CAW through cost review, queue, submission and confirmation. Check that each pre-confirmation step leaves balances unchanged. Inspect receipts and switch identities. In Readers, compare synthetic reconstructions and export/copy the record. Refresh resets all demo data. Real signed-history authenticity is not provided by a self-consistent JSON export.

The build writes only 21 explicit public assets plus SHA256SUMS.txt into dist/. It rejects unexpected existing output entries rather than deleting them. Run twice and compare the manifest. No wallet, host credentials, private research, runtime executable or selected media is packaged. Serve dist/ with an independently reviewed static host; ES modules are not a file:// installation.

## Highest-value review

1. Resolve the 15 source conflicts with cited alternatives and explicit decisions.
2. Challenge conservation, stale authority, repeat actions, integer rounding and malformed/reordered history.
3. Examine media header parsing, browser decoding, lifecycle races and privacy boundaries.
4. Reproduce build bytes and environment rejection. Changing deployment.json cannot activate a real network in this alpha.
5. Design and independently verify the first real NFT/custody/signed-action/rebuild flow before connecting a wallet.

No external issue/comment or review request was sent on a user's behalf by publishing this package. Use the repository's review template for ordinary findings. For sensitive discoveries, follow SECURITY.md.
