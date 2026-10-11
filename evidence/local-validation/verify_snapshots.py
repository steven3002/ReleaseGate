"""Reject fetched dependency bytecode differing from the observed research run."""
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXPECTED = {
    'lighthouse-onchain.so': 'a89179ae024ac36aa5fc308251caa84cd0a3390ae66d8523514004a86d5148bb',
    'squads-onchain.so': 'dec8d3e0fae58c7c8f2416e5f67c25e673f047afd6dd2bba4a47e0b29a01d34c',
}
for name, expected in EXPECTED.items():
    actual = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
    if actual != expected:
        raise SystemExit(f'{name}: differing bytecode; stop reproduction and review provenance')
    print(f'{name}: expected SHA-256 matches')
