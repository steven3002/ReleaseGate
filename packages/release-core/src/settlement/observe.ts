import type {
  ChainReader,
  SignatureStatusSnapshot,
} from '../chain/chain-reader';
import type { ProposalSnapshot } from '../inspection/read-proposal';
import { deriveProposalPda, deriveTransactionPda } from '../squads/addresses';
import { decodeProposalAccount } from '../squads/proposal';
import {
  decodeStoredTransaction,
  type StoredTransaction,
} from '../squads/stored-transaction';
import type { Operation } from './operation';

export interface OperationObservation {
  readonly proposal?: ProposalSnapshot | null | undefined;
  readonly storedTransaction?: StoredTransaction | null | undefined;
  readonly currentBlockHeight?: number | undefined;
  readonly signatureStatus?: SignatureStatusSnapshot | null | undefined;
  readonly userDeclined?: boolean | undefined;
  readonly rpcError?: string | undefined;
}

export async function observeOperation(
  chain: ChainReader,
  operation: Operation
): Promise<OperationObservation> {
  try {
    const txPda = deriveTransactionPda(
      operation.multisig,
      operation.transactionIndex
    ).address;
    const propPda = deriveProposalPda(
      operation.multisig,
      operation.transactionIndex
    ).address;

    const [accountsRes, currentBlockHeight, signatureStatus] = await Promise.all([
      chain.getAccounts([txPda, propPda]),
      chain.getBlockHeight().catch(() => undefined),
      operation.signature
        ? chain.getSignatureStatus(operation.signature).catch(() => null)
        : Promise.resolve(null),
    ]);

    const txAccount = accountsRes.accounts[0];
    const propAccount = accountsRes.accounts[1];

    let storedTransaction: StoredTransaction | null = null;
    if (txAccount) {
      const dec = decodeStoredTransaction(
        txPda,
        txAccount.data,
        accountsRes.contextSlot
      );
      if (dec.ok) {
        storedTransaction = dec.value;
      }
    }

    let proposal: ProposalSnapshot | null = null;
    if (propAccount) {
      const dec = decodeProposalAccount(
        propAccount.data
      );
      if (dec.ok) {
        proposal = {
          multisig: dec.value.multisig,
          transactionIndex: dec.value.transactionIndex,
          status: dec.value.status,
          approved: dec.value.approved,
          rejected: dec.value.rejected,
          cancelled: dec.value.cancelled,
          contextSlot: accountsRes.contextSlot,
        };
      }
    }

    return {
      proposal,
      storedTransaction,
      currentBlockHeight,
      signatureStatus,
      userDeclined: false,
    };
  } catch (err: unknown) {
    return {
      rpcError: String(err),
      userDeclined: false,
    };
  }
}
