import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { assertDevnetCluster } from '../signing/cluster-guard';
import { loadKeypairFile } from '../signing/keypair-file';
import type { EvidenceRecord } from '../records/record';
import { writeEvidenceRecord } from '../records/record';
import { getFlag, parseArgs } from './args';

export async function handleProbe(args: readonly string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const program = getFlag(flags, 'program');
  const dataStr = getFlag(flags, 'data') ?? 'probe-test';
  const payerFlag = getFlag(flags, 'payer');
  const recordPath = getFlag(flags, 'record');
  const rpcUrl = getFlag(flags, 'url') ?? 'https://api.devnet.solana.com';

  if (!program) {
    process.stderr.write('Usage: prepare-release probe --program <pubkey> [--data <text>] [--payer <keypair-or-pubkey>] [--record <path>]\n');
    return 2;
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await assertDevnetCluster(connection);

  const programId = new PublicKey(program);
  const data = Buffer.from(dataStr, 'utf8');

  const ix = new TransactionInstruction({
    programId,
    keys: [],
    data,
  });

  const tx = new Transaction().add(ix);
  let payerPubkey: PublicKey;
  if (payerFlag) {
    if (payerFlag.endsWith('.json')) {
      const kp = await loadKeypairFile(payerFlag);
      payerPubkey = kp.publicKey;
    } else {
      payerPubkey = new PublicKey(payerFlag);
    }
  } else {
    payerPubkey = new PublicKey('VxGuX3ZiwcjjLeBRgbQcKAUiMfnDH99fD2WhDHUBNwk');
  }
  tx.feePayer = payerPubkey;
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;

  const simResult = await connection.simulateTransaction(tx);
  const logs = simResult.value.logs ?? [];
  const returnDataRaw = simResult.value.returnData;

  let returnDataBytes: Buffer | null = null;
  let returnDataString: string | null = null;
  let returnDataHex: string | null = null;

  if (returnDataRaw && returnDataRaw.data && returnDataRaw.data[0]) {
    returnDataBytes = Buffer.from(returnDataRaw.data[0], 'base64');
    returnDataHex = returnDataBytes.toString('hex');
    returnDataString = returnDataBytes.toString('utf8');
  }

  process.stdout.write(`=== Program Probe Result ===\n`);
  process.stdout.write(`Program: ${program}\n`);
  process.stdout.write(`Status:  ${simResult.value.err ? 'Error: ' + JSON.stringify(simResult.value.err) : 'Success'}\n`);
  process.stdout.write(`Logs:\n`);
  for (const log of logs) {
    process.stdout.write(`  ${log}\n`);
  }
  if (returnDataBytes) {
    process.stdout.write(`Return Data (raw hex): ${returnDataHex}\n`);
    process.stdout.write(`Return Data (string):  ${returnDataString}\n`);
  } else {
    process.stdout.write(`Return Data: None\n`);
  }

  if (recordPath) {
    const record: EvidenceRecord = {
      command: 'probe',
      timestamp: new Date().toISOString(),
      cluster: 'devnet',
      genesisHash,
      inputs: {
        program,
        inputData: dataStr,
      },
      addresses: {
        program,
      },
      signatures: [],
      slots: {},
      outcome: simResult.value.err ? 'failure' : 'success',
      result: {
        logs,
        returnDataHex,
        returnDataString,
      },
      logs,
    };
    await writeEvidenceRecord(recordPath, record);
  }

  return simResult.value.err ? 1 : 0;
}
