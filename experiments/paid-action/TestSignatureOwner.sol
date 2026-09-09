// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

/// @notice Deliberately configurable signature-response fixture for local tests.
/// Anyone can change mode. This is not a wallet or production owner policy.
/// Modes 0 and 4 verify the immutable test signer. Other modes deliberately
/// return incorrect/short results or revert. Configuration emits no events.
contract TestSignatureOwner {
    address public immutable signer;
    uint8 public mode;
    uint256 private constant HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    error InvalidSigner();
    error InvalidMode();
    error SignatureFixtureReverted();

    constructor(address signerAddress) {
        if (signerAddress == address(0)) revert InvalidSigner();
        signer = signerAddress;
    }

    function configure(uint8 nextMode) external {
        if (nextMode > 4) revert InvalidMode();
        mode = nextMode;
    }

    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        uint8 selected = mode;
        if (selected == 1) return 0xffffffff;
        if (selected == 2) revert SignatureFixtureReverted();
        if (selected == 3) {
            assembly {
                mstore(0, shl(224, 0x1626ba7e))
                return(0, 4)
            }
        }
        if (signature.length != 65) return 0xffffffff;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if ((v != 27 && v != 28) || uint256(s) == 0 || uint256(s) > HALF_ORDER) return 0xffffffff;
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0) || recovered != signer) return 0xffffffff;
        if (selected == 4) {
            assembly {
                mstore(0, shl(224, 0x1626ba7e))
                mstore(32, 1)
                return(0, 64)
            }
        }
        return 0x1626ba7e;
    }
}
