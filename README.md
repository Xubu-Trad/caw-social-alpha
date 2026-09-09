# cawmmunity.caw - decentralized - social

Words first. Keep the receipt.

A community implementation guided by the CAW manifesto and recovered R2. The website is the entrance; Commons is the conversation view. This is work for public review, not an official CAW release.

| Component | Name | Where to begin |
| --- | --- | --- |
| Website and browser app | **cawmmunity.caw - decentralized - social - alpha** | [Frontend policy](docs/FRONTEND_POLICY.md) |
| Protocol experiments | **cawmmunity.caw - decentralized - social - protocol** | [Protocol scope](docs/PROTOCOL_V0_SCOPE.md) |

Both components live in this repository. These are project names; `.caw` does not establish domain registration, deployment or production readiness.

**The frontend is a simulation. The protocol is a local experiment. Production remains blocked.** No real wallet, funds, private messages or public media uploads are connected.

**Initial review target: alpha.20, [`91479b6dc8c9a264411d75177d43029e0266c354`](https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social/commit/91479b6dc8c9a264411d75177d43029e0266c354).** Review this fixed commit, even as documentation on `main` develops. [Reproduce the baseline](docs/REVIEW_BASELINE.md), choose a [review issue](https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social/issues), or follow the [current gates](docs/ROADMAP.md).

The historical-token experiment settled **nine signed posts** using CAW token logic and fixed test NFT accounts. Alpha.21 adds **72 regression cases** against that unchanged paid-action contract on a separate synthetic chain. Read [one signed, paid CAW](docs/PAID_ACTION.md) and [the regression evidence](docs/PAID_ACTION_REGRESSION.md) for their distinct results and limits. Alpha.22 adds [two live acquisition paths](docs/PAID_HISTORY_ACQUISITION.md): both recover the same fresh history without the writer's saved transaction list.

![Earlier alpha website and app entrance](docs/images/alpha-website.png)

Earlier alpha screen; the current build uses the names above.

## Try the frontend

Use Node.js **24.20.0**. The frontend and Node offline tests have no third-party package dependencies or install step. Review the source, then run:

```sh
npm test
npm run build
npm start
```

Open **http://127.0.0.1:4173/website.html** for the entrance or **http://127.0.0.1:4173/** for Commons. Stop with Ctrl+C. The server binds only to loopback. Optional Python/EVM experiments have separate requirements; see the [review guide](docs/REVIEW_GUIDE.md).

Write a draft, inspect the proposed cost, confirm a simulated post, then read its receipt. Switch accounts, preview local media or compare exported records. Nothing is sent while typing; refreshing resets the demonstration. Media preview does not upload or settle an attachment.

## What the evidence establishes

| Area | Current boundary |
| --- | --- |
| Frontend | Local conversation lanes, cost review, receipts, account switching and bounded media preview |
| Experimental protocol | Fixed test NFT ownership, actual token logic on a local fork, signed paid posts and exact allocation |
| Reconstruction | Two live collectors and two offline readers agree on a fresh local history; shared-node and manifest trust remain |
| Registration | Blocked by the existing token's rejection of the literal zero-address transfer |
| Production | Unfinished; no public deployment, permanence guarantee or authenticated production authority graph |
| Review | Public code and evidence; external audit and community acceptance are not established |

**Validation:** 401/401 offline tests across 27 files; 22 build assets. Alpha.22 reconstructs both newly acquired 20-transaction histories with the existing readers. Alpha.21's 72 regression cases and alpha.20's historical-token evidence remain separate. These are finite tests, not an outside audit or a permanence guarantee.

## Read, reproduce, challenge

| Start here | Purpose |
| --- | --- |
| [Paid-action experiment](docs/PAID_ACTION.md) | Follow one complete experimental action and reconstruct its records |
| [History acquisition](docs/PAID_HISTORY_ACQUISITION.md) | Recover records through two live query paths, then compare both readers |
| [C-001 decision request](docs/C001_DECISION_REQUEST.md) | Inspect the registration conflict and the evidence needed for a decision |
| [Assessment response](docs/CONCERNS_ALPHA19_REVIEW.md) | Separate verified concerns, corrections and next work |
| [Review guide](docs/REVIEW_GUIDE.md) | Run the frontend/tests and find earlier experiments |
| [Manifesto + R2 alignment](docs/MANIFESTO_R2_ALIGNMENT_REVIEW.md) | Trace all 59 mapped primary requirements |
| [15 open conflicts](sources/SPEC_CONFLICTS.md) | Review unresolved protocol decisions |
| [Protocol scope](docs/PROTOCOL_V0_SCOPE.md) | Inspect acceptance gates and unfinished adversarial/recovery work |
| [Validation](docs/VALIDATION.md) | Current results and historical browser limits |
| [Source coverage](docs/SOURCE_COVERAGE.md) | What was examined, preserved and excluded |

R2 calls for public contribution and review before an agreed release, without developer backdoors, proxies or multisigs. These requirements remain gates, not claims earned by a passing test suite. Upstream submissions target the relevant **cawdevelopment** repository only. The implementation and experiments are original; preserved [token reference source](experiments/token-source/NOTICES.md) retains separate attribution.

[Contributing](CONTRIBUTING.md) - [Security](SECURITY.md) - [Licensing](LICENSE_STATUS.md)
