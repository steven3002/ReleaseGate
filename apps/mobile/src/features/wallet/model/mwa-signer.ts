import { Buffer } from 'buffer';
import {
  transact,
  type Web3MobileWallet,
} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { PublicKey, type Transaction } from '@solana/web3.js';
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

// Wallets key an app's authorization to its identity URI, and some will not
// present a signing request from an app that has none. An icon, if added, must
// be a path relative to this URI.
const APP_IDENTITY = {
  name: 'ReleaseGate',
  uri: 'https://steven3002.github.io',
};

const SIGN_TRANSACTIONS_FEATURE = 'solana:signTransactions';

type AuthorizationResult = Awaited<ReturnType<Web3MobileWallet['authorize']>>;

type SessionOutcome =
  | { readonly kind: 'deferred' }
  | { readonly kind: 'signed'; readonly signedTransaction: Transaction }
  | { readonly kind: 'sent'; readonly signature: string };

/**
 * Authorizes the session, reusing the cached token when there is one. A token
 * the wallet no longer accepts is replaced by a fresh authorization inside the
 * same session, so the request that follows is not lost. Each attempt is
 * recorded in the trace.
 */
async function authorizeSession(
  wallet: Web3MobileWallet,
  cluster: ClusterDescriptor,
  cachedToken: string | undefined,
  trace: string[] = []
): Promise<AuthorizationResult> {
  const chain = cluster.walletChain as `solana:${string}`;

  if (cachedToken) {
    try {
      return await walletRequest('authorize with cached token', trace, () =>
        wallet.authorize({ identity: APP_IDENTITY, chain, auth_token: cachedToken })
      );
    } catch {
      // Token expired or revoked; fall through to a fresh authorization
    }
  }

  return await walletRequest('authorize', trace, () =>
    wallet.authorize({ identity: APP_IDENTITY, chain })
  );
}

function memberFromAuthorization(authResult: AuthorizationResult): string {
  const firstAccount = authResult.accounts?.[0];
  if (!firstAccount) {
    throw new Error('Wallet did not return any accounts');
  }
  return new PublicKey(Buffer.from(firstAccount.address, 'base64')).toBase58();
}

async function supportsSignOnly(
  wallet: Web3MobileWallet,
  trace: string[]
): Promise<boolean> {
  try {
    const capabilities = await walletRequest('getCapabilities', trace, () =>
      wallet.getCapabilities()
    );
    const features = (capabilities.features as readonly string[]) || [];
    trace.push(`features [${features.join(', ')}]`);
    return features.includes(SIGN_TRANSACTIONS_FEATURE);
  } catch {
    return false;
  }
}

// A wallet cannot have shown a prompt and collected an answer in less time than this.
const UNPROMPTED_ANSWER_MS = 1500;

/**
 * A wallet request that failed, with the step it failed in and how long the
 * wallet took to answer, so an answer given without a prompt can be told apart
 * from a decision the user made.
 */
class WalletRequestError extends Error {
  readonly declined: boolean;
  readonly unprompted: boolean;

  constructor(step: string, elapsedMs: number, cause: unknown) {
    super(`${step} failed after ${elapsedMs} ms: ${describeError(cause)}`);
    this.name = 'WalletRequestError';
    this.declined = isUserDeclinedError(cause);
    this.unprompted = elapsedMs < UNPROMPTED_ANSWER_MS;
  }
}

function describeError(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  const text = String(err);
  return code !== undefined && !text.includes(String(code)) ? `${text} [code ${String(code)}]` : text;
}

/**
 * Runs one wallet request, recording its outcome and duration in the trace.
 */
