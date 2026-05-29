import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/auth-context';

export default function BusinessProfileScreen() {
  const router = useRouter();
  const { profile, user } = useAuth();

  const email = profile?.email?.trim() || user?.email?.trim() || '';
  const businessName = profile?.business_name?.trim() ?? '';
  const businessAddress = profile?.business_address?.trim() ?? '';
  const businessWebsite = profile?.business_website?.trim() ?? '';
  const businessCountry = profile?.business_country?.trim() ?? '';
  const businessDescription = profile?.business_description?.trim() ?? '';
  const expectedMonthlyVolume = profile?.expected_monthly_volume?.trim() ?? '';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
        </Pressable>
        <Text style={styles.title}>Business information</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.card}>
        <InfoRow label="Email" value={email || 'Add email'} isMuted={!email} />
        <Divider />
        <InfoRow
          label="Business name"
          value={businessName || 'Add business name'}
          isMuted={!businessName}
        />
        <Divider />
        <InfoRow
          label="Business address"
          value={businessAddress || 'Add business address'}
          isMuted={!businessAddress}
        />
        <Divider />
        <InfoRow
          label="Business website"
          value={businessWebsite || 'Not provided'}
          isMuted={!businessWebsite}
        />
        <Divider />
        <InfoRow
          label="Country"
          value={businessCountry || 'Not provided'}
          isMuted={!businessCountry}
        />
        <Divider />
        <InfoRow
          label="What does your business do?"
          value={businessDescription || 'Add description'}
          isMuted={!businessDescription}
        />
        <Divider />
        <InfoRow
          label="Expected monthly volume"
          value={expectedMonthlyVolume || 'Not provided'}
          isMuted={!expectedMonthlyVolume}
        />
      </View>
    </SafeAreaView>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  isMuted?: boolean;
}

function InfoRow({ label, value, isMuted = false }: InfoRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, isMuted && styles.rowValueMuted]}>{value}</Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
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
  card: {
    marginHorizontal: 16,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginBottom: 4,
  },
  rowValue: {
    fontSize: 14,
    color: COLORS.secondaryText,
    lineHeight: 20,
  },
  rowValueMuted: {
    color: COLORS.mutedText,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.cardBorder,
    marginHorizontal: -2,
  },
  pressed: {
    opacity: 0.7,
  },
});
