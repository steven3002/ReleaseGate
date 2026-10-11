import {
  readDeploymentState,
  reconcileDeployment,
  type DeploymentReceipt,
} from 'release-core';
import { getBlob } from '../../../platform/storage';
import { saveReceipt } from './receipt-store';
import type { GenerateReceiptParams } from './types';

/**
 * Reconciles post-execution deployment state and generates a durable DeploymentReceipt.
 * Implements Flow F9 and fulfills Pass Mark 8.
 */
export async function generateAndStoreReceipt(
  params: GenerateReceiptParams
): Promise<DeploymentReceipt> {
  const blobBytes = await getBlob(params.selectedRelease.artifact.sha256);
  if (!blobBytes) {
    throw new Error(
      `Artifact bytes for hash ${params.selectedRelease.artifact.sha256} not found in blob storage`
    );
  }

  const deploymentState = await readDeploymentState({
    chain: params.chainReader,
    program: params.program,
    bufferAddress: params.bufferAddress,
    signature: params.signature,
    commitment: 'confirmed',
  });

  const receipt = reconcileDeployment({
    clusterId: params.workspace.clusterId,
    genesisHash: params.cluster.genesisHash,
    multisig: params.workspace.multisig,
    transactionIndex: params.transactionIndex,
    vault: params.vault,
    program: params.program,
    expectedDeploymentSlot:
      params.selectedRelease.manifest.expectedDeploymentSlot,
    artifactSha256: params.selectedRelease.artifact.sha256,
    artifactKeccak256: params.selectedRelease.artifact.keccak256,
    artifactLength: params.selectedRelease.artifact.length,
    artifactBytes: blobBytes,
    manifestSha256: params.selectedRelease.manifestSha256,
    deploymentState,
    executionInfo: {
      signature: params.signature,
      slot: deploymentState.transactionOutcome?.slot,
      executor: params.executor,
      observedOnly: params.observedOnly ?? false,
    },
    commitment: 'confirmed',
    createdAt: new Date().toISOString(),
  });

  await saveReceipt(receipt);
  return receipt;
}
