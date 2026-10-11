import type { ChainCommitment } from '../chain/chain-reader';
import type { ClusterId } from '../cluster/clusters';
import type { CheckResult } from '../verification/check';

export interface ReceiptExecutionInfo {
  readonly signature?: string | undefined;
  readonly slot?: number | undefined;
  readonly executor?: string | undefined;
  readonly observedOnly: boolean;
}

export interface DeployedStateSummary {
  readonly slot: bigint;
  readonly upgradeAuthority: string | null;
  readonly payloadMatchesArtifact: boolean;
  readonly trailingBytesAllZero: boolean;
  readonly bufferClosed: boolean;
}

export interface DeploymentReceipt {
  readonly id: string;
  readonly clusterId: ClusterId;
  readonly genesisHash: string;
  readonly multisig: string;
  readonly transactionIndex: bigint;
  readonly vault: string;
  readonly program: string;
  readonly programData: string;
  readonly artifactSha256: string;
  readonly artifactKeccak256: string;
  readonly artifactLength: number;
  readonly manifestSha256: string;
  readonly expectedDeploymentSlot: bigint;
  readonly execution: ReceiptExecutionInfo;
  readonly deployed: DeployedStateSummary;
  readonly checks: readonly CheckResult[];
  readonly commitment: ChainCommitment;
  readonly createdAt: string;
}
