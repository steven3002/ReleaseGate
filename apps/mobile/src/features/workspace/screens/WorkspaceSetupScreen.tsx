import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  CLUSTERS,
  getClusterDescriptor,
} from 'release-core';
import type {
  ClusterId,
  MemberCapabilities,
  MultisigSnapshot,
} from 'release-core';
import type { RootStackParamList } from '../../../navigation/routes';
import { Button, Card, Header, Badge, AddressText, KeyValueRow } from '../../../ui';
import { mwaSigner } from '../../wallet';
import {
  validateEndpoint,
  loadAndValidateMultisig,
} from '../model/workspace-service';
import { saveWorkspace } from '../model/workspace-store';
import type { Workspace } from '../types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'WorkspaceSetup'>;

export function WorkspaceSetupScreen() {
  const navigation = useNavigation<NavProp>();

  const [selectedClusterId, setSelectedClusterId] = useState<ClusterId>('devnet');
  const [rpcUrl, setRpcUrl] = useState<string>(CLUSTERS.devnet.defaultRpcUrl);
  const [multisigAddress, setMultisigAddress] = useState<string>('');
  const [connectedMember, setConnectedMember] = useState<string | null>(null);

  const [validating, setValidating] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [validatedSnapshot, setValidatedSnapshot] = useState<MultisigSnapshot | null>(null);
  const [validatedCapabilities, setValidatedCapabilities] = useState<MemberCapabilities | null>(null);

  const cluster = getClusterDescriptor(selectedClusterId);

  useEffect(() => {
    mwaSigner.getCachedMember(selectedClusterId).then((cached) => {
      if (cached) {
        setConnectedMember(cached);
      }
    });
  }, [selectedClusterId]);

  const handleSelectCluster = (id: ClusterId) => {
    setSelectedClusterId(id);
    const desc = getClusterDescriptor(id);
    setRpcUrl(desc.defaultRpcUrl);
    setErrorMessage(null);
    setValidatedSnapshot(null);
    setValidatedCapabilities(null);
  };

  const handleConnectWallet = async () => {
    setConnecting(true);
    setErrorMessage(null);
    try {
      const result = await mwaSigner.connect(cluster);
      setConnectedMember(result.member);
      if (multisigAddress.trim()) {
        const check = await loadAndValidateMultisig(
          rpcUrl.trim(),
          multisigAddress.trim(),
          result.member
        );
        if (check.ok && check.snapshot && check.capabilities) {
          setValidatedSnapshot(check.snapshot);
          setValidatedCapabilities(check.capabilities);
        }
      }
    } catch (err) {
      setErrorMessage(`Wallet connection failed: ${String(err)}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleValidate = async () => {
    const cleanUrl = rpcUrl.trim();
    const cleanMultisig = multisigAddress.trim();

    if (!cleanUrl) {
      setErrorMessage('RPC URL cannot be empty');
      return;
    }
    if (!cleanMultisig) {
      setErrorMessage('Multisig address cannot be empty');
      return;
    }

    setValidating(true);
    setErrorMessage(null);
    setValidatedSnapshot(null);
    setValidatedCapabilities(null);

    try {
      // 1. Genesis check
      const endpointCheck = await validateEndpoint(selectedClusterId, cleanUrl);
      if (!endpointCheck.ok) {
        setErrorMessage(endpointCheck.error || 'Endpoint validation failed');
        setValidating(false);
        return;
      }

      // 2. Multisig check
      const multisigCheck = await loadAndValidateMultisig(
        cleanUrl,
        cleanMultisig,
        connectedMember || undefined
      );

      if (!multisigCheck.ok || !multisigCheck.snapshot || !multisigCheck.capabilities) {
        setErrorMessage(multisigCheck.error || 'Multisig validation failed');
        setValidating(false);
        return;
      }

      setValidatedSnapshot(multisigCheck.snapshot);
      setValidatedCapabilities(multisigCheck.capabilities);
    } catch (err) {
      setErrorMessage(`Validation error: ${String(err)}`);
    } finally {
      setValidating(false);
    }
  };

  const handleSaveAndEnter = async () => {
    if (!validatedSnapshot || !validatedCapabilities) return;

    const workspace: Workspace = {
      id: `${selectedClusterId}:${validatedSnapshot.address}`,
      clusterId: selectedClusterId,
      rpcUrl: rpcUrl.trim(),
      multisig: validatedSnapshot.address,
      ...(connectedMember ? { member: connectedMember } : {}),
      label: `${selectedClusterId} multisig`,
      createdAt: new Date().toISOString(),
    };

    await saveWorkspace(workspace);
    navigation.replace('WorkspaceHome');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header
        title="Workspace Setup"
        subtitle="Select cluster, connect member wallet, and enter your Squads multisig."
      />

      {/* Cluster selection */}
      <Card>
        <Text style={styles.sectionTitle}>Target Cluster</Text>
        <View style={styles.buttonRow}>
          <Button
            title="devnet"
            variant={selectedClusterId === 'devnet' ? 'primary' : 'secondary'}
            onPress={() => handleSelectCluster('devnet')}
            style={styles.halfButton}
          />
          <Button
            title="mainnet-beta"
            variant={selectedClusterId === 'mainnet-beta' ? 'primary' : 'secondary'}
            onPress={() => handleSelectCluster('mainnet-beta')}
            style={styles.halfButton}
          />
        </View>
        <Text style={styles.infoText}>
          {cluster.signingEnabled
            ? 'Signing enabled: approvals, rejections and executions supported.'
            : 'Review-only: signing disabled on mainnet-beta in this version.'}
        </Text>
      </Card>

      {/* RPC Endpoint */}
      <Card>
        <Text style={styles.sectionTitle}>RPC Endpoint</Text>
        <TextInput
          style={styles.input}
          value={rpcUrl}
          onChangeText={(val) => {
            setRpcUrl(val);
            setErrorMessage(null);
            setValidatedSnapshot(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://..."
          accessibilityLabel="RPC URL input"
        />
      </Card>

      {/* Wallet Connection */}
      <Card>
        <Text style={styles.sectionTitle}>Reviewer Wallet</Text>
        {connectedMember ? (
          <View style={styles.connectedRow}>
            <View>
              <Text style={styles.connectedLabel}>Connected Member:</Text>
              <AddressText address={connectedMember} chars={8} />
            </View>
            <Button
              title="Reconnect"
              variant="secondary"
              onPress={handleConnectWallet}
              loading={connecting}
            />
          </View>
        ) : (
          <Button
            title="Connect Wallet (MWA)"
            variant="primary"
            onPress={handleConnectWallet}
            loading={connecting}
            accessibilityLabel="Connect Wallet button"
          />
        )}
      </Card>

      {/* Multisig Address */}
      <Card>
        <Text style={styles.sectionTitle}>Squads Multisig Address</Text>
        <TextInput
          style={styles.input}
          value={multisigAddress}
          onChangeText={(val) => {
            setMultisigAddress(val);
            setErrorMessage(null);
            setValidatedSnapshot(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Enter multisig base58 address"
          accessibilityLabel="Multisig address input"
        />
        <Button
          title="Validate Multisig"
          variant="secondary"
          onPress={handleValidate}
          loading={validating}
          style={styles.validateButton}
          accessibilityLabel="Validate Multisig button"
        />
      </Card>

      {/* Error display */}
      {errorMessage ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText} accessibilityLabel={errorMessage}>
            {errorMessage}
          </Text>
        </Card>
      ) : null}

      {/* Validated details */}
      {validatedSnapshot && validatedCapabilities ? (
        <Card style={styles.successCard}>
          <Text style={styles.sectionTitle}>Multisig Verified</Text>
          <KeyValueRow
            label="Threshold"
            value={`${validatedSnapshot.threshold} of ${validatedSnapshot.members.length}`}
          />
          <KeyValueRow
            label="Total Proposals"
            value={validatedSnapshot.transactionIndex.toString()}
          />
          <KeyValueRow
            label="Connected Member"
            value={
              connectedMember ? (
                <AddressText address={connectedMember} chars={4} />
              ) : (
                'None'
              )
            }
          />
          <KeyValueRow
            label="Member Permissions"
            value={
              validatedCapabilities.isMember ? (
                <View style={styles.badgesRow}>
                  {validatedCapabilities.initiate ? (
                    <Badge label="Initiate" variant="success" style={styles.badgeMargin} />
                  ) : null}
                  {validatedCapabilities.vote ? (
                    <Badge label="Vote" variant="success" style={styles.badgeMargin} />
                  ) : null}
                  {validatedCapabilities.execute ? (
                    <Badge label="Execute" variant="success" style={styles.badgeMargin} />
                  ) : null}
                </View>
              ) : (
                <Badge label="Read-only (Not a member)" variant="warning" />
              )
            }
          />

          <Button
            title="Confirm & Enter Workspace"
            variant="primary"
            onPress={handleSaveAndEnter}
            style={styles.enterButton}
            accessibilityLabel="Confirm and enter workspace button"
          />
        </Card>
      ) : null}
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
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  halfButton: {
    flex: 1,
  },
  infoText: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  input: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    fontFamily: 'monospace',
  },
  connectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  connectedLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
  validateButton: {
    marginTop: 10,
  },
  errorCard: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '500',
  },
  successCard: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  badgeMargin: {
    marginRight: 4,
  },
  enterButton: {
    marginTop: 16,
  },
});
