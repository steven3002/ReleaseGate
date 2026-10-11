import { PublicKey, Transaction } from '@solana/web3.js';
import {
  assessStoredTransaction,
  buildCreateGuardedProposal,
  buildGuardedUpgrade,
  decodeMultisigAccount,
  decodeProposalAccount,
  decodeStoredTransaction,
  deriveProgramDataAddress,
  deriveProposalPda,
  deriveTransactionPda,
  deriveVaultPda,
  toWeb3Instruction,
  type Operation,
} from 'release-core';
import { executeOperationPipeline } from '../../recovery';
import type {
  CreateGuardedProposalParams,
  CreateGuardedProposalResult,
  GuardedProposalPlan,
} from './types';

export async function prepareGuardedProposalPlan(
  params: CreateGuardedProposalParams
): Promise<GuardedProposalPlan> {
  const { workspace, selectedRelease, bufferAddress, spillAddress } = params;

  if (!workspace.member) {
    throw new Error('Workspace has no connected member wallet');
  }

  const vaultIndex = selectedRelease.manifest.vaultIndex ?? 0;
  const vault = deriveVaultPda(workspace.multisig, vaultIndex).address;
  const program = selectedRelease.manifest.program;
  const programData = deriveProgramDataAddress(program);
  const spill = spillAddress || workspace.member;
  const payloadLength = BigInt(selectedRelease.artifact.length);
  const keccak256 = selectedRelease.artifact.keccak256;
  const deploymentSlot = selectedRelease.manifest.expectedDeploymentSlot;

  // Read current multisig transactionIndex from chain
  const multisigRes = await params.chainReader.getAccounts([workspace.multisig]);
  const multisigAcc = multisigRes.accounts[0];
  if (!multisigAcc) {
    throw new Error(`Multisig account ${workspace.multisig} not found on chain`);
  }

  const decMultisig = decodeMultisigAccount(multisigAcc.data);
  if (!decMultisig.ok) {
    throw new Error(`Failed to decode multisig account: ${decMultisig.reason}`);
  }

  const transactionIndex = decMultisig.value.transactionIndex + 1n;

  return {
    multisig: workspace.multisig,
    transactionIndex,
    creator: workspace.member,
    vault,
    vaultIndex,
    program,
    programData,
    buffer: bufferAddress,
    spill,
    payloadLength,
    keccak256,
    deploymentSlot,
  };
}

/**
 * Creates a new guarded proposal (or guarded replacement) on chain.
 * Implements Flow F6 and fulfills Pass Marks 2, 3:
 * 1. Reads current multisig transactionIndex and plans new index = transactionIndex + 1.
 * 2. Builds 5 canonical instructions (buildGuardedUpgrade).
 * 3. Wraps with vaultTransactionCreate and proposalCreate at the new index.
 * 4. Signs and submits through recovery pipeline (Flow F10).
 * 5. Settles based on chain state (transaction and proposal account exist).
 * 6. Executes post-creation self-check: reads new transaction back and verifies shape
 *    is guarded-upgrade with identical parameters and creator has not approved.
 */
