import { keccak256 } from './keccak256';
import { sha256 } from './sha256';
import { verifiedBuildSha256 } from './verified-build';

export interface ArtifactDigests {
  readonly length: number;
  readonly sha256: string;
  readonly keccak256: string;
  readonly verifiedBuildSha256: string;
}

/**
 * Computes payload length alongside the three distinct release digests.
 * The three digests serve different verification roles and are never compared directly:
 * - sha256: artifact identity and manifest binding
 * - keccak256: on-chain Lighthouse assertion binding
 * - verifiedBuildSha256: comparison against solana-verify output
 */
export function computeArtifactDigests(bytes: Uint8Array): ArtifactDigests {
  return {
    length: bytes.length,
    sha256: sha256(bytes),
    keccak256: keccak256(bytes),
    verifiedBuildSha256: verifiedBuildSha256(bytes),
  };
}
