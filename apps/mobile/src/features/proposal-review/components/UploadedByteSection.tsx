import { View, Text, StyleSheet } from 'react-native';
import type { ProposalInspection, ReviewVerdict } from 'release-core';
import { Card, KeyValueRow, AddressText, Badge } from '../../../ui';
import type { ImportedRelease } from '../../release-import';

export interface UploadedByteSectionProps {
  readonly inspection: ProposalInspection;
  readonly selectedRelease: ImportedRelease | null;
  readonly verdict: ReviewVerdict | null;
}

export function UploadedByteSection({
  inspection,
  selectedRelease,
  verdict,
}: UploadedByteSectionProps) {
  const { guard, instructions, evidence } = inspection;

  let bufferAddress = guard.params?.buffer;
  if (!bufferAddress) {
    for (const ix of instructions) {
      if (ix.kind === 'loader-upgrade') {
        bufferAddress = ix.buffer;
        break;
      }
    }
  }

  const buffer = evidence.buffer;
  const bufferOwner = buffer?.owner;
  const bufferAuthority = buffer?.authority;
  const bufferPayloadLength = buffer?.payload ? buffer.payload.length : 0;
  const artifactLength = selectedRelease?.artifact.length;

  const lengthCheck = verdict?.checks.find((c) => c.id === 'buffer.length');
  const bytesCheck = verdict?.checks.find((c) => c.id === 'buffer.bytes');

  const byteMatchStatus = bytesCheck?.status;
  const byteMatchVariant =
    byteMatchStatus === 'pass'
      ? 'success'
      : byteMatchStatus === 'fail'
      ? 'danger'
      : 'neutral';

  return (
    <Card style={styles.container}>
      <Text style={styles.sectionTitle}>3. Uploaded-Byte Comparison</Text>

      <KeyValueRow
        label="Buffer Account"
        value={
          bufferAddress ? (
            <AddressText address={bufferAddress} chars={6} />
          ) : (
            'not specified'
          )
        }
      />

      <KeyValueRow
        label="Buffer Owner"
        value={
          bufferOwner ? (
            <AddressText address={bufferOwner} chars={6} />
          ) : (
            'account absent'
          )
        }
      />

      <KeyValueRow
        label="Buffer Authority"
        value={
          bufferAuthority ? (
            <AddressText address={bufferAuthority} chars={6} />
          ) : (
            'not set / absent'
          )
        }
      />

      <KeyValueRow
        label="Uploaded Payload"
        value={
          buffer ? `${bufferPayloadLength.toLocaleString()} bytes` : 'absent'
        }
      />

      <KeyValueRow
        label="Reviewed Artifact"
        value={
          artifactLength !== undefined
            ? `${artifactLength.toLocaleString()} bytes`
            : 'no release selected'
        }
      />

      {artifactLength !== undefined && buffer && (
        <KeyValueRow
          label="Length Delta"
          value={
            bufferPayloadLength === artifactLength
              ? '0 bytes (exact match)'
              : `${bufferPayloadLength - artifactLength > 0 ? '+' : ''}${(
                  bufferPayloadLength - artifactLength
                ).toLocaleString()} bytes`
          }
        />
      )}

      {/* Byte-for-byte Comparison Result */}
      <View style={styles.resultBox}>
        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Byte Comparison:</Text>
          <Badge
            label={
              byteMatchStatus === 'pass'
                ? 'Byte-for-byte Match'
                : byteMatchStatus === 'fail'
                ? 'Byte Mismatch'
                : 'Not Evaluated'
            }
            variant={byteMatchVariant}
          />
        </View>

        {bytesCheck?.status === 'fail' && (
          <View style={styles.mismatchDetails}>
            <Text style={styles.mismatchText}>
              {bytesCheck.detail || 'Bytes do not match reviewed artifact'}
            </Text>
            {bytesCheck.actual !== undefined && (
              <Text style={styles.mismatchSubtext}>
                Detail: {String(bytesCheck.actual)}
              </Text>
            )}
          </View>
        )}

        {lengthCheck?.status === 'fail' && (
          <View style={styles.mismatchDetails}>
            <Text style={styles.mismatchText}>
              {lengthCheck.detail || 'Payload length does not match'}
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
  mismatchDetails: {
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3,
    borderLeftColor: '#dc2626',
    padding: 8,
    marginTop: 8,
    borderRadius: 4,
  },
  mismatchText: {
    fontSize: 12,
    color: '#991b1b',
    fontWeight: '600',
  },
  mismatchSubtext: {
    fontSize: 11,
    color: '#b91c1c',
    marginTop: 2,
    fontFamily: 'monospace',
  },
});
