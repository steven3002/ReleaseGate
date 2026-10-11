export const MANIFEST_SCHEMA_V1 = 'releasegate.manifest/1';

export interface ManifestCluster {
  readonly name: string;
  readonly genesisHash: string;
}

export interface ManifestReleaseInfo {
  readonly name: string;
  readonly version: string;
}

export interface ManifestArtifact {
  readonly fileName?: string | undefined;
  readonly length: number;
  readonly sha256: string;
  readonly keccak256: string;
  readonly verifiedBuildSha256?: string | undefined;
}

export interface ManifestProvenance {
  readonly sourceRepository: string;
  readonly commit: string;
  readonly buildMethod: string;
  readonly builder: string;
  readonly builtAt: string;
}

export interface ReleaseManifest {
  readonly schema: typeof MANIFEST_SCHEMA_V1;
  readonly release?: ManifestReleaseInfo | undefined;
  readonly cluster: ManifestCluster;
  readonly multisig: string;
  readonly vaultIndex: number;
  readonly vault: string;
  readonly program: string;
  readonly expectedDeploymentSlot: bigint;
  readonly artifact: ManifestArtifact;
  readonly provenance: ManifestProvenance;
  readonly buffer?: string | undefined;
  readonly signature?: unknown;
}
