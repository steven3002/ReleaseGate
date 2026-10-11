import {
  createFailCheck,
  createPassCheck,
  createUnknownCheck,
  type CheckResult,
} from './check';

export interface ProvenanceCheckInput {
  readonly manifestProvenance?: {
    readonly sourceRepository: string;
    readonly commit: string;
    readonly buildMethod: string;
    readonly builder: string;
    readonly builtAt?: string | undefined;
  } | undefined;
  readonly artifactSource?: {
    readonly channel: 'file-picker' | 'share';
    readonly size: number;
    readonly importedAt: string;
  } | undefined;
  readonly manifestSource?: {
    readonly channel: 'file-picker' | 'share';
    readonly size: number;
    readonly importedAt: string;
  } | undefined;
  readonly attestation?: {
    readonly statementVersion: string;
    readonly confirmedAt: string;
  } | undefined;
}

const HEX_40_REGEX = /^[0-9a-fA-F]{40}$/;

export function runProvenanceChecks(input: ProvenanceCheckInput): CheckResult[] {
  const results: CheckResult[] = [];

  // 1. provenance.manifest
  const p = input.manifestProvenance;
  if (!p) {
    results.push(
      createUnknownCheck(
        'provenance.manifest',
        'provenance',
        'Manifest provenance data unavailable'
      )
    );
  } else {
    const missingFields: string[] = [];
    if (!p.sourceRepository || typeof p.sourceRepository !== 'string' || p.sourceRepository.trim() === '') {
      missingFields.push('sourceRepository');
    }
    if (!p.commit || typeof p.commit !== 'string' || !HEX_40_REGEX.test(p.commit)) {
      missingFields.push('commit (must be 40-character hex SHA-1)');
    }
    if (!p.buildMethod || typeof p.buildMethod !== 'string' || p.buildMethod.trim() === '') {
      missingFields.push('buildMethod');
    }
    if (!p.builder || typeof p.builder !== 'string' || p.builder.trim() === '') {
      missingFields.push('builder');
    }

    if (missingFields.length > 0) {
      results.push(
        createFailCheck(
          'provenance.manifest',
          'provenance',
          'well-formed sourceRepository, commit, buildMethod, builder',
          `Missing or malformed: ${missingFields.join(', ')}`,
          'Manifest provenance fields are incomplete or invalid'
        )
      );
    } else {
      results.push(createPassCheck('provenance.manifest', 'provenance'));
    }
  }

  // 2. provenance.source
  if (input.artifactSource === undefined && input.manifestSource === undefined) {
    results.push(
      createUnknownCheck(
        'provenance.source',
        'provenance',
        'Import sources unavailable'
      )
    );
  } else if (!input.artifactSource || !input.manifestSource) {
    const missing: string[] = [];
    if (!input.artifactSource) missing.push('artifact import source');
    if (!input.manifestSource) missing.push('manifest import source');
    results.push(
      createFailCheck(
        'provenance.source',
        'provenance',
        'both artifactSource and manifestSource present',
        `Missing: ${missing.join(', ')}`,
        'An ImportSource must be recorded for both the artifact and the manifest'
      )
    );
  } else {
    results.push(createPassCheck('provenance.source', 'provenance'));
  }

  // 3. provenance.attestation
  if (input.attestation === undefined) {
    results.push(
      createFailCheck(
        'provenance.attestation',
        'provenance',
        'reviewer attestation confirmed',
        'none',
        'Reviewer attestation has not been confirmed'
      )
    );
  } else if (
    !input.attestation.statementVersion ||
    !input.attestation.confirmedAt
  ) {
    results.push(
      createFailCheck(
        'provenance.attestation',
        'provenance',
        'valid statementVersion and confirmedAt',
        'incomplete attestation',
        'Reviewer attestation record is incomplete'
      )
    );
  } else {
    results.push(createPassCheck('provenance.attestation', 'provenance'));
  }

  return results;
}
