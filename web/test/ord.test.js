// Cross-check against ord itself, the reference implementation of teleburn
// addresses. Skipped unless `ord` is on PATH (mise.toml pins it):
//
//     mise exec -- pnpm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { teleburnAddress, toHex } from "../src/teleburn.js";

const { vectors } = JSON.parse(
  readFileSync(new URL("../../fixtures/vectors.json", import.meta.url)),
);

function ordTeleburn(inscriptionId) {
  const out = execFileSync("ord", ["teleburn", inscriptionId], {
    encoding: "utf8",
  });
  return JSON.parse(out).ethereum;
}

let hasOrd = true;
try {
  execFileSync("ord", ["--version"], { stdio: "ignore" });
} catch {
  hasOrd = false;
}
const skip = hasOrd ? false : "ord is not installed";

test("fixture vectors match ord teleburn", { skip }, () => {
  for (const v of vectors) {
    assert.equal(
      ordTeleburn(v.inscriptionId).toLowerCase(),
      v.expected,
      v.inscriptionId,
    );
  }
});

// Exact string comparison, so this also checks the EIP-55 checksum.
test("site derivation matches ord on random IDs", { skip }, async () => {
  for (let i = 0; i < 50; i++) {
    const txid = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const [index] = crypto.getRandomValues(new Uint32Array(1));
    const id = `${txid}i${i < 5 ? i : index}`;
    assert.equal(await teleburnAddress(id), ordTeleburn(id), id);
  }
});
