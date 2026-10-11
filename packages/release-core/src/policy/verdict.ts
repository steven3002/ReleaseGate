import type { CheckResult } from '../verification/check';

export type ArtifactMatchStatus = 'matches' | 'mismatch' | 'not-evaluated';

export type ExecutionConditionsStatus =
  | 'verified'
  | 'incomplete'
  | 'absent'
  | 'not-holding'
  | 'unsupported'
  | 'not-evaluated';

export type ProvenanceStatus = 'recorded' | 'missing';

export interface ActionDecision {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}

export interface PermittedActions {
  readonly approve: ActionDecision;
  readonly reject: ActionDecision;
  readonly execute: ActionDecision;
  readonly createGuardedReplacement: ActionDecision;
}

export interface BoundToTarget {
  readonly genesisHash: string;
  readonly multisig: string;
  readonly transactionIndex: bigint;
  readonly vault: string;
  readonly program: string;
  readonly expectedDeploymentSlot: bigint;
  readonly artifactSha256: string;
  readonly manifestSha256: string;
  readonly messageSha256: string;
}

export interface ReviewVerdict {
  readonly artifactMatch: ArtifactMatchStatus;
  readonly executionConditions: ExecutionConditionsStatus;
  readonly provenance: ProvenanceStatus;
  readonly checks: readonly CheckResult[];
  readonly actions: PermittedActions;
  readonly boundTo?: BoundToTarget | undefined;
  readonly evaluatedAtSlot?: number | undefined;
}
