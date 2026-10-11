import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CLUSTERS, getMemberCapabilities } from 'release-core';
import type { RootStackParamList } from '../../../navigation/routes';
import { Button, Card } from '../../../ui';
import { getOrCreateConnection, getOrCreateChainReader } from '../../../platform/rpc';
import { useProposalReview } from '../model/useProposalReview';
import { ReviewHeader } from '../components/ReviewHeader';
import { TargetNetworkSection } from '../components/TargetNetworkSection';
import { ArtifactProvenanceSection } from '../components/ArtifactProvenanceSection';
import { UploadedByteSection } from '../components/UploadedByteSection';
import { DeploymentSlotSection } from '../components/DeploymentSlotSection';
import { InstructionsAccountsSection } from '../components/InstructionsAccountsSection';
import { ExecutionConditionsSection } from '../components/ExecutionConditionsSection';
import { GovernanceStatusSection } from '../components/GovernanceStatusSection';
import { ActionEligibilitySection } from '../components/ActionEligibilitySection';
import { ReleasePickerModal } from '../components/ReleasePickerModal';
import { getActiveWorkspace, type Workspace } from '../../workspace';
import { executeVote } from '../../voting';
import { executeProposal } from '../../execution';
import { generateAndStoreReceipt } from '../../receipts';

