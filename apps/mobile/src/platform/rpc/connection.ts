import { Connection } from '@solana/web3.js';
import type { Commitment } from '@solana/web3.js';
import { Web3ChainReader } from 'release-core';
import type { ChainReader } from 'release-core';

const connectionCache = new Map<string, Connection>();
const readerCache = new Map<string, ChainReader>();

export function getOrCreateConnection(
  rpcUrl: string,
  commitment: Commitment = 'confirmed'
): Connection {
  const key = `${rpcUrl}::${commitment}`;
  let connection = connectionCache.get(key);
  if (!connection) {
    connection = new Connection(rpcUrl, commitment);
    connectionCache.set(key, connection);
  }
  return connection;
}

export function getOrCreateChainReader(
  rpcUrl: string,
  commitment: Commitment = 'confirmed'
): ChainReader {
  const key = `${rpcUrl}::${commitment}`;
  let reader = readerCache.get(key);
  if (!reader) {
    const connection = getOrCreateConnection(rpcUrl, commitment);
    reader = new Web3ChainReader(connection);
    readerCache.set(key, reader);
  }
  return reader;
}
