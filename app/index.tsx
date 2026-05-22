import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';

export default function LandingScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.brandArea}>
        <View style={styles.brandMark}>
          <Text style={styles.brandName}>HACHISU</Text>
          <View style={styles.brandAccent} />
        </View>
      </View>

      <View style={styles.copyArea}>
        <Text style={styles.headline}>Accept bitcoin instantly</Text>
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
          style={({ pressed }) => [styles.button, styles.signUpButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Sign up">
          <Text style={styles.signUpButtonText}>Sign up</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: COLORS.orange,
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
    backgroundColor: COLORS.whiteButton,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  signUpButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  pressed: {
    opacity: 0.8,
  },
});
