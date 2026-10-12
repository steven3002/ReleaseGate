import type { Operation } from 'release-core';
import { observeOperation, settle } from 'release-core';
import { pollAndSettleOperation } from './settler';
import type { OperationPipelineInput, OperationPipelineResult } from './types';

const NETWORK_RETRY_DELAYS_MS = [400, 800, 1600];

function isNetworkFailure(err: unknown): boolean {
  const text = String(err).toLowerCase();
  return (
    text.includes('fetch failed') ||
    text.includes('network request failed') ||
    text.includes('unable to resolve host')
  );
}

/**
 * Retries a call that failed for lack of connectivity, which happens briefly
 * while this app returns to the foreground from the wallet.
 */
async function withNetworkRetry<T>(run: () => Promise<T>): Promise<T> {
  for (const delayMs of NETWORK_RETRY_DELAYS_MS) {
    try {
      return await run();
    } catch (err: unknown) {
      if (!isNetworkFailure(err)) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return await run();
}

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
  let handedOffOp: Operation = {
    ...preparedOp,
    phase: 'handed-off',
    updatedAt: new Date().toISOString(),
  };
  await journal.saveOperation(handedOffOp);
  console.log('[Recovery] Handing off operation to wallet:', handedOffOp.id);
  input.onPhaseChange?.(handedOffOp);

  // Network reads happen here, before the wallet takes the foreground
  const minContextSlot = await (async () => input.connection.getSlot('finalized'))().catch(
    () => undefined
  );

  // Step 3: Sign
  let submittedOp: Operation | null = null;
  try {
    const submissionResult = await signer.signAndSubmit({
      cluster: input.cluster,
      member: handedOffOp.member,
      transaction: input.transaction,
      forceSignAndSendFallback: input.forceSignAndSendFallback,
      minContextSlot,
      refreshLifetime: async () => {
        // A connect prompt must not count against the transaction's lifetime.
        // The new lifetime is journaled before the signing session opens.
        const lifetime = await withNetworkRetry(() =>
          input.connection.getLatestBlockhash('confirmed')
        ).catch(() => null);
        if (!lifetime) {
          return;
        }
        input.transaction.recentBlockhash = lifetime.blockhash;
        handedOffOp = {
          ...handedOffOp,
          blockhash: lifetime.blockhash,
          lastValidBlockHeight: lifetime.lastValidBlockHeight,
          updatedAt: new Date().toISOString(),
        };
        await journal.saveOperation(handedOffOp);
      },
      // Resubmitting the same signed bytes is idempotent, so a transient
      // network failure while returning from the wallet can be retried.
      submit: (wireBytes: Uint8Array) =>
        withNetworkRetry(() =>
          input.connection.sendRawTransaction(wireBytes, { skipPreflight: false })
        ),
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
    const errMsg = err instanceof Error ? err.message : String(err);

    // Wrong account: stops early before signing, terminal phase failed
    const isWrongAccount =
      errMsg.includes('is not the selected member') ||
      errMsg.includes('Connected account');

    if (isWrongAccount) {
      const wrongAccountOp: Operation = {
        ...preparedOp,
        phase: 'failed',
        updatedAt: new Date().toISOString(),
        resolution: errMsg,
      };
      await journal.saveOperation(wrongAccountOp);
      input.onPhaseChange?.(wrongAccountOp);
      return { operation: wrongAccountOp };
    }

    const isDeclined =
      (err as Record<string, unknown>)?.isUserDeclined === true ||
      errMsg.toLowerCase().includes('declined') ||
      errMsg.toLowerCase().includes('refused') ||
      errMsg.toLowerCase().includes('not signed') ||
      errMsg.toLowerCase().includes('cancelled') ||
      errMsg.toLowerCase().includes('canceled');

    if (isDeclined) {
      // Observe chain state first: effect predicate wins!
      const observation = await observeOperation(input.chainReader, handedOffOp);
      const settledOp = settle(
        handedOffOp,
        { ...observation, userDeclined: true },
        new Date().toISOString()
      );
      const declinedOp: Operation =
        settledOp.phase === 'declined'
          ? { ...settledOp, resolution: `${settledOp.resolution} (${errMsg})` }
          : settledOp;
      await journal.saveOperation(declinedOp);
      input.onPhaseChange?.(declinedOp);
      return { operation: declinedOp };
    }

    // For any other unexpected submission failure, settle against chain
    const failedOrUnresolvedOp: Operation = {
      ...handedOffOp,
      phase: 'unresolved',
      updatedAt: new Date().toISOString(),
      resolution: `Submission exception: ${errMsg}`,
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
    if (settled.phase === 'confirmed') {
      return { operation: settled };
    }

    // The chain observation replaces the resolution; keep the wallet's own
    // answer beside it so the cause of the failure stays visible.
    const explained: Operation = {
      ...settled,
      resolution: `${settled.resolution ?? `Operation ${settled.phase}`} (wallet: ${errMsg})`,
    };
    await journal.saveOperation(explained);
    input.onPhaseChange?.(explained);
    return { operation: explained };
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
