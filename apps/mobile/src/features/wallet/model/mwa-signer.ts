import { Buffer } from 'buffer';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { PublicKey } from '@solana/web3.js';
import type { ClusterDescriptor } from 'release-core';
import {
  type WalletSigner,
  type WalletConnectResult,
  type SubmissionResult,
  type SignAndSubmitRequest,
  WalletDeclinedError,
} from '../types';
import {
  getCachedAuthorization,
  saveCachedAuthorization,
  clearCachedAuthorization,
} from './authorization-cache';

import {
  verifyAuthorizedMember,
  verifyMemberSignature,
  verifySignedTransactionMessage,
} from './verification';

const APP_IDENTITY = {
  name: 'ReleaseGate',
};

function isUserDeclinedError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as Record<string, unknown>;
  const code = anyErr.code;
  if (code === -3 || code === 'ERROR_NOT_SIGNED' || code === 'ERROR_ASSOCIATION_CANCELLED') {
    return true;
  }
  const msg = String(anyErr.message || anyErr).toLowerCase();
  return (
    msg.includes('declined') ||
    msg.includes('not signed') ||
    msg.includes('cancelled') ||
    msg.includes('canceled') ||
    msg.includes('refused') ||
    msg.includes('association_cancelled')
  );
}

export class MwaWalletSigner implements WalletSigner {
  constructor(private readonly transactRunner: typeof transact = transact) {}

  async connect(cluster: ClusterDescriptor): Promise<WalletConnectResult> {
    const cached = await getCachedAuthorization(cluster.id);

    try {
      return await this.transactRunner(async (wallet) => {
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
    } catch (err: unknown) {
      if (isUserDeclinedError(err)) {
        throw new WalletDeclinedError(String(err));
      }
      throw err;
    }
  }

  async signAndSubmit(request: SignAndSubmitRequest): Promise<SubmissionResult> {
    const cached = await getCachedAuthorization(request.cluster.id);

    try {
      return await this.transactRunner(async (wallet) => {
        let authResult;

        if (cached?.authToken) {
          try {
            authResult = await wallet.authorize({
              identity: APP_IDENTITY,
              chain: request.cluster.walletChain as `solana:${string}`,
              auth_token: cached.authToken,
            });
          } catch {
            authResult = null;
          }
        }

        if (!authResult) {
          authResult = await wallet.authorize({
            identity: APP_IDENTITY,
            chain: request.cluster.walletChain as `solana:${string}`,
          });
        }

        const firstAccount = authResult.accounts?.[0];
        if (!firstAccount) {
          throw new Error('Wallet did not return any accounts');
        }

        const rawAddress = firstAccount.address;
        const pubkeyBytes = Buffer.from(rawAddress, 'base64');
        const authorizedMember = new PublicKey(pubkeyBytes).toBase58();

        // Enforce member binding invariant
        verifyAuthorizedMember(authorizedMember, request.member);

        // Cache the valid auth token
        await saveCachedAuthorization({
          clusterId: request.cluster.id,
          authToken: authResult.auth_token,
          memberAddress: authorizedMember,
          authorizedAt: new Date().toISOString(),
        });

        const capabilities = await wallet.getCapabilities();
        const features = (capabilities.features as readonly string[]) || [];
        const hasSignTransactions = features.includes('solana:signTransactions');

        if (hasSignTransactions && !request.forceSignAndSendFallback) {
          // Sign-only preferred path
          const [signedTx] = await wallet.signTransactions({
            transactions: [request.transaction],
          });

          if (!signedTx) {
            throw new Error('Wallet did not return signed transaction');
          }

          verifySignedTransactionMessage(request.transaction, signedTx);
          verifyMemberSignature(signedTx, request.member);

          const wireBytes = new Uint8Array(signedTx.serialize());
          const signature = await request.submit(wireBytes);

          return {
            submissionMethod: 'app-rpc',
            signature,
            signedTransaction: wireBytes,
          };
        } else {
          // Fallback to signAndSendTransactions
          const [signature] = await wallet.signAndSendTransactions({
            transactions: [request.transaction],
          });

          if (!signature) {
            throw new Error('Wallet did not return transaction signature');
          }

          return {
            submissionMethod: 'wallet',
            signature,
          };
        }
      });
    } catch (err: unknown) {
      if (isUserDeclinedError(err)) {
        throw new WalletDeclinedError(String(err));
      }
      throw err;
    }
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
