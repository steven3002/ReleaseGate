import { Connection } from '@solana/web3.js';
import { buildApprove, buildReject } from 'release-core';
import { assertDevnetCluster } from '../signing/cluster-guard';
import { loadKeypairFile } from '../signing/keypair-file';
import { submitInstructions } from '../signing/submit';
import type { EvidenceRecord } from '../records/record';
import { writeEvidenceRecord } from '../records/record';
import { getFlag, parseArgs } from './args';

export async function handleVote(args: readonly string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const multisig = getFlag(flags, 'multisig');
  const indexStr = getFlag(flags, 'index');
  const action = (getFlag(flags, 'action') ?? 'approve') as 'approve' | 'reject';
  const memberPath = getFlag(flags, 'member');
  const recordPath = getFlag(flags, 'record');
  const rpcUrl = getFlag(flags, 'url') ?? 'https://api.devnet.solana.com';

  if (!multisig || !indexStr || !memberPath) {
    process.stderr.write(
      'Usage: prepare-release vote --multisig <pubkey> --index <n> --member <keypair-path> [--action approve|reject] [--record <path>]\n',
    );
    return 2;
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await assertDevnetCluster(connection);

  const member = await loadKeypairFile(memberPath);
  const memberPubkey = member.publicKey.toBase58();
  const transactionIndex = BigInt(indexStr);

  const ix =
    action === 'approve'
      ? buildApprove({ multisig, transactionIndex, member: memberPubkey })
      : buildReject({ multisig, transactionIndex, member: memberPubkey });

  process.stdout.write(`Submitting ${action} for proposal ${transactionIndex} as member ${memberPubkey}...\n`);

  const result = await submitInstructions(connection, [ix], member);

  if (!result.success) {
    process.stderr.write(`Failed to ${action} proposal: ${JSON.stringify(result.err)}\n`);
    if (result.logs.length > 0) {
      process.stderr.write(`Logs:\n${result.logs.join('\n')}\n`);
    }
    if (recordPath) {
      const record: EvidenceRecord = {
        command: 'vote',
        timestamp: new Date().toISOString(),
        cluster: 'devnet',
        genesisHash,
        inputs: {
          multisig,
          transactionIndex: Number(transactionIndex),
          action,
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

  process.stdout.write(`Vote (${action}) confirmed!\n`);
  process.stdout.write(`  Signature: ${result.signature}\n`);
  process.stdout.write(`  Slot:      ${result.slot}\n`);

  if (recordPath) {
    const record: EvidenceRecord = {
      command: 'vote',
      timestamp: new Date().toISOString(),
      cluster: 'devnet',
      genesisHash,
      inputs: {
        multisig,
        transactionIndex: Number(transactionIndex),
        action,
      },
      addresses: {
        multisig,
        member: memberPubkey,
      },
      signatures: [result.signature],
      slots: { executionSlot: result.slot },
      outcome: 'success',
      result: {
        action,
        member: memberPubkey,
      },
    };
    await writeEvidenceRecord(recordPath, record);
  }

  return 0;
}
