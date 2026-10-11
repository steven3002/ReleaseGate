import { Text, StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';

export interface AddressTextProps {
  address: string;
  truncate?: boolean;
  chars?: number;
  style?: TextStyle;
}

export function AddressText({
  address,
  truncate = true,
  chars = 4,
  style,
}: AddressTextProps) {
  if (!address) {
    return <Text style={[styles.mono, style]}>—</Text>;
  }

  const displayText =
    truncate && address.length > chars * 2 + 3
      ? `${address.slice(0, chars)}...${address.slice(-chars)}`
      : address;

  return (
    <Text
      style={[styles.mono, style]}
      numberOfLines={1}
      ellipsizeMode="middle"
      accessibilityLabel={address}
    >
      {displayText}
    </Text>
  );
}

const styles = StyleSheet.create({
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#1f2937',
  },
});
