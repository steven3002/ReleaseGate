import { View, Text, StyleSheet } from 'react-native';
import type { ProposalInspection } from 'release-core';
import {
  LIGHTHOUSE_PROGRAM_ID,
  LOADER_V3_PROGRAM_ID,
} from 'release-core';
import { Card, KeyValueRow, AddressText, Badge } from '../../../ui';

export interface InstructionsAccountsSectionProps {
  readonly inspection: ProposalInspection;
}

export function InstructionsAccountsSection({
  inspection,
}: InstructionsAccountsSectionProps) {
  const { transaction, instructions, guard } = inspection;

  const targetProgram = guard.params?.program;
  const targetProgramData = guard.params?.programData;
  const targetBuffer = guard.params?.buffer;
  const spillRecipient = guard.params?.spill;
  const vault = transaction.vault;

  // Writable accounts across the stored message
  const writableAccounts = transaction.accounts.filter((a) => a.isWritable);

  const getProgramDisplayName = (programId: string): string => {
    if (programId === LIGHTHOUSE_PROGRAM_ID) return 'Lighthouse';
    if (programId === LOADER_V3_PROGRAM_ID) return 'BPF Upgradeable Loader';
    return 'Custom / Unknown Program';
  };

  const getAccountRoleLabel = (address: string): string => {
    if (address === vault) return 'Vault PDA (Fee Payer / Upgrade Authority)';
    if (address === targetProgramData)
      return 'Target ProgramData (Receives new code)';
    if (address === targetProgram)
      return 'Target Program (Deployment pointer)';
    if (address === targetBuffer)
      return 'Source Buffer (Closed after upgrade)';
    if (address === spillRecipient)
      return 'Spill Account (Buffer rent refund recipient)';
    return 'Referenced Account';
  };

  return (
    <Card style={styles.container}>
      <Text style={styles.sectionTitle}>
        5. Exact Instructions & Affected Accounts
      </Text>

      {/* Instruction List */}
      {transaction.instructions.map((rawIx, idx) => {
        const classified = instructions[idx];
        const progName = getProgramDisplayName(rawIx.programId);

        return (
          <View key={idx} style={styles.instructionCard}>
            <View style={styles.instructionHeader}>
              <Text style={styles.instructionIndex}>
                #{idx + 1} {progName}
              </Text>
              <Badge
                label={classified?.kind || 'instruction'}
                variant={
                  classified?.kind === 'unsupported' ? 'danger' : 'neutral'
                }
              />
            </View>

            <KeyValueRow
              label="Program ID"
              value={<AddressText address={rawIx.programId} chars={6} />}
            />

            {/* Decoded Meaning */}
            {classified?.kind === 'assert-buffer-owner' && (
              <View style={styles.decodedBlock}>
                <Text style={styles.decodedTitle}>
                  Decoded Meaning: Assert Buffer Owner
                </Text>
                <KeyValueRow
                  label="Target Buffer"
                  value={<AddressText address={classified.target} chars={6} />}
                />
                <KeyValueRow
                  label="Expected Owner"
                  value={<AddressText address={classified.owner} chars={6} />}
                />
              </View>
            )}

            {classified?.kind === 'assert-buffer-length' && (
              <View style={styles.decodedBlock}>
                <Text style={styles.decodedTitle}>
                  Decoded Meaning: Assert Buffer Length
                </Text>
                <KeyValueRow
                  label="Target Buffer"
                  value={<AddressText address={classified.target} chars={6} />}
                />
                <KeyValueRow
                  label="Expected Length"
                  value={`${classified.length.toString()} bytes (37 metadata + ${
                    classified.length > 37n
                      ? (classified.length - 37n).toString()
                      : '0'
                  } payload)`}
                />
              </View>
            )}

            {classified?.kind === 'assert-buffer-hash' && (
              <View style={styles.decodedBlock}>
                <Text style={styles.decodedTitle}>
                  Decoded Meaning: Assert Buffer Keccak-256 Hash
                </Text>
                <KeyValueRow
                  label="Target Buffer"
                  value={<AddressText address={classified.target} chars={6} />}
                />
                <KeyValueRow
                  label="Expected Keccak-256"
                  value={
                    <AddressText address={classified.keccak256} chars={8} />
                  }
                />
                <KeyValueRow
                  label="Data Slice"
                  value={`Offset ${classified.start.toString()} for ${classified.length.toString()} bytes`}
                />
              </View>
            )}

            {classified?.kind === 'assert-deployment-slot' && (
              <View style={styles.decodedBlock}>
                <Text style={styles.decodedTitle}>
                  Decoded Meaning: Assert Deployment Slot
                </Text>
                <KeyValueRow
                  label="Target ProgramData"
                  value={<AddressText address={classified.target} chars={6} />}
                />
                <KeyValueRow
                  label="Asserted Slot"
                  value={classified.slot.toString()}
                />
              </View>
            )}

            {classified?.kind === 'loader-upgrade' && (
              <View style={styles.decodedBlock}>
                <Text style={styles.decodedTitle}>
                  Decoded Meaning: Upgrade Program
                </Text>
                <KeyValueRow
                  label="Program"
                  value={<AddressText address={classified.program} chars={6} />}
                />
                <KeyValueRow
                  label="ProgramData"
                  value={
                    <AddressText address={classified.programData} chars={6} />
                  }
                />
                <KeyValueRow
                  label="Buffer"
                  value={<AddressText address={classified.buffer} chars={6} />}
                />
                <KeyValueRow
                  label="Spill (Rent Refund)"
                  value={<AddressText address={classified.spill} chars={6} />}
                />
                <KeyValueRow
                  label="Upgrade Authority"
                  value={
                    <AddressText address={classified.authority} chars={6} />
                  }
                />
              </View>
            )}

            {classified?.kind === 'unsupported' && (
              <View style={styles.unsupportedBlock}>
                <Text style={styles.unsupportedTitle}>
                  Unsupported Instruction
                </Text>
                <Text style={styles.unsupportedReason}>
                  Reason: {classified.reason}
                </Text>
                <KeyValueRow
                  label="Raw Data (hex)"
                  value={<AddressText address={classified.dataHex} chars={8} />}
                />
              </View>
            )}

            {/* Instruction Accounts */}
            <View style={styles.accountsBlock}>
              <Text style={styles.accountsHeader}>
                Accounts ({rawIx.accounts.length}):
              </Text>
              {rawIx.accounts.map((acc, aIdx) => (
                <View key={aIdx} style={styles.accountItem}>
                  <View style={styles.accountRow}>
                    <Text style={styles.accountIndex}>#{aIdx + 1}</Text>
                    <AddressText address={acc.address} chars={5} />
                    <View style={styles.flagsRow}>
                      {acc.isSigner && (
                        <Badge label="Signer" variant="warning" />
                      )}
                      <Badge
                        label={acc.isWritable ? 'Writable' : 'Read-only'}
                        variant={acc.isWritable ? 'info' : 'neutral'}
                      />
                    </View>
                  </View>
                  <Text style={styles.accountRoleText}>
                    {getAccountRoleLabel(acc.address)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}

      {/* Affected Accounts Section */}
      <View style={styles.affectedSection}>
        <Text style={styles.subSectionTitle}>
          Affected Accounts (Writable Set)
        </Text>
        <Text style={styles.flagsExplanation}>
          Solana message privileges are compiled per transaction: accounts
          written by Upgrade appear writable in earlier assertion instructions.
        </Text>

        {writableAccounts.map((acc, idx) => (
          <View key={idx} style={styles.affectedRow}>
            <View style={styles.affectedMain}>
              <AddressText address={acc.address} chars={6} />
              <Text style={styles.affectedRole}>
                {getAccountRoleLabel(acc.address)}
              </Text>
            </View>
            <Badge label="Writable" variant="info" />
          </View>
        ))}
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
  instructionCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  instructionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  instructionIndex: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
  },
  decodedBlock: {
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    padding: 8,
    marginVertical: 6,
  },
  decodedTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  unsupportedBlock: {
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    padding: 8,
    marginVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  unsupportedTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#b91c1c',
    marginBottom: 2,
  },
  unsupportedReason: {
    fontSize: 12,
    color: '#7f1d1d',
    marginBottom: 4,
  },
  accountsBlock: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  accountsHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 4,
  },
  accountItem: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountIndex: {
    fontSize: 11,
    color: '#6b7280',
    marginRight: 4,
    fontFamily: 'monospace',
  },
  flagsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  accountRoleText: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  affectedSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  flagsExplanation: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
    marginBottom: 8,
  },
  affectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  affectedMain: {
    flex: 1,
    marginRight: 8,
  },
  affectedRole: {
    fontSize: 12,
    color: '#4b5563',
    marginTop: 2,
  },
});
