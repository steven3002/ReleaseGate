"""Local SVM JSON-line bridge for official Squads SDK transactions."""
import base64
import hashlib
import json
from pathlib import Path
import struct
import sys

from solders.account import Account
from solders.litesvm import LiteSVM
from solders.pubkey import Pubkey
from solders.transaction import Transaction
from solders.transaction_metadata import FailedTransactionMetadata

from guard_probe import LIGHTHOUSE, LOADER, SYSTEM, digest

ROOT = Path(__file__).resolve().parent
SQDS = Pubkey.from_string('SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf')
svm = LiteSVM()
svm.add_program(LIGHTHOUSE, (ROOT/'lighthouse-onchain.so').read_bytes())

build_variant = sys.argv[1] if len(sys.argv) > 1 else 'mainnet'
squads_so = ROOT / (f'squads-onchain.{build_variant}.so' if (ROOT / f'squads-onchain.{build_variant}.so').exists() else 'squads-onchain.so')
snapshot_json = ROOT / (f'squads-rpc-evidence.{build_variant}.json' if (ROOT / f'squads-rpc-evidence.{build_variant}.json').exists() else 'squads-rpc-evidence.json')

svm.add_program(SQDS, squads_so.read_bytes())
snapshot = json.loads(snapshot_json.read_text())
config = snapshot['snapshot']['value'][1]
svm.set_account(Pubkey.from_string(snapshot['config']), Account(config['lamports'],base64.b64decode(config['data'][0]),Pubkey.from_string(config['owner'])))
programdata_key = None

def handle(req):
    global programdata_key
    op = req['op']
    if op == 'init':
        for address in req['fund']:
            svm.set_account(Pubkey.from_string(address), Account(20_000_000_000,b'',SYSTEM))
        program, vault = Pubkey.from_string(req['program']), Pubkey.from_string(req['vault'])
        bytecode = (ROOT/'lighthouse-onchain.so').read_bytes()
        svm.add_program(program, bytecode)
        programdata_key = Pubkey.from_bytes(svm.get_account(program).data[4:36])
        pd = struct.pack('<I',3)+struct.pack('<Q',0)+b'\x01'+bytes(vault)+bytecode
        svm.set_account(programdata_key, Account(svm.minimum_balance_for_rent_exemption(len(pd)),pd,LOADER))
        for address in req['buffers']:
            data = struct.pack('<I',1)+b'\x01'+bytes(vault)+bytecode
            svm.set_account(Pubkey.from_string(address),Account(svm.minimum_balance_for_rent_exemption(len(data)),data,LOADER))
        svm.warp_to_slot(100)
        return {'blockhash':str(svm.latest_blockhash()),'programdata':str(programdata_key),
                'code_keccak':digest(bytecode).hex(),'code_bytes':len(bytecode)}
    if op == 'account':
        account = svm.get_account(Pubkey.from_string(req['pubkey']))
        return None if account is None else {'data':base64.b64encode(account.data).decode(), 'owner':str(account.owner),'lamports':account.lamports,'executable':account.executable}
    if op == 'warp':
        svm.warp_to_slot(req['slot'])
        return {'slot':req['slot']}
    if op == 'tx':
        result = svm.send_transaction(Transaction.from_bytes(base64.b64decode(req['tx'])))
        failed = isinstance(result,FailedTransactionMetadata)
        meta = result.meta() if failed else result
        pd = svm.get_account(programdata_key).data
        return {'ok':not failed,'error':str(result.err()) if failed else None,
                'compute_units':meta.compute_units_consumed(),'logs':meta.logs(),
                'programdata_slot':struct.unpack_from('<Q',pd,4)[0],
                'programdata_sha256':hashlib.sha256(pd).hexdigest()}
    raise ValueError('Unknown op')

for line in sys.stdin:
    try:
        response = {'result':handle(json.loads(line))}
    except Exception as exc:
        response = {'error':str(exc)}
    print(json.dumps(response),flush=True)
