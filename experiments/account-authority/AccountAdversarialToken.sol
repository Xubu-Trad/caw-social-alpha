// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

/// @notice ORIGINAL SYNTHETIC TEST FIXTURE ONLY. Not CAW and not production code.
/// Anyone can change balances and behavior through the harness-only controls.
/// Install only in a distinct empty local chain, never in real-token evidence.
/// No constructor or immutable state is required when installing this runtime.
contract AccountAdversarialToken {
    uint8 public constant HONEST = 0;
    uint8 public constant FALSE_AFTER_MOVE = 1;
    uint8 public constant REVERT_AFTER_MOVE = 2;
    uint8 public constant SHORT_RETURN = 3;
    uint8 public constant EMPTY_RETURN = 4;
    uint8 public constant INVALID_BOOL = 5;
    uint8 public constant TRAILING_WORD = 6;
    uint8 public constant INCOMING_SHORT = 7;
    uint8 public constant OUTGOING_EXTRA_DEBIT = 8;
    uint8 public constant OUTGOING_SHORT_CREDIT = 9;
    uint8 public constant INCOMING_SENDER_FEE = 10;
    uint8 public constant CALLBACK = 11;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;
    uint8 public incomingMode;
    uint8 public outgoingMode;

    address public callbackTarget;
    bool public callbackUseWithdraw;
    bool public callbackPropagate;
    uint256 public callbackAttempts;
    bool public lastCallbackSuccess;
    bytes4 public lastCallbackError;
    uint256 public lastCallbackReturnLength;
    bool private callbackActive;

    error FixtureMode();
    error FixtureBalance();
    error FixtureAllowance();
    error FixtureTransferReverted();
    error FixtureCallbackUnset();

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    /// @dev Harness control: changes actual synthetic holdings and their supply.
    function setBalance(address account, uint256 amount) external {
        uint256 previous = balanceOf[account];
        if (amount >= previous) totalSupply += amount - previous;
        else totalSupply -= previous - amount;
        balanceOf[account] = amount;
    }

    /// @dev transferFrom uses incoming; transfer uses outgoing. This distinction
    /// is an explicit fixture assumption, not automatic detection of a vault.
    function setMode(uint8 incoming, uint8 outgoing) external {
        if (incoming > CALLBACK || outgoing > CALLBACK ||
            incoming == OUTGOING_EXTRA_DEBIT || incoming == OUTGOING_SHORT_CREDIT ||
            outgoing == INCOMING_SHORT || outgoing == INCOMING_SENDER_FEE) {
            revert FixtureMode();
        }
        incomingMode = incoming;
        outgoingMode = outgoing;
    }

    /// @dev Harness control. A zero target disables configuration. The callback
    /// makes exactly deposit(1) or withdraw(1), with a 150,000-gas ceiling.
    /// Telemetry resets here and rolls back if the outer probe call reverts.
    function configureCallback(address target, bool useWithdraw, bool propagate) external {
        callbackTarget = target;
        callbackUseWithdraw = useWithdraw;
        callbackPropagate = propagate;
        callbackAttempts = 0;
        lastCallbackSuccess = false;
        lastCallbackError = bytes4(0);
        lastCallbackReturnLength = 0;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        uint8 mode = outgoingMode;
        _move(msg.sender, recipient, amount, mode);
        return _finish(mode);
    }

    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool) {
        uint256 available = allowance[sender][msg.sender];
        if (available < amount) revert FixtureAllowance();
        // Deliberately finite even for uint256.max; this is fixture behavior.
        allowance[sender][msg.sender] = available - amount;
        emit Approval(sender, msg.sender, available - amount);
        uint8 mode = incomingMode;
        _move(sender, recipient, amount, mode);
        return _finish(mode);
    }

    function _move(address sender, address recipient, uint256 amount, uint8 mode) private {
        uint256 debit = amount;
        uint256 credit = amount;
        if (mode == INCOMING_SHORT || mode == OUTGOING_SHORT_CREDIT) {
            credit = amount == 0 ? 0 : amount - 1;
        }
        if (mode == OUTGOING_EXTRA_DEBIT || mode == INCOMING_SENDER_FEE) {
            debit = amount + 1;
        }
        if (balanceOf[sender] < debit) revert FixtureBalance();
        balanceOf[sender] -= debit;
        balanceOf[recipient] += credit;
        emit Transfer(sender, recipient, credit);
        uint256 burned = debit - credit;
        if (burned != 0) {
            totalSupply -= burned;
            emit Transfer(sender, address(0), burned);
        }
    }

    function _finish(uint8 mode) private returns (bool) {
        // Each hostile response occurs AFTER tentative token/allowance effects.
        // A rejecting outer probe call must undo those effects and their logs.
        if (mode == FALSE_AFTER_MOVE) return false;
        if (mode == REVERT_AFTER_MOVE) revert FixtureTransferReverted();
        if (mode == SHORT_RETURN) {
            assembly { mstore(0, 1) return(31, 1) }
        }
        if (mode == EMPTY_RETURN) {
            assembly { return(0, 0) }
        }
        if (mode == INVALID_BOOL) {
            assembly { mstore(0, 2) return(0, 32) }
        }
        if (mode == TRAILING_WORD) {
            // Compatibility observation: valid bool first, extra word second.
            // Do not describe compiler acceptance as strict 32-byte decoding.
            assembly { mstore(0, 1) mstore(32, 0xfeed) return(0, 64) }
        }
        if (mode == CALLBACK && !callbackActive) _callback();
        return true;
    }

    function _callback() private {
        if (callbackTarget == address(0)) revert FixtureCallbackUnset();
        callbackActive = true;
        callbackAttempts += 1;
        bytes4 entrypoint = callbackUseWithdraw ? bytes4(0x2e1a7d4d) : bytes4(0xb6b55f25);
        (bool success, bytes memory returned) = callbackTarget.call{gas: 150000}(
            abi.encodeWithSelector(entrypoint, uint256(1))
        );
        callbackActive = false;
        lastCallbackSuccess = success;
        lastCallbackReturnLength = returned.length;
        bytes4 errorSelector;
        if (!success && returned.length >= 4) {
            assembly { errorSelector := mload(add(returned, 32)) }
        }
        lastCallbackError = errorSelector;
        if (!success && callbackPropagate) {
            // Preserve exact bounded callback revert bytes for the harness.
            assembly { revert(add(returned, 32), mload(returned)) }
        }
    }
}
