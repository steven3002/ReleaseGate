"""Bounded local SVM probe, using a read-only snapshot of deployed Lighthouse.

This is not a mainnet transaction, Squads integration, or security audit.
Artificial accounts use LiteSVM.set_account; mutation is a test input, not
evidence that a lone attacker can mutate a real Squads-owned buffer.
"""
import hashlib
import json
import struct
from pathlib import Path

from Crypto.Hash import keccak
from solders.account import Account
from solders.compute_budget import set_compute_unit_limit
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.litesvm import LiteSVM
from solders.pubkey import Pubkey
from solders.system_program import TransferParams, transfer
from solders.transaction import Transaction
from solders.transaction_metadata import FailedTransactionMetadata

ROOT = Path(__file__).resolve().parent
LIGHTHOUSE = Pubkey.from_string('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95')
LOADER = Pubkey.from_string('BPFLoaderUpgradeab1e11111111111111111111111')
SYSTEM = Pubkey.default()

def leb(value):
    data = bytearray()
    while value >= 128:
        data.append((value & 127) | 128)
        value >>= 7
    data.append(value)
    return bytes(data)

def digest(data):
    return keccak.new(digest_bits=256, data=data).digest()

def assertion(target, payload):
    return Instruction(LIGHTHOUSE, bytes([5, 1]) + payload, [AccountMeta(target, False, False)])

def hash_assert(target, expected, start, length):
    return assertion(target, bytes([8]) + expected + leb(start) + leb(length))

def length_assert(target, length):
    return assertion(target, bytes([1]) + struct.pack('<Q', length) + bytes([0]))

def owner_assert(target, owner):
    return assertion(target, bytes([2]) + bytes(owner) + bytes([0]))

def run_case(name, actual, expected_data, *, owner=LOADER, hash_start=37,
             hash_length=None, strict=True, expected_ok=True, mutate_after_guard=False):
    svm = LiteSVM()
    svm.add_program(LIGHTHOUSE, (ROOT/'lighthouse-onchain.so').read_bytes())
    payer, target, recipient = Keypair(), Pubkey.new_unique(), Pubkey.new_unique()
    svm.airdrop(payer.pubkey(), 10_000_000_000)
    # State=Buffer(1), Some(authority), authority bytes. Header length=37.
    header = struct.pack('<I', 1) + bytes([1]) + bytes(payer.pubkey())
    svm.set_account(target, Account(100_000_000, header + actual, owner))
    svm.set_account(recipient, Account(1_000_000, b'', SYSTEM))
    ix = [set_compute_unit_limit(1_400_000)]
    if strict:
        ix.extend([owner_assert(target, LOADER), length_assert(target, 37 + len(expected_data))])
    ix.append(hash_assert(target, digest(expected_data), hash_start,
                          len(expected_data) if hash_length is None else hash_length))
    ix.append(transfer(TransferParams(from_pubkey=payer.pubkey(), to_pubkey=recipient, lamports=10_000)))
    tx = Transaction.new_signed_with_payer(ix, payer.pubkey(), [payer], svm.latest_blockhash())
    result = svm.send_transaction(tx)
    failed = isinstance(result, FailedTransactionMetadata)
    meta = result.meta() if failed else result
    after = svm.get_balance(recipient)
    error = str(result.err()) if failed else None
    out = {'name':name, 'data_bytes':len(actual), 'expected_ok':expected_ok,
           'actual_ok':not failed, 'guard_result_correct':((not failed) == expected_ok),
           'recipient_before':1_000_000, 'recipient_after':after,
           'transfer_effect_correct': after == (1_000_000 if failed else 1_010_000),
           'compute_units':meta.compute_units_consumed(), 'error':error,
           'logs':meta.logs(), 'tx_bytes':len(bytes(tx))}
    return out

if __name__ == '__main__':
    payload = bytes(range(256)) * 256  # 64 KiB; synthetic, not an ELF upgrade.
    changed = bytearray(payload)
    changed[32000] ^= 1
    cases = [
        run_case('matching_full_buffer', payload, payload),
        run_case('one_byte_changed', bytes(changed), payload, expected_ok=False),
        run_case('truncated_buffer', payload[:-1], payload, expected_ok=False),
        run_case('appended_bytes_strict_length', payload + b'EVIL', payload, expected_ok=False),
        run_case('wrong_owner', payload, payload, owner=SYSTEM, expected_ok=False),
        run_case('wrong_offset', payload, payload, hash_start=36, expected_ok=False),
        run_case('out_of_bounds_hash', payload, payload, hash_start=38, strict=False, expected_ok=False),
        # Negative control: a prefix hash alone does not bind the whole buffer.
        run_case('prefix_only_guard_accepts_trailing_bytes', payload + b'EVIL', payload, strict=False),
    ]
    for size in [262144, 524288, 1048576, 2097152]:
        data = (b'RELEASEGATE-PROBE-' * ((size + 17)//18))[:size]
        cases.append(run_case('size_' + str(size), data, data))
    result = {'scope':'Local LiteSVM; deployed Lighthouse snapshot; synthetic account data; guard plus System transfer only',
              'bytecode_sha256':hashlib.sha256((ROOT/'lighthouse-onchain.so').read_bytes()).hexdigest(),
              'cases':cases, 'all_expected':all(c['guard_result_correct'] and c['transfer_effect_correct'] for c in cases)}
    (ROOT/'guard-results.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({**result, 'cases':[{k:v for k,v in c.items() if k != 'logs'} for c in cases]}, indent=2))
