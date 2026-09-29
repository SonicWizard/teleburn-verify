// Just enough ABI encoding and decoding for the indexer: the two OCM Teleburn
// events, and TeleburnVerifier.isTeleburnedToBatch. Hex strings in and out,
// no dependencies.

const WORD = 64; // hex characters per 32-byte word

function words(hex) {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (body.length % WORD !== 0) throw new Error("ABI data is not whole words");
  return body;
}

function word(body, i) {
  const w = body.slice(i * WORD, (i + 1) * WORD);
  if (w.length !== WORD) throw new Error(`ABI data too short for word ${i}`);
  return w;
}

function toAddress(w) {
  if (!/^0{24}/.test(w)) throw new Error(`not an address word: ${w}`);
  return "0x" + w.slice(24);
}

function toSafeNumber(w) {
  const n = BigInt("0x" + w);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`too large: ${n}`);
  return Number(n);
}

function toString(body, offsetWord) {
  const start = toSafeNumber(offsetWord) * 2;
  if (start % WORD !== 0) throw new Error("misaligned string offset");
  const len = toSafeNumber(word(body, start / WORD));
  const bytes = body.slice(start + WORD, start + WORD + len * 2);
  if (bytes.length !== len * 2) throw new Error("string runs past the data");
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.from(bytes, "hex"),
  );
}

/**
 * Decode the non-indexed part of a Teleburn event:
 *   (address sender, address teleburnAddress, string btcAddress,
 *    string inscriptionId[, uint256 sat])
 * The original OCM contract appends `sat`; the current one does not.
 */
export function decodeTeleburnData(hex, { withSat = false } = {}) {
  const body = words(hex);
  const out = {
    sender: toAddress(word(body, 0)),
    teleburnAddress: toAddress(word(body, 1)),
    btcAddress: toString(body, word(body, 2)),
    inscriptionId: toString(body, word(body, 3)),
  };
  if (withSat) out.sat = toSafeNumber(word(body, 4));
  return out;
}

export function topicToNumber(topic) {
  return toSafeNumber(words(topic));
}

function pad(hex) {
  return hex.padStart(WORD, "0");
}

function encodeArray(items) {
  return pad(items.length.toString(16)) + items.map(pad).join("");
}

/** isTeleburnedToBatch(address,uint256[],bytes32[],uint32[]) */
export const IS_TELEBURNED_TO_BATCH = "0x2f83d550";

/**
 * @param collection 0x-prefixed address
 * @param rows [{ tokenId: number, txidInternal: Uint8Array(32), index: number }]
 */
export function encodeIsTeleburnedToBatch(collection, rows) {
  const ids = encodeArray(rows.map((r) => r.tokenId.toString(16)));
  const txids = encodeArray(
    rows.map((r) => Buffer.from(r.txidInternal).toString("hex")),
  );
  const indices = encodeArray(rows.map((r) => r.index.toString(16)));
  // Head: address, then offsets (in bytes) to each of the three arrays.
  const head = 4 * 32;
  const offsets = [
    head,
    head + ids.length / 2,
    head + (ids.length + txids.length) / 2,
  ];
  return (
    IS_TELEBURNED_TO_BATCH +
    pad(collection.slice(2).toLowerCase()) +
    offsets.map((o) => pad(o.toString(16))).join("") +
    ids +
    txids +
    indices
  );
}

/** Decode a returned bool[]. */
export function decodeBoolArray(hex) {
  const body = words(hex);
  const start = toSafeNumber(word(body, 0)) / 32;
  const n = toSafeNumber(word(body, start));
  const out = [];
  for (let i = 0; i < n; i++) {
    const w = BigInt("0x" + word(body, start + 1 + i));
    if (w > 1n) throw new Error(`not a bool: ${w}`);
    out.push(w === 1n);
  }
  return out;
}
