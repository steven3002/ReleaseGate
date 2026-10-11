import {
  type ChainReader,
  type Operation,
  observeOperation,
  settle,
} from 'release-core';
import { listOperations, saveOperation } from './journal';
import { TERMINAL_PHASES } from './types';

export interface ResumePendingOptions {
  readonly onSettled?: ((operation: Operation) => void) | undefined;
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
    settledOps.push(settledOp);
  }

  return settledOps;
}
