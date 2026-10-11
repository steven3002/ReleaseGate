import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ProposalInspection, ReviewVerdict } from 'release-core';
import { getActiveWorkspace, type Workspace } from '../../workspace';
import { listReleases, type ImportedRelease } from '../../release-import';
import { fetchProposalInspection } from './proposal-reader';
import {
  filterCandidateReleases,
  resolveDefaultReleaseSelection,
} from './release-selector';
import { evaluateReview } from './review-evaluator';
import type { ProposalReviewResult, ProposalReviewState } from './types';

export function useProposalReview(
  proposalIndexStr: string
): ProposalReviewResult {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [evaluatingArtifact, setEvaluatingArtifact] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [inspection, setInspection] = useState<ProposalInspection | null>(null);
  const [allReleases, setAllReleases] = useState<ImportedRelease[]>([]);
  const [candidates, setCandidates] = useState<ImportedRelease[]>([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<ReviewVerdict | null>(null);
  const [contextSlot, setContextSlot] = useState<number>(0);
  const [hashTimingMs, setHashTimingMs] = useState<number | null>(null);

  const explicitSelectionRef = useRef<{ isSet: boolean; releaseId: string | null }>({
    isSet: false,
    releaseId: null,
  });

  const selectedRelease = useMemo(() => {
    if (!selectedReleaseId) return null;
    return allReleases.find((r) => r.id === selectedReleaseId) ?? null;
  }, [allReleases, selectedReleaseId]);

  const runEvaluation = useCallback(
    async (
      currentWorkspace: Workspace,
      currentInspection: ProposalInspection,
      currentRelease: ImportedRelease | null
    ) => {
      setEvaluatingArtifact(true);
      const startTime = Date.now();
      try {
        const { verdict: newVerdict } = await evaluateReview({
          workspace: currentWorkspace,
          inspection: currentInspection,
          selectedRelease: currentRelease,
          memberAddress: currentWorkspace.member,
        });
        const elapsed = Date.now() - startTime;
        setHashTimingMs(elapsed);
        setVerdict(newVerdict);
      } catch (evalErr) {
        setError(`Evaluation failed: ${String(evalErr)}`);
      } finally {
        setEvaluatingArtifact(false);
      }
    },
    []
  );

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const activeWs = await getActiveWorkspace();
      if (!activeWs) {
        setError('No active workspace configured');
        setLoading(false);
        setRefreshing(false);
        return;
      }
      setWorkspace(activeWs);

      const transactionIndex = BigInt(proposalIndexStr);
      const insp = await fetchProposalInspection(
        activeWs.rpcUrl,
        activeWs.multisig,
        transactionIndex
      );

      setInspection(insp);
      setContextSlot(insp.evidence.contextSlot);

      // Extract target program from inspection
      let targetProgram = insp.guard.params?.program;
      if (!targetProgram) {
        for (const ix of insp.instructions) {
          if (ix.kind === 'loader-upgrade') {
            targetProgram = ix.program;
            break;
          }
        }
      }

      // Load all imported releases
      const loadedReleases = await listReleases();
      setAllReleases(loadedReleases);

      // Filter matching candidate releases
      const matchedCandidates = filterCandidateReleases(
        loadedReleases,
        activeWs.clusterId,
        activeWs.multisig,
        targetProgram
      );
      setCandidates(matchedCandidates);

      let chosenReleaseId: string | null = null;
      if (explicitSelectionRef.current.isSet) {
        if (explicitSelectionRef.current.releaseId !== null) {
          const found = loadedReleases.some(
            (r) => r.id === explicitSelectionRef.current.releaseId
          );
          chosenReleaseId = found ? explicitSelectionRef.current.releaseId : null;
        } else {
          chosenReleaseId = null;
        }
      } else {
        chosenReleaseId = resolveDefaultReleaseSelection(matchedCandidates);
        setSelectedReleaseId(chosenReleaseId);
      }

      const activeRelease = chosenReleaseId
        ? loadedReleases.find((r) => r.id === chosenReleaseId) ?? null
        : null;

      await runEvaluation(activeWs, insp, activeRelease);
    } catch (err) {
      setError(`Failed to read proposal: ${String(err)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [proposalIndexStr, runEvaluation]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectRelease = useCallback(
    async (releaseId: string | null) => {
      explicitSelectionRef.current = { isSet: true, releaseId };
      setSelectedReleaseId(releaseId);

      if (!workspace || !inspection) {
        return;
      }

      const releaseToEvaluate = releaseId
        ? allReleases.find((r) => r.id === releaseId) ?? null
        : null;

      await runEvaluation(workspace, inspection, releaseToEvaluate);
    },
    [allReleases, inspection, runEvaluation, workspace]
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
  }, [loadData]);

  const state: ProposalReviewState = {
    loading,
    refreshing,
    evaluatingArtifact,
    error,
    inspection,
    candidates,
    selectedReleaseId,
    selectedRelease,
    verdict,
    contextSlot,
    hashTimingMs,
  };

  return {
    state,
    actions: {
      refresh,
      selectRelease,
    },
  };
}
