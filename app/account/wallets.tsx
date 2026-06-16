import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/auth/back-button';
import { COLORS } from '@/constants/colors';

export default function WalletsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <BackButton />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Wallets</Text>
        <Text style={styles.subtitle}>
          Connect where your customer payments should settle.
        </Text>

        {/* On-chain */}
        <WalletSection
          icon="link"
          title="On-chain Bitcoin"
          actions={[
            {
              label: 'Connect an existing wallet',
              onPress: () => router.push('/account/import-wallet'),
            },
          ]}
        />

        {/* Lightning */}
        <WalletSection
          icon="bolt"
          title="Lightning"
          actions={[
            { label: 'Import a wallet', onPress: () => router.push('/account/import-lbtc-wallet') },
            { label: 'Connect Strike plugin' },
          ]}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

interface WalletAction {
  label: string;
  /** When omitted, the action renders disabled with a "Coming soon" caption. */
  onPress?: () => void;
}

interface WalletSectionProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  actions: WalletAction[];
}

function WalletSection({ icon, title, actions }: WalletSectionProps) {
  const hasComingSoon = actions.some((action) => !action.onPress);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <MaterialIcons name={icon} size={20} color={COLORS.primaryText} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={styles.statusLine}>
        Status: <Text style={styles.statusValue}>Not connected</Text>
      </Text>
      {actions.map((action) =>
        action.onPress ? (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            style={({ pressed }) => [styles.connectButton, pressed && styles.connectButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={action.label}>
            <Text style={styles.connectButtonText}>{action.label}</Text>
          </Pressable>
        ) : (
          <View
            key={action.label}
            style={styles.disabledButton}
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            accessibilityLabel={`${action.label} (coming soon)`}>
            <Text style={styles.disabledButtonText}>{action.label}</Text>
          </View>
        ),
      )}
      {hasComingSoon ? <Text style={styles.comingSoon}>Coming soon</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
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
    color: COLORS.secondaryText,
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
  connectButton: {
    marginTop: 14,
    height: 46,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectButtonPressed: {
    opacity: 0.7,
  },
  connectButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.primaryText,
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
