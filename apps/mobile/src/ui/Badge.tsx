import { View, Text, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';

export interface BadgeProps {
  label: string;
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  style?: ViewStyle;
}

export function Badge({ label, variant = 'neutral', style }: BadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        variant === 'neutral' && styles.neutralBadge,
        variant === 'success' && styles.successBadge,
        variant === 'warning' && styles.warningBadge,
        variant === 'danger' && styles.dangerBadge,
        variant === 'info' && styles.infoBadge,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          variant === 'neutral' && styles.neutralText,
          variant === 'success' && styles.successText,
          variant === 'warning' && styles.warningText,
          variant === 'danger' && styles.dangerText,
          variant === 'info' && styles.infoText,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  neutralBadge: {
    backgroundColor: '#f3f4f6',
  },
  neutralText: {
    color: '#374151',
  },
  successBadge: {
    backgroundColor: '#dcfce7',
  },
  successText: {
    color: '#15803d',
  },
  warningBadge: {
    backgroundColor: '#fef9c3',
  },
  warningText: {
    color: '#a16207',
  },
  dangerBadge: {
    backgroundColor: '#fee2e2',
  },
  dangerText: {
    color: '#b91c1c',
  },
  infoBadge: {
    backgroundColor: '#e0f2fe',
  },
  infoText: {
    color: '#0369a1',
  },
});
