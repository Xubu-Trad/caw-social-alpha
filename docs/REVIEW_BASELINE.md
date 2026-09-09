# Review alpha.20

Read the words. Reproduce the receipt. Show what breaks.

The initial community review target is **0.1.0-alpha.20**, fixed at:

[`91479b6dc8c9a264411d75177d43029e0266c354`](https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social/commit/91479b6dc8c9a264411d75177d43029e0266c354)

Git tree: `af574ac95d41176b6754c3abe60e4bb80f744976`. The commit was published on 2026-09-09. Later documentation commits do not move this review target or establish a new tested protocol version. Any later code candidate needs a separately identified commit and its own evidence.

The current project name is **cawmmunity.caw - decentralized - social**. Its GitHub address is `Xubu-Trad/cawmmunity.caw-decentralized-social`. The clone URL below uses the renamed repository; checking out the pinned commit preserves alpha.20's original files and naming.

## Reproduce this version

In a fresh clone:

```sh
git clone https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social.git
cd cawmmunity.caw-decentralized-social
git checkout --detach 91479b6dc8c9a264411d75177d43029e0266c354
git rev-parse HEAD
git rev-parse "HEAD^{tree}"
```

The last two outputs must match the commit and tree above. Follow the pinned [review guide](https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social/blob/91479b6dc8c9a264411d75177d43029e0266c354/docs/REVIEW_GUIDE.md) for runtime requirements and the pinned [paid-action guide](https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social/blob/91479b6dc8c9a264411d75177d43029e0266c354/docs/PAID_ACTION.md) for the two offline readers. Start with offline reproduction; the optional local EVM run is separate.

The historical `CONTRIBUTING.md` at this commit has a stale license sentence. The [correction](https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social/commit/e8872a32159b3b45c10d3eacaf05cc0400ed5e0d) aligns it with the already approved code-only MIT grant; it does not change [licensing scope](../LICENSE_STATUS.md).

## What is being reviewed

The baseline records 366 passing offline tests across 25 files, 22 build assets, nine accepted paid posts in a local historical-token fork, and agreement between separately written JavaScript and Python readers. These are retained results from that version, not a claim that a new reviewer has reproduced them. See the pinned [validation record](https://github.com/Xubu-Trad/cawmmunity.caw-decentralized-social/blob/91479b6dc8c9a264411d75177d43029e0266c354/docs/VALIDATION.md).

Both readers use one provider-derived capture. They do not independently acquire or authenticate the whole chain history. The three-account registry, scalar-counting rule and staking model are experimental. The combined contract still needs its own adversarial regression. The frontend remains a simulation. No external audit, community agreement, public deployment or permanence guarantee is established.

The current [roadmap](ROADMAP.md) links ten actual review issues. All fifteen [source conflicts](../sources/SPEC_CONFLICTS.md) remain open; these issues do not exhaust the production requirements. Opening an issue is not resolving it.

Later evidence: [alpha.21 regression](PAID_ACTION_REGRESSION.md) tests this unchanged contract on a separate synthetic chain. Its added fixtures, checker and results belong to the later repository revision. [Alpha.22 acquisition](PAID_HISTORY_ACQUISITION.md) adds two live collection paths on another fresh synthetic run. The initial alpha.20 review commit above remains fixed.

For a finding, record the exact commit, source requirement/conflict, environment, commands, expected result, observed result and smallest reproduction. Keep failures and objections visible. Avoid keys, private paths or identifying account data. A signature, repository publication or notice delivery alone does not establish endorsement or agreement.
