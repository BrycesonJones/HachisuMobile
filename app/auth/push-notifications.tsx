import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { BackButton } from '@/components/auth/back-button';
import { NotificationPreview } from '@/components/auth/notification-preview';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ProgressIndicator } from '@/components/auth/progress-indicator';
import { ScreenContainer } from '@/components/auth/screen-container';
import { SecondaryButton } from '@/components/auth/secondary-button';
import {
  BUSINESS_ONBOARDING_PROGRESS,
  BUSINESS_ONBOARDING_STEP_COUNT,
} from '@/constants/business-onboarding-progress';
import {
  PERSONAL_ONBOARDING_PROGRESS,
  PERSONAL_ONBOARDING_STEP_COUNT,
} from '@/constants/personal-onboarding-progress';

export default function PushNotificationScreen() {
  const router = useRouter();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const isPersonalFlow = flow === 'personal';

  function handleSkip() {
    if (isPersonalFlow) {
      router.push('/auth/personal-two-factor');
      return;
    }
    router.push('/auth/verify-business');
  }

  async function handleEnable() {
    // TODO: request push notification permissions via expo-notifications when configured
    if (isPersonalFlow) {
      router.push('/auth/personal-two-factor');
      return;
    }
    router.push('/auth/verify-business');
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <BackButton
          fallback={{
            pathname: '/auth/choose-username',
            params: isPersonalFlow ? { flow: 'personal' } : {},
          }}
        />
        <View style={styles.progressArea}>
          <ProgressIndicator
            totalSteps={
              isPersonalFlow ? PERSONAL_ONBOARDING_STEP_COUNT : BUSINESS_ONBOARDING_STEP_COUNT
            }
            activeIndex={
              isPersonalFlow
                ? PERSONAL_ONBOARDING_PROGRESS.pushNotifications
                : BUSINESS_ONBOARDING_PROGRESS.pushNotifications
            }
          />
        </View>
      </View>

      <AuthTitleBlock
        title="Stay in the loop"
        subtitle="Get notified about transactions, the bitcoin price, new features, and special promotions"
        centered
      />

      <View style={styles.previewArea}>
        <NotificationPreview />
      </View>

      <View style={styles.buttonRow}>
        <SecondaryButton label="Skip" onPress={handleSkip} />
        <View style={styles.enableButton}>
          <PrimaryButton label="Enable" onPress={handleEnable} />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  previewArea: {
    flex: 1,
    justifyContent: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 16,
  },
  enableButton: {
    flex: 1,
  },
});
