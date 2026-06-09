import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/auth-context';
import { provisionBtcpayStore } from '@/lib/btcpay/provision-store';
import {
  storeStatusLabel,
  walletStoreStatusFromProfile,
} from '@/types/wallet-store';

// Phase 1: store provisioning + status only. Lightning / on-chain destination
// connection ships in a later phase — those actions are intentionally disabled.
export default function WalletScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const status = useMemo(
    () => walletStoreStatusFromProfile(profile),
    [profile],
  );

  const storeReady = status.storeProvisioningStatus === 'active' && !!status.btcpayStoreId;
  const isProvisioningState = status.storeProvisioningStatus === 'provisioning';
  const showCreateButton = !storeReady && !isProvisioningState;

  async function handleCreateStore() {
    if (isProvisioning) return;
    setIsProvisioning(true);
    setErrorMessage(null);

    const result = await provisionBtcpayStore();

    if (result.error) {
      setErrorMessage(result.error);
    }
    // Re-sync the profile so the Store status + Wallet row reflect the new state.
    await refreshProfile();
    setIsProvisioning(false);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}>
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Bitcoin Payment Setup</Text>
        <Text style={styles.subtitle}>
          Choose where your customer payments should settle.
        </Text>

        {/* Store */}
        <Section
          icon="storefront"
          title="Store"
          statusLabel={isProvisioning ? 'Creating store…' : storeStatusLabel(status)}
          statusTone={storeReady ? 'ready' : status.storeProvisioningStatus === 'failed' ? 'error' : 'neutral'}>
          {storeReady ? (
            <Text style={styles.readyText}>
              BTCPay store is ready.{'\n'}Next: connect a payment destination.
            </Text>
          ) : null}

          {showCreateButton ? (
            <Pressable
              onPress={handleCreateStore}
              disabled={isProvisioning}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || isProvisioning) && styles.primaryButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Create Bitcoin Store">
              {isProvisioning ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <Text style={styles.primaryButtonText}>Create Bitcoin Store</Text>
              )}
            </Pressable>
          ) : null}

          {isProvisioningState && !isProvisioning ? (
            <Text style={styles.hintText}>Your store is being created…</Text>
          ) : null}

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        </Section>

        {/* Lightning — Phase 2 */}
        <Section
          icon="bolt"
          title="Lightning"
          statusLabel="Not connected"
          statusTone="neutral">
          <DisabledAction label="Connect Strike" />
          <Text style={styles.comingSoon}>Coming soon</Text>
        </Section>

        {/* On-chain — Phase 2 */}
        <Section
          icon="link"
          title="On-chain Bitcoin"
          statusLabel="Not connected"
          statusTone="neutral">
          <DisabledAction label="Connect BTC Wallet" />
          <Text style={styles.comingSoon}>Coming soon</Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

type StatusTone = 'ready' | 'error' | 'neutral';

interface SectionProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  statusLabel: string;
  statusTone: StatusTone;
  children?: React.ReactNode;
}

function Section({ icon, title, statusLabel, statusTone, children }: SectionProps) {
  const toneColor =
    statusTone === 'ready'
      ? COLORS.primary
      : statusTone === 'error'
        ? ERROR_COLOR
        : COLORS.secondaryText;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <MaterialIcons name={icon} size={20} color={COLORS.primaryText} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={styles.statusLine}>
        Status: <Text style={[styles.statusValue, { color: toneColor }]}>{statusLabel}</Text>
      </Text>
      {children}
    </View>
  );
}

function DisabledAction({ label }: { label: string }) {
  return (
    <View
      style={styles.disabledButton}
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      accessibilityLabel={`${label} (coming soon)`}>
      <Text style={styles.disabledButtonText}>{label}</Text>
    </View>
  );
}

const ERROR_COLOR = '#F87171';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingRight: 14,
    paddingLeft: 4,
    borderRadius: 20,
  },
  backButtonPressed: {
    opacity: 0.6,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.primaryText,
    marginLeft: 2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 15,
    color: COLORS.secondaryText,
    lineHeight: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  statusLine: {
    fontSize: 14,
    color: COLORS.secondaryText,
  },
  statusValue: {
    fontWeight: '600',
  },
  readyText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.primaryText,
    lineHeight: 20,
  },
  hintText: {
    marginTop: 12,
    fontSize: 13,
    color: COLORS.secondaryText,
  },
  errorText: {
    marginTop: 12,
    fontSize: 13,
    color: ERROR_COLOR,
    lineHeight: 18,
  },
  primaryButton: {
    marginTop: 16,
    height: 50,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  disabledButton: {
    marginTop: 14,
    height: 46,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.mutedText,
  },
  comingSoon: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.mutedText,
    fontStyle: 'italic',
  },
});
