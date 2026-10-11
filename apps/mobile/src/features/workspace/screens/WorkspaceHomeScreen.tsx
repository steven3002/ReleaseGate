import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MultisigSnapshot, MemberCapabilities } from 'release-core';
import type { RootStackParamList } from '../../../navigation/routes';
import {
  Button,
  Card,
  Header,
  Badge,
  AddressText,
  KeyValueRow,
} from '../../../ui';
import { getActiveWorkspace } from '../model/workspace-store';
import {
  loadAndValidateMultisig,
  fetchWorkspaceProposals,
} from '../model/workspace-service';
import { listReleases } from '../../release-import';
import type { ImportedRelease } from '../../release-import/types';
import type { Workspace, WorkspaceProposalItem } from '../types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'WorkspaceHome'>;

export function WorkspaceHomeScreen() {
  const navigation = useNavigation<NavProp>();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [multisigSnapshot, setMultisigSnapshot] = useState<MultisigSnapshot | null>(null);
  const [capabilities, setCapabilities] = useState<MemberCapabilities | null>(null);
  const [proposals, setProposals] = useState<WorkspaceProposalItem[]>([]);
  const [releases, setReleases] = useState<ImportedRelease[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const activeWs = await getActiveWorkspace();
      if (!activeWs) {
        setWorkspace(null);
        setLoading(false);
        return;
      }

      setWorkspace(activeWs);

      // Load multisig details
      const msResult = await loadAndValidateMultisig(
        activeWs.rpcUrl,
        activeWs.multisig,
        activeWs.member
      );

      if (msResult.ok && msResult.snapshot && msResult.capabilities) {
        setMultisigSnapshot(msResult.snapshot);
        setCapabilities(msResult.capabilities);

        // Load proposals
        const pResult = await fetchWorkspaceProposals(
          activeWs.rpcUrl,
          activeWs.multisig,
          msResult.snapshot.transactionIndex
        );
        setProposals(pResult.proposals);
      } else {
        setError(msResult.error || 'Failed to read multisig');
      }

      // Load imported releases
      const loadedReleases = await listReleases();
      setReleases(loadedReleases);
    } catch (err) {
      setError(`Error loading workspace: ${String(err)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading && !workspace) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1f2937" />
        <Text style={styles.loadingText}>Loading workspace...</Text>
      </View>
    );
  }

  if (!workspace) {
    return (
      <View style={styles.centerContainer}>
        <Header
          title="No Active Workspace"
          subtitle="Configure a workspace to start reviewing Solana program releases."
        />
        <Button
          title="Setup Workspace"
          variant="primary"
          onPress={() => navigation.navigate('WorkspaceSetup')}
          style={styles.actionButton}
          accessibilityLabel="Setup Workspace button"
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Top Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Workspace</Text>
          <View style={styles.badgesRow}>
            <Badge
              label={workspace.clusterId}
              variant={workspace.clusterId === 'devnet' ? 'info' : 'warning'}
            />
            {capabilities?.isMember ? (
              <Badge label="Member" variant="success" />
            ) : (
              <Badge label="Read-Only" variant="neutral" />
            )}
          </View>
        </View>
        <Button
          title="Switch"
          variant="secondary"
          onPress={() => navigation.navigate('WorkspaceSetup')}
          style={styles.switchButton}
          accessibilityLabel="Switch Workspace button"
        />
      </View>

      {error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      ) : null}

      {/* Multisig Overview */}
      <Card>
        <Text style={styles.cardHeader}>Multisig Details</Text>
        <KeyValueRow
          label="Address"
          value={<AddressText address={workspace.multisig} chars={6} />}
        />
        {multisigSnapshot ? (
          <>
            <KeyValueRow
              label="Threshold"
              value={`${multisigSnapshot.threshold} of ${multisigSnapshot.members.length} members`}
            />
            <KeyValueRow
              label="Connected Member"
              value={
                workspace.member ? (
                  <AddressText address={workspace.member} chars={6} />
                ) : (
                  'Not connected'
                )
              }
            />
            <KeyValueRow
              label="Permissions"
              value={
                capabilities?.isMember ? (
                  <View style={styles.badgesRow}>
                    {capabilities.initiate ? (
                      <Badge label="Initiate" variant="success" />
                    ) : null}
                    {capabilities.vote ? (
                      <Badge label="Vote" variant="success" />
                    ) : null}
                    {capabilities.execute ? (
                      <Badge label="Execute" variant="success" />
                    ) : null}
                  </View>
                ) : (
                  <Badge label="Read-only" variant="warning" />
                )
              }
            />
          </>
        ) : null}
      </Card>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <Button
          title="Import Release"
          variant="primary"
          onPress={() => navigation.navigate('ReleaseImport')}
          style={styles.importButton}
          accessibilityLabel="Import Release button"
        />
      </View>

      {/* Proposals Section (Pass Mark 6) */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Proposals ({proposals.length})</Text>
      </View>

      {proposals.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>No proposals found for this multisig.</Text>
        </Card>
      ) : (
        proposals.map((item) => {
          const statusKind = item.proposal.status.kind;
          const statusVariant =
            statusKind === 'Active'
              ? 'info'
              : statusKind === 'Approved'
              ? 'success'
              : statusKind === 'Executed'
              ? 'neutral'
              : 'danger';

          return (
            <Card key={item.proposal.transactionIndex.toString()}>
              <View style={styles.proposalHeader}>
                <Text style={styles.proposalIndex}>
                  Proposal #{item.proposal.transactionIndex.toString()}
                </Text>
                <Badge label={statusKind} variant={statusVariant} />
              </View>
              <KeyValueRow
                label="Approvals"
                value={`${item.proposal.approved.length} of ${
                  multisigSnapshot?.threshold ?? '?'
                }`}
              />
              <KeyValueRow
                label="Address"
                value={<AddressText address={item.address} chars={6} />}
              />
            </Card>
          );
        })
      )}

      {/* Imported Releases Section */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Imported Releases ({releases.length})</Text>
      </View>

      {releases.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>
            No releases imported yet. Import a binary and manifest to review.
          </Text>
        </Card>
      ) : (
        releases.map((rel) => {
          const provenanceRecorded = !!rel.attestation;
          return (
            <TouchableOpacity
              key={rel.id}
              activeOpacity={0.7}
              onPress={() =>
                navigation.navigate('ReleaseDetail', { releaseId: rel.id })
              }
              accessibilityLabel={`Release ${rel.manifest.release?.name || 'release'} version ${rel.manifest.release?.version || ''}`}
            >
              <Card>
                <View style={styles.releaseHeader}>
                  <Text style={styles.releaseTitle}>
                    {rel.manifest.release?.name || 'Release'}{' '}
                    {rel.manifest.release?.version ? `v${rel.manifest.release.version}` : ''}
                  </Text>
                  <Badge
                    label={provenanceRecorded ? 'provenance: recorded' : 'provenance: missing'}
                    variant={provenanceRecorded ? 'success' : 'warning'}
                  />
                </View>
                <KeyValueRow
                  label="Program"
                  value={<AddressText address={rel.manifest.program} chars={6} />}
                />
                <KeyValueRow
                  label="Manifest SHA-256"
                  value={<AddressText address={rel.manifestSha256} chars={6} />}
                />
                <KeyValueRow
                  label="Artifact Length"
                  value={`${rel.artifact.length.toLocaleString()} bytes`}
                />
              </Card>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  switchButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  actionRow: {
    marginVertical: 12,
  },
  importButton: {
    minHeight: 48,
  },
  sectionHeaderRow: {
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  proposalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  proposalIndex: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  releaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  releaseTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  actionButton: {
    marginTop: 16,
    minWidth: 200,
  },
  errorCard: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
  },
});
