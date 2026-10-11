import type { Operation } from 'release-core';
import { settle } from 'release-core';
import { pollAndSettleOperation } from './settler';
import type { OperationPipelineInput, OperationPipelineResult } from './types';

/**
 * Executes the prepare -> hand-off -> sign -> settle pipeline for an operation.
 * Guarantees durable journal write before hand-off to wallet.
 * Implements Flow F10 steps 1-4.
 */
export async function executeOperationPipeline(
  input: OperationPipelineInput
): Promise<OperationPipelineResult> {
  const signer = input.walletSigner ?? (await import('../../wallet')).mwaSigner;
  const journal = input.journal ?? (await import('./journal')).documentStoreJournal;

  // Step 1: Prepare - durable write to journal BEFORE hand-off
  const preparedOp: Operation = {
    ...input.operation,
    phase: 'prepared',
    updatedAt: new Date().toISOString(),
  };
  await journal.saveOperation(preparedOp);
  console.log('[Recovery] Prepared operation durably written to journal:', preparedOp.id);
  input.onPhaseChange?.(preparedOp);

  // Step 2: Hand off - mark handed-off in journal
  const handedOffOp: Operation = {
    ...preparedOp,
    phase: 'handed-off',
    updatedAt: new Date().toISOString(),
  };
  await journal.saveOperation(handedOffOp);
  console.log('[Recovery] Handing off operation to wallet:', handedOffOp.id);
  input.onPhaseChange?.(handedOffOp);

  // Step 3: Sign
  let submittedOp: Operation | null = null;
  try {
    const submissionResult = await signer.signAndSubmit({
      cluster: input.cluster,
      member: handedOffOp.member,
      transaction: input.transaction,
      forceSignAndSendFallback: input.forceSignAndSendFallback,
      submit: async (wireBytes: Uint8Array) => {
        return await input.connection.sendRawTransaction(wireBytes, {
          skipPreflight: false,
        });
      },
    });

    submittedOp = {
      ...handedOffOp,
      phase: 'submitted',
      submission: submissionResult.submissionMethod,
      signature: submissionResult.signature,
      signedTransaction: submissionResult.signedTransaction,
      updatedAt: new Date().toISOString(),
    };
    await journal.saveOperation(submittedOp);
    console.log(
      '[Recovery] Operation submitted:',
      submittedOp.id,
      'signature:',
      submittedOp.signature
    );
    input.onPhaseChange?.(submittedOp);
  } catch (err: unknown) {
    console.log('[Recovery] Wallet signing/submission encountered error:', err);

    const isDeclined =
      (err as Record<string, unknown>)?.isUserDeclined === true ||
      String(err).toLowerCase().includes('declined');

    if (isDeclined) {
      const declinedOp = settle(
        handedOffOp,
        { userDeclined: true },
        new Date().toISOString()
      );
      await journal.saveOperation(declinedOp);
      input.onPhaseChange?.(declinedOp);
      return { operation: declinedOp };
    }

    // For any other unexpected submission failure, settle against chain
    const failedOrUnresolvedOp: Operation = {
      ...handedOffOp,
      phase: 'unresolved',
      updatedAt: new Date().toISOString(),
      resolution: `Submission exception: ${String(err)}`,
    };
    await journal.saveOperation(failedOrUnresolvedOp);
    input.onPhaseChange?.(failedOrUnresolvedOp);

    const settled = await pollAndSettleOperation(
      failedOrUnresolvedOp,
      input.chainReader,
      {
        journal,
        pollIntervalMs: input.pollIntervalMs,
        pollTimeoutMs: input.pollTimeoutMs,
        onPhaseChange: input.onPhaseChange,
      }
    );
    return { operation: settled };
  }

  // Step 4: Settle from chain state
  const settled = await pollAndSettleOperation(submittedOp, input.chainReader, {
    journal,
    pollIntervalMs: input.pollIntervalMs,
    pollTimeoutMs: input.pollTimeoutMs,
    onPhaseChange: input.onPhaseChange,
  });

  return { operation: settled };
}
