import {
  parseInscriptionId,
  teleburnAddress,
  toHex,
  txidToInternal,
} from "./teleburn.js";

// Read-only public endpoint. Only the collection address and token ID are
// sent to it; the inscription ID never leaves the browser.
const RPC_URL = "https://ethereum-rpc.publicnode.com";
const OWNER_OF = "0x6352211e"; // ownerOf(uint256)

const EXAMPLE = {
  inscription:
    "6fb976ab49dcec017f1e201e84395983204ae1a7c2abf7ced0a85d692e442799i0",
  // ENS .eth BaseRegistrar; token ID is uint256(keccak256("rodarmor")).
  collection: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85",
  tokenId: "0x1c850c13d2ee136e23c325a10b2d2e0e6bba019ddb485f1c4091e4376e48a401",
};

const $ = (id) => document.getElementById(id);

const form = $("lookup");
const result = $("result");
const verdict = $("verdict");

function show(el, visible) {
  el.hidden = !visible;
}

function setVerdict(kind, html) {
  verdict.className = `verdict verdict--${kind}`;
  verdict.innerHTML = html;
  show(verdict, true);
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function parseTokenId(raw) {
  const s = raw.trim();
  if (!/^(0x[0-9a-f]{1,64}|\d{1,78})$/i.test(s)) {
    throw new Error("Token ID must be a decimal number or 0x-prefixed hex.");
  }
  const n = BigInt(s);
  if (n >= 2n ** 256n) throw new Error("Token ID is larger than uint256.");
  return n;
}

async function ownerOf(collection, tokenId) {
  const data = OWNER_OF + tokenId.toString(16).padStart(64, "0");
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: collection, data }, "latest"],
    }),
  });
  if (!res.ok) throw new Error(`RPC request failed (${res.status}).`);
  const body = await res.json();
  if (body.error) {
    throw new Error(
      "ownerOf reverted. The token may not exist, or the address isn't an ERC-721 collection.",
    );
  }
  if (!body.result || body.result.length < 66) {
    throw new Error("No ERC-721 contract answered at that address.");
  }
  return "0x" + body.result.slice(-40);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  show(verdict, false);
  show(result, false);
  $("error").textContent = "";

  let derived;
  let parsed;
  try {
    parsed = parseInscriptionId($("inscription").value);
    derived = await teleburnAddress(parsed.inscriptionId);
  } catch (err) {
    $("error").textContent = err.message;
    return;
  }

  $("out-address").textContent = derived;
  $("out-etherscan").href = `https://etherscan.io/address/${derived}`;
  $("out-txid-display").textContent = parsed.txidDisplay;
  $("out-txid-internal").textContent = toHex(
    txidToInternal(parsed.txidDisplay),
  );
  $("out-index").textContent = parsed.index;
  show(result, true);

  const collection = $("collection").value.trim();
  const tokenRaw = $("token").value.trim();
  if (!collection && !tokenRaw) return;

  if (!/^0x[0-9a-fA-F]{40}$/.test(collection)) {
    setVerdict("error", "Collection must be a 0x address, 40 hex characters.");
    return;
  }
  let tokenId;
  try {
    tokenId = parseTokenId(tokenRaw);
  } catch (err) {
    setVerdict("error", escapeHtml(err.message));
    return;
  }

  setVerdict("pending", "Checking the current owner on Ethereum…");
  try {
    const owner = await ownerOf(collection, tokenId);
    if (owner.toLowerCase() === derived.toLowerCase()) {
      setVerdict(
        "match",
        "<strong>Teleburned to this inscription.</strong> The token is held by the derived address, which has no private key, so it cannot move again.",
      );
    } else {
      setVerdict(
        "nomatch",
        `<strong>Not teleburned to this inscription.</strong> The current owner is <code>${escapeHtml(owner)}</code>.`,
      );
    }
  } catch (err) {
    setVerdict("error", escapeHtml(err.message));
  }
});

$("example").addEventListener("click", () => {
  $("inscription").value = EXAMPLE.inscription;
  $("collection").value = EXAMPLE.collection;
  $("token").value = EXAMPLE.tokenId;
  form.requestSubmit();
});

$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("out-address").textContent);
    $("copy").textContent = "Copied";
    setTimeout(() => ($("copy").textContent = "Copy"), 1500);
  } catch {
    // Clipboard blocked; the address is still selectable.
  }
});
