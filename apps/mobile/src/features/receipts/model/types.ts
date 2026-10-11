import type {
  ChainReader,
  ClusterDescriptor,
  DeploymentReceipt,
} from 'release-core';
export type { DeploymentReceipt };
import type { ImportedRelease } from '../../release-import/types';
import type { Workspace } from '../../workspace/types';

export interface GenerateReceiptParams {
  readonly workspace: Workspace;
  readonly cluster: ClusterDescriptor;
  readonly transactionIndex: bigint;
  readonly vault: string;
  readonly program: string;
  readonly bufferAddress: string;
  readonly selectedRelease: ImportedRelease;
  readonly chainReader: ChainReader;
  readonly signature?: string | undefined;
  readonly executor?: string | undefined;
  readonly observedOnly?: boolean | undefined;
}
