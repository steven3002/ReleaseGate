import type { ReleaseManifest, ArtifactDigests } from 'release-core';

export interface ReviewedArtifact extends ArtifactDigests {
  storageRef: string;
}

export interface ImportSource {
  channel: 'file-picker' | 'share';
  providerAuthority?: string | undefined;
  displayName?: string | undefined;
  mimeType?: string | undefined;
  referrer?: string | undefined;
  size?: number | undefined;
  importedAt: string;
}

export interface Attestation {
  statementVersion: number;
  confirmedAt: string;
}

export interface ImportedRelease {
  id: string; // manifest sha256
  manifest: ReleaseManifest;
  manifestSha256: string;
  artifact: ReviewedArtifact;
  artifactSource: ImportSource;
  manifestSource: ImportSource;
  attestation?: Attestation | undefined;
}

export type ImportValidationResult =
  | { ok: true; release: ImportedRelease }
  | { ok: false; error: string; differingField?: string | undefined };
