import type { ProposalSnapshot } from '../inspection/read-proposal';
import type { StoredTransaction } from '../squads/stored-transaction';
import type { Operation } from './operation';

export interface EffectCheckInput {
  readonly operation: Operation;
  readonly proposal?: ProposalSnapshot | null | undefined;
  readonly storedTransaction?: StoredTransaction | null | undefined;
}

/**
 * Evaluates the effect predicate for an operation per Flow F10.
 * An effect is present when the intended on-chain state transition is observed.
 */
export function checkOperationEffect(input: EffectCheckInput): boolean {
  const { operation, proposal, storedTransaction } = input;

  switch (operation.kind) {
    case 'approve':
      return Boolean(proposal && proposal.approved.includes(operation.member));

    case 'reject':
      return Boolean(proposal && proposal.rejected.includes(operation.member));

    case 'create-guarded-proposal':
      // The transaction account at the planned index exists and its message digest equals the planned one, and its proposal exists
      if (!storedTransaction || !proposal) {
        return false;
      }
      if (operation.expectedMessageSha256) {
        return storedTransaction.messageSha256 === operation.expectedMessageSha256;
      }
      return true;

    case 'execute':
      return Boolean(proposal && proposal.status.kind === 'Executed');
  }
}
