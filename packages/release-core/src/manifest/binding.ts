import { computeArtifactDigests } from '../digest/artifact-digests';
import type { ArtifactDigests } from '../digest/artifact-digests';
import type { ReleaseManifest } from './schema';

export interface ArtifactBindingResult {
  readonly matches: boolean;
  readonly errors: readonly string[];
}

/**
 * Validates that an imported program binary matches the release manifest.
 * Checks payload length, literal SHA-256, literal Keccak-256, and verified-build SHA-256 (if specified).
 */
export function bindArtifactToManifest(
  artifact: Uint8Array | ArtifactDigests,
  manifest: ReleaseManifest
): ArtifactBindingResult {
  const digests: ArtifactDigests =
    artifact instanceof Uint8Array ? computeArtifactDigests(artifact) : artifact;

  const errors: string[] = [];

  if (digests.length !== manifest.artifact.length) {
    errors.push(
      `Artifact length mismatch: expected ${manifest.artifact.length} bytes, got ${digests.length} bytes`
    );
  }

  if (digests.sha256.toLowerCase() !== manifest.artifact.sha256.toLowerCase()) {
    errors.push(
      `Artifact SHA-256 mismatch: expected ${manifest.artifact.sha256.toLowerCase()}, got ${digests.sha256.toLowerCase()}`
    );
  }

  if (digests.keccak256.toLowerCase() !== manifest.artifact.keccak256.toLowerCase()) {
    errors.push(
      `Artifact Keccak-256 mismatch: expected ${manifest.artifact.keccak256.toLowerCase()}, got ${digests.keccak256.toLowerCase()}`
    );
  }

  if (manifest.artifact.verifiedBuildSha256 !== undefined) {
    if (
      digests.verifiedBuildSha256.toLowerCase() !==
      manifest.artifact.verifiedBuildSha256.toLowerCase()
    ) {
      errors.push(
        `Artifact verified-build SHA-256 mismatch: expected ${manifest.artifact.verifiedBuildSha256.toLowerCase()}, got ${digests.verifiedBuildSha256.toLowerCase()}`
      );
    }
  }

  return {
    matches: errors.length === 0,
    errors,
  };
}
