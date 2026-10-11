import {
  CLUSTERS,
  evaluate,
  getMemberCapabilities,
  verify,
  type ImportedRelease as CoreImportedRelease,
  type ReviewVerdict,
  type VerificationWorkspace,
} from 'release-core';
import { getBlob } from '../../../platform/storage';
import type { Workspace } from '../../workspace';
import type { ImportedRelease } from '../../release-import';
import type { ProposalInspection } from 'release-core';

export interface EvaluateReviewInput {
  readonly workspace: Workspace;
  readonly inspection: ProposalInspection;
  readonly selectedRelease: ImportedRelease | null;
  readonly memberAddress?: string | undefined;
}

export async function evaluateReview(
  input: EvaluateReviewInput
): Promise<{ verdict: ReviewVerdict }> {
  const { workspace, inspection, selectedRelease, memberAddress } = input;

  let coreRelease: CoreImportedRelease | undefined;
  if (selectedRelease) {
    const blobBytes = await getBlob(selectedRelease.artifact.sha256);
    coreRelease = {
      id: selectedRelease.id,
      manifest: selectedRelease.manifest,
      manifestSha256: selectedRelease.manifestSha256,
      artifact: {
        sha256: selectedRelease.artifact.sha256,
        keccak256: selectedRelease.artifact.keccak256,
        verifiedBuildSha256: selectedRelease.artifact.verifiedBuildSha256,
        length: selectedRelease.artifact.length,
        storageRef: selectedRelease.artifact.storageRef,
        bytes: blobBytes ?? undefined,
      },
      artifactSource: selectedRelease.artifactSource
        ? {
            channel: selectedRelease.artifactSource.channel,
            size: selectedRelease.artifactSource.size ?? selectedRelease.artifact.length,
            importedAt: selectedRelease.artifactSource.importedAt,
          }
        : undefined,
      manifestSource: selectedRelease.manifestSource
        ? {
            channel: selectedRelease.manifestSource.channel,
            size: selectedRelease.manifestSource.size ?? 0,
            importedAt: selectedRelease.manifestSource.importedAt,
          }
        : undefined,
      attestation: selectedRelease.attestation
        ? {
            statementVersion: String(selectedRelease.attestation.statementVersion),
            confirmedAt: selectedRelease.attestation.confirmedAt,
          }
        : undefined,
    };
  }

  const verificationWorkspace: VerificationWorkspace = {
    id: workspace.id,
    clusterId: workspace.clusterId,
    rpcUrl: workspace.rpcUrl,
    multisig: workspace.multisig,
    rpcGenesisHash: CLUSTERS[workspace.clusterId].genesisHash,
  };

  const checks = verify({
    workspace: verificationWorkspace,
    multisig: inspection.multisig,
    proposal: inspection.proposal,
    storedTransaction: inspection.transaction,
    guardAssessment: inspection.guard,
    classifiedInstructions: inspection.instructions,
    chainEvidence: inspection.evidence,
    release: coreRelease,
  });

  const memberCapabilities = memberAddress
    ? getMemberCapabilities(inspection.multisig.members, memberAddress)
    : undefined;

  const verdict = evaluate({
    checks,
    shape: inspection.guard.shape,
    cluster: CLUSTERS[workspace.clusterId],
    proposal: inspection.proposal,
    multisig: inspection.multisig,
    memberAddress,
    memberCapabilities,
    currentTimeSeconds: Math.floor(Date.now() / 1000),
    hasReviewedArtifact: coreRelease !== undefined,
  });

  return { verdict };
}
