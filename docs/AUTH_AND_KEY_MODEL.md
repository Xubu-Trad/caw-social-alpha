# Identity, authorization and private-message keys

Alpha.9 adds [signed owner cancellation](OWNER_CANCELLATION.md). The owner key remains temporarily available in Identity to cancel its exact grant. Cancellation closes the copy and is verified in owner record v2; it changes no balance or model nonce. Older snapshots cannot prove that no newer cancellation exists.

Alpha.8 adds [test-owner-signed grants](OWNER_SIGNED_GRANTS.md). A separately supplied owner test key approves exact limited terms for another key; both signatures are checked before copied settlement. Real NFT/wallet ownership, persistent grant lifecycle and production authorization remain unimplemented. The earlier unsigned-grant experiment below remains available for comparison.

The earlier [limited test-key experiment](DELEGATED_PERMISSIONS.md) enforces a proposed scope, gross-fee budget, signed permission commitment and expiry in a copied fixture. Its comparison path uses an unsigned local grant control. Production ownership-based delegation remains unimplemented; the alpha.8 extension above verifies only supplied test-owner authority. Existing design requirements below retain that production boundary.

Status: PROPOSED production design. The separate [signature lab](SIGNATURE_LAB.md) exercises ephemeral Ed25519 signing, exact action binding, expiry and revocation. Its [copied ledger](SIGNED_SETTLEMENT.md) applies verified CAWs and advances the model nonce atomically. It neither authenticates wallets/NFT owners nor encrypts messages. Commons settlement remains unsigned and synthetic.

## Separate authorities

| Material | Intended purpose | Must not imply |
|---|---|---|
| Wallet key / contract-wallet authority | Establish ownership and explicitly sign permitted actions | Merely logging in allows spending |
| On-chain NFT ownership | Current account authority under resolved transfer rules | An old browser session remains authorized after transfer |
| Service session | Scoped access to an optional operator service | Authority over protocol balances or universal operator trust |
| Delegated action key | Possible limited actions/budget/expiry under a reviewed design | Unbounded wallet access, transferable spending privilege or relay ownership |
| DM identity/device keys | Authenticate peers and protect message content | Wallet signatures alone solve encryption, recovery or ownership transfer |

For later service authentication, evaluate [ERC-4361 / SIWE](https://eips.ethereum.org/EIPS/eip-4361). Its origin/domain, nonce and session bindings are relevant; account-specific authority and spending permissions need their own checks. Contract-wallet verification, chain context, expiry and revocation must be implemented and tested with a maintained library before use. No such library is selected or installed now.

## Signed actions: proposed requirements

Bind version, network/chain, contract, account/NFT, action type, exact content digest, cost parameters or fixed-schedule commitment, recipient, nonce and validity interval. Specify canonical bytes and domain separation. Reject changed content, cross-domain replays, duplicate application, stale owners, expired sessions and modified costs. Choose nonce/order and NFT transfer rules in the specification before implementing irreversible settlement.

A session grant must disclose scope, budget and expiry. Revocation and ownership changes invalidate relevant future actions at the authoritative boundary. Login is not a token approval. Commons actions still use simulated authorization; actual signing exists only in the separate, unfunded signature lab.

## DM questions that block production messaging

The source grants an NFT owner access to account DMs but also expects secure trustless messaging. Resolve historical versus future access, counterparties' consent, device-key authentication, key-change notices, loss/recovery, transfer timing and session revocation. Specify whether transferred history is required, optional with consent, or a disclosed deviation.

Prior owners and recipients may retain copied plaintext or keys. No protocol can promise to erase those copies. Server-encrypted storage with an operator key is not end-to-end encryption. There will be no universal Xubu/support decryption key.

Select maintained reviewed cryptographic protocols only after that model is settled. Independently assess implementation, test vectors, key lifecycle, metadata, online/offline delivery and backup behavior. Documentation for another messaging system does not establish security for CAW. Group messaging and experimental Bluetooth transport are outside this baseline.

The Messages view may show a clearly disabled explanation or synthetic preview. It must not accept actual private correspondence, persist real secrets, connect a wallet, request a signature or describe demo messages as encrypted.
