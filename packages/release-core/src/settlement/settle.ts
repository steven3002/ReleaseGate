import { checkOperationEffect } from './effects';
import type { OperationObservation } from './observe';
import type { Operation, OperationPhase } from './operation';

const TERMINAL_PHASES = new Set<OperationPhase>([
  'confirmed',
  'failed',
  'declined',
  'expired',
  'superseded',
]);

/**
 * Pure state-transition function that reconciles an operation with observed chain state.
 * Implements Flow F10: decides outcome from chain state, never from wallet return alone.
 */
export function settle(
  operation: Operation,
  observation?: OperationObservation | null | undefined,
  updatedAt?: string | undefined
): Operation {
  const timestamp = updatedAt ?? operation.updatedAt;

  // Terminal states are irreversible
  if (TERMINAL_PHASES.has(operation.phase)) {
    return operation;
  }

  // "No observation" must leave or transition the phase to unresolved.
  if (!observation) {
    if (operation.phase === 'unresolved') {
      return operation;
    }
    return {
      ...operation,
      phase: 'unresolved',
      updatedAt: timestamp,
      resolution: 'No observation available; awaiting chain check',
    };
  }

  // 1. Effect first: decides confirmed even when signature is unknown
  const effectPresent = checkOperationEffect({
    operation,
    proposal: observation.proposal,
    storedTransaction: observation.storedTransaction,
  });

  if (effectPresent) {
    return {
      ...operation,
      phase: 'confirmed',
      updatedAt: timestamp,
      resolution: 'On-chain effect confirmed',
    };
  }

  // 2. User declined before signing
  if (observation.userDeclined === true) {
    return {
      ...operation,
      phase: 'declined',
      updatedAt: timestamp,
      resolution: 'Operation was declined by user in wallet',
    };
  }

  // 3. Signature known and its status is an on-chain error
  if (operation.signature && observation.signatureStatus?.err) {
    return {
      ...operation,
      phase: 'failed',
      updatedAt: timestamp,
      resolution: `Transaction failed: ${JSON.stringify(observation.signatureStatus.err)}`,
    };
  }

  // 4. Superseded creation: planned index exists with a different message digest
  if (
    operation.kind === 'create-guarded-proposal' &&
    observation.storedTransaction &&
    operation.expectedMessageSha256 &&
    observation.storedTransaction.messageSha256 !== '' &&
    observation.storedTransaction.messageSha256 !== operation.expectedMessageSha256
  ) {
    return {
      ...operation,
      phase: 'superseded',
      updatedAt: timestamp,
      resolution:
        'Planned transaction index was claimed by another transaction with a different message digest',
    };
  }

  // 5. Expiry: effect absent, block height beyond lastValidBlockHeight, signature (if known) not found
  const isPastBlockHeight =
    observation.currentBlockHeight !== undefined &&
    observation.currentBlockHeight > operation.lastValidBlockHeight;

  const signatureNotFound =
    !operation.signature || observation.signatureStatus === null;

  if (!effectPresent && isPastBlockHeight && signatureNotFound) {
    return {
      ...operation,
      phase: 'expired',
      updatedAt: timestamp,
      resolution: `Block height ${observation.currentBlockHeight} exceeded lastValidBlockHeight ${operation.lastValidBlockHeight}; transaction expired with effect absent`,
    };
  }

  // 6. Anything else: timeout, dropped session, RPC error -> unresolved
  return {
    ...operation,
    phase: 'unresolved',
    updatedAt: timestamp,
    resolution: observation.rpcError ?? 'Outcome unresolved; awaiting conclusive observation',
  };
}
