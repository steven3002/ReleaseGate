import { View, Text, StyleSheet } from 'react-native';
import type { ProposalInspection } from 'release-core';
import { Card, KeyValueRow, AddressText, Badge } from '../../../ui';
import type { Workspace } from '../../workspace';

export interface TargetNetworkSectionProps {
  readonly workspace: Workspace;
  readonly inspection: ProposalInspection;
}

export function TargetNetworkSection({
  workspace,
  inspection,
}: TargetNetworkSectionProps) {
  const { proposal, transaction, guard, instructions } = inspection;

  let targetProgram = guard.params?.program;
  let targetProgramData = guard.params?.programData;
  if (!targetProgram || !targetProgramData) {
    for (const ix of instructions) {
      if (ix.kind === 'loader-upgrade') {
        targetProgram = targetProgram ?? ix.program;
        targetProgramData = targetProgramData ?? ix.programData;
        break;
      }
    }
  }

  const txKindVariant =
    transaction.kind === 'vault' ? 'success' : 'danger';

  return (
    <Card style={styles.container}>
      <Text style={styles.sectionTitle}>1. Target & Network</Text>

      <KeyValueRow
        label="Multisig"
        value={<AddressText address={workspace.multisig} chars={6} />}
      />

      <KeyValueRow
        label="Proposal Index"
        value={`#${proposal.transactionIndex.toString()}`}
      />

      <KeyValueRow
        label="Target Program"
        value={
          targetProgram ? (
            <AddressText address={targetProgram} chars={6} />
          ) : (
            'not identified'
          )
        }
      />

      {targetProgramData && (
        <KeyValueRow
          label="ProgramData"
          value={<AddressText address={targetProgramData} chars={6} />}
        />
      )}

      <KeyValueRow
        label="Network"
        value={
          <View style={styles.networkValue}>
            <Badge label={workspace.clusterId} variant="info" />
            <Text style={styles.genesisText}>
              ({workspace.clusterId === 'devnet' ? 'EtWTRABZ...' : '5eykt4Us...'})
            </Text>
          </View>
        }
      />

      <KeyValueRow
        label="Transaction Account"
        value={<AddressText address={transaction.address} chars={6} />}
      />

      <KeyValueRow
        label="Transaction Type"
        value={<Badge label={transaction.kind} variant={txKindVariant} />}
      />
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
  networkValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  genesisText: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 6,
    fontFamily: 'monospace',
  },
});
