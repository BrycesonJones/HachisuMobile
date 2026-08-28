import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/auth-context';
import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import { resolvePostAuthRoute } from '@/lib/auth/onboarding-routing';

export default function LandingScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading, profile } = useAuth();
  const isFocused = useIsFocused();

  useEffect(() => {
    // Only route away while this screen is the one being shown. Business
    // sign-up verifies the email last, so the session appears while the user is
    // still on the confirmation screen committing their answers — redirecting
    // from underneath it would pull them off mid-commit and hide any failure.
    // Every screen that authenticates routes itself.
    if (!isFocused || isLoading || !isAuthenticated) return;
    router.replace(resolvePostAuthRoute(profile));
  }, [isAuthenticated, isFocused, isLoading, profile, router]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.primaryText} />
      </SafeAreaView>
    );
  }

  if (isAuthenticated) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.primaryText} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.brandArea}>
        <View style={styles.brandMark}>
          <Text style={styles.brandName}>HACHISU</Text>
          <View style={styles.brandAccent} />
        </View>
      </View>

      <View style={styles.copyArea}>
        <Text style={styles.headline}>accept Bitcoin instantly</Text>
        <Text style={styles.supporting}>
          Ultra-low fees, high payment limits, industry grade security, available and transparent support.
        </Text>
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          onPress={() => router.push('/auth/login')}
          style={({ pressed }) => [styles.button, styles.loginButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Log in">
          <Text style={styles.loginButtonText}>Log in</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/auth/choose-account-type')}
          style={({ pressed }) => [
            styles.button,
            styles.signUpButton,
            pressed && styles.signUpButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Join">
          <Text style={styles.signUpButtonText}>Join</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
  },
  brandArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMark: {
    alignItems: 'center',
    gap: 12,
  },
  brandName: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 4,
    color: COLORS.primaryText,
  },
  brandAccent: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  copyArea: {
    paddingBottom: 32,
    gap: 12,
  },
  headline: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.primaryText,
    textAlign: 'center',
  },
  supporting: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButton: {
    backgroundColor: COLORS.darkButton,
  },
  signUpButton: {
    backgroundColor: COLORS.cream,
  },
  signUpButtonPressed: {
    backgroundColor: COLORS.primaryLight,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  signUpButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: HachisuColors.black,
  },
  pressed: {
    opacity: 0.8,
  },
});
