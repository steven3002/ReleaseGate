import { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
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
  const [expanded, setExpanded] = useState<boolean>(!truncate);

  if (!address) {
    return <Text style={[styles.mono, style]}>—</Text>;
  }

  const isLong = address.length > chars * 2 + 3;
  const displayText =
    !expanded && truncate && isLong
      ? `${address.slice(0, chars)}...${address.slice(-chars)}`
      : address;

  if (truncate && isLong) {
    return (
      <TouchableOpacity
        onPress={() => setExpanded(prev => !prev)}
        activeOpacity={0.7}
      >
        <Text
          style={[styles.mono, style]}
          numberOfLines={expanded ? undefined : 1}
          ellipsizeMode={expanded ? undefined : 'middle'}
          selectable={true}
          accessibilityLabel={address}
        >
          {displayText}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <Text
      style={[styles.mono, style]}
      selectable={true}
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

