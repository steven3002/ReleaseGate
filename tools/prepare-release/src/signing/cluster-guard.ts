import type { Connection } from '@solana/web3.js';
import { CLUSTERS, matchesClusterGenesis } from 'release-core';

export async function assertDevnetCluster(connection: Connection): Promise<string> {
  const genesisHash = await connection.getGenesisHash();
  if (!matchesClusterGenesis('devnet', genesisHash)) {
    throw new Error(
      `Refusing operation: endpoint genesis hash "${genesisHash}" does not match devnet ("${CLUSTERS.devnet.genesisHash}").`,
    );
  }
  return genesisHash;
}