type ReviewRouteProp = RouteProp<RootStackParamList, 'ProposalReview'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function ProposalReviewScreen() {
  const route = useRoute<ReviewRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { proposalIndex } = route.params;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [pickerModalVisible, setPickerModalVisible] = useState<boolean>(false);
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);

  const { state, actions } = useProposalReview(proposalIndex);

  useEffect(() => {
    getActiveWorkspace().then((ws) => setWorkspace(ws));
  }, []);

  if (state.loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1f2937" />
        <Text style={styles.loadingText}>Reading proposal from chain...</Text>
      </View>
    );
  }

  if (state.error || !state.inspection || !workspace) {
    return (
      <View style={styles.centerContainer}>
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>Failed to Load Proposal</Text>
          <Text style={styles.errorText}>
            {state.error || 'Proposal could not be read.'}
          </Text>
          <Button
            title="Retry"
            variant="primary"
            onPress={actions.refresh}
            style={styles.retryButton}
          />
        </Card>
      </View>
    );
  }

  const memberCapabilities =
    workspace.member && state.inspection
      ? getMemberCapabilities(
          state.inspection.multisig.members,
          workspace.member
        )
      : undefined;

  const handleApprove = async () => {
    if (!state.verdict) return;
    try {
      setActionInProgress(true);
      const connection = getOrCreateConnection(workspace.rpcUrl);
      const chainReader = getOrCreateChainReader(workspace.rpcUrl);
      const cluster = CLUSTERS[workspace.clusterId];

      const result = await executeVote({
        action: 'approve',
        workspace,
        cluster,
        transactionIndex: BigInt(proposalIndex),
        expectedVerdict: state.verdict,
        selectedRelease: state.selectedRelease,
        connection,
        chainReader,
      });

      if (result.success) {
        Alert.alert(
          'Approval Recorded',
          `Proposal #${proposalIndex} was approved on chain.`
        );
        actions.refresh();
      } else {
        Alert.alert(
          'Approval Failed',
          result.error ?? 'Unknown error occurred while approving'
        );
        actions.refresh();
      }
    } catch (err: unknown) {
      Alert.alert('Approval Error', String(err));
    } finally {
      setActionInProgress(false);
    }
  };

  const handleReject = async () => {
    if (!state.verdict) return;
    try {
      setActionInProgress(true);
      const connection = getOrCreateConnection(workspace.rpcUrl);
      const chainReader = getOrCreateChainReader(workspace.rpcUrl);
      const cluster = CLUSTERS[workspace.clusterId];

      const result = await executeVote({
        action: 'reject',
        workspace,
        cluster,
        transactionIndex: BigInt(proposalIndex),
        expectedVerdict: state.verdict,
        selectedRelease: state.selectedRelease,
        connection,
        chainReader,
      });

      if (result.success) {
        Alert.alert(
          'Rejection Recorded',
          `Proposal #${proposalIndex} was rejected on chain.`
        );
        actions.refresh();
      } else {
        Alert.alert(
          'Rejection Failed',
          result.error ?? 'Unknown error occurred while rejecting'
        );
        actions.refresh();
      }
    } catch (err: unknown) {
      Alert.alert('Rejection Error', String(err));
    } finally {
      setActionInProgress(false);
    }
  };

  const handleExecute = async () => {
    if (!state.verdict) return;
    try {
      setActionInProgress(true);
      const connection = getOrCreateConnection(workspace.rpcUrl);
      const chainReader = getOrCreateChainReader(workspace.rpcUrl);
      const cluster = CLUSTERS[workspace.clusterId];

      const result = await executeProposal({
        workspace,
        cluster,
        transactionIndex: BigInt(proposalIndex),
        expectedVerdict: state.verdict,
        selectedRelease: state.selectedRelease,
        connection,
        chainReader,
      });

      if (result.success) {
        if (state.selectedRelease && state.inspection) {
          try {
            await generateAndStoreReceipt({
              workspace,
              cluster,
              transactionIndex: BigInt(proposalIndex),
              vault:
                state.inspection.transaction.vault ??
                state.inspection.guard.params?.vault ??
                '',
              program:
                state.inspection.guard.params?.program ??
                state.selectedRelease.manifest.program,
              bufferAddress:
                state.inspection.guard.params?.buffer ??
                state.selectedRelease.manifest.buffer ??
                '',
              selectedRelease: state.selectedRelease,
              chainReader,
              signature: result.operation.signature,
              executor: workspace.member,
              observedOnly: false,
            });
          } catch (receiptErr) {
            console.warn('Failed to store receipt immediately:', receiptErr);
          }
        }

        Alert.alert(
          'Upgrade Executed',
          `Proposal #${proposalIndex} has been executed on chain!`,
          [
            {
              text: 'View Receipt',
              onPress: () =>
                navigation.navigate('DeploymentReceipt', {
                  multisig: workspace.multisig,
                  transactionIndex: proposalIndex,
                }),
            },
            {
              text: 'OK',
              onPress: () => actions.refresh(),
            },
          ]
        );
      } else {
        Alert.alert(
          'Execution Refused / Failed',
          result.error ?? 'Unknown execution error'
        );
        actions.refresh();
      }
    } catch (err: unknown) {
      Alert.alert('Execution Error', String(err));
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCreateReplacement = () => {
    const buffer =
      state.inspection?.guard.params?.buffer ??
      state.selectedRelease?.manifest.buffer ??
      '';
    navigation.navigate('CreateGuardedProposal', {
      initialReleaseId: state.selectedRelease?.id,
      initialBuffer: buffer,
      replacementForIndex: proposalIndex,
    });
  };

  const handleViewReceipt = () => {
    navigation.navigate('DeploymentReceipt', {
      multisig: workspace.multisig,
      transactionIndex: proposalIndex,
    });
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={actions.refresh}
          />
        }
      >
        {/* Top Summary & Verdict */}
        <ReviewHeader
          proposalIndex={proposalIndex}
          verdict={state.verdict}
          contextSlot={state.contextSlot}
          evaluatingArtifact={state.evaluatingArtifact}
          hashTimingMs={state.hashTimingMs}
        />

        {/* 1. Target & Network */}
        <TargetNetworkSection
          workspace={workspace}
          inspection={state.inspection}
        />

        {/* 2. Reviewed Artifact & Provenance */}
        <ArtifactProvenanceSection
          selectedRelease={state.selectedRelease}
          candidatesCount={state.candidates.length}
          onOpenReleasePicker={() => setPickerModalVisible(true)}
        />

        {/* 3. Uploaded-Byte Comparison */}
        <UploadedByteSection
          inspection={state.inspection}
          selectedRelease={state.selectedRelease}
          verdict={state.verdict}
        />

        {/* 4. Deployment Slot */}
        <DeploymentSlotSection
          inspection={state.inspection}
          selectedRelease={state.selectedRelease}
          verdict={state.verdict}
        />

        {/* 5. Exact Instructions & Affected Accounts */}
        <InstructionsAccountsSection inspection={state.inspection} />

        {/* 6. Execution Conditions */}
        <ExecutionConditionsSection
          inspection={state.inspection}
          verdict={state.verdict}
        />

        {/* 7. Governance Status */}
        <GovernanceStatusSection
          workspace={workspace}
          inspection={state.inspection}
        />

        {/* 8. Action Eligibility (Interactive in S7) */}
        <ActionEligibilitySection
          verdict={state.verdict}
          proposal={state.inspection.proposal}
          connectedMember={workspace.member}
          memberCapabilities={memberCapabilities}
          isSubmitting={actionInProgress}
          onApprove={handleApprove}
          onReject={handleReject}
          onExecute={handleExecute}
          onCreateReplacement={handleCreateReplacement}
          onViewReceipt={handleViewReceipt}
        />
      </ScrollView>

      {/* Candidate Release Selection Modal */}
      <ReleasePickerModal
        visible={pickerModalVisible}
        candidates={state.candidates}
        selectedReleaseId={state.selectedRelease?.id ?? null}
        onSelectRelease={(releaseId) => {
          actions.selectRelease(releaseId);
          setPickerModalVisible(false);
        }}
        onClose={() => setPickerModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f3f4f6',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#4b5563',
  },
  errorCard: {
    padding: 20,
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#991b1b',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    minWidth: 120,
  },
});
