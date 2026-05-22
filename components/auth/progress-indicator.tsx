import { StyleSheet, View } from 'react-native';

import { COLORS } from '@/constants/colors';

interface ProgressIndicatorProps {
  totalSteps?: number;
  activeIndex?: number;
}

export function ProgressIndicator({ totalSteps = 3, activeIndex = 0 }: ProgressIndicatorProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }, (_, index) => (
        <View
          key={index}
          style={[styles.pill, index <= activeIndex ? styles.active : styles.inactive]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    width: 28,
    height: 4,
    borderRadius: 2,
  },
  active: {
    backgroundColor: COLORS.orange,
  },
  inactive: {
    backgroundColor: COLORS.progressInactive,
  },
});
