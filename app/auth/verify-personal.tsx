import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AuthProgressHeader } from '@/components/auth/auth-progress-header';
import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { VerificationInfoCard } from '@/components/auth/verification-info-card';

const PERSONAL_VERIFICATION_ROWS = [
  {
    icon: 'person-outline' as const,
    text: 'Basic information like your legal name, date of birth, and address',
  },
  {
    icon: 'badge' as const,
    text: 'Government ID or other identity documentation',
  },
  {
    icon: 'verified-user' as const,
    text: 'A quick identity check to help protect your account',
  },
];

export default function VerifyPersonalScreen() {
  const router = useRouter();

  function handleLetsGo() {
    router.push('/auth/personal-verification-info');
  }

  return (
    <ScreenContainer style={styles.container}>
      <AuthProgressHeader variant="close" showProgress={false} />

      <AuthTitleBlock
        title="Verify your personal account"
        subtitle="To complete your account setup, we need to verify some information"
        centered
      />

      <VerificationInfoCard rows={PERSONAL_VERIFICATION_ROWS} />

      <View style={styles.buttonArea}>
        <PrimaryButton label="Let's go" onPress={handleLetsGo} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  buttonArea: {
    marginTop: 'auto',
    paddingBottom: 16,
  },
});
