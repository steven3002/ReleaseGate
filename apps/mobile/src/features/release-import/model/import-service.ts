import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import {
  parseManifest,
  computeArtifactDigests,
  bindArtifactToManifest,
} from 'release-core';
import { putBlob } from '../../../platform/storage';
import type {
  ImportSource,
  ImportedRelease,
  ImportValidationResult,
  ReviewedArtifact,
} from '../types';
import { saveRelease } from './release-store';

export async function readUriBytes(uri: string): Promise<Uint8Array> {
  try {
    const file = new File(uri);
    return await file.bytes();
  } catch {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
}

export async function validateAndImportRelease(
  binaryInput: { bytes: Uint8Array; source: ImportSource },
  manifestInput: { bytes: Uint8Array; source: ImportSource }
): Promise<ImportValidationResult> {
  // 1. Parse and validate manifest
  const manifestResult = parseManifest(manifestInput.bytes);
  if (!manifestResult.ok) {
    return {
      ok: false,
      error: manifestResult.reason,
      differingField: manifestResult.field,
    };
  }

  const { manifest, manifestSha256 } = manifestResult;

  // 2. Compute artifact digests
  const digests = computeArtifactDigests(binaryInput.bytes);

  // 3. Bind artifact to manifest
  const binding = bindArtifactToManifest(digests, manifest);
  if (!binding.matches) {
    const errorMsg = binding.errors.join('; ');
    let differingField = 'artifact';
    if (digests.length !== manifest.artifact.length) {
      differingField = 'length';
    } else if (
      digests.sha256.toLowerCase() !== manifest.artifact.sha256.toLowerCase()
    ) {
      differingField = 'sha256';
    } else if (
      digests.keccak256.toLowerCase() !== manifest.artifact.keccak256.toLowerCase()
    ) {
      differingField = 'keccak256';
    } else if (
      manifest.artifact.verifiedBuildSha256 &&
      digests.verifiedBuildSha256.toLowerCase() !==
        manifest.artifact.verifiedBuildSha256.toLowerCase()
    ) {
      differingField = 'verifiedBuildSha256';
    }

    return {
      ok: false,
      error: errorMsg,
      differingField,
    };
  }

  // 4. Save binary to blob store
  await putBlob(binaryInput.bytes, digests.sha256);

  // 5. Construct ReviewedArtifact and ImportedRelease
  const artifact: ReviewedArtifact = {
    length: digests.length,
    sha256: digests.sha256,
    keccak256: digests.keccak256,
    verifiedBuildSha256: digests.verifiedBuildSha256,
    storageRef: `blob:${digests.sha256}`,
  };

  const release: ImportedRelease = {
    id: manifestSha256,
    manifest,
    manifestSha256,
    artifact,
    artifactSource: binaryInput.source,
    manifestSource: manifestInput.source,
  };

  // 6. Persist release document
  await saveRelease(release);

  return {
    ok: true,
    release,
  };
}
