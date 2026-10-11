import type { Connection } from '@solana/web3.js';
import type {
  ChainReader,
  ClusterDescriptor,
  Operation,
} from 'release-core';
import type { ImportedRelease } from '../../release-import/types';
import type { WalletSigner } from '../../wallet';
import type { Workspace } from '../../workspace/types';

export interface GuardedProposalPlan {
  readonly multisig: string;
  readonly transactionIndex: bigint;
  readonly creator: string;
  readonly vault: string;
  readonly vaultIndex: number;
  readonly program: string;
  readonly programData: string;
  readonly buffer: string;
  readonly spill: string;
  readonly payloadLength: bigint;
  readonly keccak256: string;
  readonly deploymentSlot: bigint;
}

export interface CreateGuardedProposalParams {
  readonly workspace: Workspace;
  readonly cluster: ClusterDescriptor;
  readonly selectedRelease: ImportedRelease;
  readonly bufferAddress: string;
  readonly spillAddress?: string | undefined;
  readonly connection: Connection;
  readonly chainReader: ChainReader;
  readonly walletSigner?: WalletSigner | undefined;
  readonly forceSignAndSendFallback?: boolean | undefined;
  readonly onStatusUpdate?: ((status: string) => void) | undefined;
  readonly onPhaseChange?: ((operation: Operation) => void) | undefined;
}

export interface CreateGuardedProposalResult {
  readonly success: boolean;
  readonly operation: Operation;
  readonly transactionIndex?: bigint | undefined;
  readonly selfCheckPassed?: boolean | undefined;
  readonly error?: string | undefined;
}
