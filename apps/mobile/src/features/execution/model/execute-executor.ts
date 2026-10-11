import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  buildExecute,
  readProposal,
  toWeb3Instruction,
  type Operation,
} from 'release-core';
import { evaluateReview } from '../../proposal-review/model/review-evaluator';
import { executeOperationPipeline } from '../../recovery';
import type { ExecuteProposalParams, ExecuteProposalResult } from './types';

function makeFailedOperation(
  params: ExecuteProposalParams,
  reason: string
): Operation {
  return {
    id: `execute-${params.workspace.multisig.slice(0, 8)}-${params.transactionIndex}-${Date.now()}`,
    kind: 'execute',
    clusterId: params.workspace.clusterId,
    multisig: params.workspace.multisig,
    transactionIndex: params.transactionIndex,
    member: params.workspace.member || '',
    phase: 'failed',
    submission: 'app-rpc',
    blockhash: '',
    lastValidBlockHeight: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolution: reason,
  };
}

/**
 * Executes proposal upgrade transaction through the journaled recovery pipeline.
 * Implements Flow F8 and resolves [M-23]:
 * 1. Re-verifies immediately before building.
 * 2. Builds vaultTransactionExecute instruction.
 * 3. Simulates transaction against current state. If simulation fails due to Lighthouse
 *    assertion, stops and shows "Execution conditions no longer hold" without sending anything.
 * 4. Sizes compute-unit limit from simulated consumption with +50k margin.
 * 5. Signs and submits through recovery pipeline (Flow F10).
 * 6. Settles based on chain state (proposal status Executed).
 */
export async function executeProposal(
  params: ExecuteProposalParams
): Promise<ExecuteProposalResult> {
  if (!params.workspace.member) {
    const reason = 'Workspace has no connected member wallet';
    return {
      success: false,
      error: reason,
      operation: makeFailedOperation(params, reason),
    };
  }

  params.onStatusUpdate?.('Re-verifying execution conditions on chain...');

  // Step 1: Re-run reader and verification
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

  if (!freshVerdict.actions.execute.allowed) {
    const isConditionsNotHolding =
      freshVerdict.executionConditions === 'not-holding' ||
      freshVerdict.actions.execute.reasons.some(
        (r) => r.includes('deployment.slot') || r.includes('Execution conditions')
      );
    const reason = isConditionsNotHolding
      ? 'Execution conditions no longer hold'
      : `Execution blocked: ${freshVerdict.actions.execute.reasons.join('; ')}`;

    return {
      success: false,
      executionConditionsFailed: isConditionsNotHolding,
      error: reason,
      operation: makeFailedOperation(params, reason),
    };
  }

  params.onStatusUpdate?.('Building execute instruction...');

  // Step 2: Build vaultTransactionExecute
  const executeCoreIx = await buildExecute({
    chain: params.chainReader,
    multisig: params.workspace.multisig,
    transactionIndex: params.transactionIndex,
    member: params.workspace.member,
  });

  const executeWeb3Ix = toWeb3Instruction(executeCoreIx);

  // Step 3: Simulate before sending
  params.onStatusUpdate?.('Simulating execution transaction against devnet...');
  const { blockhash, lastValidBlockHeight } =
    await params.connection.getLatestBlockhash('confirmed');

  const simTx = new Transaction();
  simTx.recentBlockhash = blockhash;
  simTx.feePayer = new PublicKey(params.workspace.member);
  simTx.add(executeWeb3Ix);

  const simResult = await params.connection.simulateTransaction(simTx);
  const simErr = simResult.value.err;
  const logs = simResult.value.logs || [];

  if (simErr) {
    const isLighthouseFailure =
      logs.some(
        (l) =>
          l.includes('0x1771') ||
          l.includes('AssertionFailed') ||
          l.includes('6001') ||
          l.includes('Result (Failed)')
      ) || JSON.stringify(simErr).includes('6001');

    const reason = isLighthouseFailure
      ? 'Execution conditions no longer hold'
      : `Simulation failed: ${JSON.stringify(simErr)}`;

    return {
      success: false,
      executionConditionsFailed: isLighthouseFailure,
      error: reason,
      operation: makeFailedOperation(params, reason),
    };
  }

  // Step 4: Compute budget sizing
  const simulatedUnitsConsumed = simResult.value.unitsConsumed ?? 200_000;
  const computeUnitLimit = Math.min(1_400_000, simulatedUnitsConsumed + 50_000);

  // Step 5: Assemble final transaction with compute unit limit
  const finalTx = new Transaction();
  finalTx.recentBlockhash = blockhash;
  finalTx.feePayer = new PublicKey(params.workspace.member);
  finalTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }));
  finalTx.add(executeWeb3Ix);

  const opId = `execute-${params.workspace.multisig.slice(0, 8)}-${params.transactionIndex}-${Date.now()}`;
  const operation: Operation = {
    id: opId,
    kind: 'execute',
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

  // Step 6: Execute pipeline
  const pipelineResult = await executeOperationPipeline({
    operation,
    transaction: finalTx,
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
    simulatedUnitsConsumed,
    computeUnitLimit,
    error:
      pipelineResult.operation.phase !== 'confirmed'
        ? pipelineResult.operation.resolution ?? `Operation ${pipelineResult.operation.phase}`
        : undefined,
  };
}
