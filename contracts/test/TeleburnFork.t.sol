// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TeleburnVerifier} from "../src/TeleburnVerifier.sol";

interface IGenesisTeleburn {
    function isTokenTeleburned(uint256 tokenId) external view returns (bool);
}

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

    // OCM Genesis and OCM's current teleburn contract, which records every
    // teleburn. Bindings below are from indexer/data/ocm-genesis.json.
    address constant OCM_GENESIS = 0x960b7a6BCD451c9968473f7bbFd9Be826EFd549A;
    IGenesisTeleburn constant OCM_TELEBURN =
        IGenesisTeleburn(0x1c359d3954812E39489eb0D887757aDaBb12E6D8);
    // The mainnet deployment, so these tests cover the live contract rather
    // than a fresh build.
    TeleburnVerifier constant DEPLOYED =
        TeleburnVerifier(0x58b0acCf5C68E99fA0424c0A30EAA1a6BfeaBDdC);

    // Tokens 1543 and 1589 share a reveal transaction and differ only in the
    // inscription index.
    bytes32 constant TXID_1543_1589 =
        0xc726edd377fd9119e84f34b37a7cb04338b157e362df6c0eccfa1ccd8add83de;
    bytes32 constant TXID_1 =
        0xaee19104849c553aff97e0d0006e5e6a8b6173ee0be8f734ff80c45e122cf7a2;

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

    /// A sample across both OCM teleburn contracts: the first and last token
    /// ids, the three from the original contract (1003, 1543, 1589), and the
    /// first teleburn through the current one (521).
    function test_OcmGenesisTokensAreTeleburnedToTheirInscriptions()
        public
        view
    {
        assertGt(address(DEPLOYED).code.length, 0);

        uint256[] memory ids = new uint256[](6);
        bytes32[] memory txids = new bytes32[](6);
        uint32[] memory indices = new uint32[](6);
        (ids[0], txids[0], indices[0]) = (1, TXID_1, 0);
        (ids[1], txids[1], indices[1]) =
        (
            521,
            0x0d28b31571eeabb20928c19fd1d191a7b8062c0d5673e35a6885d88f4d9427ae,
            57
        );
        (ids[2], txids[2], indices[2]) =
        (
            1003,
            0xfe6c099cd5979be25f3454852247af92dd53406beb9ce584c69db80f5cb68120,
            3
        );
        (ids[3], txids[3], indices[3]) = (1543, TXID_1543_1589, 123);
        (ids[4], txids[4], indices[4]) = (1589, TXID_1543_1589, 261);
        (ids[5], txids[5], indices[5]) =
        (
            10000,
            0x37f7fdb731551b5d4e6e074c0d78e4c3c247e8e5462c57cf49fed46f736b6239,
            747
        );

        bool[] memory held =
            DEPLOYED.isTeleburnedToBatch(OCM_GENESIS, ids, txids, indices);
        for (uint256 i; i < ids.length; ++i) {
            assertTrue(held[i], vm.toString(ids[i]));
            // OCM's own record agrees.
            assertTrue(OCM_TELEBURN.isTokenTeleburned(ids[i]));
        }
    }

    /// The right txid with the wrong index is a different address.
    function test_OcmGenesisSwappedIndexIsNotTeleburned() public view {
        assertFalse(
            DEPLOYED.isTeleburnedTo(OCM_GENESIS, 1543, TXID_1543_1589, 261)
        );
        assertFalse(
            DEPLOYED.isTeleburnedTo(OCM_GENESIS, 1589, TXID_1543_1589, 123)
        );
    }

    /// The display-order txid (the byte-order trap) does not match.
    function test_OcmGenesisDisplayOrderTxidIsNotTeleburned() public view {
        assertFalse(
            DEPLOYED.isTeleburnedTo(
                OCM_GENESIS,
                1,
                0xa2f72c125ec480ff34f7e80bee73618b6a5e6e00d0e097ff3a559c840491e1ae,
                0
            )
        );
    }

    /// Token 21 was not teleburned at indexing time. Whatever happens to it
    /// later, it cannot be held by token 1's teleburn address.
    function test_OcmGenesisOtherTokenIsNotTeleburnedToThatInscription()
        public
        view
    {
        assertFalse(DEPLOYED.isTeleburnedTo(OCM_GENESIS, 21, TXID_1, 0));
    }
}
