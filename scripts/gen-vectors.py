#!/usr/bin/env python3
"""Generate fixtures/vectors.json, the shared test vectors.

Both the Solidity tests and the web tests assert against this file, so the
contract and the browser derivation are held to the same independent
reference (Python's hashlib, not either implementation under test).

The first vector is the Ordinal Theory Handbook's own example, checked
against `ord teleburn`. The rest are deterministic pseudo-random txids at
the index boundaries. When `ord` is installed, cross-check them with:

    ord teleburn <inscriptionId>
"""

import hashlib
import json
import random
from pathlib import Path

# Handbook vector: inscription zero, teleburned rodarmor.eth.
HANDBOOK_TXID = "6fb976ab49dcec017f1e201e84395983204ae1a7c2abf7ced0a85d692e442799"
HANDBOOK_EXPECTED = "0xe43a06530bdf8a4e067581f48fae3b535559da9e"

INDICES = [0, 1, 2, 255, 256, 65535, 65536, 2**31, 2**32 - 1]


def derive(txid_display_hex: str, index: int) -> str:
    preimage = bytes.fromhex(txid_display_hex)[::-1] + index.to_bytes(4, "big")
    return "0x" + hashlib.sha256(preimage).digest()[:20].hex()


def vector(txid_display_hex: str, index: int) -> dict:
    # Keys are alphabetical so forge's vm.parseJson decodes them into a struct.
    return {
        "expected": derive(txid_display_hex, index),
        "index": index,
        "inscriptionId": f"{txid_display_hex}i{index}",
        "txidDisplay": "0x" + txid_display_hex,
        "txidInternal": "0x" + bytes.fromhex(txid_display_hex)[::-1].hex(),
    }


def main() -> None:
    assert derive(HANDBOOK_TXID, 0) == HANDBOOK_EXPECTED, "handbook vector"

    rng = random.Random(0x7E1EB0)
    vectors = [vector(HANDBOOK_TXID, 0)]
    for index in INDICES:
        vectors.append(vector(rng.randbytes(32).hex(), index))
    for _ in range(20):
        vectors.append(vector(rng.randbytes(32).hex(), rng.randrange(2**32)))

    out = Path(__file__).resolve().parent.parent / "fixtures" / "vectors.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"vectors": vectors}, indent=2) + "\n")
    print(f"wrote {len(vectors)} vectors to {out}")


if __name__ == "__main__":
    main()
