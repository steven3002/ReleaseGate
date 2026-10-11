import type { ProposalInspection, ReviewVerdict } from 'release-core';

export function formatArtifactMatch(match: ReviewVerdict['artifactMatch']): string {
  switch (match) {
    case 'matches':
      return 'Matches reviewed artifact';
    case 'mismatch':
      return 'Does not match reviewed artifact';
    case 'not-evaluated':
      return 'No reviewed artifact selected';
  }
}

export function formatExecutionConditions(conditions: ReviewVerdict['executionConditions']): string {
  switch (conditions) {
    case 'verified':
      return 'Execution conditions verified';
    case 'incomplete':
      return 'Execution conditions incomplete';
    case 'absent':
      return 'Execution conditions missing';
    case 'not-holding':
      return 'Execution conditions no longer hold';
    case 'unsupported':
      return 'Unsupported transaction';
    case 'not-evaluated':
      return 'Execution conditions not evaluated';
  }
}

export function formatVerdictText(verdict: ReviewVerdict, inspection?: ProposalInspection): string {
  const lines: string[] = [];

  lines.push('=== ReleaseGate Review Verdict ===');
  lines.push('');
  lines.push(`Artifact Match:       ${formatArtifactMatch(verdict.artifactMatch)}`);
  lines.push(`Execution Conditions: ${formatExecutionConditions(verdict.executionConditions)}`);
  lines.push(`Provenance:           ${verdict.provenance === 'recorded' ? 'Recorded' : 'Missing'}`);
  lines.push('');
  lines.push('Standing note: A matching hash shows these are the reviewed bytes. It does not show that the code is harmless or audited.');
  lines.push('');

  lines.push('--- Permitted Actions ---');
  const actions = [
    { name: 'Approve', spec: verdict.actions.approve },
    { name: 'Reject', spec: verdict.actions.reject },
    { name: 'Execute', spec: verdict.actions.execute },
    { name: 'Create guarded replacement', spec: verdict.actions.createGuardedReplacement },
  ];
  for (const { name, spec } of actions) {
    if (spec.allowed) {
      lines.push(`  [ALLOWED]    ${name}`);
    } else {
      lines.push(`  [DISALLOWED] ${name}: ${spec.reasons.join('; ')}`);
    }
  }
  lines.push('');

  if (inspection) {
    lines.push('--- Proposal Details ---');
    lines.push(`  Multisig:          ${inspection.multisig.address}`);
    lines.push(`  Threshold:         ${inspection.multisig.threshold} of ${inspection.multisig.members.length}`);
    lines.push(`  Transaction Index: ${inspection.proposal.transactionIndex}`);
    lines.push(`  Proposal Status:   ${inspection.proposal.status.kind}`);
    lines.push(`  Approved By:       ${inspection.proposal.approved.length} member(s)`);
    lines.push(`  Rejected By:       ${inspection.proposal.rejected.length} member(s)`);
    lines.push(`  Guard Shape:       ${inspection.guard.shape}`);
    if (inspection.guard.findings.length > 0) {
      lines.push(`  Guard Findings:    ${inspection.guard.findings.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('--- Verification Checks ---');
  for (const check of verdict.checks) {
    const statusTag = check.status.toUpperCase().padEnd(7);
    const blockingTag = check.blocking ? '[BLOCKING]' : '[NOTICE]  ';
    const detail = check.detail ? ` (${check.detail})` : '';
    lines.push(`  ${statusTag} ${blockingTag} ${check.id}${detail}`);
  }

  return lines.join('\n');
}
