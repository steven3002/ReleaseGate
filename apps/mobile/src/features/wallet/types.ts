import type { ClusterDescriptor } from 'release-core';
import type { Transaction } from '@solana/web3.js';

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

export interface SubmissionResult {
  readonly submissionMethod: 'app-rpc' | 'wallet';
  readonly signature: string;
  readonly signedTransaction?: Uint8Array | undefined;
}

export interface SignAndSubmitRequest {
  readonly cluster: ClusterDescriptor;
  readonly member: string;
  readonly transaction: Transaction;
  readonly submit: (signed: Uint8Array) => Promise<string>;
  readonly minContextSlot?: number | undefined;
  /**
   * Called between wallet sessions, while this app is in the foreground, when
   * a connect prompt has used up part of the transaction's lifetime.
   */
  readonly refreshLifetime?: (() => Promise<void>) | undefined;
  readonly forceSignAndSendFallback?: boolean | undefined;
}

export interface WalletSigner {
  connect(cluster: ClusterDescriptor): Promise<WalletConnectResult>;
  signAndSubmit(request: SignAndSubmitRequest): Promise<SubmissionResult>;
  disconnect(clusterId?: string): Promise<void>;
  getCachedMember(clusterId: string): Promise<string | null>;
}

export class WalletDeclinedError extends Error {
  readonly isUserDeclined = true;
  constructor(message = 'Operation was declined by user in wallet') {
    super(message);
    this.name = 'WalletDeclinedError';
  }
}
