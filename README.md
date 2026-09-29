# teleburn-verify

On-chain and in-browser verification that an Ethereum NFT was teleburned to a
specific Bitcoin inscription.

A teleburn migrates an NFT to Bitcoin by sending it to an address derived from
the inscription ID. Nobody holds a key for that address, so the NFT can never
move again and is provably tied to that one inscription. This project derives
the address and checks who holds the token: a stateless Solidity contract for
other contracts to call, and a static site that does the same in your browser
with nothing to install or connect.

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
scripts/     gen-vectors.py, the independent (hashlib) reference
web/         static site: src/ -> esbuild -> public/ (Cloudflare Pages)
```

Planned, not built yet: `indexer/` (OCM Genesis bindings to static JSON) and
`api/` (x402-gated bulk endpoint on a Cloudflare Worker).

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
python3 -m http.server 8124 -d public

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
- [ ] Mainnet deploy (`contracts/script/Deploy.s.sol`) and Etherscan verify
- [ ] Put the deployed address on the site's about section
- [ ] `indexer/`: OCM Genesis collection index as immutable JSON
- [ ] Fork test against real OCM Genesis tokens on
      `0x960b7a6bcd451c9968473f7bbfd9be826efd549a`
- [ ] `api/`: x402 bulk endpoint, built against x402 v2 (the v1 `X-PAYMENT`
      headers are deprecated).
- [ ] Domain + Cloudflare Pages project

Informational only. Verify on-chain before relying on a result.
