# Critique review · alpha.19

Reviewed 2026-09-09 against the retained public package `0.1.0-alpha.19`, source and execution receipts. This is a same-team documentary check, with no new execution. The supplied critique's proposed milestones are proposals, not recovered instructions or evidence that those milestones work. Ratings about development quality and visual preference are opinions.

## Verified scope

The [release receipt](../evidence/ALPHA19_TEST_RESULTS.json) records **354/354 tests across 24 files**, including 11 new named [account-authority tests](../tests/caw-account-authority.test.mjs#L371). These are suite-wide test cases, not 354 NFT or production-security scenarios. The separate local runs recorded 51 historical-CAW fork transactions and 84 synthetic transactions. No browser interaction rerun or external audit is claimed. The [requirements table](../sources/MANIFESTO_REQUIREMENTS.tsv) has 59 entries; the [conflict register](../sources/SPEC_CONFLICTS.md) still has 15 open conflicts. These counts describe this project's mapping, not a certification of completeness.

NFT custody is implemented only for three constructor-created test IDs. [Custody checks](../experiments/account-authority/CawAccountCustodyProbe.sol#L115-L124) require the current owner and matching epoch. Each [transfer](../experiments/account-authority/TestAccountRegistry.sol#L102-L126), including self-transfer, increments the epoch. This rejects stale direct requests after transfer away and back. It does **not** establish signature invalidation, delegated permission, authentic username registration or production ownership. Epochs are a proposed policy, not one-use nonces.

Per-NFT approval clears on transfer; owner-wide operator approval does not. An approved operator cannot withdraw directly for somebody else's account, but can transfer the NFT to itself and withdraw as owner. The recorded experiment exercises that consequence. A registry address/code hash detects replacement; it does not prove honesty or immutable dependencies. [Coverage limits](ACCOUNT_AUTHORITY.md) identify unexercised paths.

## Corrections

The critique's claim of no browser `fetch` is false. [app.mjs:760](../public/app.mjs#L760) fetches `fixtures.json`; [deployment.mjs:15–18](../public/deployment.mjs#L15-L18) fetches `deployment.json`. Both use same-origin URLs and omit credentials. Configuration loading also rejects redirects and has a deadline. These reads do not connect a wallet or settle CAW, but the browser is not network-free.

A literal scan of authored JavaScript/HTML found no `innerHTML`, `eval(`, `localStorage` or `process.env` use. That narrow observation is not proof that all dynamic execution, storage or network behavior is absent. Separate acquisition/experiment scripts intentionally use HTTP; the [native helper](../experiments/account-authority/account_node.py#L524-L528) reads limited operating-system environment values and supplies a controlled child environment.

The server's route allowlist, loopback binding, Host/Origin checks, CSP and resource limits are present in [server.mjs](../server.mjs). Calling them “unusually defensive” is a comparison without a stated baseline. These controls do not establish an audited client or deployment.

Signed actions and limited permissions already exist in copied synthetic ledgers. The new Solidity custody probe has no signature/delegation API. Neither component completes an Ethereum-authorized paid public CAW. The frontend still rejects real-chain configuration. No source supports a permanence, builder-disappearance or production-readiness guarantee.

## Next evidence

One bounded signed-action-to-settlement-to-reconstruction experiment is consistent with [Protocol v0](PROTOCOL_V0_SCOPE.md). Its economics and authority assumptions need explicit decisions; C-001 still blocks conforming registration, and C-007 still governs staking and distribution. Fixed test IDs cannot silently resolve either. EIP-712/1271 support and two separately written readers remain proposed scope until corresponding results exist.

The manifesto and recovered R2 remain distinct primary sources; R2 supplies the explicit public-contribution, agreed-release and no-backdoor/proxy/multisig requirements. Same-team tests and separate implementations are not outside peer review or community acceptance. Issue/PR counts, the critic's claimed inspection and repository history require separately dated remote verification; they are not established by this local review.

## Response in alpha.20

The next build is the [integrated paid-action experiment](PAID_ACTION.md), with a [formal C-001 decision request](C001_DECISION_REQUEST.md). The earlier assessment above remains scoped to alpha.19. No source conflict is silently resolved and no additional UI feature is introduced.

A separate GitHub check on 2026-09-09 found empty issue and pull-request collections, including closed records, at the public repository. This dated platform snapshot does not establish whether off-platform feedback exists. Publication and same-team review do not demonstrate external acceptance. No outreach was sent or consensus asserted.
