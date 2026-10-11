import type { ProposalSnapshot } from '../inspection/read-proposal';
import type { MultisigSnapshot } from '../squads/multisig';
import type { MemberCapabilities } from '../squads/permissions';

export function isProposalActive(proposal: ProposalSnapshot): boolean {
  return proposal.status.kind === 'Active';
}

export function isProposalApproved(proposal: ProposalSnapshot): boolean {
  return proposal.status.kind === 'Approved';
}

export function isProposalStale(
  proposal: ProposalSnapshot,
  multisig: MultisigSnapshot
): boolean {
  return proposal.transactionIndex <= multisig.staleTransactionIndex;
}

export function hasMemberApproved(
  proposal: ProposalSnapshot,
  memberAddress: string
): boolean {
  return proposal.approved.includes(memberAddress);
}

export function hasMemberRejected(
  proposal: ProposalSnapshot,
  memberAddress: string
): boolean {
  return proposal.rejected.includes(memberAddress);
}

export interface TimeLockEvaluation {
  readonly elapsed: boolean;
  readonly approvedAt?: number | undefined;
  readonly remainingSeconds?: number | undefined;
  readonly reason?: string | undefined;
}

export function evaluateTimeLock(
  proposal: ProposalSnapshot,
  multisig: MultisigSnapshot,
  currentTimeSeconds: number
): TimeLockEvaluation {
  if (proposal.status.kind !== 'Approved') {
    return {
      elapsed: false,
      reason: 'Proposal is not in Approved status',
    };
  }

  const approvedAt =
    proposal.status.timestamp !== undefined
      ? Number(proposal.status.timestamp)
      : undefined;

  if (approvedAt === undefined) {
    return {
      elapsed: false,
      reason: 'Approved timestamp is unavailable on proposal status',
    };
  }

  const timeLock = Number(multisig.timeLockSeconds);
  const requiredTime = approvedAt + timeLock;

  if (currentTimeSeconds >= requiredTime) {
    return {
      elapsed: true,
      approvedAt,
    };
  }

  const remaining = requiredTime - currentTimeSeconds;
  return {
    elapsed: false,
    approvedAt,
    remainingSeconds: remaining,
    reason: `Time-lock has not elapsed (${remaining}s remaining; device clock estimate, on-chain program is authority)`,
  };
}

export function hasPermission(
  capabilities: MemberCapabilities | undefined,
  permission: 'initiate' | 'vote' | 'execute'
): boolean {
  if (!capabilities || !capabilities.isMember) {
    return false;
  }
  return Boolean(capabilities[permission]);
}
