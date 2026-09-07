# Identity, authorization and private-message keys

Status: PROPOSED. No wallet authentication or encryption is implemented in the first fixture scope.

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

A session grant must disclose scope, budget and expiry. Revocation and ownership changes invalidate relevant future actions at the authoritative boundary. Login is not a token approval. The fixture prototype uses labelled simulated authorization states, not actual cryptographic signing.

## DM questions that block production messaging

The source grants an NFT owner access to account DMs but also expects secure trustless messaging. Resolve historical versus future access, counterparties' consent, device-key authentication, key-change notices, loss/recovery, transfer timing and session revocation. Specify whether transferred history is required, optional with consent, or a disclosed deviation.

Prior owners and recipients may retain copied plaintext or keys. No protocol can promise to erase those copies. Server-encrypted storage with an operator key is not end-to-end encryption. There will be no universal Xubu/support decryption key.

Select maintained reviewed cryptographic protocols only after that model is settled. Independently assess implementation, test vectors, key lifecycle, metadata, online/offline delivery and backup behavior. BitChat or Nostr documentation is not a security review of CAW. Group messaging and experimental Bluetooth transport are outside this baseline.

The interface may show a clearly disabled, explanatory Messages view or synthetic preview. It must not accept actual private correspondence, persist real secrets, connect a wallet, request a signature or describe demo messages as encrypted.
