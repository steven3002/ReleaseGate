"""Local actual loader-v3 upgrade preceded by existing Lighthouse guards.

Uses the public Lighthouse binary as a test payload, at an artificial program
address. No network mutation, multisig lifecycle, device, or new program.
"""
import hashlib
import json
import struct
from pathlib import Path

from solders.account import Account
from solders.compute_budget import set_compute_unit_limit
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.litesvm import LiteSVM
from solders.pubkey import Pubkey
from solders.transaction import Transaction
from solders.transaction_metadata import FailedTransactionMetadata

from guard_probe import LIGHTHOUSE, LOADER, SYSTEM, digest, hash_assert, owner_assert, length_assert

ROOT = Path(__file__).resolve().parent
RENT = Pubkey.from_string('SysvarRent111111111111111111111111111111111')
CLOCK = Pubkey.from_string('SysvarC1ock11111111111111111111111111111111')

def slot_assert(programdata, expected_slot):
    # instruction=AssertUpgradeableLoaderAccount(13), log=Plain(1),
    # outer enum=ProgramData(3), inner=Slot(1), u64, operator=Equal(0).
    return Instruction(LIGHTHOUSE, bytes([13,1,3,1]) + struct.pack('<Q', expected_slot) + bytes([0]), [AccountMeta(programdata,False,False)])

def case(name, mutate=False, wrong_authority=False, guard=True, expected_ok=True,
         actual_previous_slot=0, expected_previous_slot=None):
    bytecode = (ROOT/'lighthouse-onchain.so').read_bytes()
    svm = LiteSVM()
    svm.add_program(LIGHTHOUSE, bytecode)
    program = Pubkey.new_unique()
    svm.add_program(program, bytecode)
    payer, stranger = Keypair(), Keypair()
    svm.airdrop(payer.pubkey(), 10_000_000_000)
    programdata = Pubkey.from_bytes(svm.get_account(program).data[4:36])
    before_pd = struct.pack('<I', 3) + struct.pack('<Q', actual_previous_slot) + b'\x01' + bytes(payer.pubkey()) + bytecode
    svm.set_account(programdata, Account(svm.minimum_balance_for_rent_exemption(len(before_pd)), before_pd, LOADER))
    svm.warp_to_slot(100)
    buffer, spill = Pubkey.new_unique(), Pubkey.new_unique()
    authority = stranger.pubkey() if wrong_authority else payer.pubkey()
    payload = bytearray(bytecode)
    if mutate:
        payload[200000] ^= 1
    buffer_data = struct.pack('<I', 1) + b'\x01' + bytes(authority) + payload
    svm.set_account(buffer, Account(svm.minimum_balance_for_rent_exemption(len(buffer_data)), bytes(buffer_data), LOADER))
    svm.set_account(spill, Account(1_000_000, b'', SYSTEM))
    ix = [set_compute_unit_limit(1_400_000)]
    if guard:
        ix.extend([owner_assert(buffer, LOADER), length_assert(buffer, 37 + len(bytecode)), hash_assert(buffer, digest(bytecode), 37, len(bytecode))])
    if expected_previous_slot is not None:
        ix.append(slot_assert(programdata, expected_previous_slot))
    # Canonical loader-v3 Upgrade; authority is a regular local key for this
    # primitive probe. Squads must ultimately supply its vault PDA via CPI.
    ix.append(Instruction(LOADER, struct.pack('<I', 3), [
        AccountMeta(programdata, False, True), AccountMeta(program, False, True),
        AccountMeta(buffer, False, True), AccountMeta(spill, False, True),
        AccountMeta(RENT, False, False), AccountMeta(CLOCK, False, False),
        AccountMeta(payer.pubkey(), True, False)]))
    result = svm.send_transaction(Transaction.new_signed_with_payer(ix, payer.pubkey(), [payer], svm.latest_blockhash()))
    failed = isinstance(result, FailedTransactionMetadata)
    meta = result.meta() if failed else result
    after_pd = svm.get_account(programdata).data
    after_buffer = svm.get_account(buffer)
    success_code_matches = hashlib.sha256(after_pd[45:45 + len(bytecode)]).digest() == hashlib.sha256(bytecode).digest()
    return {'name':name, 'actual_ok':not failed, 'expected_ok':expected_ok,
            'expected_result':((not failed) == expected_ok), 'compute_units':meta.compute_units_consumed(),
            'error':str(result.err()) if failed else None, 'logs':meta.logs(),
            'programdata_slot_after':struct.unpack_from('<Q', after_pd, 4)[0],
            'programdata_unchanged_if_failed':bytes(after_pd) == before_pd if failed else None,
            'upgraded_code_matches_expected':success_code_matches,
            'buffer_unchanged_if_failed':bool(after_buffer and bytes(after_buffer.data) == bytes(buffer_data)) if failed else None,
            'buffer_data_bytes_after':len(after_buffer.data) if after_buffer else None}

if __name__ == '__main__':
    cases = [case('matching_guard_then_real_upgrade'),
             case('mutated_code_blocks_real_upgrade', mutate=True, expected_ok=False),
             case('different_buffer_authority_guarded', wrong_authority=True, expected_ok=False),
             case('different_buffer_authority_unguarded_control', wrong_authority=True, guard=False, expected_ok=False),
             case('matching_previous_version_slot', actual_previous_slot=50, expected_previous_slot=50),
             case('stale_previous_version_blocks_upgrade', actual_previous_slot=60, expected_previous_slot=50, expected_ok=False),
             case('without_previous_version_guard_upgrade_proceeds', actual_previous_slot=60, expected_previous_slot=None)]
    report = {'scope':'Local LiteSVM; actual loader-v3 Upgrade; regular-key authority, not Squads; public Lighthouse ELF payload at artificial address',
              'cases':cases, 'all_expected':all(c['expected_result'] and (not c['actual_ok'] or c['programdata_slot_after'] == 100) for c in cases)}
    (ROOT/'upgrade-results.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({**report, 'cases':[{k:v for k,v in c.items() if k != 'logs'} for c in cases]},indent=2))
