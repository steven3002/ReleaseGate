import * as fs from 'node:fs/promises';
import { Connection } from '@solana/web3.js';
import {
  buildCreateGuardedProposal,
  buildGuardedUpgrade,
  computeArtifactDigests,
  decodeMultisigAccount,
  decodeProgramDataAccount,
  deriveProgramDataAddress,
  deriveVaultPda,
  encodeLighthouseAssertion,
  encodeUpgradeInstruction,
  type Instruction,
  LOADER_V3_PROGRAM_ID,
  parseManifest,
  SYSVAR_CLOCK_ID,
  SYSVAR_RENT_ID,
  Web3ChainReader,
} from 'release-core';
import { assertDevnetCluster } from '../signing/cluster-guard';
import { loadKeypairFile } from '../signing/keypair-file';
import { submitInstructions } from '../signing/submit';
import type { EvidenceRecord } from '../records/record';
import { writeEvidenceRecord } from '../records/record';
import { getFlag, parseArgs } from './args';

export async function handlePropose(args: readonly string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const multisig = getFlag(flags, 'multisig');
  const vaultIndexStr = getFlag(flags, 'vault-index') ?? '0';
  const program = getFlag(flags, 'program');
  const buffer = getFlag(flags, 'buffer');
  const spill = getFlag(flags, 'spill');
  const creatorPath = getFlag(flags, 'creator');
  const manifestPath = getFlag(flags, 'manifest');
  const artifactPath = getFlag(flags, 'artifact');
  const slotStr = getFlag(flags, 'slot');
  const kind = (getFlag(flags, 'kind') ?? 'guarded') as 'guarded' | 'no-slot-guard' | 'unguarded';
  const recordPath = getFlag(flags, 'record');
  const rpcUrl = getFlag(flags, 'url') ?? 'https://api.devnet.solana.com';

  if (!multisig || !program || !buffer || !creatorPath) {
    process.stderr.write(
      'Usage: prepare-release propose --multisig <pubkey> --program <pubkey> --buffer <pubkey> --creator <keypair-path> [--kind guarded|no-slot-guard|unguarded] [--manifest <path>] [--artifact <path>] [--slot <n>] [--spill <pubkey>] [--record <path>]\n',
    );
    return 2;
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await assertDevnetCluster(connection);
  const chainReader = new Web3ChainReader(connection);

  const creator = await loadKeypairFile(creatorPath);
  const creatorPubkey = creator.publicKey.toBase58();
  const spillRecipient = spill ?? creatorPubkey;
  const vaultIndex = parseInt(vaultIndexStr, 10);
  const vault = deriveVaultPda(multisig, vaultIndex).address;
  const programData = deriveProgramDataAddress(program);

  // Fetch multisig to determine transaction index
  const { accounts: multisigAccounts } = await chainReader.getAccounts([multisig]);
  const multisigAcc = multisigAccounts[0];
  if (!multisigAcc) {
    process.stderr.write(`Multisig account ${multisig} not found on chain\n`);
    return 1;
  }
  const decodedMultisig = decodeMultisigAccount(multisigAcc.data);
  if (!decodedMultisig.ok) {
    process.stderr.write(`Failed to decode multisig account: ${decodedMultisig.reason}\n`);
    return 1;
  }
  const plannedTransactionIndex = decodedMultisig.value.transactionIndex + 1n;

  // Resolve artifact digests and expected slot
  let payloadLength = 0n;
  let keccak256Hash = '';
  let expectedDeploymentSlot = 0n;

  if (manifestPath) {
    const manifestBytes = await fs.readFile(manifestPath);
    const parsed = parseManifest(new Uint8Array(manifestBytes));
    if (!parsed.ok) {
      process.stderr.write(`Failed to parse manifest: ${parsed.reason}\n`);
      return 1;
    }
    payloadLength = BigInt(parsed.manifest.artifact.length);
    keccak256Hash = parsed.manifest.artifact.keccak256;
    expectedDeploymentSlot = parsed.manifest.expectedDeploymentSlot;
  } else if (artifactPath) {
    const artBytes = await fs.readFile(artifactPath);
    const digests = computeArtifactDigests(new Uint8Array(artBytes));
    payloadLength = BigInt(digests.length);
    keccak256Hash = digests.keccak256;
    if (slotStr !== undefined) {
      expectedDeploymentSlot = BigInt(slotStr);
    } else {
      const { accounts: pdAccounts } = await chainReader.getAccounts([programData]);
      const pdAcc = pdAccounts[0];
      if (pdAcc) {
        const decodedPd = decodeProgramDataAccount(pdAcc.data);
        if (decodedPd.ok) {
          expectedDeploymentSlot = decodedPd.value.slot;
        }
      }
    }
  } else if (slotStr !== undefined) {
    expectedDeploymentSlot = BigInt(slotStr);
  }

  let innerInstructions: Instruction[];

  if (kind === 'guarded') {
    if (payloadLength === 0n || !keccak256Hash) {
      process.stderr.write('Guarded proposal requires --manifest or --artifact to extract payload length and keccak256\n');
      return 2;
    }
    innerInstructions = buildGuardedUpgrade({
      program,
      programData,
      buffer,
      spill: spillRecipient,
      vault,
      payloadLength,
      keccak256: keccak256Hash,
      deploymentSlot: expectedDeploymentSlot,
    });
  } else if (kind === 'no-slot-guard') {
    if (payloadLength === 0n || !keccak256Hash) {
      process.stderr.write('no-slot-guard proposal requires --manifest or --artifact to extract payload length and keccak256\n');
      return 2;
    }
    const ix1 = encodeLighthouseAssertion({
      kind: 'buffer-owner',
      target: buffer,
      owner: LOADER_V3_PROGRAM_ID,
    });
    const ix2 = encodeLighthouseAssertion({
      kind: 'buffer-length',
      target: buffer,
      length: 37n + payloadLength,
    });
    const ix3 = encodeLighthouseAssertion({
      kind: 'buffer-hash',
      target: buffer,
      keccak256: keccak256Hash,
      start: 37n,
      length: payloadLength,
    });
    const ixUpgrade = encodeUpgradeInstruction({
      programData,
      program,
      buffer,
      spill: spillRecipient,
      rentSysvar: SYSVAR_RENT_ID,
      clockSysvar: SYSVAR_CLOCK_ID,
      authority: vault,
    });
    innerInstructions = [ix1, ix2, ix3, ixUpgrade];
  } else {
    // unguarded
    const ixUpgrade = encodeUpgradeInstruction({
      programData,
      program,
      buffer,
      spill: spillRecipient,
      rentSysvar: SYSVAR_RENT_ID,
      clockSysvar: SYSVAR_CLOCK_ID,
      authority: vault,
    });
    innerInstructions = [ixUpgrade];
  }

  const createInstructions = buildCreateGuardedProposal({
    multisig,
    transactionIndex: plannedTransactionIndex,
    creator: creatorPubkey,
    vaultIndex,
    innerInstructions,
  });

  process.stdout.write(
    `Submitting proposal (kind: ${kind}, index: ${plannedTransactionIndex}, inner instructions: ${innerInstructions.length})...\n`,
  );

  const result = await submitInstructions(connection, createInstructions, creator);

  if (!result.success) {
    process.stderr.write(`Failed to create proposal on chain: ${JSON.stringify(result.err)}\n`);
    if (result.logs.length > 0) {
      process.stderr.write(`Logs:\n${result.logs.join('\n')}\n`);
    }
    if (recordPath) {
      const record: EvidenceRecord = {
        command: 'propose',
        timestamp: new Date().toISOString(),
        cluster: 'devnet',
        genesisHash,
        inputs: {
          multisig,
          program,
          buffer,
          kind,
          plannedTransactionIndex: Number(plannedTransactionIndex),
          expectedDeploymentSlot,
        },
        addresses: {
          multisig,
          program,
          programData,
          buffer,
          vault,
          spill: spillRecipient,
          creator: creatorPubkey,
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

  process.stdout.write(`Proposal created successfully!\n`);
  process.stdout.write(`  Multisig:          ${multisig}\n`);
  process.stdout.write(`  Transaction Index: ${plannedTransactionIndex}\n`);
  process.stdout.write(`  Proposal Kind:     ${kind}\n`);
  process.stdout.write(`  Tx Size:           ${result.serializedTxSize} bytes\n`);
  process.stdout.write(`  Signature:         ${result.signature}\n`);
  process.stdout.write(`  Slot:              ${result.slot}\n`);

  if (recordPath) {
    const record: EvidenceRecord = {
      command: 'propose',
      timestamp: new Date().toISOString(),
      cluster: 'devnet',
      genesisHash,
      inputs: {
        multisig,
        program,
        buffer,
        kind,
        plannedTransactionIndex: Number(plannedTransactionIndex),
        expectedDeploymentSlot: expectedDeploymentSlot.toString(),
        innerInstructionCount: innerInstructions.length,
      },
      addresses: {
        multisig,
        program,
        programData,
        buffer,
        vault,
        spill: spillRecipient,
        creator: creatorPubkey,
      },
      signatures: [result.signature],
      slots: { executionSlot: result.slot },
      outcome: 'success',
      result: {
        transactionIndex: Number(plannedTransactionIndex),
        kind,
        serializedTxSize: result.serializedTxSize,
      },
    };
    await writeEvidenceRecord(recordPath, record);
  }

  return 0;
}
