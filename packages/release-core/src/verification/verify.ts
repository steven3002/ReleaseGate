import type { ClusterId } from '../cluster/clusters';
import type { GuardAssessment } from '../guard/assess';
import type { ClassifiedInstruction } from '../inspection/classify';
import type { ChainEvidence, ProposalSnapshot } from '../inspection/read-proposal';
import type { ReleaseManifest } from '../manifest/schema';
import type { MultisigSnapshot } from '../squads/multisig';
import type { StoredTransaction } from '../squads/stored-transaction';
import { runArtifactChecks } from './artifact-checks';
import { runBufferChecks } from './buffer-checks';
import type { CheckResult } from './check';
import { runDeploymentChecks } from './deployment-checks';
import { runIdentityChecks } from './identity-checks';
import { runProvenanceChecks } from './provenance-checks';
import { runTransactionChecks } from './transaction-checks';

export interface VerificationWorkspace {
  readonly id?: string | undefined;
  readonly clusterId: ClusterId;
  readonly rpcUrl?: string | undefined;
  readonly multisig: string;
  readonly rpcGenesisHash?: string | undefined;
}

export interface ReviewedArtifact {
  readonly sha256: string;
  readonly keccak256: string;
  readonly verifiedBuildSha256?: string | undefined;
  readonly length: number;
  readonly storageRef?: string | undefined;
  readonly bytes?: Uint8Array | undefined;
}

export interface ImportSource {
  readonly channel: 'file-picker' | 'share';
  readonly providerAuthority?: string | undefined;
  readonly displayName?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly referrer?: string | undefined;
  readonly size: number;
  readonly importedAt: string;
}

export interface Attestation {
  readonly statementVersion: string;
  readonly confirmedAt: string;
}

export interface ImportedRelease {
  readonly id: string;
  readonly manifest: ReleaseManifest;
  readonly manifestSha256: string;
  readonly artifact: ReviewedArtifact;
  readonly artifactSource?: ImportSource | undefined;
  readonly manifestSource?: ImportSource | undefined;
  readonly attestation?: Attestation | undefined;
}

export interface VerificationInput {
  readonly workspace: VerificationWorkspace;
  readonly multisig?: MultisigSnapshot | undefined;
  readonly proposal?: ProposalSnapshot | undefined;
  readonly storedTransaction?: StoredTransaction | undefined;
  readonly guardAssessment?: GuardAssessment | undefined;
  readonly classifiedInstructions?: readonly ClassifiedInstruction[] | undefined;
  readonly chainEvidence?: ChainEvidence | undefined;
  readonly release?: ImportedRelease | undefined;
}

export function verify(input: VerificationInput): CheckResult[] {
  const { workspace, proposal, storedTransaction, guardAssessment, chainEvidence, release } = input;

  const manifest = release?.manifest;
  const artifact = release?.artifact;

  const expectedSlot =
    manifest?.expectedDeploymentSlot !== undefined
      ? BigInt(manifest.expectedDeploymentSlot)
      : undefined;

  const upgradeProgram =
    guardAssessment?.params?.program ??
    (storedTransaction?.instructions.length
      ? chainEvidence?.program?.owner
      : undefined);

  const vault =
    manifest?.vault ??
    storedTransaction?.vault;

  const identityChecks = runIdentityChecks({
    workspaceClusterId: workspace.clusterId,
    workspaceMultisig: workspace.multisig,
    rpcGenesisHash: workspace.rpcGenesisHash,
    manifestClusterGenesisHash: manifest?.cluster.genesisHash,
    manifestMultisig: manifest?.multisig,
    manifestVault: manifest?.vault,
    manifestVaultIndex: manifest?.vaultIndex,
    storedTransactionVault: storedTransaction?.vault,
    manifestProgram: manifest?.program,
    upgradeProgram,
  });

  const transactionChecks = runTransactionChecks({
    storedTransaction,
    expectedMultisig: workspace.multisig,
    expectedTransactionIndex: proposal?.transactionIndex ?? 0n,
    guardAssessment,
    classifiedInstructions: input.classifiedInstructions,
    artifactLength: artifact?.length ?? manifest?.artifact.length,
    artifactKeccak256: artifact?.keccak256 ?? manifest?.artifact.keccak256,
    manifestExpectedDeploymentSlot: expectedSlot,
  });

  const bufferChecks = runBufferChecks({
    buffer: chainEvidence?.buffer,
    vault,
    artifactLength: artifact?.length ?? manifest?.artifact.length,
    artifactBytes: artifact?.bytes,
  });

  const deploymentChecks = runDeploymentChecks({
    programAddress: manifest?.program ?? guardAssessment?.params?.program,
    programAccount: chainEvidence?.program,
    expectedProgramDataAddress: guardAssessment?.params?.programData,
    programDataAccount: chainEvidence?.programData,
    vault,
    manifestExpectedDeploymentSlot: expectedSlot,
    artifactLength: artifact?.length ?? manifest?.artifact.length,
  });

  const artifactChecks = runArtifactChecks({
    manifestArtifact: manifest?.artifact,
    reviewedArtifact: artifact,
  });

  const provenanceChecks = runProvenanceChecks({
    manifestProvenance: manifest?.provenance,
    artifactSource: release?.artifactSource,
    manifestSource: release?.manifestSource,
    attestation: release?.attestation,
  });

  // Reorganize in canonical order matching section 7.5
  const programAccountCheck = deploymentChecks.find(c => c.id === 'program.account');
  const otherDeploymentChecks = deploymentChecks.filter(c => c.id !== 'program.account');

  const orderedResults: CheckResult[] = [
    ...identityChecks,
    ...(programAccountCheck ? [programAccountCheck] : []),
    ...transactionChecks,
    ...bufferChecks,
    ...otherDeploymentChecks,
    ...artifactChecks,
    ...provenanceChecks,
  ];

  return orderedResults;
}
