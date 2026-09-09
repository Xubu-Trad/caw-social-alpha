// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface ISnapshotRegistry {
    function authority(uint256 id) external view returns (address, uint256);
    function getApproved(uint256 id) external view returns (address);
    function balanceOf(address who) external view returns (uint256);
    function isApprovedForAll(address who, address operator) external view returns (bool);
}
interface ISnapshotProbe {
    function credits(uint256 id) external view returns (uint256);
    function stakes(uint256 id) external view returns (uint256);
    function nonces(uint256 id) external view returns (uint256);
    function totalCredits() external view returns (uint256);
    function poolDust() external view returns (uint256);
    function messageCount() external view returns (uint256);
}
interface ISnapshotToken {
    function balanceOf(address who) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function callbackAttempts() external view returns (uint256);
    function lastCallbackSuccess() external view returns (bool);
    function lastCallbackError() external view returns (bytes4);
    function lastCallbackReturnLength() external view returns (uint256);
}

/// @notice Read-only test helper. Batches ordinary getters; proves no chain authenticity.
/// Native gas and transaction nonces are excluded: rejected transactions still pay gas.
contract PaidStateSnapshot {
    /// @dev x: registry, probe, token, owner A, owner B, hook, wallet.
    /// Result: 3*(owner,epoch,credit,stake,nonce,approval), totals(credit,dust,messages),
    /// token balances(probe,A,B,wallet,hook), allowances(A,B,wallet,hook), supply,
    /// token callback(attempts,success,error,length), NFT balances(A,B,wallet,hook),
    /// A-to-hook global approval. Layout is explicitly decoded by the runner.
    function read(address[7] calldata x) external view returns (uint256[40] memory out) {
        ISnapshotRegistry r = ISnapshotRegistry(x[0]);
        ISnapshotProbe p = ISnapshotProbe(x[1]);
        ISnapshotToken t = ISnapshotToken(x[2]);
        for (uint256 id = 1; id <= 3; id++) {
            uint256 at = (id - 1) * 6;
            (address owner, uint256 epoch) = r.authority(id);
            out[at] = uint256(uint160(owner));
            out[at+1] = epoch;
            out[at+2] = p.credits(id);
            out[at+3] = p.stakes(id);
            out[at+4] = p.nonces(id);
            out[at+5] = uint256(uint160(r.getApproved(id)));
        }
        out[18] = p.totalCredits(); out[19] = p.poolDust(); out[20] = p.messageCount();
        out[21] = t.balanceOf(x[1]); out[22] = t.balanceOf(x[3]); out[23] = t.balanceOf(x[4]);
        out[24] = t.balanceOf(x[6]); out[25] = t.balanceOf(x[5]);
        out[26] = t.allowance(x[3], x[1]); out[27] = t.allowance(x[4], x[1]);
        out[28] = t.allowance(x[6], x[1]); out[29] = t.allowance(x[5], x[1]);
        out[30] = t.totalSupply(); out[31] = t.callbackAttempts();
        out[32] = t.lastCallbackSuccess() ? 1 : 0;
        out[33] = uint32(t.lastCallbackError()); out[34] = t.lastCallbackReturnLength();
        out[35] = r.balanceOf(x[3]); out[36] = r.balanceOf(x[4]);
        out[37] = r.balanceOf(x[6]); out[38] = r.balanceOf(x[5]);
        out[39] = r.isApprovedForAll(x[3],x[5]) ? 1 : 0;
    }
}
