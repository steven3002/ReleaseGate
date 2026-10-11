import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { PublicKey } from '@solana/web3.js';
import type { ClusterDescriptor } from 'release-core';
import type { WalletSigner, WalletConnectResult } from '../types';
import {
  getCachedAuthorization,
  saveCachedAuthorization,
  clearCachedAuthorization,
} from './authorization-cache';

const APP_IDENTITY = {
  name: 'ReleaseGate',
};

export class MwaWalletSigner implements WalletSigner {
  async connect(cluster: ClusterDescriptor): Promise<WalletConnectResult> {
    const cached = await getCachedAuthorization(cluster.id);

    return await transact(async (wallet) => {
      let authResult;

      if (cached?.authToken) {
        try {
          authResult = await wallet.authorize({
            identity: APP_IDENTITY,
            chain: cluster.walletChain as `solana:${string}`,
            auth_token: cached.authToken,
          });
        } catch {
          // Token expired, invalidated or refused; fall back to fresh authorization
          authResult = null;
        }
      }

      if (!authResult) {
        authResult = await wallet.authorize({
          identity: APP_IDENTITY,
          chain: cluster.walletChain as `solana:${string}`,
        });
      }

      const firstAccount = authResult.accounts?.[0];
      if (!firstAccount) {
        throw new Error('Wallet did not return any accounts');
      }

      const rawAddress = firstAccount.address;
      const pubkeyBytes = Buffer.from(rawAddress, 'base64');
      const member = new PublicKey(pubkeyBytes).toBase58();

      const newAuth = {
        clusterId: cluster.id,
        authToken: authResult.auth_token,
        memberAddress: member,
        authorizedAt: new Date().toISOString(),
      };
      await saveCachedAuthorization(newAuth);

      return {
        member,
        authToken: authResult.auth_token,
      };
    });
  }

  async disconnect(clusterId?: string): Promise<void> {
    if (clusterId) {
      await clearCachedAuthorization(clusterId);
    }
  }

  async getCachedMember(clusterId: string): Promise<string | null> {
    const cached = await getCachedAuthorization(clusterId);
    return cached ? cached.memberAddress : null;
  }
}

export const mwaSigner = new MwaWalletSigner();
