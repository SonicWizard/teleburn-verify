import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseInscriptionId,
  teleburnAddress,
  toChecksumAddress,
  txidToInternal,
  toHex,
} from "../src/teleburn.js";

const { vectors } = JSON.parse(
  readFileSync(new URL("../../fixtures/vectors.json", import.meta.url)),
);

const INSCRIPTION_ZERO =
  "6fb976ab49dcec017f1e201e84395983204ae1a7c2abf7ced0a85d692e442799i0";

test("handbook vector derives the checksummed ord teleburn address", async () => {
  assert.equal(
    await teleburnAddress(INSCRIPTION_ZERO),
    "0xe43A06530BdF8A4e067581f48Fae3b535559dA9e",
  );
});

test("display-order txid gives the wrong address", async () => {
  const txid = INSCRIPTION_ZERO.slice(0, 64);
  const preimage = new Uint8Array(36);
  preimage.set(Buffer.from(txid, "hex"), 0);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", preimage),
  );
  assert.equal(
    "0x" + toHex(digest.slice(0, 20)),
    "0x1c111ad24611f7e874cd9a700ff1f08f6c8cb0ef",
  );
});

test("matches every fixture vector", async () => {
  assert.ok(vectors.length > 1);
  for (const v of vectors) {
    assert.equal(
      "0x" + toHex(txidToInternal(v.txidDisplay.slice(2))),
      v.txidInternal,
    );
    const derived = await teleburnAddress(v.inscriptionId);
    assert.equal(derived.toLowerCase(), v.expected, v.inscriptionId);
  }
});

test("EIP-55 checksum matches the spec's reference vectors", () => {
  // From the EIP-55 specification.
  for (const addr of [
    "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
    "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
    "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
  ]) {
    assert.equal(toChecksumAddress(Buffer.from(addr.slice(2), "hex")), addr);
  }
});

test("accepts an ID inside a URL and normalizes case", () => {
  const upper = INSCRIPTION_ZERO.toUpperCase().replace("I", "i");
  assert.equal(
    parseInscriptionId(`https://ordinals.com/inscription/${upper}`)
      .inscriptionId,
    INSCRIPTION_ZERO,
  );
});

test("rejects bad input", () => {
  assert.throws(
    () => parseInscriptionId("not an id"),
    /isn't an inscription ID/,
  );
  assert.throws(
    () => parseInscriptionId(`${INSCRIPTION_ZERO.slice(0, 64)}i4294967296`),
    /out of range/,
  );
  assert.throws(
    () => parseInscriptionId(`${INSCRIPTION_ZERO} ${INSCRIPTION_ZERO}`),
    /more than one/,
  );
});

test("rejects malformed IDs instead of trimming them to a valid one", () => {
  const txid = INSCRIPTION_ZERO.slice(0, 64);
  for (const input of [
    `a${INSCRIPTION_ZERO}`, // 65-character txid
    `${txid.slice(1)}i0`, // 63-character txid
    `${INSCRIPTION_ZERO}x`, // trailing junk on the index
    `${txid}i007`, // non-canonical index
    `${txid}i`, // missing index
  ]) {
    assert.throws(
      () => parseInscriptionId(input),
      /isn't an inscription ID/,
      input,
    );
  }
});

test("accepts an ID followed by URL punctuation", () => {
  for (const suffix of ["/", "?preview=1", "#top", ".", ")"]) {
    assert.equal(
      parseInscriptionId(
        `https://ordinals.com/inscription/${INSCRIPTION_ZERO}${suffix}`,
      ).inscriptionId,
      INSCRIPTION_ZERO,
    );
  }
});
