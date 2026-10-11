import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {
  ActionDecision,
  MemberCapabilities,
  ProposalSnapshot,
  ReviewVerdict,
} from 'release-core';
import { Card, Badge } from '../../../ui';

export interface ActionEligibilitySectionProps {
  readonly verdict: ReviewVerdict | null;
  readonly proposal?: ProposalSnapshot | null | undefined;
  readonly connectedMember?: string | undefined;
  readonly memberCapabilities?: MemberCapabilities | undefined;
  readonly isSubmitting?: boolean | undefined;
  readonly onApprove?: (() => void) | undefined;
  readonly onReject?: (() => void) | undefined;
  readonly onExecute?: (() => void) | undefined;
  readonly onCreateReplacement?: (() => void) | undefined;
  readonly onViewReceipt?: (() => void) | undefined;
}

export function ActionEligibilitySection({
  verdict,
  proposal,
  connectedMember,
  memberCapabilities,
  isSubmitting = false,
  onApprove,
  onReject,
  onExecute,
  onCreateReplacement,
  onViewReceipt,
}: ActionEligibilitySectionProps) {
  const actions = verdict?.actions;
  const isExecuted = proposal?.status.kind === 'Executed';

  const hasApproved = Boolean(
    connectedMember && proposal?.approved.includes(connectedMember)
  );
  const hasRejected = Boolean(
    connectedMember && proposal?.rejected.includes(connectedMember)
  );

  // Pass Mark 12: permission visibility gates
  const canVote = memberCapabilities?.vote === true;
  const canExecute = memberCapabilities?.execute === true;
  const canInitiate = memberCapabilities?.initiate === true;

  const renderBlockedReasons = (decision?: ActionDecision) => {
    const reasons = decision?.reasons ?? ['Verdict not yet evaluated'];
    if (decision?.allowed || reasons.length === 0) return null;
    return (
      <View style={styles.reasonsList}>
        {reasons.map((reason, idx) => (
          <Text key={idx} style={styles.reasonText}>
            • {reason}
          </Text>
        ))}
      </View>
    );
  };

  return (
    <Card style={styles.container}>
      <Text style={styles.sectionTitle}>8. Action Eligibility</Text>
      <Text style={styles.subtitle}>
        Sign and execute actions governed by on-chain membership and verified
        conditions.
      </Text>

      {/* Voting Controls (Vote Permission required; Pass Mark 12) */}
      {canVote ? (
        <View style={styles.actionGroup}>
          <Text style={styles.groupHeader}>Voting</Text>

          {/* Approve Action */}
          <View style={styles.actionCard}>
            <View style={styles.actionHeader}>
              <Text style={styles.actionName}>Approve</Text>
              {hasApproved ? (
                <Badge label="Approved by You" variant="success" />
              ) : (
                <Badge
                  label={
                    actions?.approve?.allowed
                      ? 'Available'
                      : 'Blocked'
                  }
                  variant={actions?.approve?.allowed ? 'success' : 'neutral'}
                />
              )}
            </View>

            {hasApproved ? (
              <Text style={styles.alreadyVotedText}>
                Your wallet has already signed approval for this proposal.
              </Text>
            ) : actions?.approve?.allowed ? (
              <TouchableOpacity
                style={[
                  styles.approveButton,
                  isSubmitting && styles.buttonDisabled,
                ]}
                onPress={onApprove}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.approveButtonText}>Approve Proposal</Text>
                )}
              </TouchableOpacity>
            ) : (
              renderBlockedReasons(actions?.approve)
            )}
          </View>

          {/* Reject Action */}
          <View style={styles.actionCard}>
            <View style={styles.actionHeader}>
              <Text style={styles.actionName}>Reject</Text>
              {hasRejected ? (
                <Badge label="Rejected by You" variant="neutral" />
              ) : (
                <Badge
                  label={
                    actions?.reject?.allowed ? 'Available' : 'Blocked'
                  }
                  variant={actions?.reject?.allowed ? 'neutral' : 'neutral'}
                />
              )}
            </View>

            {hasRejected ? (
              <Text style={styles.alreadyVotedText}>
                Your wallet has already recorded rejection for this proposal.
              </Text>
            ) : actions?.reject?.allowed ? (
              <TouchableOpacity
                style={[
                  styles.rejectButton,
                  isSubmitting && styles.buttonDisabled,
                ]}
                onPress={onReject}
                disabled={isSubmitting}
              >
                <Text style={styles.rejectButtonText}>Reject Proposal</Text>
              </TouchableOpacity>
            ) : (
              renderBlockedReasons(actions?.reject)
            )}
          </View>
        </View>
      ) : null}

      {/* Execution Controls (Separate from Approve, Execute Permission required; Pass Mark 12) */}
      {canExecute ? (
        <View style={styles.actionGroup}>
          <Text style={styles.groupHeader}>Execution (Separate Action)</Text>

          <View style={styles.actionCard}>
            <View style={styles.actionHeader}>
              <Text style={styles.actionName}>Execute Upgrade</Text>
              {isExecuted ? (
                <Badge label="Executed" variant="success" />
              ) : (
                <Badge
                  label={
                    actions?.execute?.allowed ? 'Available' : 'Blocked'
                  }
                  variant={actions?.execute?.allowed ? 'success' : 'neutral'}
                />
              )}
            </View>

            {isExecuted ? (
              <View style={styles.executedBox}>
                <Text style={styles.executedText}>
                  This proposal has been executed on chain.
                </Text>
                <TouchableOpacity
                  style={styles.receiptButton}
                  onPress={onViewReceipt}
                >
                  <Text style={styles.receiptButtonText}>
                    View Deployment Receipt
                  </Text>
                </TouchableOpacity>
              </View>
            ) : actions?.execute?.allowed ? (
              <TouchableOpacity
                style={[
                  styles.executeButton,
                  isSubmitting && styles.buttonDisabled,
                ]}
                onPress={onExecute}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.executeButtonText}>Execute Upgrade</Text>
                )}
              </TouchableOpacity>
            ) : (
              renderBlockedReasons(actions?.execute)
            )}
          </View>
        </View>
      ) : null}

      {/* Guarded Replacement Control (Initiate Permission required; Pass Mark 12) */}
      {canInitiate && actions?.createGuardedReplacement ? (
        <View style={styles.actionGroup}>
          <Text style={styles.groupHeader}>Replacement</Text>

          <View style={styles.actionCard}>
            <View style={styles.actionHeader}>
              <Text style={styles.actionName}>
                Create Guarded Replacement
              </Text>
              <Badge
                label={
                  actions.createGuardedReplacement.allowed
                    ? 'Available'
                    : 'Blocked'
                }
                variant={
                  actions.createGuardedReplacement.allowed
                    ? 'success'
                    : 'neutral'
                }
              />
            </View>

            {actions.createGuardedReplacement.allowed ? (
              <TouchableOpacity
                style={[
                  styles.replacementButton,
                  isSubmitting && styles.buttonDisabled,
                ]}
                onPress={onCreateReplacement}
                disabled={isSubmitting}
              >
                <Text style={styles.replacementButtonText}>
                  Create Guarded Replacement
                </Text>
              </TouchableOpacity>
            ) : (
              renderBlockedReasons(actions.createGuardedReplacement)
            )}
          </View>
        </View>
      ) : null}

      {/* When user has no permissions or read-only */}
      {!canVote && !canExecute && !canInitiate && (
        <View style={styles.readOnlyBox}>
          <Text style={styles.readOnlyText}>
            Connected wallet is not a multisig member with Initiate, Vote, or
            Execute permissions.
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
  },
  actionGroup: {
    marginBottom: 12,
  },
  groupHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  actionName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  alreadyVotedText: {
    fontSize: 12,
    color: '#059669',
    marginTop: 4,
    fontWeight: '500',
  },
  reasonsList: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  reasonText: {
    fontSize: 12,
    color: '#b91c1c',
    lineHeight: 16,
    marginBottom: 2,
  },
  approveButton: {
    backgroundColor: '#059669',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  approveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  rejectButton: {
    backgroundColor: '#dc2626',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  rejectButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  executeButton: {
    backgroundColor: '#2563eb',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  executeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  replacementButton: {
    backgroundColor: '#0284c7',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  replacementButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  executedBox: {
    marginTop: 6,
  },
  executedText: {
    fontSize: 12,
    color: '#059669',
    marginBottom: 8,
    fontWeight: '600',
  },
  receiptButton: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  receiptButtonText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
  readOnlyBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    padding: 10,
    marginTop: 4,
  },
  readOnlyText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
});
