"""Read-only public RPC snapshot fetcher for deployed Lighthouse program bytecode."""
import base64
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import struct
import urllib.request

ROOT = Path(__file__).resolve().parent
PROGRAM = 'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95'
FEATURE = 'H5AgGhTzvHp2GH9SVGZYBpjeQPy1V9bqYQ4MmTtiCWr9'
ENDPOINTS = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com']

def rpc(url, method, params):
    req = urllib.request.Request(url, data=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params}).encode(), headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=20) as response:
        result = json.load(response)
    if 'error' in result:
        raise RuntimeError(str(result['error']))
    return result['result']

def snapshot(url):
    try:
        result = rpc(url, 'getMultipleAccounts', [[PROGRAM, FEATURE], {'encoding':'base64','commitment':'finalized'}])
        return {'endpoint':url,'result':result}
    except Exception as exc:
        return {'endpoint':url,'error':str(exc)}

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        snapshots = list(pool.map(snapshot, ENDPOINTS))
    good = next((s for s in snapshots if 'result' in s and s['result']['value'][0]), None)
    evidence = {'retrieved_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'program':PROGRAM,'feature':FEATURE,'snapshots':snapshots}
    if good:
        from solders.pubkey import Pubkey
        program_data = base64.b64decode(good['result']['value'][0]['data'][0])
        if struct.unpack_from('<I',program_data)[0] != 2:
            raise ValueError('Unexpected Lighthouse program account layout')
        programdata_key = str(Pubkey.from_bytes(program_data[4:36]))
        raw = rpc(good['endpoint'], 'getAccountInfo', [programdata_key, {'encoding':'base64','commitment':'finalized'}])
        account_bytes = base64.b64decode(raw['value']['data'][0])
        if struct.unpack_from('<I',account_bytes)[0] != 3:
            raise ValueError('Unexpected program-data account layout')
        bytecode = account_bytes[45:]
        (ROOT/'lighthouse-onchain.so').write_bytes(bytecode)
        evidence['programdata_snapshot'] = raw
        evidence['programdata_key'] = programdata_key
        evidence['bytecode_sha256'] = hashlib.sha256(bytecode).hexdigest()
        evidence['bytecode_bytes'] = len(bytecode)
        evidence['deployment_slot'] = struct.unpack_from('<Q',account_bytes,4)[0]
    (ROOT/'rpc-evidence.json').write_text(json.dumps(evidence,indent=2))
    print(json.dumps({k:v for k,v in evidence.items() if k not in ('snapshots','programdata_snapshot')},indent=2))
    print(json.dumps([{'endpoint':s['endpoint'],'error':s.get('error'),'slot':s.get('result',{}).get('context',{}).get('slot'),'feature_account_present':bool(s.get('result',{}).get('value',[None,None])[1])} for s in snapshots],indent=2))
