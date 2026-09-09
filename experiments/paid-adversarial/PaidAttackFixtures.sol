// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IPaidAttackProbe {
    struct PostRequest {
        uint256 accountId;
        uint256 epoch;
        uint256 nonce;
        uint256 validAfter;
        uint256 deadline;
        bytes32 distributionHash;
        bytes text;
    }

    function deposit(uint256 accountId, uint256 expectedEpoch, uint256 amount) external;
    function withdraw(uint256 accountId, uint256 expectedEpoch, uint256 amount) external;
    function stake(uint256 accountId, uint256 expectedEpoch, uint256 amount) external;
    function unstake(uint256 accountId, uint256 expectedEpoch, uint256 amount) external;
    function post(PostRequest calldata request, bytes calldata signature) external;
}

interface IPaidAttackRegistry {
    function authority(uint256 accountId) external view returns (address owner, uint256 epoch);
    function transferFrom(address from, address to, uint256 accountId) external;
}

/// @notice ORIGINAL SYNTHETIC TEST FIXTURES ONLY. All controls are public.
/// No authorization, wallet safety or production behavior is claimed here.
/// Calls target the constructor-pinned probe and five named methods only.
abstract contract PaidBoundedCalls {
    address public immutable probe;
    uint8 public action;
    uint256 public accountId;
    uint256 public expectedEpoch;
    bytes public postCalldata;

    uint256 public constant MAX_POST_CALLDATA = 8192;
    uint256 public constant NESTED_CALL_GAS = 30000;

    error AttackConfiguration();
    error AttackCalldata();

    constructor(address probeAddress) {
        if (probeAddress.code.length == 0) revert AttackConfiguration();
        probe = probeAddress;
    }

    /// @dev Harness control. Save only a canonical encoding of the typed post
    /// call; no arbitrary selector, target, trailing bytes or value transfer.
    /// Large saved inputs remain subject to the probe's 100,000-gas wallet cap.
    function setPostCalldata(bytes calldata value) external {
        if (value.length < 4 || value.length > MAX_POST_CALLDATA) revert AttackCalldata();
        bytes4 selector;
        assembly { selector := calldataload(value.offset) }
        if (selector != IPaidAttackProbe.post.selector) revert AttackCalldata();
        (IPaidAttackProbe.PostRequest memory request, bytes memory signature) =
            abi.decode(value[4:], (IPaidAttackProbe.PostRequest, bytes));
        if (request.text.length > 1680 || signature.length > 4096) revert AttackCalldata();
        if (keccak256(value) != keccak256(abi.encodeWithSelector(selector, request, signature))) {
            revert AttackCalldata();
        }
        postCalldata = value;
    }

    function _configureAttack(uint8 selected, uint256 id, uint256 epochValue) internal {
        if (selected > 5 || id < 1 || id > 3) revert AttackConfiguration();
        action = selected;
        accountId = id;
        expectedEpoch = epochValue;
    }

    /// @dev Actions 1..4 always attempt exactly one base unit. Action 5 uses
    /// the validated saved post. These inputs need not pass business checks:
    /// during an outer guarded call, the guard should reject them first.
    function _probeAttempt() internal returns (bool success, uint256 size, bytes32 firstWord) {
        bytes memory payload;
        uint8 selected = action;
        if (selected == 1) payload = abi.encodeWithSelector(IPaidAttackProbe.deposit.selector, accountId, expectedEpoch, uint256(1));
        else if (selected == 2) payload = abi.encodeWithSelector(IPaidAttackProbe.withdraw.selector, accountId, expectedEpoch, uint256(1));
        else if (selected == 3) payload = abi.encodeWithSelector(IPaidAttackProbe.stake.selector, accountId, expectedEpoch, uint256(1));
        else if (selected == 4) payload = abi.encodeWithSelector(IPaidAttackProbe.unstake.selector, accountId, expectedEpoch, uint256(1));
        else if (selected == 5) {
            payload = postCalldata;
            if (payload.length == 0) revert AttackCalldata();
        } else revert AttackConfiguration();
        return _boundedCall(probe, payload);
    }

    /// @dev Zero value; 30,000 gas; copy at most one return word. Both possible
    /// targets are constructor-pinned fixtures, never a caller-selected target.
    function _boundedCall(address target, bytes memory payload)
        internal returns (bool success, uint256 size, bytes32 firstWord) {
        assembly {
            let output := mload(0x40)
            mstore(output, 0)
            success := call(30000, target, 0, add(payload, 32), mload(payload), output, 32)
            size := returndatasize()
            firstWord := mload(output)
        }
    }

    /// @dev Preserve up to the first 32 bytes. Named probe errors are four
    /// bytes; a static state-write failure has no return bytes.
    function _propagate(uint256 size, bytes32 firstWord) internal pure {
        assembly {
            let output := mload(0x40)
            mstore(output, firstWord)
            if gt(size, 32) { size := 32 }
            revert(output, size)
        }
    }
}

