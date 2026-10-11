import {
  getDocument,
  setDocument,
  listDocuments,
  deleteDocument,
} from '../../../platform/storage';
import type { ImportedRelease, Attestation } from '../types';

const COLLECTION = 'releases';

export async function saveRelease(release: ImportedRelease): Promise<void> {
  await setDocument(COLLECTION, release.id, release);
}

export async function getRelease(id: string): Promise<ImportedRelease | null> {
  return await getDocument<ImportedRelease>(COLLECTION, id);
}

export async function listReleases(): Promise<ImportedRelease[]> {
  return await listDocuments<ImportedRelease>(COLLECTION);
}

export async function removeRelease(id: string): Promise<void> {
  await deleteDocument(COLLECTION, id);
}

export async function saveAttestation(
  releaseId: string,
  attestation: Attestation
): Promise<ImportedRelease> {
  const release = await getRelease(releaseId);
  if (!release) {
    throw new Error(`Release not found: ${releaseId}`);
  }

  const updated: ImportedRelease = {
    ...release,
    attestation,
  };
  await saveRelease(updated);
  return updated;
}
