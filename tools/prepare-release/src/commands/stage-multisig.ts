import * as fs from 'node:fs/promises';
import { Connection, Keypair } from '@solana/web3.js';
import {
  buildCreateMultisig,
  deriveMultisigPda,
  deriveVaultPda,
} from 'release-core';
import { assertDevnetCluster } from '../signing/cluster-guard';
import { loadKeypairFile } from '../signing/keypair-file';
import { submitInstructions } from '../signing/submit';
import type { EvidenceRecord } from '../records/record';
import { writeEvidenceRecord } from '../records/record';
import { getFlag, parseArgs } from './args';

export async function handleStageMultisig(args: readonly string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const membersRaw = getFlag(flags, 'members');
  const thresholdStr = getFlag(flags, 'threshold');
  const timeLockStr = getFlag(flags, 'time-lock') ?? '0';
  const payerPath = getFlag(flags, 'payer');
  const createKeyPath = getFlag(flags, 'create-key');
  const createKeyOutPath = getFlag(flags, 'create-key-out');
  const recordPath = getFlag(flags, 'record');
  const rpcUrl = getFlag(flags, 'url') ?? 'https://api.devnet.solana.com';

  if (!membersRaw || !thresholdStr || !payerPath) {
    process.stderr.write(
      'Usage: prepare-release stage-multisig --members <m1,m2,...> --threshold <n> --payer <keypair-path> [--create-key <path>] [--create-key-out <path>] [--record <path>]\n',
    );
    return 2;
  }

  const members = membersRaw.split(',').map((s) => s.trim()).filter(Boolean);
  const threshold = parseInt(thresholdStr, 10);
  const timeLockSeconds = parseInt(timeLockStr, 10);

  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await assertDevnetCluster(connection);

  const payer = await loadKeypairFile(payerPath);
  let createKey: Keypair;
  if (createKeyPath) {
    createKey = await loadKeypairFile(createKeyPath);
  } else {
    createKey = Keypair.generate();
    if (createKeyOutPath) {
      await fs.writeFile(createKeyOutPath, JSON.stringify(Array.from(createKey.secretKey)), {
        mode: 0o600,
      });
    }
  }

  const createKeyPubkey = createKey.publicKey.toBase58();
  const multisig = deriveMultisigPda(createKeyPubkey).address;
  const vault = deriveVaultPda(multisig, 0).address;

  const ix = buildCreateMultisig({
    createKey: createKeyPubkey,
    creator: payer.publicKey.toBase58(),
    threshold,
    members,
    timeLockSeconds,
  });

  const result = await submitInstructions(connection, [ix], payer, [createKey]);

  if (!result.success) {
    process.stderr.write(`Failed to stage multisig on chain: ${JSON.stringify(result.err)}\n`);
    if (result.logs.length > 0) {
      process.stderr.write(`Logs:\n${result.logs.join('\n')}\n`);
    }
    if (recordPath) {
      const record: EvidenceRecord = {
        command: 'stage-multisig',
        timestamp: new Date().toISOString(),
        cluster: 'devnet',
        genesisHash,
        inputs: { members, threshold, timeLockSeconds },
        addresses: { multisig, vault, createKey: createKeyPubkey, payer: payer.publicKey.toBase58() },
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

  process.stdout.write(`Staged multisig successfully!\n`);
  process.stdout.write(`  Multisig:   ${multisig}\n`);
  process.stdout.write(`  Vault:      ${vault}\n`);
  process.stdout.write(`  Create Key: ${createKeyPubkey}\n`);
  process.stdout.write(`  Threshold:  ${threshold} of ${members.length}\n`);
  process.stdout.write(`  Signature:  ${result.signature}\n`);
  process.stdout.write(`  Slot:       ${result.slot}\n`);

  if (recordPath) {
    const record: EvidenceRecord = {
      command: 'stage-multisig',
      timestamp: new Date().toISOString(),
      cluster: 'devnet',
      genesisHash,
      inputs: { members, threshold, timeLockSeconds },
      addresses: { multisig, vault, createKey: createKeyPubkey, payer: payer.publicKey.toBase58() },
      signatures: [result.signature],
      slots: { executionSlot: result.slot },
      outcome: 'success',
      result: {
        multisig,
        vault,
        threshold,
        memberCount: members.length,
      },
    };
    await writeEvidenceRecord(recordPath, record);
  }

  return 0;
}
