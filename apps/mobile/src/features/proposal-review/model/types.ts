import type {
  ProposalInspection,
  ReviewVerdict,
} from 'release-core';
import type { ImportedRelease } from '../../release-import';

export interface ProposalReviewState {
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly evaluatingArtifact: boolean;
  readonly error: string | null;
  readonly inspection: ProposalInspection | null;
  readonly candidates: readonly ImportedRelease[];
  readonly selectedReleaseId: string | null;
  readonly selectedRelease: ImportedRelease | null;
  readonly verdict: ReviewVerdict | null;
  readonly contextSlot: number;
  readonly hashTimingMs: number | null;
}

export interface ProposalReviewActions {
  readonly refresh: () => Promise<void>;
  readonly selectRelease: (releaseId: string | null) => void;
}

export interface ProposalReviewResult {
  readonly state: ProposalReviewState;
  readonly actions: ProposalReviewActions;
}
