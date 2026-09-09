// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IHookAccountRegistry {
    function transferFrom(address from, address to, uint256 accountId) external;
}

interface IHookAccountProbe {
    function deposit(uint256 accountId, uint256 expectedEpoch, uint256 amount) external;
    function withdraw(uint256 accountId, uint256 expectedEpoch, uint256 amount) external;
}

/// @notice Original openly configurable TEST hook. No production privileges.
/// Targets/actions are typed and bounded; no arbitrary calldata execution.
/// The legacy one-argument entrypoints adapt the synthetic token's callbacks.
contract AccountHookFixture {
    address public registry;
    address public probe;
    uint256 public accountId;
    address public currentOwner;
    address public otherOwner;
    uint256 public expectedEpoch;
    uint8 public mode;

    error HookConfiguration();
    error HookAmount();
    error HookMode();
    error HookReceiver();

    /// @dev Modes: 0 accept/no-op; 1 nested deposit; 2 nested withdrawal;
    /// 3 currentOwner -> otherOwner; 4 currentOwner -> hook -> currentOwner;
    /// 5 reject NFT receipt; 6 forward a received NFT from hook -> otherOwner.
    function configure(address registryAddress, address probeAddress, uint256 id,
        address owner, address other, uint256 epochValue, uint8 modeValue) external {
        if (registryAddress.code.length == 0 || probeAddress.code.length == 0 ||
            owner == address(0) || other == address(0) || modeValue > 6) revert HookConfiguration();
        registry = registryAddress;
        probe = probeAddress;
        accountId = id;
        currentOwner = owner;
        otherOwner = other;
        expectedEpoch = epochValue;
        mode = modeValue;
    }

    function deposit(uint256 amount) external {
        if (amount != 1) revert HookAmount();
        _run();
    }

    function withdraw(uint256 amount) external {
        if (amount != 1) revert HookAmount();
        _run();
    }

    function _run() private {
        if (mode == 0) return;
        if (mode == 1) IHookAccountProbe(probe).deposit(accountId, expectedEpoch, 1);
        else if (mode == 2) IHookAccountProbe(probe).withdraw(accountId, expectedEpoch, 1);
        else if (mode == 3) IHookAccountRegistry(registry).transferFrom(currentOwner, otherOwner, accountId);
        else if (mode == 4) {
            IHookAccountRegistry(registry).transferFrom(currentOwner, address(this), accountId);
            IHookAccountRegistry(registry).transferFrom(address(this), currentOwner, accountId);
        } else revert HookMode();
    }

    function onERC721Received(address, address, uint256 id, bytes calldata) external returns (bytes4) {
        if (msg.sender != registry || id != accountId) revert HookReceiver();
        if (mode == 5) return bytes4(0);
        if (mode == 6) IHookAccountRegistry(registry).transferFrom(address(this), otherOwner, id);
        return 0x150b7a02;
    }
}
