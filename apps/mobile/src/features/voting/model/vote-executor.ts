import { PublicKey, Transaction } from '@solana/web3.js';
import {
  buildApprove,
  buildReject,
  readProposal,
  toWeb3Instruction,
  type Operation,
} from 'release-core';
import { evaluateReview } from '../../proposal-review/model/review-evaluator';
import { executeOperationPipeline } from '../../recovery';
import type { VoteExecutionParams, VoteExecutionResult } from './types';

function makeDeclinedOrFailedOperation(
  params: VoteExecutionParams,
  phase: 'failed',
  reason: string
): Operation {
  return {
    id: `vote-${params.action}-${params.workspace.multisig.slice(0, 8)}-${params.transactionIndex}-${Date.now()}`,
    kind: params.action,
    clusterId: params.workspace.clusterId,
    multisig: params.workspace.multisig,
    transactionIndex: params.transactionIndex,
    member: params.workspace.member || '',
    phase,
    submission: 'app-rpc',
    blockhash: '',
    lastValidBlockHeight: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolution: reason,
  };
}

/**
 * Executes an Approve or Reject vote through the journaled recovery pipeline.
 * Implements Flow F7:
 * 1. Re-verifies immediately before building.
 * 2. Stops and returns the new verdict if state/verdict changed.
 * 3. Builds proposalApprove or proposalReject instruction.
 * 4. Signs and submits through recovery pipeline (Flow F10).
 * 5. Settles based on chain state (member appears in approved/rejected list).
 */
export async function executeVote(
  params: VoteExecutionParams
): Promise<VoteExecutionResult> {
  if (!params.workspace.member) {
    const reason = 'Workspace has no connected member wallet';
    return {
      success: false,
      error: reason,
      operation: makeDeclinedOrFailedOperation(params, 'failed', reason),
    };
  }

  params.onStatusUpdate?.('Re-verifying proposal state on chain...');

  // Step 1: Re-run reader and verification immediately before building
  const inspection = await readProposal(params.chainReader, {
    multisig: params.workspace.multisig,
    transactionIndex: params.transactionIndex,
  });

  const { verdict: freshVerdict } = await evaluateReview({
    workspace: params.workspace,
    inspection,
    selectedRelease: params.selectedRelease,
    memberAddress: params.workspace.member,
  });

  // Step 2: Check action eligibility on fresh state
  if (params.action === 'approve') {
    if (!freshVerdict.actions.approve.allowed) {
      const reason = `Approve is blocked: ${freshVerdict.actions.approve.reasons.join('; ')}`;
      return {
        success: false,
        newVerdict: freshVerdict,
        error: reason,
        operation: makeDeclinedOrFailedOperation(params, 'failed', reason),
      };
    }
  } else {
    if (!freshVerdict.actions.reject.allowed) {
      const reason = `Reject is blocked: ${freshVerdict.actions.reject.reasons.join('; ')}`;
      return {
        success: false,
        newVerdict: freshVerdict,
        error: reason,
        operation: makeDeclinedOrFailedOperation(params, 'failed', reason),
      };
    }
  }

  // Ensure verdict has not changed compared to reviewer's seen state
  if (
    freshVerdict.artifactMatch !== params.expectedVerdict.artifactMatch ||
    freshVerdict.executionConditions !== params.expectedVerdict.executionConditions
  ) {
    const reason = 'Proposal state or verdict changed on chain before voting';
    return {
      success: false,
      newVerdict: freshVerdict,
      error: reason,
      operation: makeDeclinedOrFailedOperation(params, 'failed', reason),
    };
  }

  params.onStatusUpdate?.('Preparing vote transaction...');

  // Step 3: Build instruction
  const coreInstruction =
    params.action === 'approve'
      ? buildApprove({
          multisig: params.workspace.multisig,
          transactionIndex: params.transactionIndex,
          member: params.workspace.member,
        })
      : buildReject({
          multisig: params.workspace.multisig,
          transactionIndex: params.transactionIndex,
          member: params.workspace.member,
        });

  const web3Instruction = toWeb3Instruction(coreInstruction);

  // Step 4: Assemble transaction and prepare operation
  const { blockhash, lastValidBlockHeight } =
    await params.connection.getLatestBlockhash('confirmed');

  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = new PublicKey(params.workspace.member);
  tx.add(web3Instruction);

  const opId = `vote-${params.action}-${params.workspace.multisig.slice(0, 8)}-${params.transactionIndex}-${Date.now()}`;
  const operation: Operation = {
    id: opId,
    kind: params.action,
    clusterId: params.workspace.clusterId,
    multisig: params.workspace.multisig,
    transactionIndex: params.transactionIndex,
    member: params.workspace.member,
    boundTo: freshVerdict.boundTo,
    phase: 'prepared',
    submission: 'app-rpc',
    blockhash,
    lastValidBlockHeight,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  params.onStatusUpdate?.('Awaiting wallet authorization & signing...');

  // Step 5: Execute pipeline
  const pipelineResult = await executeOperationPipeline({
    operation,
    transaction: tx,
    cluster: params.cluster,
    connection: params.connection,
    chainReader: params.chainReader,
    walletSigner: params.walletSigner,
    forceSignAndSendFallback: params.forceSignAndSendFallback,
    onPhaseChange: params.onPhaseChange,
  });

  return {
    success: pipelineResult.operation.phase === 'confirmed',
    operation: pipelineResult.operation,
    newVerdict: freshVerdict,
    error:
      pipelineResult.operation.phase !== 'confirmed'
        ? pipelineResult.operation.resolution ?? `Operation ${pipelineResult.operation.phase}`
        : undefined,
  };
}
