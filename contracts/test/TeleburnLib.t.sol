// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TeleburnLib} from "../src/TeleburnLib.sol";
import {TeleburnVerifier} from "../src/TeleburnVerifier.sol";

contract MockERC721 {
    mapping(uint256 => address) public owners;

    function mint(address to, uint256 tokenId) external {
        owners[tokenId] = to;
    }

    function ownerOf(uint256 tokenId) external view returns (address owner) {
        owner = owners[tokenId];
        require(owner != address(0), "nonexistent token");
    }
}

/// Answers every call, including ownerOf, with empty return data.
contract EmptyReturn {
    fallback() external {}
}

/// ownerOf returns a word with bits set above the low 160, so not an address.
contract DirtyOwner {
    function ownerOf(uint256) external pure returns (uint256) {
        return type(uint256).max;
    }
}

contract TeleburnLibTest is Test {
    // Ordinal Theory Handbook vector: inscription zero, teleburned rodarmor.eth.
    bytes32 constant HANDBOOK_TXID_DISPLAY =
        0x6fb976ab49dcec017f1e201e84395983204ae1a7c2abf7ced0a85d692e442799;
    address constant HANDBOOK_EXPECTED =
        0xe43A06530BdF8A4e067581f48Fae3b535559dA9e;
    // What the display-order txid derives to. Plausible-looking and wrong.
    address constant DISPLAY_ORDER_WRONG =
        0x1C111aD24611f7e874CD9A700Ff1f08f6C8CB0ef;

    // Field order must be alphabetical to match vm.parseJson decoding.
    struct Vector {
        address expected;
        uint256 index;
        string inscriptionId;
        bytes32 txidDisplay;
        bytes32 txidInternal;
    }

    TeleburnVerifier verifier;
    MockERC721 nft;

    function setUp() public {
        verifier = new TeleburnVerifier();
        nft = new MockERC721();
    }

    function test_HandbookVector() public pure {
        bytes32 internalTxid = TeleburnLib.reverse(HANDBOOK_TXID_DISPLAY);
        assertEq(TeleburnLib.ethAddress(internalTxid, 0), HANDBOOK_EXPECTED);
    }

    /// Guards the reversal. If someone "fixes" it by feeding the displayed
    /// txid straight in, this fails before the handbook test explains why.
    function test_DisplayOrderDerivesTheWrongAddress() public pure {
        address wrong = TeleburnLib.ethAddress(HANDBOOK_TXID_DISPLAY, 0);
        assertEq(wrong, DISPLAY_ORDER_WRONG);
        assertTrue(wrong != HANDBOOK_EXPECTED);
    }

    function test_FixtureVectors() public view {
        string memory json = vm.readFile(
            string.concat(vm.projectRoot(), "/../fixtures/vectors.json")
        );
        Vector[] memory vs =
            abi.decode(vm.parseJson(json, ".vectors"), (Vector[]));
        assertGt(vs.length, 1);
        for (uint256 i; i < vs.length; ++i) {
            Vector memory v = vs[i];
            uint32 index = uint32(v.index);
            assertEq(
                TeleburnLib.reverse(v.txidDisplay),
                v.txidInternal,
                v.inscriptionId
            );
            assertEq(
                verifier.deriveAddress(v.txidInternal, index),
                v.expected,
                v.inscriptionId
            );
            assertEq(
                verifier.deriveAddressFromDisplayTxid(v.txidDisplay, index),
                v.expected,
                v.inscriptionId
            );
        }
    }

    function testFuzz_ReverseIsAnInvolution(bytes32 x) public pure {
        assertEq(TeleburnLib.reverse(TeleburnLib.reverse(x)), x);
    }

    function testFuzz_ReverseMatchesByteLoop(bytes32 x) public pure {
        bytes memory reversed = new bytes(32);
        for (uint256 i; i < 32; ++i) {
            reversed[i] = x[31 - i];
        }
        // casting to 'bytes32' is safe because `reversed` is exactly 32 bytes
        // forge-lint: disable-next-line(unsafe-typecast)
        assertEq(TeleburnLib.reverse(x), bytes32(reversed));
    }

    function test_IsTeleburnedTo() public {
        bytes32 internalTxid = TeleburnLib.reverse(HANDBOOK_TXID_DISPLAY);
        nft.mint(HANDBOOK_EXPECTED, 1);
        nft.mint(DISPLAY_ORDER_WRONG, 2);

        assertTrue(verifier.isTeleburnedTo(address(nft), 1, internalTxid, 0));
        assertFalse(verifier.isTeleburnedTo(address(nft), 2, internalTxid, 0));
        assertFalse(verifier.isTeleburnedTo(address(nft), 1, internalTxid, 1));
    }

    function test_IsTeleburnedTo_RevertsForMissingToken() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                TeleburnVerifier.TokenQueryFailed.selector, 7
            )
        );
        verifier.isTeleburnedTo(address(nft), 7, bytes32(0), 0);
    }

    function test_IsTeleburnedTo_RevertsForNonContractCollection() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                TeleburnVerifier.TokenQueryFailed.selector, 7
            )
        );
        verifier.isTeleburnedTo(address(0xBEEF), 7, bytes32(0), 0);
    }

    function test_IsTeleburnedTo_RevertsForEmptyReturnData() public {
        address collection = address(new EmptyReturn());
        vm.expectRevert(
            abi.encodeWithSelector(
                TeleburnVerifier.TokenQueryFailed.selector, 7
            )
        );
        verifier.isTeleburnedTo(collection, 7, bytes32(0), 0);
    }

    function test_IsTeleburnedTo_RevertsForNonAddressReturn() public {
        address collection = address(new DirtyOwner());
        vm.expectRevert(
            abi.encodeWithSelector(
                TeleburnVerifier.TokenQueryFailed.selector, 7
            )
        );
        verifier.isTeleburnedTo(collection, 7, bytes32(0), 0);
    }

    function test_Batch() public {
        bytes32 internalTxid = TeleburnLib.reverse(HANDBOOK_TXID_DISPLAY);
        nft.mint(HANDBOOK_EXPECTED, 1);
        nft.mint(address(0xBEEF), 2);

        uint256[] memory ids = new uint256[](2);
        bytes32[] memory txids = new bytes32[](2);
        uint32[] memory indices = new uint32[](2);
        (ids[0], ids[1]) = (1, 2);
        (txids[0], txids[1]) = (internalTxid, internalTxid);

        bool[] memory out =
            verifier.isTeleburnedToBatch(address(nft), ids, txids, indices);
        assertTrue(out[0]);
        assertFalse(out[1]);
    }

    function test_Batch_RevertsOnLengthMismatch() public {
        vm.expectRevert(TeleburnVerifier.LengthMismatch.selector);
        verifier.isTeleburnedToBatch(
            address(nft), new uint256[](2), new bytes32[](1), new uint32[](2)
        );
    }
}
