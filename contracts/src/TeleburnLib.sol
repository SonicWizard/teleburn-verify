// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TeleburnLib
/// @notice Derives the Ethereum teleburn address for a Bitcoin inscription,
///         per the Ordinal Theory Handbook: the first 20 bytes of the SHA-256
///         of the 36-byte serialized inscription ID (32-byte txid followed by
///         a 4-byte big-endian inscription index).
/// @dev The txid must be in Bitcoin's INTERNAL byte order, which is the
///      reverse of the hex shown in an inscription ID or a block explorer.
///      Feeding the displayed hex in unchanged yields a wrong address that
///      looks perfectly valid.
library TeleburnLib {
    /// @param txidInternal Bitcoin txid in internal byte order.
    /// @param index Inscription index (the digits after the `i`).
    function ethAddress(bytes32 txidInternal, uint32 index)
        internal
        pure
        returns (address)
    {
        // abi.encodePacked(bytes32, uint32) is exactly 36 bytes, index
        // big-endian. SHA-256 is precompile 0x02. >> 96 keeps the leading
        // 20 bytes of the digest.
        return address(
            uint160(
                uint256(sha256(abi.encodePacked(txidInternal, index))) >> 96
            )
        );
    }

    /// @notice Reverses the byte order of a 32-byte word, converting a
    ///         display-order txid to internal order (and back).
    function reverse(bytes32 x) internal pure returns (bytes32 r) {
        for (uint256 i = 0; i < 32; i++) {
            r |= bytes32(uint256(uint8(x[i])) << (8 * i));
        }
    }
}
