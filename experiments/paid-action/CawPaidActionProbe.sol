// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IPaidCawToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface IPaidAccountRegistry {
    function authority(uint256 accountId) external view returns (address owner, uint256 currentEpoch);
}

/// @notice Original three-account experiment, not an adopted CAW protocol.
/// Fixed fees, locked stakes, account-based pool exclusion, rounding, UTF-8
/// scalar counting and time/epoch rules are explicit experimental choices.
/// Registry pins do not authenticate its initial state or external dependencies.
/// No registration, burn, admin, upgrade, delegation or dust-withdrawal path.
contract CawPaidActionProbe {
    IPaidCawToken public constant TOKEN = IPaidCawToken(0xf3b9569F82B18aEf890De263B84189bd33EBe452);
    uint256 public constant FEE = 5000 * 10 ** 18;
    uint256 public constant MAX_STAKE = type(uint256).max / FEE;
    bytes32 public constant PROFILE = keccak256("CAW_PAID_ACTION_THREE_ID_POOL_LOCKED_STAKE_UTF8_SCALARS_V1");
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("CAW Paid Action Experiment");
    bytes32 private constant VERSION_HASH = keccak256("1");
    bytes32 private constant POST_TYPEHASH = keccak256("Post(uint256 accountId,uint256 epoch,uint256 nonce,uint256 validAfter,uint256 deadline,bytes32 distributionHash,bytes32 textHash,uint256 fee,bytes32 profile)");
    uint256 private constant HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public immutable registry;
    bytes32 public immutable registryCodeHash;
    mapping(uint256 => uint256) public credits;
    mapping(uint256 => uint256) public stakes;
    mapping(uint256 => uint256) public nonces;
    uint256 public totalCredits;
    uint256 public poolDust;
    uint256 public messageCount;
    bool private entered;

    struct PostRequest {
        uint256 accountId;
        uint256 epoch;
        uint256 nonce;
        uint256 validAfter;
        uint256 deadline;
        bytes32 distributionHash;
        bytes text;
    }

    error InvalidRegistry();
    error RegistryCodeChanged();
    error InvalidAccount();
    error InvalidAuthority();
    error NotAccountOwner();
    error StaleEpoch();
    error AuthorityChanged();
    error Reentrant();
    error ZeroAmount();
    error InsufficientCredit();
    error InsufficientStake();
    error StakeLimit();
    error TokenRejected();
    error UnexpectedTokenDelta();
    error Underbacked();
    error InvalidNonce();
    error InvalidWindow();
    error DistributionChanged();
    error NoEligibleStake();
    error InvalidText();
    error InvalidSignature();

    event Deposited(uint256 indexed accountId, address indexed owner, uint256 amount, uint256 credit, uint256 epoch);
    event Withdrawn(uint256 indexed accountId, address indexed owner, uint256 amount, uint256 credit, uint256 epoch);
    event Staked(uint256 indexed accountId, address indexed owner, uint256 amount, uint256 stake, uint256 epoch);
    event Unstaked(uint256 indexed accountId, address indexed owner, uint256 amount, uint256 stake, uint256 epoch);
    event Posted(uint256 indexed messageId, uint256 indexed accountId, address indexed owner,
        uint256 epoch, uint256 nonce, bytes text, uint256 fee, bytes32 distributionHash,
        uint256 alloc1, uint256 alloc2, uint256 alloc3, uint256 dust);

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

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    /// @dev Commits the exact stakes of IDs 1, 2 and 3, including the payer's.
    function distributionHash() public view returns (bytes32) {
        return keccak256(abi.encode(stakes[1], stakes[2], stakes[3]));
    }

    /// @dev A digest is not acceptance: this helper does not check current state.
    function postDigest(PostRequest calldata request) public view returns (bytes32) {
        bytes32 body = keccak256(abi.encode(POST_TYPEHASH, request.accountId, request.epoch,
            request.nonce, request.validAfter, request.deadline, request.distributionHash,
            keccak256(request.text), FEE, PROFILE));
        return keccak256(abi.encodePacked(hex"1901", domainSeparator(), body));
    }

    function deposit(uint256 accountId, uint256 expectedEpoch, uint256 amount) external guarded {
        _move(accountId, expectedEpoch, amount, true);
    }

    function withdraw(uint256 accountId, uint256 expectedEpoch, uint256 amount) external guarded {
        _move(accountId, expectedEpoch, amount, false);
    }

    function stake(uint256 accountId, uint256 expectedEpoch, uint256 amount) external guarded {
        if (amount == 0) revert ZeroAmount();
        address owner = _directOwner(accountId, expectedEpoch);
        uint256 locked = stakes[accountId];
        if (amount > credits[accountId] - locked) revert InsufficientCredit();
        if (amount > MAX_STAKE - locked) revert StakeLimit();
        _backed();
        _recheck(accountId, owner, expectedEpoch);
        stakes[accountId] = locked + amount;
        emit Staked(accountId, owner, amount, locked + amount, expectedEpoch);
    }

    function unstake(uint256 accountId, uint256 expectedEpoch, uint256 amount) external guarded {
        if (amount == 0) revert ZeroAmount();
        address owner = _directOwner(accountId, expectedEpoch);
        if (amount > stakes[accountId]) revert InsufficientStake();
        _backed();
        _recheck(accountId, owner, expectedEpoch);
        stakes[accountId] -= amount;
        emit Unstaked(accountId, owner, amount, stakes[accountId], expectedEpoch);
    }

    /// @dev Any relayer can submit. Only exact current-owner authorization can
    /// spend; the relayer receives nothing. Nonces persist across NFT transfers.
    /// The validity interval is [validAfter, deadline), with no duration cap.
    function post(PostRequest calldata request, bytes calldata signature) external guarded {
        address owner = _ownerAt(request.accountId, request.epoch);
        if (request.nonce != nonces[request.accountId]) revert InvalidNonce();
        if (request.validAfter >= request.deadline || block.timestamp < request.validAfter || block.timestamp >= request.deadline) {
            revert InvalidWindow();
        }
        if (request.distributionHash != distributionHash()) revert DistributionChanged();
        _text(request.text);
        if (credits[request.accountId] - stakes[request.accountId] < FEE) revert InsufficientCredit();
        _signature(owner, postDigest(request), signature);
        _backed();
        _recheck(request.accountId, owner, request.epoch);
        (uint256[3] memory allocations, uint256 dust) = _allocate(request.accountId);
        nonces[request.accountId] += 1;
        messageCount += 1;
        _emitPost(request, owner, allocations, dust);
    }

    function _allocate(uint256 payer) private returns (uint256[3] memory allocations, uint256 dust) {
        uint256 eligible;
        for (uint256 id = 1; id <= 3; id++) {
            if (id != payer) eligible += stakes[id];
        }
        if (eligible == 0) revert NoEligibleStake();
        credits[payer] -= FEE;
        uint256 paid;
        for (uint256 id = 1; id <= 3; id++) {
            if (id != payer && stakes[id] != 0) {
                // MAX_STAKE bounds the multiplication; only two IDs contribute.
                uint256 amount = FEE * stakes[id] / eligible;
                allocations[id - 1] = amount;
                credits[id] += amount;
                paid += amount;
            }
        }
        dust = FEE - paid;
        poolDust += dust;
        totalCredits -= dust;
    }

    function _emitPost(PostRequest calldata request, address owner, uint256[3] memory amounts, uint256 dust) private {
        emit Posted(messageCount, request.accountId, owner, request.epoch, request.nonce,
            request.text, FEE, request.distributionHash, amounts[0], amounts[1], amounts[2], dust);
    }

    function _move(uint256 id, uint256 expectedEpoch, uint256 amount, bool incoming) private {
        if (amount == 0) revert ZeroAmount();
        address owner = _directOwner(id, expectedEpoch);
        if (!incoming && amount > credits[id] - stakes[id]) revert InsufficientCredit();
        uint256 vaultAfter;
        {
            uint256 vaultBefore = _balance(address(this));
            uint256 ownerBefore = _balance(owner);
            if (!incoming) {
                credits[id] -= amount;
                totalCredits -= amount;
            }
            _checkRegistry();
            bool accepted = incoming ? TOKEN.transferFrom(owner, address(this), amount) : TOKEN.transfer(owner, amount);
            _checkRegistry();
            if (!accepted) revert TokenRejected();
            vaultAfter = _balance(address(this));
            uint256 ownerAfter = _balance(owner);
            bool exact = incoming
                ? _increase(vaultBefore, vaultAfter, amount) && _increase(ownerAfter, ownerBefore, amount)
                : _increase(vaultAfter, vaultBefore, amount) && _increase(ownerBefore, ownerAfter, amount);
            if (!exact) revert UnexpectedTokenDelta();
        }
        _recheck(id, owner, expectedEpoch);
        if (incoming) {
            credits[id] += amount;
            totalCredits += amount;
        }
        if (vaultAfter < totalCredits + poolDust) revert Underbacked();
        if (incoming) emit Deposited(id, owner, amount, credits[id], expectedEpoch);
        else emit Withdrawn(id, owner, amount, credits[id], expectedEpoch);
    }

    function _signature(address owner, bytes32 digest, bytes calldata signature) private view {
        if (owner.code.length == 0) {
            if (signature.length != 65) revert InvalidSignature();
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                r := calldataload(signature.offset)
                s := calldataload(add(signature.offset, 32))
                v := byte(0, calldataload(add(signature.offset, 64)))
            }
            if ((v != 27 && v != 28) || uint256(s) == 0 || uint256(s) > HALF_ORDER) revert InvalidSignature();
            address recovered = ecrecover(digest, v, r, s);
            if (recovered == address(0) || recovered != owner) revert InvalidSignature();
        } else {
            if (signature.length > 4096) revert InvalidSignature();
            bytes memory payload = abi.encodeWithSelector(bytes4(0x1626ba7e), digest, signature);
            bool accepted;
            uint256 returned;
            bytes32 firstWord;
            _checkRegistry();
            // Copy only one word, even if the signature provider returns more.
            // The gas cap is an experimental compatibility/resource restriction.
            assembly {
                let output := mload(0x40)
                mstore(output, 0)
                accepted := staticcall(100000, owner, add(payload, 32), mload(payload), output, 32)
                returned := returndatasize()
                firstWord := mload(output)
            }
            _checkRegistry();
            if (!accepted || returned < 32 || bytes4(firstWord) != bytes4(0x1626ba7e)) revert InvalidSignature();
        }
    }

    /// @dev Nonempty exact UTF-8, at most 420 Unicode scalars / 1680 bytes.
    /// No normalization, trimming, case change or grapheme-count claim is made.
    function _text(bytes calldata value) private pure {
        if (value.length == 0 || value.length > 1680) revert InvalidText();
        uint256 i;
        uint256 count;
        while (i < value.length) {
            uint8 first = uint8(value[i]);
            uint256 width;
            if (first < 0x80) width = 1;
            else if (first >= 0xc2 && first <= 0xdf) width = 2;
            else if (first >= 0xe0 && first <= 0xef) width = 3;
            else if (first >= 0xf0 && first <= 0xf4) width = 4;
            else revert InvalidText();
            if (i + width > value.length) revert InvalidText();
            for (uint256 j = 1; j < width; j++) {
                uint8 next = uint8(value[i + j]);
                if (next < 0x80 || next > 0xbf) revert InvalidText();
                if (j == 1 && ((first == 0xe0 && next < 0xa0) || (first == 0xed && next > 0x9f)
                    || (first == 0xf0 && next < 0x90) || (first == 0xf4 && next > 0x8f))) revert InvalidText();
            }
            i += width;
            count += 1;
            if (count > 420) revert InvalidText();
        }
    }

    function _checkRegistry() private view {
        if (registry.codehash != registryCodeHash) revert RegistryCodeChanged();
    }

    function _ownerAt(uint256 id, uint256 expectedEpoch) private view returns (address owner) {
        if (id < 1 || id > 3) revert InvalidAccount();
        _checkRegistry();
        uint256 epoch;
        (owner, epoch) = IPaidAccountRegistry(registry).authority(id);
        _checkRegistry();
        if (owner == address(0)) revert InvalidAuthority();
        if (epoch != expectedEpoch) revert StaleEpoch();
    }

    function _directOwner(uint256 id, uint256 expectedEpoch) private view returns (address owner) {
        owner = _ownerAt(id, expectedEpoch);
        if (owner != msg.sender) revert NotAccountOwner();
    }

    function _recheck(uint256 id, address owner, uint256 epoch) private view {
        _checkRegistry();
        (address nowOwner, uint256 nowEpoch) = IPaidAccountRegistry(registry).authority(id);
        _checkRegistry();
        if (nowOwner != owner || nowEpoch != epoch) revert AuthorityChanged();
    }

    function _balance(address owner) private view returns (uint256 amount) {
        _checkRegistry();
        amount = TOKEN.balanceOf(owner);
        _checkRegistry();
    }

    function _backed() private view {
        if (_balance(address(this)) < totalCredits + poolDust) revert Underbacked();
    }

    function _increase(uint256 beforeValue, uint256 afterValue, uint256 amount) private pure returns (bool) {
        return afterValue >= beforeValue && afterValue - beforeValue == amount;
    }
}
