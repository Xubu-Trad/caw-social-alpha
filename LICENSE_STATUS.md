# Licensing status

Xubu approved the MIT license for the original alpha implementation and project-authored explanatory documentation on 2026-09-08. See [LICENSE](LICENSE). Covered material may be copied, modified and commercially reused with the copyright and permission notice retained. No legal name or private email is included in the notice.

## Covered implementation

Original application JavaScript, Python capture/fixture scripts, HTML, CSS, tests, synthetic fixtures, build scripts and project-authored explanatory documentation are covered. The application and original experimental custody probe are covered; preserved third-party token source is separately classified below. This is a provenance statement, not a warranty of rights; rights the licensor does not hold are not granted. Future contributions retain their authors' copyright.

## Excluded material

- `public/caw-symbol.png`, `docs/images/alpha-website.png` and other artwork/screenshots. The original artist and general redistribution license for the CAW illustration have not been established. The screenshot includes it. See [asset provenance](docs/ASSET_PROVENANCE.md).
- `sources/` and preserved primary texts. The manifesto, recovered R2 and historical source evidence retain their existing rights. Preservation does not relicense them.
- `reference/fixtures/caw-token-publicnode.json` and `reference/fixtures/caw-token-drpc.json`. These are raw public-network observations retained as evidence, outside the code license grant.
- `experiments/custody/drpc-simulation.json` and `experiments/custody/publicnode-simulation.json`, which preserve raw remote execution observations and an access failure outside the original-code grant.
- `experiments/token-source/StandardERC20.sol` and its embedded copy in `compile-standard.json` retain the retrieved source MIT declaration and [third-party notices](experiments/token-source/NOTICES.md), including the original OpenZeppelin notice. Xubu does not replace that attribution or claim authorship.
- `experiments/local-custody/fork-result.json` and `experiments/local-custody/synthetic-result.json` retain raw experiment evidence outside the original-code license grant. Original fixture and runner code are covered. The separately acquired Anvil binary is not included or relicensed.
- `experiments/account-authority/fork-result.json` and `experiments/account-authority/synthetic-result.json` preserve raw execution evidence outside the original-code license grant. The original account probe, test registry, hooks, synthetic token and runner are covered.
- `experiments/paid-action/execution-trace.json`, `history.json`, `execution-summary.json` and `known-account-failure.json` preserve raw or extracted observations outside the original-code grant. Original contracts, runners, readers, tests and explanatory documents are covered. The optional signing runner uses the separately supplied Python `cryptography` package; its code/binaries are not redistributed here.
- Any future third-party code/content carrying its own notice; preserve that notice and review its compatibility separately.
- `experiments/paid-adversarial/execution-trace.json`, `execution-summary.json` and `first-attempt.json` retain raw or extracted local observations outside the original-code grant. Original regression fixtures, runner, checker, tests and explanatory documentation are covered by the approved code-only MIT license.

- Raw/extracted observations in `experiments/paid-acquisition/` (`execution-trace.json`, `execution-summary.json`, both `history-*.json`, both `reconstruction-python-*.json`, `reconstruction-checks.json`, `first-attempt.json` and `manifest.json`) remain outside the original-code grant. The authored collectors, runner, checker, tests, input index and explanatory documentation are covered.

- Raw/extracted observations and execution reports in `experiments/paid-reorg/`, `experiments/paid-acquisition-race/` and `experiments/paid-live-acquisition/` remain outside the original-code grant, including recorded RPC evidence, histories, manifests, reconstructed results and replay observations. Original coordinators, transports, runners, checkers, tests, input indexes and explanatory documentation are covered. Reusing an observation in a replay does not relicense the source observation.

The code license grants no CAW trademark rights or endorsement. Do not apply Xubu's MIT grant to excluded content; preserve each item's own stated rights. Future additions require classification before assuming coverage. Licensing of this alpha does not select a license for a separate future contract repository or establish community acceptance of the protocol.
