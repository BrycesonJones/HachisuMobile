import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AuthProgressHeader } from '@/components/auth/auth-progress-header';
import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { SecondaryButton } from '@/components/auth/secondary-button';
import { SecurityVisual } from '@/components/auth/security-visual';
import {
  PERSONAL_ONBOARDING_PROGRESS,
  PERSONAL_ONBOARDING_STEP_COUNT,
} from '@/constants/personal-onboarding-progress';

export default function PersonalTwoFactorScreen() {
  const router = useRouter();

  function handleSkip() {
    router.push('/auth/personal-country');
  }

  function handleEnable() {
    // TODO: implement authenticator app or passkey setup
    router.push('/auth/personal-country');
  }

  return (
    <ScreenContainer style={styles.container}>
      <AuthProgressHeader
        variant="close"
        totalSteps={PERSONAL_ONBOARDING_STEP_COUNT}
        activeIndex={PERSONAL_ONBOARDING_PROGRESS.twoFactor}
      />

      <AuthTitleBlock
        title="Set up 2-factor authentication"
        subtitle="Enhance security with 2FA for login with an authenticator app or a passkey."
        centered
      />

      <View style={styles.visualArea}>
        <SecurityVisual />
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
  visualArea: {
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
