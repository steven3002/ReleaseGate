import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import type { ImportedRelease } from '../../release-import';
import { Badge, Button, AddressText } from '../../../ui';

export interface ReleasePickerModalProps {
  readonly visible: boolean;
  readonly candidates: readonly ImportedRelease[];
  readonly selectedReleaseId: string | null;
  readonly onSelectRelease: (releaseId: string | null) => void;
  readonly onClose: () => void;
}

export function ReleasePickerModal({
  visible,
  candidates,
  selectedReleaseId,
  onSelectRelease,
  onClose,
}: ReleasePickerModalProps) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheetContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.titleText}>Select Reviewed Release</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitleText}>
            Candidate releases matching the workspace cluster, multisig, and
            target program.
          </Text>

          <ScrollView style={styles.list}>
            {/* Option to select None */}
            <TouchableOpacity
              style={[
                styles.candidateItem,
                selectedReleaseId === null && styles.candidateItemSelected,
              ]}
              onPress={() => {
                onSelectRelease(null);
                onClose();
              }}
              activeOpacity={0.7}
            >
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>None (No Release Selected)</Text>
                {selectedReleaseId === null && (
                  <Badge label="Selected" variant="info" />
                )}
              </View>
              <Text style={styles.itemSubtext}>
                Review proposal without comparing against any artifact.
              </Text>
            </TouchableOpacity>

            {/* Candidate List */}
            {candidates.map((rel) => {
              const isSelected = rel.id === selectedReleaseId;
              const hasAttestation = !!rel.attestation;

              return (
                <TouchableOpacity
                  key={rel.id}
                  style={[
                    styles.candidateItem,
                    isSelected && styles.candidateItemSelected,
                  ]}
                  onPress={() => {
                    onSelectRelease(rel.id);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName}>
                      {rel.manifest.release?.name || 'Release'}{' '}
                      {rel.manifest.release?.version
                        ? `v${rel.manifest.release.version}`
                        : ''}
                    </Text>
                    <View style={styles.badgeRow}>
                      <Badge
                        label={
                          hasAttestation
                            ? 'provenance: recorded'
                            : 'provenance: missing'
                        }
                        variant={hasAttestation ? 'success' : 'warning'}
                      />
                      {isSelected && (
                        <Badge label="Selected" variant="info" />
                      )}
                    </View>
                  </View>

                  <Text style={styles.fileName}>
                    {rel.manifest.artifact.fileName || 'release.so'} (
                    {rel.artifact.length.toLocaleString()} bytes)
                  </Text>

                  <View style={styles.shaRow}>
                    <Text style={styles.shaLabel}>SHA-256: </Text>
                    <AddressText address={rel.artifact.sha256} chars={6} />
                  </View>
                </TouchableOpacity>
              );
            })}

            {candidates.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  No candidate releases found matching this program and cluster.
                </Text>
              </View>
            )}
          </ScrollView>

          <Button
            title="Close"
            variant="secondary"
            onPress={onClose}
            style={styles.bottomButton}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '80%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: '600',
  },
  subtitleText: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
    marginBottom: 12,
  },
  list: {
    marginBottom: 12,
  },
  candidateItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  candidateItemSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  itemSubtext: {
    fontSize: 12,
    color: '#6b7280',
  },
  fileName: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
    marginTop: 2,
  },
  shaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  shaLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  emptyBox: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
  bottomButton: {
    marginTop: 4,
  },
});
