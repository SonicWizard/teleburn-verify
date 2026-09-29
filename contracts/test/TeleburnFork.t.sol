// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TeleburnVerifier} from "../src/TeleburnVerifier.sol";

/// Live check against Ethereum mainnet. Skipped unless MAINNET_RPC_URL is set:
///
///     MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com forge test --mc Fork
contract TeleburnForkTest is Test {
    // ENS .eth BaseRegistrar. Token id is uint256(keccak256(label)).
    address constant ENS_BASE_REGISTRAR =
        0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85;
    // Inscription zero, internal byte order (reversed from the displayed id).
    bytes32 constant INSCRIPTION_ZERO_TXID_INTERNAL =
        0x9927442e695da8d0cef7abc2a7e14a20835939841e201e7f01ecdc49ab76b96f;

    TeleburnVerifier verifier;

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        verifier = new TeleburnVerifier();
    }

    /// rodarmor.eth was teleburned to inscription zero, so the registrar NFT
    /// for "rodarmor" is owned by the derived address on mainnet.
    function test_RodarmorEthIsTeleburnedToInscriptionZero() public view {
        uint256 tokenId = uint256(keccak256("rodarmor"));
        assertTrue(
            verifier.isTeleburnedTo(
                ENS_BASE_REGISTRAR, tokenId, INSCRIPTION_ZERO_TXID_INTERNAL, 0
            )
        );
    }
}
