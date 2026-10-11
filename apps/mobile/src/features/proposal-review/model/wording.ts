import type {
  ArtifactMatchStatus,
  ExecutionConditionsStatus,
  ProvenanceStatus,
} from 'release-core';

export const STANDING_NOTE =
  'A matching hash shows these are the reviewed bytes. It does not show that the code is harmless or audited.';

export function getArtifactMatchWording(status?: ArtifactMatchStatus): string {
  switch (status) {
    case 'matches':
      return 'Matches reviewed artifact';
    case 'mismatch':
      return 'Does not match reviewed artifact';
    case 'not-evaluated':
    default:
      return 'No reviewed artifact selected';
  }
}

export function getExecutionConditionsWording(
  status?: ExecutionConditionsStatus
): string {
  switch (status) {
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
    default:
      return 'Not evaluated';
  }
}

export function getProvenanceWording(status?: ProvenanceStatus): string {
  switch (status) {
    case 'recorded':
      return 'provenance: recorded';
    case 'missing':
    default:
      return 'provenance: missing';
  }
}

export const DIGEST_LABELS = {
  sha256: 'literal SHA-256',
  keccak256: 'literal Keccak-256',
  verifiedBuildSha256: 'verified-build SHA-256',
} as const;
