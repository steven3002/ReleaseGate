import { View, Text, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

export interface KeyValueRowProps {
  label: string;
  value: ReactNode;
  style?: ViewStyle;
}

export function KeyValueRow({ label, value, style }: KeyValueRowProps) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueContainer}>
        {typeof value === 'string' ? (
          <Text style={styles.valueText}>{value}</Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  label: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
  },
  valueContainer: {
    flex: 2,
    alignItems: 'flex-end',
  },
  valueText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
    textAlign: 'right',
  },
});
