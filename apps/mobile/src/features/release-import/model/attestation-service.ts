import type { Attestation, ImportedRelease } from '../types';
import { saveAttestation } from './release-store';

export const ATTESTATION_STATEMENT =
  'I obtained this artifact from my own review or build, not from the proposer.';
export const ATTESTATION_STATEMENT_VERSION = 1;

export async function attestRelease(
  releaseId: string
): Promise<ImportedRelease> {
  const attestation: Attestation = {
    statementVersion: ATTESTATION_STATEMENT_VERSION,
    confirmedAt: new Date().toISOString(),
  };

  return await saveAttestation(releaseId, attestation);
}
