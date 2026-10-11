import { View, Text, StyleSheet } from 'react-native';
import type { ProposalInspection, ReviewVerdict } from 'release-core';
import { Card, KeyValueRow, Badge } from '../../../ui';
import type { ImportedRelease } from '../../release-import';

export interface DeploymentSlotSectionProps {
  readonly inspection: ProposalInspection;
  readonly selectedRelease: ImportedRelease | null;
  readonly verdict: ReviewVerdict | null;
}

export function DeploymentSlotSection({
  inspection,
  selectedRelease,
  verdict,
}: DeploymentSlotSectionProps) {
  const { guard, evidence } = inspection;

  const manifestExpectedSlot = selectedRelease?.manifest.expectedDeploymentSlot;
  const guardAssertedSlot = guard.params?.deploymentSlot;
  const currentOnChainSlot = evidence.programData?.slot;

  const slotCheck = verdict?.checks.find((c) => c.id === 'deployment.slot');

  const slotCheckVariant =
    slotCheck?.status === 'pass'
      ? 'success'
      : slotCheck?.status === 'fail'
      ? 'danger'
      : 'neutral';

  return (
    <Card style={styles.container}>
      <Text style={styles.sectionTitle}>4. Deployment Slot</Text>

      {/* The three numbers */}
      <KeyValueRow
        label="Manifest Expected Slot"
        value={
          manifestExpectedSlot !== undefined
            ? manifestExpectedSlot.toString()
            : 'no release selected'
        }
      />

      <KeyValueRow
        label="Guard Asserted Slot"
        value={
          guardAssertedSlot !== undefined
            ? guardAssertedSlot.toString()
            : 'no slot assertion in transaction'
        }
      />

      <KeyValueRow
        label="Current On-Chain Slot"
        value={
          currentOnChainSlot !== undefined
            ? currentOnChainSlot.toString()
            : 'program data absent'
        }
      />

      {/* Comparison Assessment */}
      <View style={styles.resultBox}>
        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Slot Condition Status:</Text>
          <Badge
            label={
              slotCheck?.status === 'pass'
                ? 'Slot Matches'
                : slotCheck?.status === 'fail'
                ? 'Slot Changed / Mismatch'
                : 'Not Evaluated'
            }
            variant={slotCheckVariant}
          />
        </View>

        {slotCheck?.status === 'fail' && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              {slotCheck.detail ||
                'Current deployment slot does not match the reviewed state.'}
            </Text>
          </View>
        )}
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
  resultBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  warningBox: {
    backgroundColor: '#fffbeb',
    borderLeftWidth: 3,
    borderLeftColor: '#d97706',
    padding: 8,
    marginTop: 8,
    borderRadius: 4,
  },
  warningText: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '600',
  },
});
