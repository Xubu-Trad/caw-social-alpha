# NFT account authority · experiment

**Local execution completed.** Account balances followed the current owner of each fixed test NFT; stale direct requests and transfer-during-custody attempts rejected. It is not username registration, a paid public CAW or a completed protocol. The existing frontend remains a simulation.

| Evidence | Status |
| --- | --- |
| Compilation and bounded local execution | Four original Solidity sources compiled; historical CAW fork completed 46 steps / 51 local transactions; separate synthetic suite completed 20 adversarial scenarios in 72 recorded steps / 84 local transactions |
| Independent offline assertions and recorded cases | 354/354 tests passed across 24 files; [fork receipt](../experiments/account-authority/fork-result.json), [synthetic receipt](../experiments/account-authority/synthetic-result.json) and [validation](VALIDATION.md) retained |

## Fixed accounts, explicit authority

The original [test registry](../experiments/account-authority/TestAccountRegistry.sol) creates IDs 1 and 2 for one test owner and ID 3 for another during construction. It has no later mint, burn, username, registration, administrator or upgrade mechanism. Its ownership, approvals and safe-transfer interfaces follow the [ERC-721 core specification](https://eips.ethereum.org/EIPS/eip-721), with [ERC-165 interface detection](https://eips.ethereum.org/EIPS/eip-165). Metadata and enumeration extensions are absent. Test coverage must be recorded before claiming broader interoperability.

The [account custody probe](../experiments/account-authority/CawAccountCustodyProbe.sol) fixes the CAW token and stores an immutable registry address and expected runtime hash. Credits belong to the **account ID**, not the depositor address. Only the current owner may deposit or withdraw, selecting that account explicitly. Withdrawal pays that owner. No staking, operator login or special deployer permission is required.

The registry and its dependencies still require review. A matching code hash detects code replacement; it does not prove that the chosen registry is legitimate, honest or independent of mutable external authority.

## Epochs and transfer permissions

Every successful NFT transfer, including transfer to self, increments that account's epoch. Direct deposit and withdrawal calls provide `expectedEpoch`. An old request rejects after A→B and remains stale after A→B→A. This is a **proposed sequencing policy**, not a rule supplied by the manifesto or ERC-721.

There is no signature verification, delegation, session grant or relayed authorization API. The epoch is not a one-use nonce: repeated direct calls at the current epoch are separate authorized transactions, subject to credit and amount checks.

An approved NFT operator cannot withdraw directly while another address owns the account. However, that operator can transfer the NFT to itself and then withdraw as owner. Granting NFT transfer power therefore has consequences for the funded account. Each transfer clears the **per-NFT approval**; it does not erase the former owner's `ApprovalForAll` grants. Those owner-wide grants can matter again if the NFT returns to that owner.

## Calls and callbacks

Unlike the earlier [depositor probe](LOCAL_CUSTODY.md), deposits check both exact vault intake and exact sender debit. Withdrawals check both sides too. Authority is checked before and after token interaction; registry code checks surround external reads/calls. A changed owner or epoch must revert the full custody transition, including a transfer away and back during a callback. Reentrancy and backing checks remain necessary; dishonest balance reporting and backing-loss recovery remain limitations.

Safe NFT transfer updates ownership, epoch and per-NFT approval before calling the receiver. A rejecting receiver rolls back the transfer. An accepting receiver may transfer onward during its callback; the fixture does not falsely require it to remain the final owner. The bounded [hook fixture](../experiments/account-authority/AccountHookFixture.sol) supplies explicit test behavior, not production privileges.

The [offline assertions](../tests/caw-account-authority.test.mjs) reconstruct the exact recorded requests, events, balances, ownership, epochs, approvals, resets and failures. The synthetic sender-fee deposit reverted; transfer-away-and-back during both deposit and withdrawal reverted with all recorded effects rolled back. An operator transferred an NFT to itself and withdrew as owner. Receiver rejection, acceptance and onward transfer were exercised.

All **15 conflicts remain open**. [C-001](../sources/SPEC_CONFLICTS.md#c-001) still blocks conforming registration because the existing token rejects the required zero-address transfer. Fixed test NFTs do not resolve that conflict. The next complete paid-action path also needs its own signed-authority, economics and reconstruction gates.


## Reproduce and review the limits

The [runner](../experiments/account-authority/run_account_authority.py), [bounded node helper](../experiments/account-authority/account_node.py), [compiler input](../experiments/account-authority/compile-standard.json), [build](../experiments/account-authority/authority-build.json) and [toolchain](../experiments/account-authority/toolchain.json) are preserved. The account token fixture raises only the prior synthetic callback allowance from 50,000 to 150,000 gas so two NFT transfers can reach the final authority check. Historical CAW code/storage is not replaced. The alternate token runs only on a separate empty local chain.

Using Windows, separately verified Anvil 1.8.1 and a fresh output filename:

```sh
python experiments/account-authority/run_account_authority.py --mode fork --anvil /path/to/anvil.exe --output authority-fork-recheck.json --expected-script-sha256 d6ed0548f91a2b5d7a9208ef24ff4a78b5094aae185e63e9a704b2ce728d533f --expected-input-sha256 23bf546149bf28d8107866cfd8256091f18d4621b1ca10e8be6d093275c83d14
```

For the separate synthetic suite use `--mode synthetic --output authority-synthetic-recheck.json`. Verify the executable and files against the retained hashes first. These example outputs and work folders are Git-excluded. Ordinary offline tests do not launch the EVM or contact a provider.

Every transaction is retained. Fixture-only configuration steps explicitly mark their following state as derived, not observed; all tested account transitions and snapshot resets have recorded state reads. Two bounded receipt retries occurred in the synthetic run. Earlier memory-floor and receipt-timing failures remain in the local archive and are not successful runs.

This is a finite fixed-registry experiment: no authentic production registry, live ownership authentication, signature/delegate authority, DM-key transfer, consensus, freshness, permanent history or paid social settlement is established. Runtime registry replacement, the four-argument safe-transfer overload and custody calls inside NFT receiver callbacks were not exercised. Interface checks are not exhaustive ERC-721 conformance certification. No real key, wallet, public transaction or public deployment was used.