async function walletRequest<T>(
  step: string,
  trace: string[],
  run: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await run();
    trace.push(`${step} ok after ${Date.now() - startedAt} ms`);
    return result;
  } catch (err: unknown) {
    const failure = new WalletRequestError(step, Date.now() - startedAt, err);
    trace.push(failure.message);
    throw failure;
  }
}

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
        const authResult = await authorizeSession(wallet, cluster, cached?.authToken);
        const member = memberFromAuthorization(authResult);

        await saveCachedAuthorization({
          clusterId: cluster.id,
          authToken: authResult.auth_token,
          memberAddress: member,
          authorizedAt: new Date().toISOString(),
        });

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

  /**
   * Signs and submits through at most three wallet sessions. Nothing here
   * touches the network while a session is open: the wallet is in the
   * foreground then, and Android may deny network access to this app.
   */
  async signAndSubmit(request: SignAndSubmitRequest): Promise<SubmissionResult> {
    const trace: string[] = [];
    let mayDefer = true;
    let mayRetry = true;

    for (let session = 1; session <= 3; session += 1) {
      trace.push(`session ${session}`);

      let outcome: SessionOutcome;
      try {
        outcome = await this.runSigningSession(request, trace, mayDefer);
      } catch (err: unknown) {
        if (!(err instanceof WalletRequestError)) {
          throw err;
        }
        // A wallet that answers without prompting gets one further session,
        // which starts from the authorization cached by this one.
        if (mayRetry && err.unprompted) {
          mayRetry = false;
          continue;
        }
        const detail = trace.join('; ');
        if (err.declined) {
          throw new WalletDeclinedError(detail);
        }
        throw new Error(detail);
      }

      if (outcome.kind === 'deferred') {
        // The connect prompt took time the transaction no longer has. With the
        // session closed this app is in the foreground again and can renew it.
        mayDefer = false;
        await request.refreshLifetime?.();
        continue;
      }

      if (outcome.kind === 'sent') {
        return { submissionMethod: 'wallet', signature: outcome.signature };
      }

      verifySignedTransactionMessage(request.transaction, outcome.signedTransaction);
      verifyMemberSignature(outcome.signedTransaction, request.member);

      const wireBytes = new Uint8Array(outcome.signedTransaction.serialize());
      const signature = await request.submit(wireBytes);

      return {
        submissionMethod: 'app-rpc',
        signature,
        signedTransaction: wireBytes,
      };
    }

    throw new Error(trace.join('; '));
  }

  private async runSigningSession(
    request: SignAndSubmitRequest,
    trace: string[],
    mayDefer: boolean
  ): Promise<SessionOutcome> {
    const cached = await getCachedAuthorization(request.cluster.id);

    return await this.transactRunner(async (wallet): Promise<SessionOutcome> => {
      const authorizeStartedAt = Date.now();
      const authResult = await authorizeSession(
        wallet,
        request.cluster,
        cached?.authToken,
        trace
      );
      const prompted = Date.now() - authorizeStartedAt >= UNPROMPTED_ANSWER_MS;
      const authorizedMember = memberFromAuthorization(authResult);

      verifyAuthorizedMember(authorizedMember, request.member);

      await saveCachedAuthorization({
        clusterId: request.cluster.id,
        authToken: authResult.auth_token,
        memberAddress: authorizedMember,
        authorizedAt: new Date().toISOString(),
      });

      if (mayDefer && prompted && request.refreshLifetime) {
        trace.push('connect prompt shown; signing in a new session');
        return { kind: 'deferred' };
      }

      if (!request.forceSignAndSendFallback && (await supportsSignOnly(wallet, trace))) {
        try {
          const [signedTransaction] = await walletRequest('signTransactions', trace, () =>
            wallet.signTransactions({ transactions: [request.transaction] })
          );
          if (!signedTransaction) {
            throw new Error('Wallet did not return signed transaction');
          }
          return { kind: 'signed', signedTransaction };
        } catch (err: unknown) {
          // Only a wallet answer that was not the user's own decision falls
          // through; nothing was signed, so wallet-side submission is still safe.
          const retryable =
            err instanceof WalletRequestError && (!err.declined || err.unprompted);
          if (!retryable) {
            throw err;
          }
        }
      }

      // Some wallets reject sign-and-send requests that omit minContextSlot.
      const { minContextSlot } = request;
      const [signature] = await walletRequest('signAndSendTransactions', trace, () =>
        wallet.signAndSendTransactions({
          transactions: [request.transaction],
          ...(minContextSlot !== undefined ? { minContextSlot } : {}),
        })
      );
      if (!signature) {
        throw new Error('Wallet did not return transaction signature');
      }
      return { kind: 'sent', signature };
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
