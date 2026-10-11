import { View, Text, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  style?: ViewStyle;
}

export function Header({ title, subtitle, style }: HeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
});
