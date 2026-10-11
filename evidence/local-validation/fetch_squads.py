"""Read-only canonical Squads program/config snapshot for a local SVM test."""
import base64
import datetime
import hashlib
import json
from pathlib import Path
import struct
from solders.pubkey import Pubkey
from fetch_evidence import rpc

ROOT = Path(__file__).resolve().parent
URL = 'https://api.mainnet-beta.solana.com'
PROGRAM = 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf'
CONFIG = 'BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr'
result = rpc(URL, 'getMultipleAccounts', [[PROGRAM, CONFIG], {'encoding':'base64','commitment':'finalized'}])
raw = base64.b64decode(result['value'][0]['data'][0])
assert struct.unpack_from('<I',raw)[0] == 2
pd = str(Pubkey.from_bytes(raw[4:36]))
programdata = rpc(URL,'getAccountInfo',[pd,{'encoding':'base64','commitment':'finalized'}])
data = base64.b64decode(programdata['value']['data'][0])
assert struct.unpack_from('<I',data)[0] == 3
bytecode = data[45:]
(ROOT/'squads-onchain.so').write_bytes(bytecode)
evidence = {'retrieved_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'endpoint':URL, 'program':PROGRAM, 'config':CONFIG, 'snapshot':result,
            'programdata':pd, 'programdata_snapshot':programdata,
            'bytecode_sha256':hashlib.sha256(bytecode).hexdigest(),
            'bytecode_bytes':len(bytecode), 'authority_option':data[12]}
(ROOT/'squads-rpc-evidence.json').write_text(json.dumps(evidence,indent=2))
print(json.dumps({k:v for k,v in evidence.items() if k not in ['snapshot','programdata_snapshot']},indent=2))
