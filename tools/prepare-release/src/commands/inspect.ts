import * as fs from 'node:fs/promises';
import { Connection } from '@solana/web3.js';
import {
  CLUSTERS,
  computeArtifactDigests,
  evaluate,
  getMemberCapabilities,
  type ImportedRelease,
  parseManifest,
  readProposal,
  type ReviewVerdict,
  verify,
  Web3ChainReader,
  type VerificationWorkspace,
} from 'release-core';
import { assertDevnetCluster } from '../signing/cluster-guard';
import { formatVerdictText } from '../rendering/verdict-text';
import type { EvidenceRecord } from '../records/record';
import { writeEvidenceRecord } from '../records/record';
import { getBooleanFlag, getFlag, parseArgs } from './args';

export async function handleInspect(args: readonly string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const multisig = getFlag(flags, 'multisig');
  const indexStr = getFlag(flags, 'index');
  const manifestPath = getFlag(flags, 'manifest');
  const artifactPath = getFlag(flags, 'artifact');
  const member = getFlag(flags, 'member');
  const jsonOutput = getBooleanFlag(flags, 'json');
  const recordPath = getFlag(flags, 'record');
  const rpcUrl = getFlag(flags, 'url') ?? 'https://api.devnet.solana.com';

  if (!multisig || !indexStr) {
    process.stderr.write(
      'Usage: prepare-release inspect --multisig <pubkey> --index <n> [--manifest <path>] [--artifact <path>] [--member <pubkey>] [--json] [--record <path>]\n',
    );
    return 2;
  }

  const transactionIndex = BigInt(indexStr);
  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await assertDevnetCluster(connection);
  const chainReader = new Web3ChainReader(connection);

  const inspection = await readProposal(chainReader, { multisig, transactionIndex });

  let verdict: ReviewVerdict | undefined;

  if (manifestPath && artifactPath) {
    const manifestBytes = await fs.readFile(manifestPath);
    const parsedManifest = parseManifest(new Uint8Array(manifestBytes));
    if (!parsedManifest.ok) {
      process.stderr.write(`Failed to parse manifest: ${parsedManifest.reason}\n`);
      return 1;
    }

    const artifactBytes = await fs.readFile(artifactPath);
    const digests = computeArtifactDigests(new Uint8Array(artifactBytes));

    const importedRelease: ImportedRelease = {
      id: parsedManifest.manifestSha256,
      manifest: parsedManifest.manifest,
      manifestSha256: parsedManifest.manifestSha256,
      artifact: {
        sha256: digests.sha256,
        keccak256: digests.keccak256,
        verifiedBuildSha256: digests.verifiedBuildSha256,
        length: digests.length,
        storageRef: artifactPath,
        bytes: new Uint8Array(artifactBytes),
      },
      artifactSource: { channel: 'file-picker', size: digests.length, importedAt: new Date().toISOString() },
      manifestSource: { channel: 'file-picker', size: manifestBytes.length, importedAt: new Date().toISOString() },
      attestation: { statementVersion: '1', confirmedAt: new Date().toISOString() },
    };

    const targetMember = member ?? inspection.multisig.members[0]?.address ?? '';
    const workspace: VerificationWorkspace = {
      id: 'desktop-workspace',
      clusterId: 'devnet',
      rpcUrl,
      multisig,
      rpcGenesisHash: genesisHash,
    };

    const checks = verify({
      workspace,
      multisig: inspection.multisig,
      proposal: inspection.proposal,
      storedTransaction: inspection.transaction,
      guardAssessment: inspection.guard,
      classifiedInstructions: inspection.instructions,
      chainEvidence: inspection.evidence,
      release: importedRelease,
    });

    verdict = evaluate({
      checks,
      shape: inspection.guard.shape,
      cluster: CLUSTERS.devnet,
      proposal: inspection.proposal,
      multisig: inspection.multisig,
      memberAddress: targetMember,
      memberCapabilities: getMemberCapabilities(inspection.multisig.members, targetMember),
      currentTimeSeconds: Math.floor(Date.now() / 1000),
      hasReviewedArtifact: true,
    });
  } else {
    // If no release was provided, run evaluation with available checks
    const targetMember = member ?? inspection.multisig.members[0]?.address ?? '';
    const workspace: VerificationWorkspace = {
      id: 'desktop-workspace',
      clusterId: 'devnet',
      rpcUrl,
      multisig,
      rpcGenesisHash: genesisHash,
    };

    const checks = verify({
      workspace,
      multisig: inspection.multisig,
      proposal: inspection.proposal,
      storedTransaction: inspection.transaction,
      guardAssessment: inspection.guard,
      classifiedInstructions: inspection.instructions,
      chainEvidence: inspection.evidence,
    });

    verdict = evaluate({
      checks,
      shape: inspection.guard.shape,
      cluster: CLUSTERS.devnet,
      proposal: inspection.proposal,
      multisig: inspection.multisig,
      memberAddress: targetMember,
      memberCapabilities: getMemberCapabilities(inspection.multisig.members, targetMember),
      currentTimeSeconds: Math.floor(Date.now() / 1000),
      hasReviewedArtifact: false,
    });
  }

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify({ inspection, verdict }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n`);
  } else {
    process.stdout.write(`${formatVerdictText(verdict, inspection)}\n`);
  }

  if (recordPath) {
    const record: EvidenceRecord = {
      command: 'inspect',
      timestamp: new Date().toISOString(),
      cluster: 'devnet',
      genesisHash,
      inputs: {
        multisig,
        transactionIndex: Number(transactionIndex),
        manifestPath,
        artifactPath,
      },
      addresses: {
        multisig,
        proposal: inspection.proposal.multisig,
      },
      signatures: [],
      slots: {
        contextSlot: inspection.evidence.contextSlot,
      },
      outcome: 'success',
      result: {
        shape: inspection.guard.shape,
        artifactMatch: verdict.artifactMatch,
        executionConditions: verdict.executionConditions,
        verdict: JSON.parse(JSON.stringify(verdict, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))),
      },
    };
    await writeEvidenceRecord(recordPath, record);
  }

  return 0;
}
