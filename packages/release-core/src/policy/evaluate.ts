import type { ClusterDescriptor } from '../cluster/clusters';
import type { GuardShape } from '../guard/assess';
import type { ProposalSnapshot } from '../inspection/read-proposal';
import type { MultisigSnapshot } from '../squads/multisig';
import type { MemberCapabilities } from '../squads/permissions';
import type { CheckResult } from '../verification/check';
import {
  evaluateTimeLock,
  hasMemberApproved,
  hasMemberRejected,
  hasPermission,
  isProposalActive,
  isProposalApproved,
  isProposalStale,
} from './governance';
import type {
  ActionDecision,
  ArtifactMatchStatus,
  BoundToTarget,
  ExecutionConditionsStatus,
  PermittedActions,
  ProvenanceStatus,
  ReviewVerdict,
} from './verdict';

export interface PolicyInput {
  readonly checks: readonly CheckResult[];
  readonly shape?: GuardShape | undefined;
  readonly cluster: ClusterDescriptor;
  readonly multisig: MultisigSnapshot;
  readonly proposal: ProposalSnapshot;
  readonly memberAddress?: string | undefined;
  readonly memberCapabilities?: MemberCapabilities | undefined;
  readonly currentTimeSeconds: number;
  readonly boundTo?: BoundToTarget | undefined;
  readonly evaluatedAtSlot?: number | undefined;
  readonly hasReviewedArtifact: boolean;
}

