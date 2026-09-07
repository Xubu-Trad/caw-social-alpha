# CAW Social · alpha

Words first. Keep the receipt.

A community frontend and synthetic reference model, guided by the CAW manifesto and recovered R2 instructions. The website is the entrance; Commons is the conversation app. This is an implementation under review, not an official CAW release.

**Simulation only. No connected wallet, blockchain, real funds, private messages or public media uploads.** The full protocol is unfinished. A strict alpha configuration rejects real chain, wallet, contract, RPC and upload settings.

![Alpha website and app entrance](docs/images/alpha-website.png)

## Run it

Use Node.js **24.20.0**. There are no third-party package dependencies and no install step. Review the source before execution. From this repository:

```sh
npm test
npm run build
npm start
```

Open **http://127.0.0.1:4173/website.html** for the alpha website or **http://127.0.0.1:4173/** for Commons. Stop the preview with Ctrl+C. The server binds only to loopback; it is not a public web host. Node-only commands are in [the review guide](docs/REVIEW_GUIDE.md). No PowerShell, private helper, wallet or original developer machine is required by the package.

## What works

- Participant lanes, local search, following and per-account bookmarks.
- Draft → cost review → queue → simulated confirmation → receipt.
- Synthetic account transfer, stale-authority rejection and replay of exported records.
- Saved-record verification against a separately retained SHA-256 checkpoint; see [history recovery](docs/HISTORY_RECOVERY.md).
- Bounded local media preview, with no upload or media attachment to settlement.
- Portable website/app assets and a deterministic SHA-256 build manifest.
- Identity includes a [local signature lab](docs/SIGNATURE_LAB.md): verify exact words, expiry and one-time acceptance using temporary test keys.
- Ledger compares source payment descriptions without changing active settlement; see [economic scenarios](docs/ECONOMIC_SCENARIOS.md).

The accounting model uses **provisional appendix settings**. Main-text and appendix allocations differ; stake eligibility, rounding, repeat actions and character counting also require decisions. Passing tests does not resolve these conflicts.

## Read, reproduce, challenge

| Start here | Purpose |
| --- | --- |
| [Review guide](docs/REVIEW_GUIDE.md) | Reproduce behavior and report a useful finding |
| [Manifesto + R2 alignment](docs/MANIFESTO_R2_ALIGNMENT_REVIEW.md) | Every one of the 59 primary requirements, with current limits |
| [15 open conflicts](sources/SPEC_CONFLICTS.md) | Decisions required before production behavior is fixed |
| [Test deployment plan](docs/TEST_DEPLOYMENT_PLAN.md) | Local protocol work, adversarial checks, then a separate chain test |
| [Frontend policy](docs/FRONTEND_POLICY.md) | What this client displays and what it cannot control |
| [Validation](docs/VALIDATION.md) | Current automated results and clearly scoped browser evidence |
| [Source coverage](docs/SOURCE_COVERAGE.md) | What was examined, preserved and excluded |

R2 requires public contribution and review before an agreed release, with no developer backdoors, proxies or multisigs. No deployed code or authority graph exists here to certify. These records support a review process; they are not independent peer review or community acceptance.

Public review does not mean testnet-ready. Missing pieces include NFT mint/burn, actual token custody, signed actions, settlement contracts, recoverable public history, reviewed DM cryptography and operator-loss recovery. Native/installable distribution and replicated media remain planned.

Upstream submissions target the relevant **cawdevelopment** repository only. No upstream application or contract code was copied into this alpha.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Licensing status](LICENSE_STATUS.md)
