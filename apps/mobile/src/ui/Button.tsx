import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { ViewStyle, TextStyle } from 'react-native';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
  accessibilityLabel,
}: ButtonProps) {
  const isActionDisabled = disabled || loading;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: isActionDisabled }}
      onPress={onPress}
      disabled={isActionDisabled}
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        isActionDisabled && styles.disabled,
        style,
      ]}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'secondary' ? '#111827' : '#ffffff'}
        />
      ) : (
        <Text
          style={[
            styles.text,
            variant === 'primary' && styles.primaryText,
            variant === 'secondary' && styles.secondaryText,
            variant === 'danger' && styles.dangerText,
            isActionDisabled && styles.disabledText,
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primary: {
    backgroundColor: '#1f2937',
  },
  secondary: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  danger: {
    backgroundColor: '#dc2626',
  },
  disabled: {
    backgroundColor: '#e5e7eb',
    borderColor: '#e5e7eb',
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
  },
  primaryText: {
    color: '#ffffff',
  },
  secondaryText: {
    color: '#111827',
  },
  dangerText: {
    color: '#ffffff',
  },
  disabledText: {
    color: '#9ca3af',
  },
});
