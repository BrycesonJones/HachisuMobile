import { StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/auth/back-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { COLORS } from '@/constants/colors';

// TODO: authenticated session, dashboard routing, and auth guards

export default function LoginSuccessPlaceholderScreen() {
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <BackButton />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Login flow coming next</Text>
        <Text style={styles.subtitle}>
          Session creation and the authenticated dashboard will be added in a future
          update.
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
