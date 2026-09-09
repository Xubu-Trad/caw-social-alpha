// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface ITestAccountReceiver {
    function onERC721Received(address operator, address from, uint256 accountId, bytes calldata data) external returns (bytes4);
}

/// @notice Original ERC721 core fixture for an isolated authority experiment.
/// Constructor creates accounts 1/2 for first and 3 for second. No later mint,
/// burn, admin, metadata, enumeration, registration or username mechanism exists.
/// Account epochs start at zero and increase on EVERY transfer, even to self.
contract TestAccountRegistry {
    mapping(uint256 => address) private owners;
    mapping(address => uint256) private balances;
    mapping(uint256 => address) private approved;
    mapping(address => mapping(address => bool)) private operators;
    mapping(uint256 => uint256) private epochs;

    error InvalidOwner();
    error UnknownAccount();
    error InvalidRecipient();
    error InvalidOperator();
    error NotAuthorized();
    error WrongFrom();
    error UnsafeRecipient();

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    constructor(address first, address second) {
        if (first == address(0) || second == address(0)) revert InvalidOwner();
        _initialMint(first, 1);
        _initialMint(first, 2);
        _initialMint(second, 3);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x80ac58cd;
    }

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert InvalidOwner();
        return balances[owner];
    }

    function ownerOf(uint256 accountId) public view returns (address owner) {
        owner = owners[accountId];
        if (owner == address(0)) revert UnknownAccount();
    }

    function authority(uint256 accountId) external view returns (address owner, uint256 currentEpoch) {
        owner = ownerOf(accountId);
        currentEpoch = epochs[accountId];
    }

    function epoch(uint256 accountId) external view returns (uint256) {
        ownerOf(accountId);
        return epochs[accountId];
    }

    function getApproved(uint256 accountId) external view returns (address) {
        ownerOf(accountId);
        return approved[accountId];
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return operators[owner][operator];
    }

    function approve(address to, uint256 accountId) external {
        address owner = ownerOf(accountId);
        if (msg.sender != owner && !operators[owner][msg.sender]) revert NotAuthorized();
        approved[accountId] = to;
        emit Approval(owner, to, accountId);
    }

    function setApprovalForAll(address operator, bool allowed) external {
        if (operator == msg.sender) revert InvalidOperator();
        operators[msg.sender][operator] = allowed;
        emit ApprovalForAll(msg.sender, operator, allowed);
    }

    function transferFrom(address from, address to, uint256 accountId) external {
        _transfer(from, to, accountId);
    }

    function safeTransferFrom(address from, address to, uint256 accountId) external {
        _safeTransfer(from, to, accountId, "");
    }

    function safeTransferFrom(address from, address to, uint256 accountId, bytes calldata data) external {
        _safeTransfer(from, to, accountId, data);
    }

    function _initialMint(address owner, uint256 accountId) private {
        owners[accountId] = owner;
        balances[owner] += 1;
        emit Transfer(address(0), owner, accountId);
    }

    function _transfer(address from, address to, uint256 accountId) private {
        address owner = ownerOf(accountId);
        if (owner != from) revert WrongFrom();
        if (to == address(0)) revert InvalidRecipient();
        if (msg.sender != owner && msg.sender != approved[accountId] && !operators[owner][msg.sender]) {
            revert NotAuthorized();
        }
        // Approval clearing and epoch movement precede every external callback.
        approved[accountId] = address(0);
        emit Approval(owner, address(0), accountId);
        balances[from] -= 1;
        balances[to] += 1;
        owners[accountId] = to;
        epochs[accountId] += 1;
        emit Transfer(from, to, accountId);
    }

    function _safeTransfer(address from, address to, uint256 accountId, bytes memory data) private {
        _transfer(from, to, accountId);
        if (to.code.length != 0) {
            bytes4 accepted = ITestAccountReceiver(to).onERC721Received(msg.sender, from, accountId, data);
            if (accepted != 0x150b7a02) revert UnsafeRecipient();
        }
        // A compliant receiver may transfer onward during its callback. Do not
        // add a nonstandard final-owner equality check. Rejection reverts all.
    }
}
