import React from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CLUSTERS } from 'release-core';
import type { RootStackParamList } from '../../../navigation/routes';
import { AddressText } from '../../../ui/AddressText';
import { getOrCreateConnection, getOrCreateChainReader } from '../../../platform/rpc';
import { listDocuments } from '../../../platform/storage';
import type { ImportedRelease } from '../../release-import/types';
import type { Workspace } from '../../workspace/types';
import { executeCreateGuardedProposal } from '../model/builder';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateGuardedProposal'>;

export function CreateGuardedProposalScreen({ route, navigation }: Props) {
  const { initialReleaseId, initialBuffer, replacementForIndex } =
    route.params || {};

  const [workspace, setWorkspace] = React.useState<Workspace | null>(null);
  const [releases, setReleases] = React.useState<ImportedRelease[]>([]);
  const [selectedRelease, setSelectedRelease] =
    React.useState<ImportedRelease | null>(null);
  const [bufferAddress, setBufferAddress] = React.useState(
    initialBuffer || ''
  );
  const [spillAddress, setSpillAddress] = React.useState('');
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [createdIndex, setCreatedIndex] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function loadData() {
      const storedWorkspaces = await listDocuments<Workspace>('workspaces');
      const ws = storedWorkspaces[0] ?? null;
      setWorkspace(ws);
      if (ws?.member) {
        setSpillAddress(ws.member);
      }

      const storedReleases = await listDocuments<ImportedRelease>('releases');
      setReleases(storedReleases);

      if (initialReleaseId) {
        const found = storedReleases.find((r) => r.id === initialReleaseId);
        if (found) {
          setSelectedRelease(found);
          if (!initialBuffer && found.manifest.buffer) {
            setBufferAddress(found.manifest.buffer);
          }
        }
      } else if (storedReleases.length === 1) {
        const single = storedReleases[0] ?? null;
        setSelectedRelease(single);
        if (single && !initialBuffer && single.manifest.buffer) {
          setBufferAddress(single.manifest.buffer);
        }
      }
    }
    loadData();
  }, [initialReleaseId, initialBuffer]);

  const handleCreate = async () => {
    if (!workspace) {
      Alert.alert('Error', 'No active workspace found');
      return;
    }
    if (!selectedRelease) {
      Alert.alert('Error', 'Please select a reviewed release');
      return;
    }
    if (!bufferAddress.trim()) {
      Alert.alert('Error', 'Please enter a buffer account address');
      return;
    }

    try {
      setSubmitting(true);
      setStatusMessage('Initializing transaction...');
      const connection = getOrCreateConnection(workspace.rpcUrl);
      const chainReader = getOrCreateChainReader(workspace.rpcUrl);
      const cluster = CLUSTERS[workspace.clusterId];

      const result = await executeCreateGuardedProposal({
        workspace,
        cluster,
        selectedRelease,
        bufferAddress: bufferAddress.trim(),
        spillAddress: spillAddress.trim() || undefined,
        connection,
        chainReader,
        onStatusUpdate: (msg) => setStatusMessage(msg),
      });

      if (result.success && result.transactionIndex !== undefined) {
        setCreatedIndex(result.transactionIndex.toString());
        setStatusMessage(
          `Guarded proposal #${result.transactionIndex} created and verified on chain!`
        );
      } else {
        Alert.alert(
          'Proposal Creation Failed',
          result.error ?? 'Unknown error occurred'
        );
        setStatusMessage(result.error ?? 'Creation failed');
      }
    } catch (err: unknown) {
      Alert.alert('Execution Error', String(err));
      setStatusMessage(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const isReplacement = Boolean(replacementForIndex);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backHeaderButton}
          >
            <Text style={styles.backHeaderText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            {isReplacement
              ? `Create Guarded Replacement`
              : `New Guarded Proposal`}
          </Text>
          {isReplacement ? (
            <Text style={styles.subtitle}>
              Replacement for Proposal #{replacementForIndex}
            </Text>
          ) : null}
        </View>

        {/* Release Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Reviewed Release</Text>
          {releases.length > 1 ? (
            <View style={styles.releasePickerContainer}>
              <Text style={styles.pickerLabel}>Choose Release:</Text>
              {releases.map((rel) => {
                const isSelected = selectedRelease?.id === rel.id;
                return (
                  <TouchableOpacity
                    key={rel.id}
                    style={[
                      styles.releaseOption,
                      isSelected && styles.releaseOptionSelected,
                    ]}
                    onPress={() => setSelectedRelease(rel)}
                    accessibilityLabel={`Select release ${rel.manifest.release?.name ?? 'release'} v${rel.manifest.release?.version ?? '1'}`}
                  >
                    <Text
                      style={[
                        styles.releaseOptionText,
                        isSelected && styles.releaseOptionTextSelected,
                      ]}
                    >
                      {rel.manifest.release?.name ?? 'release'} v
                      {rel.manifest.release?.version ?? '1'} (
                      {rel.artifact.length} bytes)
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          {selectedRelease ? (
            <View>
              <View style={styles.row}>
                <Text style={styles.label}>Release:</Text>
                <Text style={styles.value}>
                  {selectedRelease.manifest.release?.name ?? 'release'} v
                  {selectedRelease.manifest.release?.version ?? '1'}
                </Text>
              </View>
              <View style={styles.rowBlock}>
                <Text style={styles.label}>Target Program:</Text>
                <AddressText address={selectedRelease.manifest.program} />
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Expected Deployment Slot:</Text>
                <Text style={styles.value}>
                  {selectedRelease.manifest.expectedDeploymentSlot.toString()}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Artifact Length:</Text>
                <Text style={styles.value}>
                  {selectedRelease.artifact.length} bytes
                </Text>
              </View>
              <View style={styles.rowBlock}>
                <Text style={styles.label}>Keccak-256 Digest:</Text>
                <AddressText address={selectedRelease.artifact.keccak256} />
              </View>
            </View>
          ) : (
            <Text style={styles.missingText}>
              No reviewed release selected. Available releases: {releases.length}
            </Text>
          )}
        </View>

        {/* Account Parameters */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Account Parameters</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Buffer Account Address:</Text>
            <TextInput
              style={styles.input}
              value={bufferAddress}
              onChangeText={setBufferAddress}
              placeholder="Base58 buffer address"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              Buffer Rent Refund Recipient (Spill):
            </Text>
            <TextInput
              style={styles.input}
              value={spillAddress}
              onChangeText={setSpillAddress}
              placeholder="Base58 spill recipient (defaults to creator)"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
            />
          </View>
        </View>

        {/* Guard Structure Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            3. Canonical Stored Instructions (5)
          </Text>
          <Text style={styles.ixItem}>
            1. Lighthouse: AssertAccountInfo · Owner == loader-v3
          </Text>
          <Text style={styles.ixItem}>
            2. Lighthouse: AssertAccountInfo · DataLength == 37 +{' '}
            {selectedRelease?.artifact.length ?? 'L'}
          </Text>
          <Text style={styles.ixItem}>
            3. Lighthouse: AssertAccountInfo · VerifyDatahash == Keccak-256
          </Text>
          <Text style={styles.ixItem}>
            4. Lighthouse: AssertUpgradeableLoaderAccount · ProgramData.Slot =={' '}
            {selectedRelease?.manifest.expectedDeploymentSlot.toString() ?? 'S'}
          </Text>
          <Text style={styles.ixItem}>
            5. Loader-v3: Upgrade (targets: programData, program, buffer, spill,
            vault)
          </Text>
        </View>

        {/* Standing Note & Policy Notice */}
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            Approval is always separate. This action creates the proposal at index{' '}
            <Text style={styles.boldText}>
              multisig.transactionIndex + 1
            </Text>{' '}
            with zero approvals.
          </Text>
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>Standing Note</Text>
          <Text style={styles.noteText}>
            A matching hash shows these are the reviewed bytes. It does not show
            that the code is harmless or audited.
          </Text>
        </View>

        {/* Status and Action Buttons */}
        {statusMessage ? (
          <View style={styles.statusBox}>
            {submitting ? (
              <ActivityIndicator
                size="small"
                color="#38bdf8"
                style={styles.spinner}
              />
            ) : null}
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        ) : null}

        {createdIndex ? (
          <TouchableOpacity
            style={styles.viewProposalButton}
            onPress={() => {
              navigation.replace('ProposalReview', {
                proposalIndex: createdIndex,
              });
            }}
          >
            <Text style={styles.viewProposalButtonText}>
              View Created Proposal #{createdIndex}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.actionButton,
              (!selectedRelease || submitting) && styles.actionButtonDisabled,
            ]}
            onPress={handleCreate}
            disabled={!selectedRelease || submitting}
          >
            <Text style={styles.actionButtonText}>
              {submitting
                ? 'Creating on Chain...'
                : isReplacement
                  ? 'Sign & Submit Guarded Replacement'
                  : 'Sign & Submit Guarded Proposal'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0d14',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  backHeaderButton: {
    marginBottom: 10,
  },
  backHeaderText: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#131b2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  sectionTitle: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowBlock: {
    paddingVertical: 6,
  },
  label: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 2,
  },
  value: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '500',
  },
  missingText: {
    color: '#f87171',
    fontSize: 13,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0a0d14',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    color: '#f8fafc',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ixItem: {
    color: '#cbd5e1',
    fontSize: 12,
    paddingVertical: 4,
    fontFamily: 'monospace',
  },
  noticeBox: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  noticeText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  boldText: {
    fontWeight: '700',
    color: '#f8fafc',
  },
  noteBox: {
    backgroundColor: '#1e1b4b',
    borderColor: '#3730a3',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  noteTitle: {
    color: '#c7d2fe',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  noteText: {
    color: '#e0e7ff',
    fontSize: 12,
    lineHeight: 18,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderColor: '#38bdf8',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  spinner: {
    marginRight: 10,
  },
  statusText: {
    color: '#38bdf8',
    fontSize: 13,
    flex: 1,
  },
  actionButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    backgroundColor: '#334155',
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  viewProposalButton: {
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  viewProposalButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  releasePickerContainer: {
    marginBottom: 12,
  },
  pickerLabel: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 6,
    fontWeight: '600',
  },
  releaseOption: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 6,
  },
  releaseOptionSelected: {
    borderColor: '#38bdf8',
    backgroundColor: '#1e293b',
  },
  releaseOptionText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  releaseOptionTextSelected: {
    color: '#38bdf8',
    fontWeight: '600',
  },
});
