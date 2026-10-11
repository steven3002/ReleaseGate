export type CheckGroup =
  | 'identity'
  | 'transaction'
  | 'buffer'
  | 'deployment'
  | 'artifact'
  | 'provenance'
  | 'governance';

export type CheckStatus = 'pass' | 'fail' | 'notice' | 'unknown';

export type CheckId =
  | 'cluster.genesis'
  | 'manifest.cluster'
  | 'manifest.multisig'
  | 'manifest.vault'
  | 'manifest.program'
  | 'program.account'
  | 'transaction.kind'
  | 'transaction.resolved'
  | 'transaction.supported'
  | 'guard.complete'
  | 'guard.length'
  | 'guard.hash'
  | 'guard.slot'
  | 'buffer.owner'
  | 'buffer.state'
  | 'buffer.authority'
  | 'buffer.length'
  | 'buffer.bytes'
  | 'programdata.state'
  | 'programdata.authority'
  | 'deployment.slot'
  | 'programdata.capacity'
  | 'artifact.length'
  | 'artifact.sha256'
  | 'artifact.keccak256'
  | 'provenance.manifest'
  | 'provenance.source'
  | 'provenance.attestation';

export interface CheckResult {
  readonly id: CheckId;
  readonly group: CheckGroup;
  readonly status: CheckStatus;
  readonly blocking: boolean;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly detail?: string;
}

export function createPassCheck(
  id: CheckId,
  group: CheckGroup,
  options?: { detail?: string }
): CheckResult {
  return {
    id,
    group,
    status: 'pass',
    blocking: true,
    ...(options?.detail !== undefined ? { detail: options.detail } : {}),
  };
}

export function createFailCheck(
  id: CheckId,
  group: CheckGroup,
  expected: unknown,
  actual: unknown,
  detail?: string
): CheckResult {
  return {
    id,
    group,
    status: 'fail',
    blocking: true,
    expected,
    actual,
    ...(detail !== undefined ? { detail } : {}),
  };
}

export function createNoticeCheck(
  id: CheckId,
  group: CheckGroup,
  status: 'pass' | 'notice',
  expected?: unknown,
  actual?: unknown,
  detail?: string
): CheckResult {
  return {
    id,
    group,
    status,
    blocking: false,
    ...(expected !== undefined ? { expected } : {}),
    ...(actual !== undefined ? { actual } : {}),
    ...(detail !== undefined ? { detail } : {}),
  };
}

export function createUnknownCheck(
  id: CheckId,
  group: CheckGroup,
  detail: string,
  blocking: boolean = true
): CheckResult {
  return {
    id,
    group,
    status: 'unknown',
    blocking,
    detail,
  };
}
