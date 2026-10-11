import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../../navigation/routes';
import { Button, Card, Badge, AddressText, KeyValueRow } from '../../../ui';
import { getRelease } from '../model/release-store';
import {
  attestRelease,
  ATTESTATION_STATEMENT,
} from '../model/attestation-service';
import type { ImportedRelease, ImportSource } from '../types';

type DetailRouteProp = RouteProp<RootStackParamList, 'ReleaseDetail'>;

export function ReleaseDetailScreen() {
  const route = useRoute<DetailRouteProp>();
  const { releaseId } = route.params;

  const [release, setRelease] = useState<ImportedRelease | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [attesting, setAttesting] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getRelease(releaseId);
      setRelease(data);
    } catch {
      setRelease(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [releaseId]);

  const handleAttest = async () => {
    if (!release) return;
    setAttesting(true);
    try {
      const updated = await attestRelease(release.id);
      setRelease(updated);
    } catch (err) {
      Alert.alert('Attestation Failed', String(err));
    } finally {
      setAttesting(false);
    }
  };

  if (loading || !release) {
    return (
      <View style={styles.centerContainer}>
        {loading ? (
          <ActivityIndicator size="large" color="#1f2937" />
        ) : (
          <Text style={styles.emptyText}>Release not found.</Text>
        )}
      </View>
    );
  }

  const { manifest, artifact, artifactSource, manifestSource, attestation } = release;
  const isAttested = !!attestation;

  const renderOriginCard = (title: string, source: ImportSource) => (
    <Card>
      <Text style={styles.cardHeader}>{title}</Text>
      <KeyValueRow
        label="Channel"
        value={
          <Badge
            label={source.channel}
            variant={source.channel === 'share' ? 'info' : 'neutral'}
          />
        }
      />
      <KeyValueRow
        label="File Name"
        value={source.displayName || 'not available'}
      />
      <KeyValueRow
        label="MIME Type"
        value={source.mimeType || 'not available'}
      />
      <KeyValueRow
        label="Content Authority"
        value={source.providerAuthority || 'not available'}
      />
      <KeyValueRow
        label="Referrer App"
        value={source.referrer || 'not available'}
      />
      <KeyValueRow
        label="Reported Size"
        value={source.size ? `${source.size.toLocaleString()} bytes` : 'not available'}
      />
      <KeyValueRow label="Imported At" value={source.importedAt} />
    </Card>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Title & Provenance Status Badge */}
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <Text style={styles.titleText}>
            {manifest.release?.name || 'Release'} {manifest.release?.version ? `v${manifest.release.version}` : ''}
          </Text>
          <Text style={styles.subtitleText}>Manifest: {manifest.schema}</Text>
        </View>
        <Badge
          label={isAttested ? 'provenance: recorded' : 'provenance: missing'}
          variant={isAttested ? 'success' : 'warning'}
        />
      </View>

      {/* Target Identity */}
      <Card>
        <Text style={styles.cardHeader}>Target On-Chain Identity</Text>
        <KeyValueRow
          label="Cluster"
          value={`${manifest.cluster.name} (${manifest.cluster.genesisHash.slice(0, 8)}...)`}
        />
        <KeyValueRow
          label="Program ID"
          value={<AddressText address={manifest.program} chars={6} />}
        />
        <KeyValueRow
          label="Multisig"
          value={<AddressText address={manifest.multisig} chars={6} />}
        />
        <KeyValueRow
          label="Vault"
          value={<AddressText address={manifest.vault} chars={6} />}
        />
        <KeyValueRow
          label="Expected Deployment Slot"
          value={manifest.expectedDeploymentSlot.toString()}
        />
      </Card>

      {/* Artifact Digests (Pass Mark 7) */}
      <Card>
        <Text style={styles.cardHeader}>Artifact Digests & Length</Text>
        <KeyValueRow
          label="Payload Length"
          value={`${artifact.length.toLocaleString()} bytes`}
        />
        <View style={styles.digestBlock}>
          <Text style={styles.digestLabel}>Literal SHA-256 (sha256):</Text>
          <Text style={styles.digestValue} accessibilityLabel={`sha256 ${artifact.sha256}`}>
            {artifact.sha256}
          </Text>
        </View>
        <View style={styles.digestBlock}>
          <Text style={styles.digestLabel}>Literal Keccak-256 (keccak256):</Text>
          <Text style={styles.digestValue} accessibilityLabel={`keccak256 ${artifact.keccak256}`}>
            {artifact.keccak256}
          </Text>
        </View>
        <View style={styles.digestBlock}>
          <Text style={styles.digestLabel}>Verified Build SHA-256 (verifiedBuildSha256):</Text>
          <Text
            style={styles.digestValue}
            accessibilityLabel={`verifiedBuildSha256 ${artifact.verifiedBuildSha256}`}
          >
            {artifact.verifiedBuildSha256}
          </Text>
        </View>
      </Card>

      {/* Manifest Provenance */}
      <Card>
        <Text style={styles.cardHeader}>Declared Provenance</Text>
        <KeyValueRow
          label="Repository"
          value={manifest.provenance.sourceRepository}
        />
        <KeyValueRow
          label="Commit"
          value={<AddressText address={manifest.provenance.commit} chars={6} />}
        />
        <KeyValueRow
          label="Builder"
          value={manifest.provenance.builder}
        />
        <KeyValueRow
          label="Build Method"
          value={manifest.provenance.buildMethod}
        />
        <KeyValueRow
          label="Built At"
          value={manifest.provenance.builtAt}
        />
      </Card>

      {/* Origin Metadata (Pass Mark 10) */}
      {renderOriginCard('Binary File Origin', artifactSource)}
      {renderOriginCard('Manifest File Origin', manifestSource)}

      {/* Reviewer Attestation (Pass Mark 11) */}
      <Card style={isAttested ? styles.attestedCard : styles.unattestedCard}>
        <Text style={styles.cardHeader}>Reviewer Attestation</Text>
        <Text style={styles.statementText}>"{ATTESTATION_STATEMENT}"</Text>

        {isAttested ? (
          <View style={styles.attestedDetails}>
            <KeyValueRow
              label="Statement Version"
              value={attestation.statementVersion.toString()}
            />
            <KeyValueRow
              label="Confirmed At"
              value={attestation.confirmedAt}
            />
            <Badge label="Attested" variant="success" style={styles.attestedBadge} />
          </View>
        ) : (
          <View style={styles.unattestedDetails}>
            <Text style={styles.attestationPrompt}>
              Sign off on your independent verification of this artifact.
            </Text>
            <Button
              title="Attest Artifact"
              variant="primary"
              onPress={handleAttest}
              loading={attesting}
              accessibilityLabel="Attest Artifact button"
            />
          </View>
        )}
      </Card>
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
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginVertical: 12,
  },
  titleContainer: {
    flex: 1,
    marginRight: 8,
  },
  titleText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  subtitleText: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  digestBlock: {
    marginVertical: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  digestLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 2,
  },
  digestValue: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#111827',
    backgroundColor: '#f3f4f6',
    padding: 6,
    borderRadius: 4,
  },
  attestedCard: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  unattestedCard: {
    borderColor: '#fde047',
    backgroundColor: '#fefce8',
  },
  statementText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#1f2937',
    lineHeight: 20,
    marginBottom: 10,
  },
  attestedDetails: {
    marginTop: 8,
  },
  attestedBadge: {
    marginTop: 8,
  },
  unattestedDetails: {
    marginTop: 8,
  },
  attestationPrompt: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
});
