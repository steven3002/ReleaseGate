import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import type { RootStackParamList } from '../../../navigation/routes';
import { Button, Card, Header, Badge, KeyValueRow } from '../../../ui';
import {
  getInitialIntent,
  addInboundIntentListener,
  clearIntent,
} from '../../../../modules/inbound-intent';
import type { InboundIntentData } from '../../../../modules/inbound-intent';
import type { ImportSource } from '../types';
import { readUriBytes, validateAndImportRelease } from '../model/import-service';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'ReleaseImport'>;

interface SelectedFile {
  uri: string;
  source: ImportSource;
}

export function ReleaseImportScreen() {
  const navigation = useNavigation<NavProp>();

  const [selectedBinary, setSelectedBinary] = useState<SelectedFile | null>(null);
  const [selectedManifest, setSelectedManifest] = useState<SelectedFile | null>(null);

  const [importing, setImporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);

  const handleIncomingIntent = (intent: InboundIntentData) => {
    if (!intent.uri) return;

    const source: ImportSource = {
      channel: 'share',
      displayName: intent.displayName,
      mimeType: intent.mimeType,
      providerAuthority: intent.providerAuthority,
      referrer: intent.referrer,
      size: intent.size,
      importedAt: new Date().toISOString(),
    };

    const fileName = (intent.displayName || '').toLowerCase();
    if (fileName.endsWith('.json') || intent.mimeType?.includes('json')) {
      setSelectedManifest({ uri: intent.uri, source });
    } else {
      setSelectedBinary({ uri: intent.uri, source });
    }
  };

  useEffect(() => {
    // Check initial launch intent
    getInitialIntent().then((initial: InboundIntentData | null) => {
      if (initial) {
        handleIncomingIntent(initial);
        clearIntent();
      }
    });

    // Listen for new incoming intents while app is running
    const sub = addInboundIntentListener((intent: InboundIntentData) => {
      handleIncomingIntent(intent);
    });

    return () => {
      sub?.remove();
    };
  }, []);

  const handlePickBinary = async () => {
    setErrorMessage(null);
    setErrorField(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (!asset) return;
        const source: ImportSource = {
          channel: 'file-picker',
          displayName: asset.name,
          size: asset.size,
          mimeType: asset.mimeType,
          importedAt: new Date().toISOString(),
        };
        setSelectedBinary({ uri: asset.uri, source });
      }
    } catch (err) {
      setErrorMessage(`Failed to pick binary: ${String(err)}`);
    }
  };

  const handlePickManifest = async () => {
    setErrorMessage(null);
    setErrorField(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (!asset) return;
        const source: ImportSource = {
          channel: 'file-picker',
          displayName: asset.name,
          size: asset.size,
          mimeType: asset.mimeType,
          importedAt: new Date().toISOString(),
        };
        setSelectedManifest({ uri: asset.uri, source });
      }
    } catch (err) {
      setErrorMessage(`Failed to pick manifest: ${String(err)}`);
    }
  };

  const handleImport = async () => {
    if (!selectedBinary || !selectedManifest) {
      setErrorMessage('Please select both the program binary and the manifest');
      return;
    }

    setImporting(true);
    setErrorMessage(null);
    setErrorField(null);

    try {
      const binaryBytes = await readUriBytes(selectedBinary.uri);
      const manifestBytes = await readUriBytes(selectedManifest.uri);

      const result = await validateAndImportRelease(
        { bytes: binaryBytes, source: selectedBinary.source },
        { bytes: manifestBytes, source: selectedManifest.source }
      );

      if (!result.ok) {
        setErrorMessage(result.error);
        if (result.differingField) {
          setErrorField(result.differingField);
        }
        setImporting(false);
        return;
      }

      // Navigate to ReleaseDetail
      navigation.replace('ReleaseDetail', { releaseId: result.release.id });
    } catch (err) {
      setErrorMessage(`Import error: ${String(err)}`);
      setImporting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header
        title="Import Release"
        subtitle="Select the compiled program binary (.so) and the release manifest (.json)."
      />

      {/* Program Binary Selection */}
      <Card>
        <Text style={styles.cardTitle}>1. Program Binary (.so)</Text>
        {selectedBinary ? (
          <View style={styles.fileDetails}>
            <KeyValueRow
              label="File Name"
              value={selectedBinary.source.displayName || 'Unnamed file'}
            />
            <KeyValueRow
              label="Source Channel"
              value={
                <Badge
                  label={selectedBinary.source.channel}
                  variant={selectedBinary.source.channel === 'share' ? 'info' : 'neutral'}
                />
              }
            />
            {selectedBinary.source.size ? (
              <KeyValueRow
                label="Size"
                value={`${selectedBinary.source.size.toLocaleString()} bytes`}
              />
            ) : null}
            {selectedBinary.source.providerAuthority ? (
              <KeyValueRow
                label="Provider"
                value={selectedBinary.source.providerAuthority}
              />
            ) : null}
            <Button
              title="Replace Binary"
              variant="secondary"
              onPress={handlePickBinary}
              style={styles.replaceButton}
            />
          </View>
        ) : (
          <Button
            title="Pick Program Binary (.so)"
            variant="secondary"
            onPress={handlePickBinary}
            accessibilityLabel="Pick Program Binary button"
          />
        )}
      </Card>

      {/* Release Manifest Selection */}
      <Card>
        <Text style={styles.cardTitle}>2. Release Manifest (.json)</Text>
        {selectedManifest ? (
          <View style={styles.fileDetails}>
            <KeyValueRow
              label="File Name"
              value={selectedManifest.source.displayName || 'Unnamed file'}
            />
            <KeyValueRow
              label="Source Channel"
              value={
                <Badge
                  label={selectedManifest.source.channel}
                  variant={selectedManifest.source.channel === 'share' ? 'info' : 'neutral'}
                />
              }
            />
            {selectedManifest.source.size ? (
              <KeyValueRow
                label="Size"
                value={`${selectedManifest.source.size.toLocaleString()} bytes`}
              />
            ) : null}
            {selectedManifest.source.providerAuthority ? (
              <KeyValueRow
                label="Provider"
                value={selectedManifest.source.providerAuthority}
              />
            ) : null}
            <Button
              title="Replace Manifest"
              variant="secondary"
              onPress={handlePickManifest}
              style={styles.replaceButton}
            />
          </View>
        ) : (
          <Button
            title="Pick Release Manifest (.json)"
            variant="secondary"
            onPress={handlePickManifest}
            accessibilityLabel="Pick Release Manifest button"
          />
        )}
      </Card>

      {/* Error Message */}
      {errorMessage ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>Import Refused</Text>
          <Text style={styles.errorText} accessibilityLabel={errorMessage}>
            {errorMessage}
          </Text>
          {errorField ? (
            <Text style={styles.errorField}>
              Differing Field: <Text style={styles.bold}>{errorField}</Text>
            </Text>
          ) : null}
        </Card>
      ) : null}

      {/* Import Action */}
      <Button
        title="Import & Verify Release"
        variant="primary"
        onPress={handleImport}
        disabled={!selectedBinary || !selectedManifest}
        loading={importing}
        style={styles.importButton}
        accessibilityLabel="Import and Verify Release button"
      />
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
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  fileDetails: {
    marginTop: 4,
  },
  replaceButton: {
    marginTop: 10,
    minHeight: 38,
  },
  importButton: {
    marginTop: 16,
    minHeight: 50,
  },
  errorCard: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#b91c1c',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 14,
    color: '#b91c1c',
  },
  errorField: {
    fontSize: 13,
    color: '#7f1d1d',
    marginTop: 4,
  },
  bold: {
    fontWeight: '700',
  },
});
