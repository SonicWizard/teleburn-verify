# teleburn-verify

On-chain and in-browser verification that an Ethereum NFT was teleburned to a
specific Bitcoin inscription.

A teleburn migrates an NFT to Bitcoin by sending it to an address derived from
the inscription ID. Nobody holds a key for that address, so the NFT can never
move again and is provably tied to that one inscription. This project derives
the address and checks who holds the token: a stateless Solidity contract for
other contracts to call, and a static site that does the same in your browser
with nothing to install or connect.

## Deployment

| | |
| --- | --- |
| Site | https://teleburn.dev |
| `TeleburnVerifier` (Ethereum mainnet) | [`0x58b0acCf5C68E99fA0424c0A30EAA1a6BfeaBDdC`](https://etherscan.io/address/0x58b0acCf5C68E99fA0424c0A30EAA1a6BfeaBDdC#code) |

The contract is verified on Etherscan and Sourcify (exact match), and its
on-chain bytecode matches a local build of this repo. The deploy record is in
`contracts/broadcast/Deploy.s.sol/1/`.

## The derivation

Per the Ordinal Theory Handbook, the teleburn address is the first 20 bytes of
the SHA-256 of the inscription ID serialized as 36 bytes: the 32-byte txid,
then the inscription index as 4 big-endian bytes.

**The trap:** the txid goes in in Bitcoin's _internal_ byte order, which is the
reverse of the hex shown in the inscription ID. Using the displayed hex gives a
wrong address that looks valid.

| Input                                                                | Address                                      |
| -------------------------------------------------------------------- | -------------------------------------------- |
| `6fb976ab49dcec017f1e201e84395983204ae1a7c2abf7ced0a85d692e442799i0` | `0xe43A06530BdF8A4e067581f48Fae3b535559dA9e` |
| Same, txid in display order (wrong)                                  | `0x1c111ad24611f7e874cd9a700ff1f08f6c8cb0ef` |

The correct address currently owns the ENS registrar NFT for `rodarmor.eth` on
mainnet, which the fork test checks live.

## Layout

```
contracts/   Foundry: TeleburnLib, TeleburnVerifier, tests, deploy script
fixtures/    vectors.json, shared by the Solidity and JS tests
indexer/     OCM Genesis teleburns -> data/ocm-genesis.json
scripts/     gen-vectors.py, the independent (hashlib) reference
web/         static site: src/ -> esbuild -> public/ (Cloudflare Worker)
```

Planned, not built yet: `api/` (x402-gated bulk endpoint on a Cloudflare
Worker).

## OCM Genesis index

`indexer/data/ocm-genesis.json` maps every OCM Genesis token teleburned to
Bitcoin to its inscription ID and teleburn address. OCM teleburns through its
own contracts (`0x27Cb…18E4`, then `0x1c35…E6D8`), which accept the teleburn
address from the caller instead of deriving it, so the indexer trusts none of
their events as-is. For each one it re-derives the address from the
inscription ID and requires it to match where the token was sent, requires
the event count to equal OCM's `teleburnedCount`, and checks through the
deployed `TeleburnVerifier` that every token is still held there. The index is
taken at a finalized block, and bindings never change once made, so reruns
only add tokens.

## Commands

Tool versions (Node, pnpm, Foundry, Python, ord) are pinned in `mise.toml`,
and CI uses the same file. Run `mise install` once, then either activate mise
in your shell or prefix commands with `mise exec --`.

```bash
# Contracts
cd contracts
forge test
MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com forge test --mc Fork

# Web (pnpm; dependency install scripts need approval in pnpm-workspace.yaml)
cd web
pnpm install
pnpm test                # includes the ord cross-check when ord is on PATH
pnpm run build           # writes public/app.js
pnpm exec wrangler dev   # serves public/ with the _headers CSP applied

# Indexer (uses web/'s install for the derivation; needs an RPC that serves
# eth_getLogs over the full history, MEV Blocker's by default)
cd indexer
node --test              # offline checks on the committed index
node src/index.js        # rebuild data/ocm-genesis.json from mainnet

# Regenerate vectors (then rerun both test suites)
python3 scripts/gen-vectors.py
```

## Status

- [x] `TeleburnLib` + `TeleburnVerifier` (view/pure only, no state, no funds)
- [x] Tests: handbook vector, byte-order regression, 30 shared vectors, fuzzed
      byte reversal, `ownerOf` match/mismatch/revert, non-contract and
      malformed `ownerOf` responses, batch, live mainnet fork, malformed
      inscription ID input
- [x] CI (`.github/workflows/ci.yml`): both suites, `forge fmt`, the fork test
      (public RPC unless the `MAINNET_RPC_URL` secret is set), fixture drift
- [x] Web: single lookup, client-side SHA-256, EIP-55, optional `ownerOf`
      check via a public RPC, no wallet connection, strict CSP
- [x] Cross-check against `ord teleburn` (ord 0.29.0): every fixture vector,
      plus 50 random IDs per run compared checksum and all
- [x] Mainnet deploy (`contracts/script/Deploy.s.sol`) and Etherscan verify
- [x] Put the deployed address on the site's about section
- [x] `indexer/`: OCM Genesis collection index as JSON (8,425 teleburned
      tokens at block 26084832), every binding checked on-chain
- [x] Fork test against real OCM Genesis tokens on
      `0x960b7a6bcd451c9968473f7bbfd9be826efd549a`, through the deployed
      verifier
- [ ] `api/`: x402 bulk endpoint, built against x402 v2 (the v1 `X-PAYMENT`
      headers are deprecated).
- [x] Live at https://teleburn.dev: CI deploys `web/` on every push to main
      once tests pass (needs the `CLOUDFLARE_API_TOKEN` secret)
- [x] Cloudflare: Always Use HTTPS, and redirect www.teleburn.dev to the apex

Informational only. Verify on-chain before relying on a result.
