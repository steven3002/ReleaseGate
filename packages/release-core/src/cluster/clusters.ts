export type ClusterId = 'devnet' | 'mainnet-beta';

export interface ClusterDescriptor {
  readonly id: ClusterId;
  readonly genesisHash: string;
  readonly defaultRpcUrl: string;
  readonly walletChain: string;
  readonly signingEnabled: boolean;
}

export const CLUSTERS: Readonly<Record<ClusterId, ClusterDescriptor>> = {
  devnet: {
    id: 'devnet',
    genesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
    defaultRpcUrl: 'https://api.devnet.solana.com',
    walletChain: 'solana:devnet',
    signingEnabled: true,
  },
  'mainnet-beta': {
    id: 'mainnet-beta',
    genesisHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
    defaultRpcUrl: 'https://api.mainnet-beta.solana.com',
    walletChain: 'solana:mainnet',
    signingEnabled: false,
  },
};

export function getClusterDescriptor(id: ClusterId): ClusterDescriptor {
  const cluster = CLUSTERS[id];
  if (!cluster) {
    throw new Error(`Unknown cluster identifier: ${id}`);
  }
  return cluster;
}

export function findClusterByGenesisHash(genesisHash: string): ClusterDescriptor | undefined {
  return Object.values(CLUSTERS).find(c => c.genesisHash === genesisHash);
}
