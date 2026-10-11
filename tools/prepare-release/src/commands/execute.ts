import {
  Connection,
  Transaction,
} from '@solana/web3.js';
import {
  buildExecute,
  Web3ChainReader,
} from 'release-core';
import { assertDevnetCluster } from '../signing/cluster-guard';
import { loadKeypairFile } from '../signing/keypair-file';
import { submitInstructions, toTransactionInstruction } from '../signing/submit';
import type { EvidenceRecord } from '../records/record';
import { writeEvidenceRecord } from '../records/record';
import { getBooleanFlag, getFlag, parseArgs } from './args';

export async function handleExecute(args: readonly string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const multisig = getFlag(flags, 'multisig');
  const indexStr = getFlag(flags, 'index');
  const memberPath = getFlag(flags, 'member');
  const skipPreflight = getBooleanFlag(flags, 'skip-preflight');
  const cuLimitStr = getFlag(flags, 'compute-unit-limit');
  const recordPath = getFlag(flags, 'record');
  const rpcUrl = getFlag(flags, 'url') ?? 'https://api.devnet.solana.com';

  if (!multisig || !indexStr || !memberPath) {
    process.stderr.write(
      'Usage: prepare-release execute --multisig <pubkey> --index <n> --member <keypair-path> [--skip-preflight] [--compute-unit-limit <n>] [--record <path>]\n',
    );
    return 2;
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await assertDevnetCluster(connection);
  const chainReader = new Web3ChainReader(connection);

  const member = await loadKeypairFile(memberPath);
  const memberPubkey = member.publicKey.toBase58();
  const transactionIndex = BigInt(indexStr);

  const executeIx = await buildExecute({
    chain: chainReader,
    multisig,
    transactionIndex,
    member: memberPubkey,
  });

  let computeUnitLimit = cuLimitStr ? parseInt(cuLimitStr, 10) : undefined;
  if (computeUnitLimit === undefined) {
    try {
      const simTx = new Transaction();
      simTx.add(toTransactionInstruction(executeIx));
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      simTx.recentBlockhash = blockhash;
      simTx.feePayer = member.publicKey;
      const sim = await connection.simulateTransaction(simTx);
      if (sim.value.unitsConsumed) {
        computeUnitLimit = Math.min(1_400_000, sim.value.unitsConsumed + 50_000);
      } else {
        computeUnitLimit = 400_000;
      }
    } catch {
      computeUnitLimit = 400_000;
    }
  }

  process.stdout.write(
    `Executing proposal ${transactionIndex} as member ${memberPubkey} (skipPreflight: ${skipPreflight}, CU limit: ${computeUnitLimit})...\n`,
  );

  const result = await submitInstructions(connection, [executeIx], member, [], {
    skipPreflight,
    computeUnitLimit,
  });

  if (!result.success) {
    process.stderr.write(`Execution failed on chain (signature: ${result.signature}): ${JSON.stringify(result.err)}\n`);
    if (result.logs.length > 0) {
      process.stderr.write(`Logs:\n${result.logs.join('\n')}\n`);
    }
    if (recordPath) {
      const record: EvidenceRecord = {
        command: 'execute',
        timestamp: new Date().toISOString(),
        cluster: 'devnet',
        genesisHash,
        inputs: {
          multisig,
          transactionIndex: Number(transactionIndex),
          skipPreflight,
          computeUnitLimit,
        },
        addresses: {
          multisig,
          member: memberPubkey,
        },
        signatures: [result.signature],
        slots: { executionSlot: result.slot },
        outcome: 'failure',
        error: JSON.stringify(result.err),
        logs: result.logs,
      };
      await writeEvidenceRecord(recordPath, record);
    }
    return 1;
  }

  process.stdout.write(`Proposal executed successfully!\n`);
  process.stdout.write(`  Signature: ${result.signature}\n`);
  process.stdout.write(`  Slot:      ${result.slot}\n`);

  if (recordPath) {
    const record: EvidenceRecord = {
      command: 'execute',
      timestamp: new Date().toISOString(),
      cluster: 'devnet',
      genesisHash,
      inputs: {
        multisig,
        transactionIndex: Number(transactionIndex),
        skipPreflight,
        computeUnitLimit,
      },
      addresses: {
        multisig,
        member: memberPubkey,
      },
      signatures: [result.signature],
      slots: { executionSlot: result.slot },
      outcome: 'success',
      result: {
        signature: result.signature,
        slot: result.slot,
      },
      logs: result.logs,
    };
    await writeEvidenceRecord(recordPath, record);
  }

  return 0;
}
