import { View, Text, StyleSheet } from 'react-native';
import { Card, KeyValueRow, AddressText, Badge, Button } from '../../../ui';
import type { ImportedRelease } from '../../release-import';
import { DIGEST_LABELS } from '../model/wording';

export interface ArtifactProvenanceSectionProps {
  readonly selectedRelease: ImportedRelease | null;
  readonly candidatesCount: number;
  readonly onOpenReleasePicker: () => void;
}

export function ArtifactProvenanceSection({
  selectedRelease,
  candidatesCount,
  onOpenReleasePicker,
}: ArtifactProvenanceSectionProps) {
  return (
    <Card style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>2. Reviewed Artifact & Provenance</Text>
        <Button
          title={
            candidatesCount > 1
              ? `Select Release (${candidatesCount})`
              : selectedRelease
              ? 'Change Selection'
              : `Select Release (${candidatesCount})`
          }
          variant="secondary"
          onPress={onOpenReleasePicker}
          style={styles.selectButton}
        />
      </View>

      {!selectedRelease ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No reviewed artifact selected</Text>
          <Text style={styles.emptySubtext}>
            Approval is blocked without a reviewed and attested release artifact.
          </Text>
        </View>
      ) : (
        <View style={styles.detailsContainer}>
          <View style={styles.releaseHeaderRow}>
            <Text style={styles.releaseName}>
              {selectedRelease.manifest.release?.name || 'Release'}{' '}
              {selectedRelease.manifest.release?.version
                ? `v${selectedRelease.manifest.release.version}`
                : ''}
            </Text>
            <Badge
              label={
                selectedRelease.attestation
                  ? 'provenance: recorded'
                  : 'provenance: missing'
              }
              variant={selectedRelease.attestation ? 'success' : 'warning'}
            />
          </View>

          <KeyValueRow
            label="File Name"
            value={selectedRelease.manifest.artifact.fileName || 'release.so'}
          />

          <KeyValueRow
            label="Artifact Length"
            value={`${selectedRelease.artifact.length.toLocaleString()} bytes`}
          />

          {/* Three Digests By Name */}
          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>Digests (by convention)</Text>
            <KeyValueRow
              label={DIGEST_LABELS.sha256}
              value={
                <AddressText
                  address={selectedRelease.artifact.sha256}
                  chars={8}
                />
              }
            />
            <KeyValueRow
              label={DIGEST_LABELS.keccak256}
              value={
                <AddressText
                  address={selectedRelease.artifact.keccak256}
                  chars={8}
                />
              }
            />
            {selectedRelease.artifact.verifiedBuildSha256 && (
              <KeyValueRow
                label={DIGEST_LABELS.verifiedBuildSha256}
                value={
                  <AddressText
                    address={selectedRelease.artifact.verifiedBuildSha256}
                    chars={8}
                  />
                }
              />
            )}
          </View>

          {/* Manifest Provenance */}
          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>Manifest Provenance</Text>
            <KeyValueRow
              label="Source Repo"
              value={
                selectedRelease.manifest.provenance.sourceRepository ||
                'not available'
              }
            />
            <KeyValueRow
              label="Commit"
              value={
                <AddressText
                  address={selectedRelease.manifest.provenance.commit}
                  chars={8}
                />
              }
            />
            <KeyValueRow
              label="Build Method"
              value={
                selectedRelease.manifest.provenance.buildMethod || 'not available'
              }
            />
            <KeyValueRow
              label="Builder"
              value={
                selectedRelease.manifest.provenance.builder || 'not available'
              }
            />
            <KeyValueRow
              label="Built At"
              value={
                selectedRelease.manifest.provenance.builtAt || 'not available'
              }
            />
          </View>

          {/* Import Sources */}
          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>Import Sources</Text>
            <KeyValueRow
              label="Artifact Channel"
              value={
                <Badge
                  label={selectedRelease.artifactSource.channel}
                  variant={
                    selectedRelease.artifactSource.channel === 'share'
                      ? 'info'
                      : 'neutral'
                  }
                />
              }
            />
            <KeyValueRow
              label="Artifact Referrer"
              value={selectedRelease.artifactSource.referrer || 'not available'}
            />
            <KeyValueRow
              label="Manifest Channel"
              value={
                <Badge
                  label={selectedRelease.manifestSource.channel}
                  variant={
                    selectedRelease.manifestSource.channel === 'share'
                      ? 'info'
                      : 'neutral'
                  }
                />
              }
            />
          </View>

          {/* Attestation */}
          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>Reviewer Attestation</Text>
            {selectedRelease.attestation ? (
              <>
                <KeyValueRow
                  label="Statement Version"
                  value={selectedRelease.attestation.statementVersion.toString()}
                />
                <KeyValueRow
                  label="Confirmed At"
                  value={selectedRelease.attestation.confirmedAt}
                />
                <Text style={styles.attestationQuote}>
                  "I obtained this artifact from my own review or build, not from
                  the proposer."
                </Text>
              </>
            ) : (
              <Text style={styles.missingAttestationText}>
                Attestation has not been confirmed for this release.
              </Text>
            )}
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  selectButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  emptyContainer: {
    paddingVertical: 12,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#6b7280',
  },
  detailsContainer: {
    marginTop: 4,
  },
  releaseHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  releaseName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  subSection: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  attestationQuote: {
    fontSize: 12,
    color: '#15803d',
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 16,
  },
  missingAttestationText: {
    fontSize: 13,
    color: '#b45309',
    marginTop: 4,
  },
});
