import { StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/auth/back-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { COLORS } from '@/constants/colors';

// TODO: integrate ID upload, selfie verification, and KYC provider flow

export default function IdentityVerificationPlaceholderScreen() {
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <BackButton />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Identity verification coming next</Text>
        <Text style={styles.subtitle}>
          Government ID upload, selfie verification, and KYC provider integration will be
          added in a future step.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  content: {
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.secondaryText,
  },
});
