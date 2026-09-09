// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface ICawAccountToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface ICawAccountAuthority {
    function authority(uint256 accountId) external view returns (address owner, uint256 currentEpoch);
}

/// @notice Original isolated account-custody experiment, not a protocol release.
/// Credits belong to a registry account ID. Only its current owner may spend.
/// No registration, username, burn, fee, signature or delegation API is present.
/// A runtime pin detects code changes; it does not authenticate a registry or
/// establish that unchanged registry code has honest/immutable dependencies.
contract CawAccountCustodyProbe {
    ICawAccountToken public constant TOKEN = ICawAccountToken(0xf3b9569F82B18aEf890De263B84189bd33EBe452);
    address public immutable registry;
    bytes32 public immutable registryCodeHash;
    mapping(uint256 => uint256) public credits;
    uint256 public totalCredits;
    bool private entered;

    error InvalidRegistry();
    error RegistryCodeChanged();
    error InvalidAuthority();
    error NotAccountOwner();
    error StaleEpoch();
    error AuthorityChanged();
    error Reentrant();
    error ZeroAmount();
    error InsufficientCredit();
    error TokenRejected();
    error UnexpectedTokenDelta();
    error Underbacked();

    event Deposited(uint256 indexed accountId, address indexed owner, uint256 amount, uint256 credit, uint256 epoch);
    event Withdrawn(uint256 indexed accountId, address indexed owner, uint256 amount, uint256 credit, uint256 epoch);

    constructor(address registryAddress, bytes32 expectedRegistryCodeHash) {
        if (registryAddress == address(0) || registryAddress.code.length == 0) revert InvalidRegistry();
        if (expectedRegistryCodeHash == bytes32(0) || registryAddress.codehash != expectedRegistryCodeHash) {
            revert RegistryCodeChanged();
        }
        registry = registryAddress;
        registryCodeHash = expectedRegistryCodeHash;
    }

    modifier guarded() {
        if (entered) revert Reentrant();
        entered = true;
        _;
        entered = false;
    }

    /// @dev The explicit epoch rejects stale direct calldata, including calls
    /// queued before transfer away and back. This is not signature verification.
    function deposit(uint256 accountId, uint256 expectedEpoch, uint256 amount) external guarded {
        if (amount == 0) revert ZeroAmount();
        address owner = _requireOwner(accountId, expectedEpoch);
        uint256 vaultBefore = _balance(address(this));
        uint256 payerBefore = _balance(owner);
        _checkRegistry();
        bool accepted = TOKEN.transferFrom(owner, address(this), amount);
        _checkRegistry();
        if (!accepted) revert TokenRejected();
        uint256 vaultAfter = _balance(address(this));
        uint256 payerAfter = _balance(owner);
        if (!_increasedExactly(vaultBefore, vaultAfter, amount) || !_decreasedExactly(payerBefore, payerAfter, amount)) {
            revert UnexpectedTokenDelta();
        }
        _recheckAuthority(accountId, owner, expectedEpoch);
        credits[accountId] += amount;
        totalCredits += amount;
        if (vaultAfter < totalCredits) revert Underbacked();
        emit Deposited(accountId, owner, amount, credits[accountId], expectedEpoch);
    }

    function withdraw(uint256 accountId, uint256 expectedEpoch, uint256 amount) external guarded {
        if (amount == 0) revert ZeroAmount();
        address owner = _requireOwner(accountId, expectedEpoch);
        if (credits[accountId] < amount) revert InsufficientCredit();
        uint256 vaultBefore = _balance(address(this));
        uint256 recipientBefore = _balance(owner);
        credits[accountId] -= amount;
        totalCredits -= amount;
        _checkRegistry();
        bool accepted = TOKEN.transfer(owner, amount);
        _checkRegistry();
        if (!accepted) revert TokenRejected();
        uint256 vaultAfter = _balance(address(this));
        uint256 recipientAfter = _balance(owner);
        if (!_decreasedExactly(vaultBefore, vaultAfter, amount) || !_increasedExactly(recipientBefore, recipientAfter, amount)) {
            revert UnexpectedTokenDelta();
        }
        if (vaultAfter < totalCredits) revert Underbacked();
        _recheckAuthority(accountId, owner, expectedEpoch);
        emit Withdrawn(accountId, owner, amount, credits[accountId], expectedEpoch);
    }

    function _checkRegistry() private view {
        if (registry.codehash != registryCodeHash) revert RegistryCodeChanged();
    }

    function _authority(uint256 accountId) private view returns (address owner, uint256 currentEpoch) {
        _checkRegistry();
        (owner, currentEpoch) = ICawAccountAuthority(registry).authority(accountId);
        _checkRegistry();
        if (owner == address(0)) revert InvalidAuthority();
    }

    function _requireOwner(uint256 accountId, uint256 expectedEpoch) private view returns (address owner) {
        uint256 currentEpoch;
        (owner, currentEpoch) = _authority(accountId);
        if (currentEpoch != expectedEpoch) revert StaleEpoch();
        if (owner != msg.sender) revert NotAccountOwner();
    }

    function _recheckAuthority(uint256 accountId, address expectedOwner, uint256 expectedEpoch) private view {
        (address owner, uint256 currentEpoch) = _authority(accountId);
        if (owner != expectedOwner || currentEpoch != expectedEpoch) revert AuthorityChanged();
    }

    function _balance(address account) private view returns (uint256 amount) {
        _checkRegistry();
        amount = TOKEN.balanceOf(account);
        _checkRegistry();
    }

    function _increasedExactly(uint256 beforeValue, uint256 afterValue, uint256 amount) private pure returns (bool) {
        return afterValue >= beforeValue && afterValue - beforeValue == amount;
    }

    function _decreasedExactly(uint256 beforeValue, uint256 afterValue, uint256 amount) private pure returns (bool) {
        return beforeValue >= afterValue && beforeValue - afterValue == amount;
    }
}
