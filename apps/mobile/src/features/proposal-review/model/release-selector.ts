import { CLUSTERS, type ClusterId } from 'release-core';
import type { ImportedRelease } from '../../release-import';

export function filterCandidateReleases(
  releases: readonly ImportedRelease[],
  clusterId: ClusterId,
  multisigAddress: string,
  targetProgram?: string
): ImportedRelease[] {
  const clusterGenesis = CLUSTERS[clusterId].genesisHash;

  return releases.filter((rel) => {
    // Cluster genesis match
    if (rel.manifest.cluster.genesisHash !== clusterGenesis) {
      return false;
    }
    // Multisig match
    if (rel.manifest.multisig !== multisigAddress) {
      return false;
    }
    // Target program match (if target program is known)
    if (targetProgram && rel.manifest.program !== targetProgram) {
      return false;
    }
    return true;
  });
}

export function resolveDefaultReleaseSelection(
  candidates: readonly ImportedRelease[]
): string | null {
  if (candidates.length === 1 && candidates[0]) {
    return candidates[0].id;
  }
  return null;
}
