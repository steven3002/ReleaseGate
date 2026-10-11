import type { ChainCommitment } from '../chain/chain-reader';
import type { ClusterId } from '../cluster/clusters';
import { sha256 } from '../digest/sha256';
import { decodeProgramDataAccount } from '../loader-v3/accounts';
import {
  createFailCheck,
  createPassCheck,
  type CheckResult,
} from '../verification/check';
import type { DeploymentState } from './read-deployment';
import type { DeploymentReceipt, ReceiptExecutionInfo } from './receipt';

export interface ReconcileDeploymentInput {
  readonly clusterId: ClusterId;
  readonly genesisHash: string;
  readonly multisig: string;
  readonly transactionIndex: bigint;
  readonly vault: string;
  readonly program: string;
  readonly expectedDeploymentSlot: bigint;
  readonly artifactSha256: string;
  readonly artifactKeccak256: string;
  readonly artifactLength: number;
  readonly artifactBytes: Uint8Array;
  readonly manifestSha256: string;
  readonly deploymentState: DeploymentState;
  readonly executionInfo?: {
    readonly signature?: string | undefined;
    readonly slot?: number | undefined;
    readonly executor?: string | undefined;
    readonly observedOnly?: boolean | undefined;
  } | undefined;
  readonly commitment?: ChainCommitment | undefined;
  readonly createdAt: string;
}

export function reconcileDeployment(input: ReconcileDeploymentInput): DeploymentReceipt {
  const {
    clusterId,
    genesisHash,
    multisig,
    transactionIndex,
    vault,
    program,
    expectedDeploymentSlot,
    artifactSha256,
    artifactKeccak256,
    artifactLength,
    artifactBytes,
    manifestSha256,
    deploymentState,
    executionInfo,
    commitment = 'confirmed',
    createdAt,
  } = input;

  if (!deploymentState.programDataAccount) {
    throw new Error(`ProgramData account ${deploymentState.programDataAddress} does not exist`);
  }

  const pdataDec = decodeProgramDataAccount(deploymentState.programDataAccount.data);
  if (!pdataDec.ok) {
    throw new Error(`Failed to decode ProgramData account: ${pdataDec.reason}`);
  }

  const deployedSlot = pdataDec.value.slot;
  const upgradeAuthority = pdataDec.value.upgradeAuthority ?? null;
  const deployedPayload = pdataDec.value.payload;

  const executionSlot =
    executionInfo?.slot !== undefined
      ? BigInt(executionInfo.slot)
      : deploymentState.transactionOutcome?.slot !== undefined
        ? BigInt(deploymentState.transactionOutcome.slot)
        : deployedSlot;

  const isObservedOnly = Boolean(executionInfo?.observedOnly);

  // Observed-only guard: valid ONLY while ProgramData.slot still belongs to that execution
  if (isObservedOnly && executionInfo?.slot !== undefined) {
    if (deployedSlot !== BigInt(executionInfo.slot)) {
      throw new Error(
        `Cannot produce observed-only receipt: ProgramData deployment slot (${deployedSlot}) does not belong to execution slot (${executionInfo.slot})`
      );
    }
  }

  // 1. Check slot matches execution slot
  const slotMatches = deployedSlot === executionSlot;

  // 2. Check upgrade authority equals vault
  const authorityMatches = upgradeAuthority === vault;

  // 3. Payload prefix equals artifact byte-for-byte
  let payloadMatchesArtifact = false;
  if (deployedPayload.length >= artifactLength) {
    payloadMatchesArtifact = true;
    for (let i = 0; i < artifactLength; i++) {
      if (deployedPayload[i] !== artifactBytes[i]) {
        payloadMatchesArtifact = false;
        break;
      }
    }
  }

  // 4. Trailing bytes after artifactLength are all zero
  let trailingBytesAllZero = true;
  if (deployedPayload.length > artifactLength) {
    for (let i = artifactLength; i < deployedPayload.length; i++) {
      if (deployedPayload[i] !== 0) {
        trailingBytesAllZero = false;
        break;
      }
    }
  }

  // 5. Buffer closed
  const bufferClosed =
    deploymentState.bufferAccount === null ||
    deploymentState.bufferAccount.lamports === 0n;

  const checks: CheckResult[] = [
    slotMatches
      ? createPassCheck('deployment.slot', 'deployment')
      : createFailCheck(
          'deployment.slot',
          'deployment',
          executionSlot.toString(),
          deployedSlot.toString(),
          'Deployed ProgramData slot does not match execution slot'
        ),
    authorityMatches
      ? createPassCheck('programdata.authority', 'deployment')
      : createFailCheck(
          'programdata.authority',
          'deployment',
          vault,
          upgradeAuthority ?? 'none',
          'Deployed program upgrade authority does not match multisig vault'
        ),
    payloadMatchesArtifact
      ? createPassCheck('buffer.bytes', 'buffer')
      : createFailCheck(
          'buffer.bytes',
          'buffer',
          artifactSha256,
          'mismatch',
          'Deployed payload does not match reviewed artifact'
        ),
    trailingBytesAllZero
      ? createPassCheck('buffer.length', 'buffer')
      : createFailCheck(
          'buffer.length',
          'buffer',
          'all zero',
          'non-zero trailing bytes',
          'Deployed program data contains non-zero trailing bytes'
        ),
    bufferClosed
      ? createPassCheck('buffer.state', 'buffer')
      : createFailCheck(
          'buffer.state',
          'buffer',
          'closed',
          'exists',
          'Buffer account was not closed by loader during execution'
        ),
  ];

  const receiptExecution: ReceiptExecutionInfo = {
    signature: executionInfo?.signature ?? undefined,
    slot: executionInfo?.slot ?? (deploymentState.transactionOutcome?.slot ?? undefined),
    executor: executionInfo?.executor ?? undefined,
    observedOnly: isObservedOnly,
  };

  const receiptId = sha256(
    new TextEncoder().encode(
      `${clusterId}:${program}:${deployedSlot.toString()}:${artifactSha256}:${manifestSha256}`
    )
  );

  return {
    id: receiptId,
    clusterId,
    genesisHash,
    multisig,
    transactionIndex,
    vault,
    program,
    programData: deploymentState.programDataAddress,
    artifactSha256,
    artifactKeccak256,
    artifactLength,
    manifestSha256,
    expectedDeploymentSlot,
    execution: receiptExecution,
    deployed: {
      slot: deployedSlot,
      upgradeAuthority,
      payloadMatchesArtifact,
      trailingBytesAllZero,
      bufferClosed,
    },
    checks,
    commitment,
    createdAt,
  };
}