export async function executeCreateGuardedProposal(
  params: CreateGuardedProposalParams
): Promise<CreateGuardedProposalResult> {
  params.onStatusUpdate?.('Preparing guarded proposal plan...');
  const plan = await prepareGuardedProposalPlan(params);

  // Step 2: Build inner guarded upgrade instructions
  const innerCoreInstructions = buildGuardedUpgrade({
    program: plan.program,
    programData: plan.programData,
    buffer: plan.buffer,
    spill: plan.spill,
    vault: plan.vault,
    payloadLength: plan.payloadLength,
    keccak256: plan.keccak256,
    deploymentSlot: plan.deploymentSlot,
  });

  // Step 3: Wrap with vaultTransactionCreate and proposalCreate
  const outerCoreInstructions = buildCreateGuardedProposal({
    multisig: plan.multisig,
    transactionIndex: plan.transactionIndex,
    creator: plan.creator,
    vaultIndex: plan.vaultIndex,
    innerInstructions: innerCoreInstructions,
  });

  // Step 4: Assemble outer transaction
  const { blockhash, lastValidBlockHeight } =
    await params.connection.getLatestBlockhash('confirmed');

  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = new PublicKey(plan.creator);
  for (const ix of outerCoreInstructions) {
    tx.add(toWeb3Instruction(ix));
  }

  const opId = `create-guarded-${plan.multisig.slice(0, 8)}-${plan.transactionIndex}-${Date.now()}`;
  const operation: Operation = {
    id: opId,
    kind: 'create-guarded-proposal',
    clusterId: params.workspace.clusterId,
    multisig: plan.multisig,
    transactionIndex: plan.transactionIndex,
    member: plan.creator,
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

  if (pipelineResult.operation.phase !== 'confirmed') {
    return {
      success: false,
      operation: pipelineResult.operation,
      transactionIndex: plan.transactionIndex,
      selfCheckPassed: false,
      error:
        pipelineResult.operation.resolution ??
        `Operation ended in phase ${pipelineResult.operation.phase}`,
    };
  }

  // Step 6: Post-creation self-check
  params.onStatusUpdate?.('Running post-creation verification on chain...');
  const txPda = deriveTransactionPda(plan.multisig, plan.transactionIndex).address;
  const propPda = deriveProposalPda(plan.multisig, plan.transactionIndex).address;

  const { accounts, contextSlot } = await params.chainReader.getAccounts([
    txPda,
    propPda,
  ]);

  const txAcc = accounts[0];
  const propAcc = accounts[1];
  if (!txAcc || !propAcc) {
    return {
      success: false,
      operation: pipelineResult.operation,
      transactionIndex: plan.transactionIndex,
      selfCheckPassed: false,
      error: 'Self-check failed: created transaction or proposal account missing on chain',
    };
  }

  const decTx = decodeStoredTransaction(txPda, txAcc.data, contextSlot);
  if (!decTx.ok) {
    return {
      success: false,
      operation: pipelineResult.operation,
      transactionIndex: plan.transactionIndex,
      selfCheckPassed: false,
      error: `Self-check failed to decode stored transaction: ${decTx.reason}`,
    };
  }

  const guard = assessStoredTransaction(decTx.value);
  if (guard.shape !== 'guarded-upgrade') {
    return {
      success: false,
      operation: pipelineResult.operation,
      transactionIndex: plan.transactionIndex,
      selfCheckPassed: false,
      error: `Self-check failed: created transaction shape is ${guard.shape}, expected guarded-upgrade`,
    };
  }

  if (
    guard.params?.program !== plan.program ||
    guard.params?.buffer !== plan.buffer ||
    guard.params?.spill !== plan.spill ||
    guard.params?.keccak256 !== plan.keccak256 ||
    guard.params?.payloadLength !== plan.payloadLength ||
    guard.params?.deploymentSlot !== plan.deploymentSlot
  ) {
    return {
      success: false,
      operation: pipelineResult.operation,
      transactionIndex: plan.transactionIndex,
      selfCheckPassed: false,
      error: 'Self-check failed: created transaction parameters do not match release plan',
    };
  }

  const decProp = decodeProposalAccount(propAcc.data);
  if (!decProp.ok) {
    return {
      success: false,
      operation: pipelineResult.operation,
      transactionIndex: plan.transactionIndex,
      selfCheckPassed: false,
      error: 'Self-check failed to decode proposal account',
    };
  }

  if (decProp.value.approved.length !== 0) {
    return {
      success: false,
      operation: pipelineResult.operation,
      transactionIndex: plan.transactionIndex,
      selfCheckPassed: false,
      error: 'Self-check failed: proposal must have 0 approvals at creation',
    };
  }

  return {
    success: true,
    operation: pipelineResult.operation,
    transactionIndex: plan.transactionIndex,
    selfCheckPassed: true,
  };
}
