import type { ClusterDescriptor } from 'release-core';

export interface WalletAuthorization {
  clusterId: string;
  authToken: string;
  memberAddress: string;
  authorizedAt: string;
}

export interface WalletConnectResult {
  member: string;
  authToken: string;
}

export interface WalletSigner {
  connect(cluster: ClusterDescriptor): Promise<WalletConnectResult>;
  disconnect(clusterId?: string): Promise<void>;
  getCachedMember(clusterId: string): Promise<string | null>;
}
