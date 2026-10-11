import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DeploymentReceipt } from 'release-core';
import type { RootStackParamList } from '../../../navigation/routes';
import { AddressText } from '../../../ui/AddressText';
import { getReceipt, getReceiptForProposal } from '../model/receipt-store';

type Props = NativeStackScreenProps<RootStackParamList, 'DeploymentReceipt'>;

export function ReceiptScreen({ route, navigation }: Props) {
  const { receiptId, multisig, transactionIndex } = route.params;
  const [receipt, setReceipt] = React.useState<DeploymentReceipt | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        let found: DeploymentReceipt | null = null;
        if (receiptId) {
          found = await getReceipt(receiptId);
        }
        if (!found && multisig && transactionIndex) {
          found = await getReceiptForProposal(multisig, BigInt(transactionIndex));
        }
        if (active) {
          if (found) {
            setReceipt(found);
            setError(null);
          } else {
            setError('Deployment receipt not found in storage');
          }
        }
      } catch (err: unknown) {
        if (active) {
          setError(String(err));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [receiptId, multisig, transactionIndex]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading deployment receipt...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !receipt) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Receipt Unavailable</Text>
          <Text style={styles.errorText}>{error ?? 'No receipt available'}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isObserved = receipt.execution.observedOnly;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backHeaderButton}
          >
            <Text style={styles.backHeaderText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Deployment Receipt</Text>
          <View
            style={[
              styles.badge,
              isObserved ? styles.badgeNotice : styles.badgePass,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                isObserved ? styles.badgeTextNotice : styles.badgeTextPass,
              ]}
            >
              {isObserved ? 'Observed Only' : 'Verified Execution'}
            </Text>
          </View>
        </View>

        {/* Section 1: Execution Invariants */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Execution Invariants</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Execution Status:</Text>
            <Text style={styles.valueHighlight}>Reconciled</Text>
          </View>

          {receipt.execution.signature ? (
            <View style={styles.rowBlock}>
              <Text style={styles.label}>Transaction Signature:</Text>
              <AddressText address={receipt.execution.signature} />
            </View>
          ) : null}

          {receipt.execution.slot !== undefined ? (
            <View style={styles.row}>
              <Text style={styles.label}>Execution Slot:</Text>
              <Text style={styles.value}>{receipt.execution.slot}</Text>
            </View>
          ) : null}

          {receipt.execution.executor ? (
            <View style={styles.rowBlock}>
              <Text style={styles.label}>Executor:</Text>
              <AddressText address={receipt.execution.executor} />
            </View>
          ) : null}
        </View>

        {/* Section 2: Deployed On-Chain State */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Deployed On-Chain State</Text>

          <View style={styles.rowBlock}>
            <Text style={styles.label}>Program ID:</Text>
            <AddressText address={receipt.program} />
          </View>

          <View style={styles.rowBlock}>
            <Text style={styles.label}>ProgramData Address:</Text>
            <AddressText address={receipt.programData} />
          </View>

          <View style={styles.rowBlock}>
            <Text style={styles.label}>Upgrade Authority (Vault):</Text>
            <AddressText address={receipt.deployed.upgradeAuthority ?? 'None'} />
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Deployed Slot:</Text>
            <Text style={styles.value}>{receipt.deployed.slot.toString()}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Payload Matches Artifact:</Text>
            <Text
              style={
                receipt.deployed.payloadMatchesArtifact
                  ? styles.passText
                  : styles.failText
              }
            >
              {receipt.deployed.payloadMatchesArtifact ? 'YES' : 'NO'}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Trailing Zero Bytes Valid:</Text>
            <Text
              style={
                receipt.deployed.trailingBytesAllZero
                  ? styles.passText
                  : styles.failText
              }
            >
              {receipt.deployed.trailingBytesAllZero ? 'YES' : 'NO'}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Buffer Account Closed:</Text>
            <Text
              style={
                receipt.deployed.bufferClosed
                  ? styles.passText
                  : styles.failText
              }
            >
              {receipt.deployed.bufferClosed ? 'YES' : 'NO'}
            </Text>
          </View>
        </View>

        {/* Section 3: Artifact & Provenance Identification */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Artifact Identification</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Artifact Length:</Text>
            <Text style={styles.value}>{receipt.artifactLength} bytes</Text>
          </View>

          <View style={styles.rowBlock}>
            <Text style={styles.label}>Artifact SHA-256 (literal):</Text>
            <AddressText address={receipt.artifactSha256} />
          </View>

          <View style={styles.rowBlock}>
            <Text style={styles.label}>Artifact Keccak-256 (literal):</Text>
            <AddressText address={receipt.artifactKeccak256} />
          </View>

          <View style={styles.rowBlock}>
            <Text style={styles.label}>Manifest SHA-256:</Text>
            <AddressText address={receipt.manifestSha256} />
          </View>
        </View>

        {/* Section 4: Verification Checks Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            4. Post-Execution Reconciliation Checks ({receipt.checks.length})
          </Text>

          {receipt.checks.map((check) => {
            const isPass = check.status === 'pass';
            const isNotice = check.status === 'notice';
            return (
              <View key={check.id} style={styles.checkItem}>
                <View style={styles.checkHeader}>
                  <Text style={styles.checkId}>{check.id}</Text>
                  <View
                    style={[
                      styles.checkBadge,
                      isPass
                        ? styles.badgePass
                        : isNotice
                          ? styles.badgeNotice
                          : styles.badgeFail,
                    ]}
                  >
                    <Text
                      style={[
                        styles.checkBadgeText,
                        isPass
                          ? styles.badgeTextPass
                          : isNotice
                            ? styles.badgeTextNotice
                            : styles.badgeTextFail,
                      ]}
                    >
                      {check.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                {check.detail ? (
                  <Text style={styles.checkDetail}>{check.detail}</Text>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Standing Note */}
        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>Standing Note</Text>
          <Text style={styles.noteText}>
            A matching hash shows these are the reviewed bytes. It does not show
            that the code is harmless or audited.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Receipt ID: {receipt.id}</Text>
          <Text style={styles.footerText}>
            Generated: {new Date(receipt.createdAt).toLocaleString()}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0d14',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 16,
  },
  errorTitle: {
    color: '#f87171',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  header: {
    marginBottom: 20,
  },
  backHeaderButton: {
    marginBottom: 10,
  },
  backHeaderText: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgePass: {
    backgroundColor: '#064e3b',
    borderColor: '#059669',
  },
  badgeNotice: {
    backgroundColor: '#78350f',
    borderColor: '#d97706',
  },
  badgeFail: {
    backgroundColor: '#7f1d1d',
    borderColor: '#dc2626',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  badgeTextPass: {
    color: '#34d399',
  },
  badgeTextNotice: {
    color: '#fbbf24',
  },
  badgeTextFail: {
    color: '#f87171',
  },
  section: {
    backgroundColor: '#131b2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  sectionTitle: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowBlock: {
    paddingVertical: 6,
  },
  label: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 2,
  },
  value: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '500',
  },
  valueHighlight: {
    color: '#34d399',
    fontSize: 14,
    fontWeight: '700',
  },
  passText: {
    color: '#34d399',
    fontSize: 13,
    fontWeight: '700',
  },
  failText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '700',
  },
  checkItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  checkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkId: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  checkBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  checkBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  checkDetail: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4,
  },
  noteBox: {
    backgroundColor: '#1e1b4b',
    borderColor: '#3730a3',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  noteTitle: {
    color: '#c7d2fe',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  noteText: {
    color: '#e0e7ff',
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  footerText: {
    color: '#64748b',
    fontSize: 11,
    marginVertical: 2,
  },
});
