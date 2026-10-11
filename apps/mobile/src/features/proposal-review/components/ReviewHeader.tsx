import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { ReviewVerdict } from 'release-core';
import { Badge, Card } from '../../../ui';
import {
  STANDING_NOTE,
  getArtifactMatchWording,
  getExecutionConditionsWording,
} from '../model/wording';

export interface ReviewHeaderProps {
  readonly proposalIndex: string;
  readonly verdict: ReviewVerdict | null;
  readonly contextSlot: number;
  readonly evaluatingArtifact: boolean;
  readonly hashTimingMs: number | null;
}

export function ReviewHeader({
  proposalIndex,
  verdict,
  contextSlot,
  evaluatingArtifact,
  hashTimingMs,
}: ReviewHeaderProps) {
  const artifactMatchText = getArtifactMatchWording(verdict?.artifactMatch);
  const executionConditionsText = getExecutionConditionsWording(
    verdict?.executionConditions
  );

  const artifactVariant =
    verdict?.artifactMatch === 'matches'
      ? 'success'
      : verdict?.artifactMatch === 'mismatch'
      ? 'danger'
      : 'neutral';

  const executionVariant =
    verdict?.executionConditions === 'verified'
      ? 'success'
      : verdict?.executionConditions === 'incomplete'
      ? 'warning'
      : verdict?.executionConditions === 'absent' ||
        verdict?.executionConditions === 'not-holding'
      ? 'danger'
      : 'neutral';

  return (
    <Card style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.titleText}>Proposal #{proposalIndex}</Text>
        {contextSlot > 0 && (
          <Text style={styles.slotText}>Slot {contextSlot.toLocaleString()}</Text>
        )}
      </View>

      {/* Primary Verdict Badges */}
      <View style={styles.verdictsContainer}>
        <View style={styles.badgeRow}>
          <Badge label={artifactMatchText} variant={artifactVariant} />
        </View>
        <View style={styles.badgeRow}>
          <Badge
            label={executionConditionsText}
            variant={executionVariant}
          />
        </View>
      </View>

      {evaluatingArtifact && (
        <View style={styles.evaluatingRow}>
          <ActivityIndicator size="small" color="#4b5563" />
          <Text style={styles.evaluatingText}>
            Comparing uploaded bytes with reviewed artifact...
          </Text>
        </View>
      )}

      {hashTimingMs !== null && !evaluatingArtifact && (
        <Text style={styles.timingText}>
          Evaluated in {hashTimingMs} ms
        </Text>
      )}

      {/* Standing Note */}
      <View style={styles.standingNoteContainer}>
        <Text style={styles.standingNoteText}>{STANDING_NOTE}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  titleText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  slotText: {
    fontSize: 13,
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  verdictsContainer: {
    marginBottom: 12,
  },
  badgeRow: {
    marginVertical: 3,
    alignItems: 'flex-start',
  },
  evaluatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  evaluatingText: {
    fontSize: 12,
    color: '#4b5563',
    marginLeft: 8,
  },
  timingText: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  standingNoteContainer: {
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    padding: 10,
    marginTop: 4,
  },
  standingNoteText: {
    fontSize: 12,
    color: '#4b5563',
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
