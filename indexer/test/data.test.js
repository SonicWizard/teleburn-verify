import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { teleburnAddress } from "../../web/src/teleburn.js";

// Offline checks on the committed index. The on-chain checks (event count,
// current holder) run when it is generated; these catch hand edits and
// regressions in the file itself.
const index = JSON.parse(
  readFileSync(new URL("../data/ocm-genesis.json", import.meta.url)),
);

test("header matches the tokens", () => {
  const ids = Object.keys(index.tokens).map(Number);
  assert.equal(index.count, ids.length);
  assert.ok(ids.every((id) => Number.isInteger(id) && id >= 1 && id <= 10000));
});

test("every teleburn address derives from its inscription ID", async () => {
  for (const [id, t] of Object.entries(index.tokens)) {
    assert.equal(await teleburnAddress(t.inscriptionId), t.teleburnAddress, id);
  }
});

test("matches the first current-contract event, decoded separately", () => {
  assert.deepEqual(index.tokens["521"], {
    inscriptionId:
      "ae27944d8fd885685ae373560d2c06b8a791d1d19fc12809b2abee7115b3280di57",
    teleburnAddress: "0x2e971f2f071d2F4a56D6cd43276ae8B5790f627A",
    tx: "0x9c61f4d5693be748462b42ca31f2015348a1e3524c7594c12b3d4ec80695796b",
    block: 18673093,
  });
});
