// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TeleburnVerifier} from "../src/TeleburnVerifier.sol";

/// Dry run against a fork first:
///
///     forge script script/Deploy.s.sol --rpc-url $MAINNET_RPC_URL
///
/// Then broadcast and verify (needs ETHERSCAN_API_KEY). The contract has no
/// owner, so the deployer gets no privileges; it only pays gas. Sign with a
/// Trezor, or with MetaMask in the browser (forge serves a local signing page):
///
///     forge script script/Deploy.s.sol --rpc-url $MAINNET_RPC_URL \
///       --trezor --sender $DEPLOYER --broadcast --verify
///
///     forge script script/Deploy.s.sol --rpc-url $MAINNET_RPC_URL \
///       --browser --sender $DEPLOYER --broadcast --verify
contract Deploy is Script {
    function run() external returns (TeleburnVerifier verifier) {
        vm.startBroadcast();
        verifier = new TeleburnVerifier();
        vm.stopBroadcast();
        console.log("TeleburnVerifier deployed at", address(verifier));
    }
}
