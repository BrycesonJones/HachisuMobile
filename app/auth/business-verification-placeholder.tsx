import { StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/auth/back-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { COLORS } from '@/constants/colors';

// TODO: document upload, owner information, and KYB provider flow

export default function BusinessVerificationPlaceholderScreen() {
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <BackButton />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Business verification coming next</Text>
        <Text style={styles.subtitle}>
          Document upload, owner and operator verification, and KYB provider integration
          will be added in a future step.
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
