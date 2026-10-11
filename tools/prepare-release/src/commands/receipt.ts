import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Connection } from '@solana/web3.js';
import {
  computeArtifactDigests,
  parseManifest,
  readDeploymentState,
  reconcileDeployment,
  Web3ChainReader,
} from 'release-core';
import { assertDevnetCluster } from '../signing/cluster-guard';
import type { EvidenceRecord } from '../records/record';
import { writeEvidenceRecord } from '../records/record';
import { getFlag, parseArgs } from './args';

export async function handleReceipt(args: readonly string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const multisig = getFlag(flags, 'multisig');
  const indexStr = getFlag(flags, 'index');
  const program = getFlag(flags, 'program');
  const manifestPath = getFlag(flags, 'manifest');
  const artifactPath = getFlag(flags, 'artifact');
  const executionSignature = getFlag(flags, 'execution-signature');
  const bufferAddress = getFlag(flags, 'buffer');
  const outPath = getFlag(flags, 'out');
  const recordPath = getFlag(flags, 'record');
  const rpcUrl = getFlag(flags, 'url') ?? 'https://api.devnet.solana.com';

  if (!multisig || !indexStr || !program || !manifestPath || !artifactPath) {
    process.stderr.write(
      'Usage: prepare-release receipt --multisig <pubkey> --index <n> --program <pubkey> --manifest <path> --artifact <path> [--execution-signature <sig>] [--buffer <pubkey>] [--out <path>] [--record <path>]\n',
    );
    return 2;
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await assertDevnetCluster(connection);
  const chainReader = new Web3ChainReader(connection);

  const manifestBytes = await fs.readFile(manifestPath);
  const parsed = parseManifest(new Uint8Array(manifestBytes));
  if (!parsed.ok) {
    process.stderr.write(`Failed to parse manifest: ${parsed.reason}\n`);
    return 1;
  }

  const artifactBytes = await fs.readFile(artifactPath);
  const digests = computeArtifactDigests(new Uint8Array(artifactBytes));
  const transactionIndex = BigInt(indexStr);

  const deploymentState = await readDeploymentState({
    chain: chainReader,
    program,
    bufferAddress: bufferAddress ?? '11111111111111111111111111111111',
    signature: executionSignature,
  });

  const receipt = reconcileDeployment({
    clusterId: 'devnet',
    genesisHash,
    multisig,
    transactionIndex,
    vault: parsed.manifest.vault,
    program,
    expectedDeploymentSlot: parsed.manifest.expectedDeploymentSlot,
    artifactSha256: digests.sha256,
    artifactKeccak256: digests.keccak256,
    artifactLength: digests.length,
    artifactBytes: new Uint8Array(artifactBytes),
    manifestSha256: parsed.manifestSha256,
    deploymentState,
    createdAt: new Date().toISOString(),
  });

  process.stdout.write(`=== Deployment Receipt ===\n`);
  process.stdout.write(`ID:                       ${receipt.id}\n`);
  process.stdout.write(`Cluster:                  ${receipt.clusterId}\n`);
  process.stdout.write(`Multisig:                 ${receipt.multisig}\n`);
  process.stdout.write(`Transaction Index:        ${receipt.transactionIndex}\n`);
  process.stdout.write(`Program:                  ${receipt.program}\n`);
  process.stdout.write(`ProgramData:              ${receipt.programData}\n`);
  process.stdout.write(`Deployed Slot:            ${receipt.deployed.slot}\n`);
  process.stdout.write(`Upgrade Authority:        ${receipt.deployed.upgradeAuthority ?? 'None'}\n`);
  process.stdout.write(`Payload Matches Artifact: ${receipt.deployed.payloadMatchesArtifact}\n`);
  process.stdout.write(`Trailing Bytes Zero:      ${receipt.deployed.trailingBytesAllZero}\n`);
  process.stdout.write(`Buffer Closed:            ${receipt.deployed.bufferClosed}\n`);
  process.stdout.write(`Observed Only:            ${receipt.execution.observedOnly}\n`);
  if (receipt.execution.signature) {
    process.stdout.write(`Execution Signature:      ${receipt.execution.signature}\n`);
  }

  const allChecksPass = receipt.checks.every(
    (c) => c.status === 'pass' || (!c.blocking && c.status === 'notice'),
  );

  const receiptJson = JSON.stringify(receipt, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);

  if (outPath) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, `${receiptJson}\n`, 'utf8');
    process.stdout.write(`Wrote receipt to ${outPath}\n`);
  }

  if (recordPath) {
    const record: EvidenceRecord = {
      command: 'receipt',
      timestamp: new Date().toISOString(),
      cluster: 'devnet',
      genesisHash,
      inputs: {
        multisig,
        transactionIndex: Number(transactionIndex),
        program,
        manifestPath,
        artifactPath,
        executionSignature,
      },
      addresses: {
        multisig,
        program,
        programData: receipt.programData,
      },
      signatures: receipt.execution.signature ? [receipt.execution.signature] : [],
      slots: {
        deployedSlot: Number(receipt.deployed.slot),
        expectedDeploymentSlot: Number(receipt.expectedDeploymentSlot),
      },
      outcome: allChecksPass ? 'success' : 'failure',
      result: JSON.parse(receiptJson),
    };
    await writeEvidenceRecord(recordPath, record);
  }

  return allChecksPass ? 0 : 1;
}
