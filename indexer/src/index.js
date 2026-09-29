// Builds data/ocm-genesis.json: every OCM Genesis token teleburned to
// Bitcoin, and the inscription it is bound to.
//
// OCM's teleburn contracts take the teleburn address from the caller (signed
// off by OCM's server) rather than deriving it, so nothing in their events is
// trusted as-is. For each Teleburn event this:
//
//   1. re-derives the address from the inscription ID (web/src/teleburn.js,
//      the same code the site runs and CI checks against ord), and requires
//      it to equal the address the token was sent to;
//   2. requires the event count to equal OCM's own teleburnedCount, so
//      events an RPC silently drops fail the run;
//   3. checks through the deployed TeleburnVerifier that each token is held
//      by its derived address at the snapshot block.
//
// Usage (after `pnpm install` in web/):
//
//     node src/index.js     # or MAINNET_RPC_URL=<your RPC> node src/index.js

import { writeFileSync } from "node:fs";
import {
  parseInscriptionId,
  teleburnAddress,
  txidToInternal,
} from "../../web/src/teleburn.js";
import {
  decodeBoolArray,
  decodeTeleburnData,
  encodeIsTeleburnedToBatch,
  topicToNumber,
} from "./abi.js";

// Needs eth_getLogs over the full history. Of the keyless public RPCs tried,
// MEV Blocker's is the one that serves it in usable ranges; others cap the
// range at 10-10,000 blocks, want a key for old blocks, or (Flashbots)
// return an empty list for a range that has events. The teleburnedCount
// check below catches a provider that drops logs.
const RPC_URL = process.env.MAINNET_RPC_URL || "https://rpc.mevblocker.io";

const COLLECTION = "0x960b7a6bcd451c9968473f7bbfd9be826efd549a";
const VERIFIER = "0x58b0acCf5C68E99fA0424c0A30EAA1a6BfeaBDdC";

const SOURCES = [
  {
    // Original GenesisTeleburn. Three teleburns (tokens 1003, 1543, 1589)
    // before it was replaced. Its event has a trailing `uint256 sat`.
    address: "0x27Cb33476bf69E025927a07b6732Cdfd8f7618E4",
    fromBlock: 18636817,
    // Teleburn(uint256,address,address,string,string,uint256)
    topic0:
      "0x8e1008309d9f0b6ae2e033d05bfb3fc38037c2001043acbf6ab10af38bb1ca0c",
    withSat: true,
  },
  {
    // Current GenesisTeleburn. Its constructor seeds teleburnedCount with the
    // original contract's three tokens.
    address: "0x1c359d3954812E39489eb0D887757aDaBb12E6D8",
    fromBlock: 18672967,
    // Teleburn(uint256,address,address,string,string)
    topic0:
      "0xc05eba7c5eeb227a4a8f4cfa3302be3ec8ff2d5a33962794b2c80008e030d6b3",
    withSat: false,
  },
];
const COUNT_SOURCE = SOURCES[1].address;
const TELEBURNED_COUNT = "0x2d47c3da"; // teleburnedCount()

const BATCH_SIZE = 200;
const OUT = new URL("../data/ocm-genesis.json", import.meta.url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, init, attempts = 6) {
  for (let i = 1; ; i++) {
    let retryAfter = 0;
    try {
      const res = await fetch(url, init);
      if (res.ok) return await res.json();
      retryAfter = Number(res.headers.get("retry-after")) * 1000 || 0;
      const err = new Error(`HTTP ${res.status} from ${url}`);
      // Other 4xx (dRPC answers an oversized log range with a 400) won't
      // improve on retry.
      err.final = res.status < 500 && res.status !== 429;
      throw err;
    } catch (err) {
      if (err.final || i >= attempts) throw err;
      await sleep(Math.max(retryAfter, 1000 * 2 ** i));
    }
  }
}

