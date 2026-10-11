import type { Connection } from '@solana/web3.js';
import type {
  ChainReader,
  ClusterDescriptor,
  Operation,
  ReviewVerdict,
} from 'release-core';
import type { ImportedRelease } from '../../release-import/types';
import type { WalletSigner } from '../../wallet';
import type { Workspace } from '../../workspace/types';

export interface ExecuteProposalParams {
  readonly workspace: Workspace;
  readonly cluster: ClusterDescriptor;
  readonly transactionIndex: bigint;
  readonly expectedVerdict: ReviewVerdict;
  readonly selectedRelease: ImportedRelease | null;
  readonly connection: Connection;
  readonly chainReader: ChainReader;
  readonly walletSigner?: WalletSigner | undefined;
  readonly forceSignAndSendFallback?: boolean | undefined;
  readonly onStatusUpdate?: ((status: string) => void) | undefined;
  readonly onPhaseChange?: ((operation: Operation) => void) | undefined;
}

export interface ExecuteProposalResult {
  readonly success: boolean;
  readonly operation: Operation;
  readonly simulatedUnitsConsumed?: number | undefined;
  readonly computeUnitLimit?: number | undefined;
  readonly executionConditionsFailed?: boolean | undefined;
  readonly error?: string | undefined;
}