export function evaluate(input: PolicyInput): ReviewVerdict {
  const {
    checks,
    shape,
    cluster,
    multisig,
    proposal,
    memberAddress,
    memberCapabilities,
    currentTimeSeconds,
    boundTo,
    evaluatedAtSlot,
    hasReviewedArtifact,
  } = input;

  // 1. Artifact match status
  let artifactMatch: ArtifactMatchStatus = 'not-evaluated';
  if (hasReviewedArtifact) {
    const artifactCheckIds = new Set([
      'artifact.length',
      'artifact.sha256',
      'artifact.keccak256',
      'buffer.length',
      'buffer.bytes',
    ]);
    const relevantChecks = checks.filter(c => artifactCheckIds.has(c.id));
    const allPass =
      relevantChecks.length === artifactCheckIds.size &&
      relevantChecks.every(c => c.status === 'pass');
    artifactMatch = allPass ? 'matches' : 'mismatch';
  }

  // 2. Execution conditions status
  let executionConditions: ExecutionConditionsStatus = 'not-evaluated';
  if (shape === undefined) {
    executionConditions = 'not-evaluated';
  } else if (shape === 'partial-guard') {
    executionConditions = 'incomplete';
  } else if (shape === 'unguarded-upgrade') {
    executionConditions = 'absent';
  } else if (shape === 'unsupported') {
    executionConditions = 'unsupported';
  } else if (shape === 'guarded-upgrade') {
    const requiredPassIds = new Set([
      'transaction.kind',
      'transaction.resolved',
      'transaction.supported',
      'guard.complete',
      'guard.length',
      'guard.hash',
      'guard.slot',
      'buffer.owner',
      'buffer.state',
      'buffer.authority',
      'programdata.state',
      'programdata.authority',
      'program.account',
    ]);

    const otherChecksPass = Array.from(requiredPassIds).every(id => {
      const c = checks.find(chk => chk.id === id);
      return c?.status === 'pass';
    });

    const slotCheck = checks.find(c => c.id === 'deployment.slot');

    if (otherChecksPass && slotCheck?.status === 'pass') {
      executionConditions = 'verified';
    } else if (otherChecksPass && slotCheck?.status === 'fail') {
      // not-holding is specific: complete guard, everything else passes, only deployment.slot fails
      executionConditions = 'not-holding';
    } else {
      executionConditions = 'unsupported';
    }
  }

  // 3. Provenance status
  const provenanceCheckIds = ['provenance.manifest', 'provenance.source', 'provenance.attestation'];
  const allProvenancePass = provenanceCheckIds.every(id => {
    const c = checks.find(chk => chk.id === id);
    return c?.status === 'pass';
  });
  const provenance: ProvenanceStatus = allProvenancePass ? 'recorded' : 'missing';

  // 4. Action decisions
  const hasBlockingFailures = checks.some(c => c.blocking && c.status !== 'pass');

  // Approve
  const approveReasons: string[] = [];
  if (!cluster.signingEnabled) {
    approveReasons.push('Signing is disabled on this cluster');
  }
  if (!memberAddress) {
    approveReasons.push('No wallet connected');
  }
  if (!hasPermission(memberCapabilities, 'vote')) {
    approveReasons.push('Member does not have Vote permission');
  }
  if (!isProposalActive(proposal)) {
    approveReasons.push(`Proposal is ${proposal.status.kind}, must be Active to approve`);
  }
  if (isProposalStale(proposal, multisig)) {
    approveReasons.push('Proposal is stale (multisig configuration changed)');
  }
  if (memberAddress && hasMemberApproved(proposal, memberAddress)) {
    approveReasons.push('Member has already approved this proposal');
  }
  if (artifactMatch !== 'matches') {
    approveReasons.push(`Artifact match status is ${artifactMatch}, must be matches`);
  }
  if (executionConditions !== 'verified') {
    approveReasons.push(`Execution conditions status is ${executionConditions}, must be verified`);
  }
  if (provenance !== 'recorded') {
    approveReasons.push(`Provenance status is ${provenance}, must be recorded`);
  }
  if (hasBlockingFailures) {
    approveReasons.push('One or more blocking verification checks failed');
  }
  const approve: ActionDecision = {
    allowed: approveReasons.length === 0,
    reasons: approveReasons,
  };

  // Reject
  const rejectReasons: string[] = [];
  if (!cluster.signingEnabled) {
    rejectReasons.push('Signing is disabled on this cluster');
  }
  if (!memberAddress) {
    rejectReasons.push('No wallet connected');
  }
  if (!hasPermission(memberCapabilities, 'vote')) {
    rejectReasons.push('Member does not have Vote permission');
  }
  if (!isProposalActive(proposal)) {
    rejectReasons.push(`Proposal is ${proposal.status.kind}, must be Active to reject`);
  }
  if (isProposalStale(proposal, multisig)) {
    rejectReasons.push('Proposal is stale (multisig configuration changed)');
  }
  if (memberAddress && hasMemberRejected(proposal, memberAddress)) {
    rejectReasons.push('Member has already rejected this proposal');
  }
  const reject: ActionDecision = {
    allowed: rejectReasons.length === 0,
    reasons: rejectReasons,
  };

  // Execute
  const executeReasons: string[] = [];
  if (!cluster.signingEnabled) {
    executeReasons.push('Signing is disabled on this cluster');
  }
  if (!memberAddress) {
    executeReasons.push('No wallet connected');
  }
  if (!hasPermission(memberCapabilities, 'execute')) {
    executeReasons.push('Member does not have Execute permission');
  }
  if (!isProposalApproved(proposal)) {
    executeReasons.push(`Proposal is ${proposal.status.kind}, must be Approved to execute`);
  }
  const timeLockEval = evaluateTimeLock(proposal, multisig, currentTimeSeconds);
  if (!timeLockEval.elapsed) {
    executeReasons.push(timeLockEval.reason ?? 'Time-lock has not elapsed');
  }
  if (artifactMatch !== 'matches') {
    executeReasons.push(`Artifact match status is ${artifactMatch}, must be matches`);
  }
  if (executionConditions !== 'verified') {
    executeReasons.push(`Execution conditions status is ${executionConditions}, must be verified`);
  }
  if (provenance !== 'recorded') {
    executeReasons.push(`Provenance status is ${provenance}, must be recorded`);
  }
  if (hasBlockingFailures) {
    executeReasons.push('One or more blocking verification checks failed');
  }
  const execute: ActionDecision = {
    allowed: executeReasons.length === 0,
    reasons: executeReasons,
  };

  // Create guarded replacement
  const replacementReasons: string[] = [];
  if (!cluster.signingEnabled) {
    replacementReasons.push('Signing is disabled on this cluster');
  }
  if (!memberAddress) {
    replacementReasons.push('No wallet connected');
  }
  if (!hasPermission(memberCapabilities, 'initiate')) {
    replacementReasons.push('Member does not have Initiate permission');
  }
  if (shape !== 'unguarded-upgrade' && shape !== 'partial-guard') {
    replacementReasons.push(
      `Transaction shape is ${shape ?? 'unknown'}, replacement only offered for unguarded-upgrade or partial-guard`
    );
  }
  if (artifactMatch !== 'matches') {
    replacementReasons.push(`Artifact match status is ${artifactMatch}, must be matches`);
  }
  if (provenance !== 'recorded') {
    replacementReasons.push(`Provenance status is ${provenance}, must be recorded`);
  }
  const failingEnvGroups = checks.filter(
    c =>
      (c.group === 'identity' || c.group === 'buffer' || c.group === 'deployment') &&
      c.blocking &&
      c.status !== 'pass'
  );
  if (failingEnvGroups.length > 0) {
    replacementReasons.push(
      `${failingEnvGroups.length} required identity/buffer/deployment check(s) failed: ${failingEnvGroups.map(c => c.id).join(', ')}`
    );
  }
  const createGuardedReplacement: ActionDecision = {
    allowed: replacementReasons.length === 0,
    reasons: replacementReasons,
  };

  const actions: PermittedActions = {
    approve,
    reject,
    execute,
    createGuardedReplacement,
  };

  return {
    artifactMatch,
    executionConditions,
    provenance,
    checks,
    actions,
    ...(boundTo !== undefined ? { boundTo } : {}),
    ...(evaluatedAtSlot !== undefined ? { evaluatedAtSlot } : {}),
  };
}
