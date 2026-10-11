import { View, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';

export type StatusType = 'pass' | 'fail' | 'notice' | 'unknown';

export interface StatusIndicatorProps {
  status: StatusType;
  size?: number;
  style?: ViewStyle;
}

export function StatusIndicator({
  status,
  size = 10,
  style,
}: StatusIndicatorProps) {
  const getBackgroundColor = () => {
    switch (status) {
      case 'pass':
        return '#16a34a'; // green
      case 'fail':
        return '#dc2626'; // red
      case 'notice':
        return '#ca8a04'; // yellow
      case 'unknown':
      default:
        return '#9ca3af'; // gray
    }
  };

  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: getBackgroundColor(),
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    marginRight: 6,
  },
});