/// @notice Adapts the unchanged synthetic token's deposit(1) callback to every
/// guarded entrypoint in the unchanged CawPaidActionProbe. The token records
/// success/error telemetry and decides whether to swallow or propagate it.
contract PaidEntrypointHook is PaidBoundedCalls {
    error HookAmount();

    constructor(address probeAddress) PaidBoundedCalls(probeAddress) {}

    /// @dev 0 no-op; 1 deposit; 2 withdraw; 3 stake; 4 unstake; 5 post.
    function configure(uint8 selected, uint256 id, uint256 epochValue) external {
        _configureAttack(selected, id, epochValue);
    }

    function deposit(uint256 amount) external {
        if (amount != 1) revert HookAmount();
        if (action == 0) return;
        (bool success, uint256 size, bytes32 firstWord) = _probeAttempt();
        if (!success) _propagate(size, firstWord);
    }
}

/// @notice Openly configurable ERC1271 ATTACK FIXTURE, not a usable wallet.
/// In particular mode 6 deliberately accepts a length-only synthetic policy.
/// A callback cannot persist telemetry because the probe uses STATICCALL.
/// The signature entrypoint is intentionally not marked view: selected modes
/// try a state-changing CALL inside the probe's static execution context.
contract PaidSignatureAttackOwner is PaidBoundedCalls {
    address public immutable signer;
    address public immutable registry;
    address public transferRecipient;
    uint8 public mode;

    bytes4 private constant MAGIC = 0x1626ba7e;
    bytes4 private constant BAD_MAGIC = 0xffffffff;
    bytes4 private constant REENTRANT = bytes4(keccak256("Reentrant()"));
    uint256 private constant HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    error SignatureAttackReverted();
    error UnexpectedAttackResult();

    constructor(address signerAddress, address probeAddress, address registryAddress)
        PaidBoundedCalls(probeAddress) {
        if (signerAddress == address(0) || registryAddress.code.length == 0) revert AttackConfiguration();
        signer = signerAddress;
        registry = registryAddress;
    }

    /// @dev Modes: 0 ECDSA; 1 bad magic; 2 explicit revert; 3 four-byte result;
    /// 4 ECDSA then 64 KiB result; 5 exhaust gas; 6 accept lengths 0..4096;
    /// 7 nested probe rejection caught then ECDSA; 8 propagate that rejection;
    /// 9 registry static-write failure caught then ECDSA; 10 propagate it.
    /// Modes 7/8 select any of actions 1..5. Modes 9/10 require this fixture
    /// to own the configured ID/epoch and a different nonzero recipient.
    function configure(uint8 selectedMode, uint8 selectedAction, uint256 id,
        uint256 epochValue, address recipient) external {
        if (selectedMode > 10) revert AttackConfiguration();
        if ((selectedMode == 7 || selectedMode == 8) && selectedAction == 0) revert AttackConfiguration();
        if ((selectedMode == 9 || selectedMode == 10) &&
            (recipient == address(0) || recipient == address(this))) revert AttackConfiguration();
        _configureAttack(selectedAction, id, epochValue);
        mode = selectedMode;
        transferRecipient = recipient;
    }

    /// @dev Public TEST-ONLY recovery control. A normal transaction can move
    /// this fixture's NFT to a real test owner for a subsequent withdrawal.
    function releaseAccount(uint256 id, address recipient) external {
        if (id < 1 || id > 3 || recipient == address(0)) revert AttackConfiguration();
        IPaidAttackRegistry(registry).transferFrom(address(this), recipient, id);
    }

    function isValidSignature(bytes32 digest, bytes calldata signature) external returns (bytes4) {
        uint8 selected = mode;
        if (selected == 1) return BAD_MAGIC;
        if (selected == 2) revert SignatureAttackReverted();
        if (selected == 3) {
            assembly { mstore(0, shl(224, 0x1626ba7e)) return(0, 4) }
        }
        if (selected == 5) {
            // Deliberately consumes the entire forwarded cap, not a gas estimate.
            assembly { for { } 1 { } { } }
        }
        if (selected == 6) return signature.length <= 4096 ? MAGIC : BAD_MAGIC;
        if (selected == 7 || selected == 8) {
            (bool success, uint256 size, bytes32 firstWord) = _probeAttempt();
            if (success || size != 4 || bytes4(firstWord) != REENTRANT) revert UnexpectedAttackResult();
            if (selected == 8) _propagate(size, firstWord);
        }
        if (selected == 9 || selected == 10) {
            (address owner, uint256 epochValue) = IPaidAttackRegistry(registry).authority(accountId);
            if (owner != address(this) || epochValue != expectedEpoch) revert AttackConfiguration();
            (bool success, uint256 size, bytes32 firstWord) = _boundedCall(registry,
                abi.encodeWithSelector(IPaidAttackRegistry.transferFrom.selector,
                    address(this), transferRecipient, accountId));
            // Correctly configured ownership passes the registry's permission
            // checks. Its first state write must fail under propagated STATICCALL.
            if (success || size != 0) revert UnexpectedAttackResult();
            if (selected == 10) _propagate(size, firstWord);
        }
        if (!_validSigner(digest, signature)) return BAD_MAGIC;
        if (selected == 4) {
            assembly {
                let output := mload(0x40)
                mstore(output, shl(224, 0x1626ba7e))
                return(output, 65536)
            }
        }
        return MAGIC;
    }

    function _validSigner(bytes32 digest, bytes calldata signature) private view returns (bool) {
        if (signature.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if ((v != 27 && v != 28) || uint256(s) == 0 || uint256(s) > HALF_ORDER) return false;
        address recovered = ecrecover(digest, v, r, s);
        return recovered != address(0) && recovered == signer;
    }
}
