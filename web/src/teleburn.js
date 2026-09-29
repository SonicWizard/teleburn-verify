// Teleburn address derivation, per the Ordinal Theory Handbook: the first 20
// bytes of the SHA-256 of the 36-byte serialized inscription ID (32-byte txid
// in Bitcoin's internal byte order, then a 4-byte big-endian index).
//
// Must stay in step with contracts/src/TeleburnLib.sol. Both are tested
// against fixtures/vectors.json.

import { keccak_256 } from "@noble/hashes/sha3.js";

// Word boundaries so a 65-character txid or a trailing typo is rejected
// rather than trimmed to something that parses. The index is canonical, as
// ord prints it: no leading zeros.
const INSCRIPTION_ID = /\b([0-9a-f]{64})i(0|[1-9]\d*)\b/gi;

/**
 * Pull an inscription ID out of user input. Accepts a bare ID or a URL that
 * contains one (ordinals.com, Magic Eden, and so on).
 */
export function parseInscriptionId(input) {
  const matches = [...String(input).trim().matchAll(INSCRIPTION_ID)];
  if (matches.length === 0) {
    throw new Error(
      "That isn't an inscription ID. Expected 64 hex characters, then i, then the index.",
    );
  }
  if (matches.length > 1) {
    throw new Error("That contains more than one inscription ID. Paste one.");
  }

  const [, txidHex, indexStr] = matches[0];
  const index = Number(indexStr);
  if (!Number.isSafeInteger(index) || index > 0xffffffff) {
    throw new Error("Inscription index is out of range (max 4294967295).");
  }
  return {
    inscriptionId: `${txidHex.toLowerCase()}i${index}`,
    txidDisplay: txidHex.toLowerCase(),
    index,
  };
}

/** Display-order txid hex to internal-order bytes (reversed). */
export function txidToInternal(txidDisplayHex) {
  const bytes = Uint8Array.from(
    txidDisplayHex.match(/../g).map((h) => parseInt(h, 16)),
  );
  return bytes.reverse();
}

export async function teleburnAddress(inscriptionId) {
  const { txidDisplay, index } = parseInscriptionId(inscriptionId);

  const preimage = new Uint8Array(36);
  preimage.set(txidToInternal(txidDisplay), 0); // internal byte order
  new DataView(preimage.buffer).setUint32(32, index, false); // big-endian

  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", preimage),
  );
  return toChecksumAddress(digest.slice(0, 20));
}

export function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** EIP-55 mixed-case checksum encoding. */
export function toChecksumAddress(bytes20) {
  const lower = toHex(bytes20);
  const hash = keccak_256(new TextEncoder().encode(lower));
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    const nibble = (hash[i >> 1] >> (i % 2 ? 0 : 4)) & 0xf;
    out += nibble >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}
