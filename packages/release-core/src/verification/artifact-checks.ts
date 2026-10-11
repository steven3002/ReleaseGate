import {
  createFailCheck,
  createPassCheck,
  createUnknownCheck,
  type CheckResult,
} from './check';

export interface ArtifactCheckInput {
  readonly manifestArtifact?: {
    readonly length: number;
    readonly sha256: string;
    readonly keccak256: string;
    readonly verifiedBuildSha256?: string | undefined;
  } | undefined;
  readonly reviewedArtifact?: {
    readonly length: number;
    readonly sha256: string;
    readonly keccak256: string;
    readonly verifiedBuildSha256?: string | undefined;
  } | undefined;
}

export function runArtifactChecks(input: ArtifactCheckInput): CheckResult[] {
  const results: CheckResult[] = [];
  const m = input.manifestArtifact;
  const a = input.reviewedArtifact;

  // 1. artifact.length
  if (m === undefined || a === undefined) {
    results.push(
      createUnknownCheck(
        'artifact.length',
        'artifact',
        'Manifest artifact or reviewed artifact unavailable'
      )
    );
  } else if (a.length !== m.length) {
    results.push(
      createFailCheck(
        'artifact.length',
        'artifact',
        m.length,
        a.length,
        `Imported file length (${a.length}) does not match manifest length (${m.length})`
      )
    );
  } else {
    results.push(createPassCheck('artifact.length', 'artifact'));
  }

  // 2. artifact.sha256
  if (m === undefined || a === undefined) {
    results.push(
      createUnknownCheck(
        'artifact.sha256',
        'artifact',
        'Manifest artifact or reviewed artifact unavailable'
      )
    );
  } else if (a.sha256.toLowerCase() !== m.sha256.toLowerCase()) {
    results.push(
      createFailCheck(
        'artifact.sha256',
        'artifact',
        m.sha256.toLowerCase(),
        a.sha256.toLowerCase(),
        'Imported file SHA-256 does not match manifest SHA-256'
      )
    );
  } else {
    results.push(createPassCheck('artifact.sha256', 'artifact'));
  }

  // 3. artifact.keccak256
  if (m === undefined || a === undefined) {
    results.push(
      createUnknownCheck(
        'artifact.keccak256',
        'artifact',
        'Manifest artifact or reviewed artifact unavailable'
      )
    );
  } else if (a.keccak256.toLowerCase() !== m.keccak256.toLowerCase()) {
    results.push(
      createFailCheck(
        'artifact.keccak256',
        'artifact',
        m.keccak256.toLowerCase(),
        a.keccak256.toLowerCase(),
        'Imported file Keccak-256 does not match manifest Keccak-256'
      )
    );
  } else {
    results.push(createPassCheck('artifact.keccak256', 'artifact'));
  }

  return results;
}
