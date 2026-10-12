import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import type { Operation, OperationPhase } from 'release-core';
import { Card, Badge, AddressText, KeyValueRow, Button } from '../../../ui';
import { getOrCreateChainReader } from '../../../platform/rpc';
import { getActiveWorkspace } from '../../workspace';
import { listOperations, saveOperation } from '../model/journal';
import { pollAndSettleOperation } from '../model/settler';
import { resumePendingOperations } from '../model/resume';
import { TERMINAL_PHASES } from '../model/types';

function getPhaseBadgeVariant(
  phase: OperationPhase
): 'success' | 'danger' | 'warning' | 'neutral' | 'info' {
  switch (phase) {
    case 'confirmed':
      return 'success';
    case 'failed':
      return 'danger';
    case 'unresolved':
      return 'warning';
    case 'expired':
      return 'warning';
    case 'declined':
      return 'neutral';
    case 'superseded':
      return 'info';
    default:
      return 'info';
  }
}

export function PendingOperationsScreen() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [checkingOpId, setCheckingOpId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const ops = await listOperations();
      setOperations(ops);
    } catch (err) {
      console.warn('Failed to load operations:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const ws = await getActiveWorkspace();
      if (ws) {
        const chainReader = getOrCreateChainReader(ws.rpcUrl);
        await resumePendingOperations(chainReader);
      }
    } catch (err) {
      console.warn('Failed to resume on refresh:', err);
    }
    await loadData();
  };

  const handleCheckStatus = async (op: Operation) => {
    try {
      setCheckingOpId(op.id);
      const ws = await getActiveWorkspace();
      if (!ws) {
        Alert.alert('Error', 'No active workspace configured');
        return;
      }
      const chainReader = getOrCreateChainReader(ws.rpcUrl);
      const settled = await pollAndSettleOperation(op, chainReader, {
        pollTimeoutMs: 5000,
        pollIntervalMs: 1000,
      });
      await saveOperation(settled);
      Alert.alert(
        'Status Checked',
        `Operation phase: ${settled.phase}\n${settled.resolution ?? ''}`
      );
      await loadData();
    } catch (err) {
      Alert.alert('Status Check Error', String(err));
    } finally {
      setCheckingOpId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1f2937" />
        <Text style={styles.loadingText}>Loading operations journal...</Text>
      </View>
    );
  }

  const pendingCount = operations.filter((o) => !TERMINAL_PHASES.has(o.phase)).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Operations Journal</Text>
        <Text style={styles.subtitle}>
          Durable memory of operations, bound targets, signatures, and settlement
          phases.
        </Text>
        <View style={styles.summaryRow}>
          <Badge label={`Total: ${operations.length}`} variant="neutral" />
          {pendingCount > 0 ? (
            <Badge label={`Pending / Unresolved: ${pendingCount}`} variant="warning" />
          ) : (
            <Badge label="All Settled" variant="success" />
          )}
        </View>
      </View>

      {operations.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No Operations Recorded</Text>
          <Text style={styles.emptyText}>
            Operations created during voting, execution, or proposal building will
            appear here.
          </Text>
        </Card>
      ) : (
        operations.map((op) => {
          const isPending = !TERMINAL_PHASES.has(op.phase);
          const isChecking = checkingOpId === op.id;

          return (
            <Card key={op.id} style={styles.operationCard}>
              <View style={styles.opHeaderRow}>
                <View style={styles.opTitleGroup}>
                  <Text style={styles.opKind}>{op.kind.toUpperCase()}</Text>
                  <Text style={styles.opIndex}>
                    Proposal #{op.transactionIndex.toString()}
                  </Text>
                </View>
                <Badge
                  label={op.phase.toUpperCase()}
                  variant={getPhaseBadgeVariant(op.phase)}
                />
              </View>

              <KeyValueRow
                label="Operation ID"
                value={<AddressText address={op.id} />}
              />
              <KeyValueRow
                label="Created"
                value={new Date(op.createdAt).toLocaleString()}
              />
              {op.member ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>Member</Text>
                  <AddressText address={op.member} />
                </View>
              ) : null}

              {op.signature ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>Signature</Text>
                  <AddressText address={op.signature} />
                </View>
              ) : null}

              {op.blockhash ? (
                <KeyValueRow
                  label="Blockhash"
                  value={`${op.blockhash.slice(0, 12)}... (valid to height ${op.lastValidBlockHeight})`}
                />
              ) : null}

              {op.boundTo ? (
                <View style={styles.boundBox}>
                  <Text style={styles.boundTitle}>Bound Target State</Text>
                  <KeyValueRow
                    label="Multisig"
                    value={<AddressText address={op.boundTo.multisig} />}
                  />
                  <KeyValueRow
                    label="Program"
                    value={<AddressText address={op.boundTo.program} />}
                  />
                  <KeyValueRow
                    label="Expected Deployment Slot"
                    value={op.boundTo.expectedDeploymentSlot.toString()}
                  />
                  <KeyValueRow
                    label="Artifact SHA-256"
                    value={<AddressText address={op.boundTo.artifactSha256} />}
                  />
                  <KeyValueRow
                    label="Manifest SHA-256"
                    value={<AddressText address={op.boundTo.manifestSha256} />}
                  />
                </View>
              ) : null}

              {op.resolution ? (
                <View style={styles.resolutionBox}>
                  <Text style={styles.resolutionLabel}>Resolution</Text>
                  <Text style={styles.resolutionText}>{op.resolution}</Text>
                </View>
              ) : null}

              {isPending ? (
                <View style={styles.pendingActionBox}>
                  <Text style={styles.pendingNotice}>
                    This operation is not in a terminal phase. Retries are blocked
                    until on-chain state is confirmed.
                  </Text>
                  <Button
                    title={isChecking ? 'Checking...' : 'Check Status'}
                    variant="primary"
                    disabled={isChecking}
                    onPress={() => handleCheckStatus(op)}
                  />
                </View>
              ) : null}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
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
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
  operationCard: {
    marginBottom: 16,
    padding: 16,
  },
  opHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 8,
  },
  opTitleGroup: {
    flexDirection: 'column',
  },
  opKind: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  opIndex: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  fieldBlock: {
    marginVertical: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  boundBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  boundTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  resolutionBox: {
    marginTop: 10,
    padding: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  resolutionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 2,
  },
  resolutionText: {
    fontSize: 12,
    color: '#78350f',
  },
  pendingActionBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  pendingNotice: {
    fontSize: 12,
    color: '#b45309',
    marginBottom: 8,
    fontWeight: '500',
  },
});
