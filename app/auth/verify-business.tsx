import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AuthProgressHeader } from '@/components/auth/auth-progress-header';
import { AuthTitleBlock } from '@/components/auth/auth-title-block';
import { PrimaryButton } from '@/components/auth/primary-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { VerificationInfoCard } from '@/components/auth/verification-info-card';

const BUSINESS_VERIFICATION_ROWS = [
  {
    icon: 'person-outline' as const,
    text: "Basic information like your company's name, address, and EIN",
  },
  {
    icon: 'badge' as const,
    text: 'Tax, banking, and other relevant documentation',
  },
  {
    icon: 'description' as const,
    text: 'Identities of the owners and operators',
  },
];

export default function VerifyBusinessScreen() {
  const router = useRouter();

  function handleLetsGo() {
    router.push('/auth/company-verification-info');
  }

  return (
    <ScreenContainer style={styles.container}>
      <AuthProgressHeader
        variant="close"
        showProgress={false}
        fallback="/auth/push-notifications"
      />

      <AuthTitleBlock
        title="Verify your business"
        subtitle="To complete your account setup, we need to verify some information"
        centered
      />

      <VerificationInfoCard rows={BUSINESS_VERIFICATION_ROWS} />

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
