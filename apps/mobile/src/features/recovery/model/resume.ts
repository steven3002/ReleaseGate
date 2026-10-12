import {
  CLUSTERS,
  type ChainReader,
  type Operation,
  observeOperation,
  settle,
} from 'release-core';
import { listDocuments } from '../../../platform/storage';
import {
  generateAndStoreReceipt,
  getReceiptForProposal,
} from '../../receipts';
import type { ImportedRelease } from '../../release-import/types';
import type { Workspace } from '../../workspace/types';
import { listOperations, saveOperation } from './journal';
import { TERMINAL_PHASES } from './types';

export interface ResumePendingOptions {
  readonly onSettled?: ((operation: Operation) => void) | undefined;
}

async function tryReconcileReceiptOnResume(
  op: Operation,
  chainReader: ChainReader
): Promise<void> {
  const existing = await getReceiptForProposal(op.multisig, op.transactionIndex);
  if (existing) {
    return;
  }

  const workspaces = await listDocuments<Workspace>('workspaces');
  const ws = workspaces.find((w) => w.multisig === op.multisig);
  if (!ws) {
    return;
  }

  const cluster = CLUSTERS[ws.clusterId];
  if (!cluster) {
    return;
  }

  const releases = await listDocuments<ImportedRelease>('releases');
  const targetProgram = op.boundTo?.program;
  const manifestSha = op.boundTo?.manifestSha256;
  const artifactSha = op.boundTo?.artifactSha256;

  const release =
    releases.find((r) => manifestSha && r.id === manifestSha) ??
    releases.find((r) => artifactSha && r.artifact.sha256 === artifactSha) ??
    releases.find((r) => targetProgram && r.manifest.program === targetProgram);

  if (!release) {
    return;
  }

  const vault = op.boundTo?.vault || release.manifest.vault;
  const program = targetProgram || release.manifest.program;
  const bufferAddress = release.manifest.buffer || '';

  await generateAndStoreReceipt({
    workspace: ws,
    cluster,
    transactionIndex: op.transactionIndex,
    vault,
    program,
    bufferAddress,
    selectedRelease: release,
    chainReader,
    signature: op.signature,
    executor: op.member,
    observedOnly: !op.signature,
  });
}

/**
 * Resumes and settles all non-terminal operations currently in the journal.
 * Implements Flow F10 step 5.
 */
export async function resumePendingOperations(
  chainReader: ChainReader,
  options?: ResumePendingOptions | undefined
): Promise<Operation[]> {
  const allOps = await listOperations();
  const pendingOps = allOps.filter((op) => !TERMINAL_PHASES.has(op.phase));
  const settledOps: Operation[] = [];

  for (const op of pendingOps) {
    const observation = await observeOperation(chainReader, op);
    const settledOp = settle(op, observation, new Date().toISOString());

    if (settledOp.phase !== op.phase || settledOp.resolution !== op.resolution) {
      await saveOperation(settledOp);
      options?.onSettled?.(settledOp);
    }

    if (settledOp.kind === 'execute' && settledOp.phase === 'confirmed') {
      try {
        await tryReconcileReceiptOnResume(settledOp, chainReader);
      } catch (err) {
        console.warn('[Recovery] Failed to generate receipt on resume:', err);
      }
    }

    settledOps.push(settledOp);
  }

  return settledOps;
}
