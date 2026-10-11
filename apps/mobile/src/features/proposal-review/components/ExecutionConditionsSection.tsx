import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { ProposalInspection, ReviewVerdict, CheckResult } from 'release-core';
import { Card, KeyValueRow, Badge, StatusIndicator } from '../../../ui';

export interface ExecutionConditionsSectionProps {
  readonly inspection: ProposalInspection;
  readonly verdict: ReviewVerdict | null;
}

export function ExecutionConditionsSection({
  inspection,
  verdict,
}: ExecutionConditionsSectionProps) {
  const [showAllChecks, setShowAllChecks] = useState<boolean>(false);
  const { guard, instructions } = inspection;

  // Condition presence detection
  const hasOwnerAssert = instructions.some(
    (ix) => ix.kind === 'assert-buffer-owner'
  );
  const hasLengthAssert = instructions.some(
    (ix) => ix.kind === 'assert-buffer-length'
  );
  const hasHashAssert = instructions.some(
    (ix) => ix.kind === 'assert-buffer-hash'
  );
  const hasSlotAssert = instructions.some(
    (ix) => ix.kind === 'assert-deployment-slot'
  );
  const hasUpgradeIx = instructions.some((ix) => ix.kind === 'loader-upgrade');

  const shapeVariant =
    guard.shape === 'guarded-upgrade'
      ? 'success'
      : guard.shape === 'partial-guard'
      ? 'warning'
      : guard.shape === 'unguarded-upgrade'
      ? 'danger'
      : 'neutral';

  const checks = verdict?.checks ?? [];

  return (
    <Card style={styles.container}>
      <Text style={styles.sectionTitle}>6. Execution Conditions</Text>

      <KeyValueRow
        label="Guard Shape"
        value={<Badge label={guard.shape} variant={shapeVariant} />}
      />

      {/* Five Canonical Conditions Presence */}
      <View style={styles.conditionsBox}>
        <Text style={styles.subTitle}>Required On-Chain Assertions</Text>

        <View style={styles.conditionRow}>
          <Text style={styles.conditionName}>1. Buffer Owner (Loader v3)</Text>
          <Badge
            label={hasOwnerAssert ? 'Present' : 'Missing'}
            variant={hasOwnerAssert ? 'success' : 'danger'}
          />
        </View>

        <View style={styles.conditionRow}>
          <Text style={styles.conditionName}>2. Buffer Complete Length</Text>
          <Badge
            label={hasLengthAssert ? 'Present' : 'Missing'}
            variant={hasLengthAssert ? 'success' : 'danger'}
          />
        </View>

        <View style={styles.conditionRow}>
          <Text style={styles.conditionName}>3. Buffer Keccak-256 Hash</Text>
          <Badge
            label={hasHashAssert ? 'Present' : 'Missing'}
            variant={hasHashAssert ? 'success' : 'danger'}
          />
        </View>

        <View style={styles.conditionRow}>
          <Text style={styles.conditionName}>4. Deployment Slot Binding</Text>
          <Badge
            label={hasSlotAssert ? 'Present' : 'Missing'}
            variant={hasSlotAssert ? 'success' : 'danger'}
          />
        </View>

        <View style={styles.conditionRow}>
          <Text style={styles.conditionName}>5. Upgrade Execution</Text>
          <Badge
            label={hasUpgradeIx ? 'Present' : 'Missing'}
            variant={hasUpgradeIx ? 'success' : 'danger'}
          />
        </View>
      </View>

      {/* 28 Verification Checks Breakdown */}
      {checks.length > 0 && (
        <View style={styles.checksSection}>
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setShowAllChecks((prev) => !prev)}
            activeOpacity={0.7}
          >
            <Text style={styles.subTitle}>
              Verification Checks ({checks.filter((c) => c.status === 'pass').length} of {checks.length} passing)
            </Text>
            <Text style={styles.toggleText}>
              {showAllChecks ? 'Hide Details' : 'Show All'}
            </Text>
          </TouchableOpacity>

          {showAllChecks && (
            <View style={styles.checksList}>
              {checks.map((chk: CheckResult) => (
                <View key={chk.id} style={styles.checkItem}>
                  <View style={styles.checkHeader}>
                    <View style={styles.checkNameRow}>
                      <StatusIndicator status={chk.status} size={8} />
                      <Text style={styles.checkId}>{chk.id}</Text>
                    </View>
                    <Badge
                      label={chk.status}
                      variant={
                        chk.status === 'pass'
                          ? 'success'
                          : chk.status === 'notice'
                          ? 'warning'
                          : chk.status === 'fail'
                          ? 'danger'
                          : 'neutral'
                      }
                    />
                  </View>
                  {chk.status !== 'pass' && chk.detail && (
                    <Text style={styles.checkDetail}>{chk.detail}</Text>
                  )}
                  {chk.status !== 'pass' &&
                    chk.expected !== undefined &&
                    chk.actual !== undefined && (
                      <Text style={styles.checkDiff}>
                        Expected: {String(chk.expected)} | Actual:{' '}
                        {String(chk.actual)}
                      </Text>
                    )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}
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
  conditionsBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  subTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  conditionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  conditionName: {
    fontSize: 13,
    color: '#4b5563',
  },
  checksSection: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  toggleText: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
  },
  checksList: {
    marginTop: 8,
  },
  checkItem: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  checkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkId: {
    fontSize: 13,
    color: '#1f2937',
    fontFamily: 'monospace',
    marginLeft: 6,
  },
  checkDetail: {
    fontSize: 11,
    color: '#dc2626',
    marginTop: 2,
    marginLeft: 14,
  },
  checkDiff: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1,
    marginLeft: 14,
    fontFamily: 'monospace',
  },
});
