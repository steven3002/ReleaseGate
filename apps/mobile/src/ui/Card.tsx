import { View, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

export interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
}

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
});
