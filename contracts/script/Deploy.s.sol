// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TeleburnVerifier} from "../src/TeleburnVerifier.sol";

/// Dry run against a fork first:
///
///     forge script script/Deploy.s.sol --rpc-url $MAINNET_RPC_URL
///
/// Then broadcast and verify with a hardware wallet:
///
///     forge script script/Deploy.s.sol --rpc-url $MAINNET_RPC_URL \
///       --ledger --broadcast --verify
contract Deploy is Script {
    function run() external returns (TeleburnVerifier verifier) {
        vm.startBroadcast();
        verifier = new TeleburnVerifier();
        vm.stopBroadcast();
        console.log("TeleburnVerifier deployed at", address(verifier));
    }
}