let rpcId = 0;
async function rpc(method, params) {
  const body = await fetchJson(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (body.error) {
    throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  }
  return body.result;
}

/**
 * All logs for one source up to `toBlock`. Providers cap eth_getLogs by
 * block range or result size, and say so differently, so any error halves
 * the window and a success grows it back.
 */
async function fetchLogs(source, toBlock) {
  const logs = [];
  let span = 100_000;
  for (let from = source.fromBlock; from <= toBlock;) {
    const to = Math.min(from + span - 1, toBlock);
    let page;
    try {
      page = await rpc("eth_getLogs", [
        {
          address: source.address,
          topics: [source.topic0],
          fromBlock: "0x" + from.toString(16),
          toBlock: "0x" + to.toString(16),
        },
      ]);
    } catch (err) {
      if (span === 1) throw err;
      span = Math.ceil(span / 2);
      continue;
    }
    logs.push(...page);
    from = to + 1;
    span = Math.min(span * 2, 1_000_000);
  }
  return logs;
}

async function main() {
  // Finalized, so a reorg can't change the snapshot after it is written.
  const snapshot = parseInt(
    (await rpc("eth_getBlockByNumber", ["finalized", false])).number,
    16,
  );
  const blockTag = "0x" + snapshot.toString(16);
  console.log(`snapshot block ${snapshot}`);

  const bindings = new Map();
  for (const source of SOURCES) {
    const logs = await fetchLogs(source, snapshot);
    console.log(`${source.address}: ${logs.length} Teleburn events`);
    for (const log of logs) {
      if (log.topics[0] !== source.topic0) throw new Error("wrong topic0");
      const tokenId = topicToNumber(log.topics[1]);
      const ev = decodeTeleburnData(log.data, { withSat: source.withSat });

      const { inscriptionId } = parseInscriptionId(ev.inscriptionId);
      if (inscriptionId !== ev.inscriptionId) {
        throw new Error(`token ${tokenId}: non-canonical ${ev.inscriptionId}`);
      }
      const derived = await teleburnAddress(inscriptionId);
      if (derived.toLowerCase() !== ev.teleburnAddress) {
        throw new Error(
          `token ${tokenId}: sent to ${ev.teleburnAddress}, but ` +
            `${inscriptionId} derives ${derived}`,
        );
      }
      if (bindings.has(tokenId)) {
        throw new Error(`token ${tokenId} teleburned twice`);
      }
      bindings.set(tokenId, {
        inscriptionId,
        teleburnAddress: derived,
        tx: log.transactionHash,
        block: parseInt(log.blockNumber, 16),
      });
    }
  }

  const count = parseInt(
    await rpc("eth_call", [
      { to: COUNT_SOURCE, data: TELEBURNED_COUNT },
      blockTag,
    ]),
    16,
  );
  if (count !== bindings.size) {
    throw new Error(
      `teleburnedCount is ${count}, found ${bindings.size} events`,
    );
  }

  const ids = [...bindings.keys()].sort((a, b) => a - b);
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const rows = chunk.map((tokenId) => {
      const { txidDisplay, index } = parseInscriptionId(
        bindings.get(tokenId).inscriptionId,
      );
      return { tokenId, txidInternal: txidToInternal(txidDisplay), index };
    });
    const data = encodeIsTeleburnedToBatch(COLLECTION, rows);
    const held = decodeBoolArray(
      await rpc("eth_call", [{ to: VERIFIER, data }, blockTag]),
    );
    const moved = chunk.filter((_, j) => !held[j]);
    if (moved.length) {
      throw new Error(
        `not held by their teleburn address: ${moved.join(", ")}`,
      );
    }
  }
  console.log(`all ${ids.length} tokens held by their teleburn address`);

  // One token per line, sorted, so a rerun diffs as appended lines plus the
  // snapshot block.
  const header = {
    collection: COLLECTION,
    teleburnContracts: SOURCES.map((s) => s.address),
    verifiedWith: VERIFIER,
    snapshotBlock: snapshot,
    count: ids.length,
  };
  const lines = ids.map(
    (id) => `    "${id}": ${JSON.stringify(bindings.get(id))}`,
  );
  const head = JSON.stringify(header, null, 2).slice(0, -2);
  writeFileSync(OUT, `${head},\n  "tokens": {\n${lines.join(",\n")}\n  }\n}\n`);
  console.log(`wrote ${new URL(OUT).pathname}`);
}

await main();
