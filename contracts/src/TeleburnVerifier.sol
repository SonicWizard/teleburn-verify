// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TeleburnLib} from "./TeleburnLib.sol";

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title TeleburnVerifier
/// @notice Checks whether an ERC-721 token was teleburned to a specific
///         Bitcoin inscription, i.e. whether it sits at the address derived
///         from that inscription ID.
/// @dev View and pure functions only: no state, no owner, no funds.
contract TeleburnVerifier {
    error TokenQueryFailed(uint256 tokenId);
    error LengthMismatch();

    /// @param txidInternal Txid in internal byte order (reversed from display).
    function deriveAddress(bytes32 txidInternal, uint32 index)
        external
        pure
        returns (address)
    {
        return TeleburnLib.ethAddress(txidInternal, index);
    }

    /// @notice Same derivation for a txid copied as displayed in an
    ///         inscription ID or block explorer. Reverses it first.
    function deriveAddressFromDisplayTxid(bytes32 txidDisplay, uint32 index)
        external
        pure
        returns (address)
    {
        return TeleburnLib.ethAddress(TeleburnLib.reverse(txidDisplay), index);
    }

    /// @param txidInternal Txid in internal byte order (reversed from display).
    /// @dev Reverts with TokenQueryFailed if ownerOf reverts or does not
    ///      return an address: nonexistent token, no code at `collection`
    ///      (an EOA returns empty data), or a malformed return value.
    ///      A low-level call because try/catch cannot catch a failure to
    ///      decode the return data.
    function isTeleburnedTo(
        address collection,
        uint256 tokenId,
        bytes32 txidInternal,
        uint32 index
    ) public view returns (bool) {
        address expected = TeleburnLib.ethAddress(txidInternal, index);
        (bool ok, bytes memory ret) =
            collection.staticcall(abi.encodeCall(IERC721.ownerOf, (tokenId)));
        if (!ok || ret.length < 32) revert TokenQueryFailed(tokenId);
        uint256 word = abi.decode(ret, (uint256));
        if (word >> 160 != 0) revert TokenQueryFailed(tokenId);
        return address(uint160(word)) == expected;
    }

    function isTeleburnedToBatch(
        address collection,
        uint256[] calldata tokenIds,
        bytes32[] calldata txids,
        uint32[] calldata indices
    ) external view returns (bool[] memory out) {
        uint256 n = tokenIds.length;
        if (n != txids.length || n != indices.length) revert LengthMismatch();
        out = new bool[](n);
        for (uint256 i; i < n; ++i) {
            out[i] =
                isTeleburnedTo(collection, tokenIds[i], txids[i], indices[i]);
        }
    }
}
