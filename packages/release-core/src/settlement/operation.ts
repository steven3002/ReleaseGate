import type { ClusterId } from '../cluster/clusters';
import type { BoundToTarget } from '../policy/verdict';

export type OperationKind =
  | 'approve'
  | 'reject'
  | 'create-guarded-proposal'
  | 'execute';

export type OperationPhase =
  | 'prepared'
  | 'handed-off'
  | 'submitted'
  | 'confirmed'
  | 'failed'
  | 'declined'
  | 'expired'
  | 'superseded'
  | 'unresolved';

export interface Operation {
  readonly id: string;
  readonly kind: OperationKind;
  readonly clusterId: ClusterId;
  readonly multisig: string;
  readonly transactionIndex: bigint;
  readonly member: string;
  readonly boundTo?: BoundToTarget | undefined;
  readonly phase: OperationPhase;
  readonly submission: 'app-rpc' | 'wallet';
  readonly signature?: string | undefined;
  readonly signedTransaction?: Uint8Array | undefined;
  readonly blockhash: string;
  readonly lastValidBlockHeight: number;
  readonly expectedMessageSha256?: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolution?: string | undefined;
}
