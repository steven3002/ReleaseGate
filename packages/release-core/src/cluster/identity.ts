import type { ClusterDescriptor, ClusterId } from './clusters';
import { getClusterDescriptor } from './clusters';

export interface GenesisComparisonResult {
  readonly matches: boolean;
  readonly expectedGenesisHash: string;
  readonly observedGenesisHash: string;
  readonly clusterId: ClusterId;
}

/**
 * Compares an endpoint's observed genesis hash against the cluster's pinned genesis hash.
 * This ensures devnet and mainnet-beta operations cannot be routed to mismatched RPC endpoints.
 */
export function compareGenesis(
  cluster: ClusterDescriptor | ClusterId,
  observedGenesisHash: string
): GenesisComparisonResult {
  const descriptor = typeof cluster === 'string' ? getClusterDescriptor(cluster) : cluster;
  return {
    matches: descriptor.genesisHash === observedGenesisHash,
    expectedGenesisHash: descriptor.genesisHash,
    observedGenesisHash,
    clusterId: descriptor.id,
  };
}

export function matchesClusterGenesis(
  cluster: ClusterDescriptor | ClusterId,
  observedGenesisHash: string
): boolean {
  return compareGenesis(cluster, observedGenesisHash).matches;
}
