// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface ICawTokenProbe {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

/// @notice Experimental depositor-keyed custody only. No NFT or paid CAW logic.
/// This probe is for isolated execution; it is not a deployable protocol release.
contract CawCustodyProbe {
    ICawTokenProbe public constant TOKEN = ICawTokenProbe(0xf3b9569F82B18aEf890De263B84189bd33EBe452);
    mapping(address => uint256) public credits;
    uint256 public totalCredits;
    bool private entered;

    error Reentrant();
    error ZeroAmount();
    error InsufficientCredit();
    error TokenRejected();
    error UnexpectedTokenDelta();
    error Underbacked();

    event Deposited(address indexed account, uint256 amount, uint256 credit);
    event Withdrawn(address indexed account, uint256 amount, uint256 credit);

    modifier guarded() {
        if (entered) revert Reentrant();
        entered = true;
        _;
        entered = false;
    }

    function deposit(uint256 amount) external guarded {
        if (amount == 0) revert ZeroAmount();
        uint256 beforeBalance = TOKEN.balanceOf(address(this));
        if (!TOKEN.transferFrom(msg.sender, address(this), amount)) revert TokenRejected();
        uint256 afterBalance = TOKEN.balanceOf(address(this));
        if (afterBalance != beforeBalance + amount) revert UnexpectedTokenDelta();
        credits[msg.sender] += amount;
        totalCredits += amount;
        if (afterBalance < totalCredits) revert Underbacked();
        emit Deposited(msg.sender, amount, credits[msg.sender]);
    }

    function withdraw(uint256 amount) external guarded {
        if (amount == 0) revert ZeroAmount();
        if (credits[msg.sender] < amount) revert InsufficientCredit();
        uint256 beforeBalance = TOKEN.balanceOf(address(this));
        uint256 recipientBefore = TOKEN.balanceOf(msg.sender);
        credits[msg.sender] -= amount;
        totalCredits -= amount;
        if (!TOKEN.transfer(msg.sender, amount)) revert TokenRejected();
        uint256 afterBalance = TOKEN.balanceOf(address(this));
        if (afterBalance + amount != beforeBalance || TOKEN.balanceOf(msg.sender) != recipientBefore + amount) {
            revert UnexpectedTokenDelta();
        }
        if (afterBalance < totalCredits) revert Underbacked();
        emit Withdrawn(msg.sender, amount, credits[msg.sender]);
    }
}
