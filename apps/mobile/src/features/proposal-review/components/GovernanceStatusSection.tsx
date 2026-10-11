import { View, Text, StyleSheet } from 'react-native';
import type { ProposalInspection } from 'release-core';
import { getMemberCapabilities } from 'release-core';
import { Card, KeyValueRow, Badge, AddressText } from '../../../ui';
import type { Workspace } from '../../workspace';

export interface GovernanceStatusSectionProps {
  readonly workspace: Workspace;
  readonly inspection: ProposalInspection;
}

export function GovernanceStatusSection({
  workspace,
  inspection,
}: GovernanceStatusSectionProps) {
  const { proposal, multisig } = inspection;
  const connectedMember = workspace.member;

  const capabilities = connectedMember
    ? getMemberCapabilities(multisig.members, connectedMember)
    : null;

  const statusVariant =
    proposal.status.kind === 'Active'
      ? 'info'
      : proposal.status.kind === 'Approved'
      ? 'success'
      : proposal.status.kind === 'Rejected'
      ? 'danger'
      : 'neutral';

  return (
    <Card style={styles.container}>
      <Text style={styles.sectionTitle}>7. Governance & Permissions</Text>

      <KeyValueRow
        label="Proposal Status"
        value={<Badge label={proposal.status.kind} variant={statusVariant} />}
      />

      <KeyValueRow
        label="Approvals"
        value={`${proposal.approved.length} of ${multisig.threshold}`}
      />

      {proposal.approved.length > 0 && (
        <View style={styles.votersBlock}>
          <Text style={styles.votersLabel}>Approved by:</Text>
          {proposal.approved.map((addr, i) => (
            <View key={i} style={styles.voterRow}>
              <AddressText address={addr} chars={6} />
              {addr === connectedMember && (
                <Badge label="You" variant="info" />
              )}
            </View>
          ))}
        </View>
      )}

      {proposal.rejected.length > 0 && (
        <View style={styles.votersBlock}>
          <Text style={styles.votersLabel}>Rejected by:</Text>
          {proposal.rejected.map((addr, i) => (
            <View key={i} style={styles.voterRow}>
              <AddressText address={addr} chars={6} />
              {addr === connectedMember && (
                <Badge label="You" variant="info" />
              )}
            </View>
          ))}
        </View>
      )}

      <KeyValueRow
        label="Time-Lock"
        value={
          multisig.timeLockSeconds > 0n
            ? `${multisig.timeLockSeconds.toString()} seconds`
            : 'None (0s)'
        }
      />

      {/* Connected Member Capabilities */}
      <View style={styles.memberBox}>
        <Text style={styles.subTitle}>Connected Wallet Permissions</Text>
        <KeyValueRow
          label="Address"
          value={
            connectedMember ? (
              <AddressText address={connectedMember} chars={6} />
            ) : (
              'No wallet connected'
            )
          }
        />

        <View style={styles.capsRow}>
          <View style={styles.capItem}>
            <Text style={styles.capLabel}>Initiate</Text>
            <Badge
              label={capabilities?.initiate ? 'Yes' : 'No'}
              variant={capabilities?.initiate ? 'success' : 'neutral'}
            />
          </View>
          <View style={styles.capItem}>
            <Text style={styles.capLabel}>Vote</Text>
            <Badge
              label={capabilities?.vote ? 'Yes' : 'No'}
              variant={capabilities?.vote ? 'success' : 'neutral'}
            />
          </View>
          <View style={styles.capItem}>
            <Text style={styles.capLabel}>Execute</Text>
            <Badge
              label={capabilities?.execute ? 'Yes' : 'No'}
              variant={capabilities?.execute ? 'success' : 'neutral'}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  votersBlock: {
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    padding: 8,
    marginVertical: 4,
  },
  votersLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  voterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  memberBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  subTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  capsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  capItem: {
    alignItems: 'center',
  },
  capLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
});
