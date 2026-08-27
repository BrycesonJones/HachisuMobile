import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StatusBar, StyleSheet, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/auth/primary-button';
import { useSendFlow } from '@/components/wallet/send-flow-context';
import { COLORS } from '@/constants/colors';

interface SendScreenScaffoldProps {
  /** Centered header title. */
  title: string;
  children: ReactNode;
  /** 'close' shows an X (used by the scanner), 'back' a chevron. */
  leadingAction?: 'back' | 'close';
  /**
   * Blocks the screen when the active store changed mid-flow, so a send can
   * never continue against a different store's wallet. The success screen opts
   * out — its transaction already happened.
   */
  guardStoreMismatch?: boolean;
}

/**
 * Shared dark scaffold for the Send Bitcoin screens: safe area, back/close
 * header, and the store-switch guard.
 */
export function SendScreenScaffold({
  title,
  children,
  leadingAction = 'back',
  guardStoreMismatch = true,
}: SendScreenScaffoldProps) {
  const router = useRouter();
  const { storeMismatch, storeName, reset } = useSendFlow();

  const blocked = guardStoreMismatch && storeMismatch;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={leadingAction === 'close' ? 'Close' : 'Go back'}
          hitSlop={8}>
          <MaterialIcons
            name={leadingAction === 'close' ? 'close' : 'chevron-left'}
            size={24}
            color={COLORS.primaryText}
          />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {blocked ? (
        <View style={styles.guardBody}>
          <MaterialIcons name="storefront" size={32} color={COLORS.secondaryText} />
          <Text style={styles.guardTitle}>Store changed</Text>
          <Text style={styles.guardText}>
            This send was started for {storeName ?? 'another store'}, but a different
            store is now active. Nothing was sent. Start again from the dashboard.
          </Text>
          <View style={styles.guardButton}>
            <PrimaryButton
              label="Back to dashboard"
              onPress={() => {
                reset();
                router.dismissTo('/(tabs)/home');
              }}
            />
          </View>
        </View>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  guardBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  guardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  guardText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: COLORS.secondaryText,
  },
  guardButton: {
    alignSelf: 'stretch',
    marginTop: 12,
  },
});
