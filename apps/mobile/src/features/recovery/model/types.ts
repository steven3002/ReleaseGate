import type { Connection, Transaction } from '@solana/web3.js';
import type {
  ChainReader,
  ClusterDescriptor,
  Operation,
  OperationPhase,
} from 'release-core';
import type { WalletSigner } from '../../wallet';

export interface OperationJournal {
  saveOperation(operation: Operation): Promise<void>;
  getOperation(id: string): Promise<Operation | null>;
  listOperations(): Promise<Operation[]>;
  removeOperation(id: string): Promise<void>;
}

export interface OperationPipelineInput {
  readonly operation: Operation;
  readonly transaction: Transaction;
  readonly cluster: ClusterDescriptor;
  readonly connection: Connection;
  readonly chainReader: ChainReader;
  readonly walletSigner?: WalletSigner | undefined;
  readonly journal?: OperationJournal | undefined;
  readonly forceSignAndSendFallback?: boolean | undefined;
  readonly pollIntervalMs?: number | undefined;
  readonly pollTimeoutMs?: number | undefined;
  readonly onPhaseChange?: ((operation: Operation) => void) | undefined;
}

export interface OperationPipelineResult {
  readonly operation: Operation;
}

export const TERMINAL_PHASES: ReadonlySet<OperationPhase> = new Set([
  'confirmed',
  'failed',
  'declined',
  'expired',
  'superseded',
]);
