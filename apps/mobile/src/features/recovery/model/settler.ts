import {
  type ChainReader,
  type Operation,
  observeOperation,
  settle,
} from 'release-core';
import { TERMINAL_PHASES, type OperationJournal } from './types';

export interface PollAndSettleOptions {
  readonly journal?: OperationJournal | undefined;
  readonly pollIntervalMs?: number | undefined;
  readonly pollTimeoutMs?: number | undefined;
  readonly onPhaseChange?: ((operation: Operation) => void) | undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollAndSettleOperation(
  operation: Operation,
  chainReader: ChainReader,
  options?: PollAndSettleOptions | undefined
): Promise<Operation> {
  const journal =
    options?.journal ?? (await import('./journal')).documentStoreJournal;
  const pollIntervalMs = options?.pollIntervalMs ?? 1500;
  const pollTimeoutMs = options?.pollTimeoutMs ?? 30000;
  const startTime = Date.now();

  let currentOp = operation;

  while (Date.now() - startTime < pollTimeoutMs) {
    const observation = await observeOperation(chainReader, currentOp);
    const nextOp = settle(currentOp, observation, new Date().toISOString());

    if (nextOp.phase !== currentOp.phase || nextOp.resolution !== currentOp.resolution) {
      await journal.saveOperation(nextOp);
      options?.onPhaseChange?.(nextOp);
      currentOp = nextOp;
    }

    if (TERMINAL_PHASES.has(currentOp.phase)) {
      return currentOp;
    }

    await delay(pollIntervalMs);
  }

  // Timeout reached without terminal state; mark unresolved
  if (!TERMINAL_PHASES.has(currentOp.phase)) {
    const unresolvedOp = settle(currentOp, null, new Date().toISOString());
    await journal.saveOperation(unresolvedOp);
    options?.onPhaseChange?.(unresolvedOp);
    return unresolvedOp;
  }

  return currentOp;
}
