import { StyleSheet, View } from 'react-native';

import { BackButton } from '@/components/auth/back-button';
import { CloseButton } from '@/components/auth/close-button';
import { ProgressIndicator } from '@/components/auth/progress-indicator';

interface AuthProgressHeaderProps {
  variant?: 'back' | 'close';
  onClosePress?: () => void;
  totalSteps?: number;
  activeIndex?: number;
  showProgress?: boolean;
}

export function AuthProgressHeader({
  variant = 'back',
  onClosePress,
  totalSteps = 3,
  activeIndex = 0,
  showProgress = true,
}: AuthProgressHeaderProps) {
  return (
    <View style={styles.header}>
      {variant === 'close' ? <CloseButton onPress={onClosePress} /> : <BackButton />}
      {showProgress && (
        <View style={styles.progressArea}>
          <ProgressIndicator totalSteps={totalSteps} activeIndex={activeIndex} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 8,
    paddingBottom: 24,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  progressArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
