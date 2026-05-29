import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/auth-context';
import { formatPhoneDisplay } from '@/contexts/profile-extras-context';

export default function PersonalProfileScreen() {
  const router = useRouter();
  const { profile, user } = useAuth();

  const email = profile?.email?.trim() || user?.email?.trim() || '';
  const formattedPhone = profile?.phone ? formatPhoneDisplay(profile.phone) : '';
  const fullName = profile?.full_name?.trim() ?? '';
  const personalAddress = profile?.personal_address?.trim() ?? '';
  const country = profile?.country?.trim() ?? '';
  const addressLines = [fullName, personalAddress, country].filter(Boolean);

  function handleBack() {
    router.back();
  }

  function handleEditPhone() {
    router.push('/account/edit-phone' as never);
  }

  function handleEditNameAddress() {
    router.push('/account/edit-name-address' as never);
  }

  function handleCloseAccount() {
    // TODO: wire to real close-account confirmation flow.
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
        </Pressable>
        <Text style={styles.title}>Personal information</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.card}>
        <InfoRow
          label="Email"
          value={email || 'Add email'}
          isMuted={!email}
        />

        <Divider />

        <InfoRow
          label="Phone number"
          value={formattedPhone || 'Add phone number'}
          isMuted={!formattedPhone}
          onEditPress={handleEditPhone}
          editAccessibilityLabel="Edit phone number"
        />

        <Divider />

        <InfoRow
          label="Name & address"
          value={addressLines.length > 0 ? addressLines : 'Add name and address'}
          isMuted={addressLines.length === 0}
          onEditPress={handleEditNameAddress}
          editAccessibilityLabel="Edit name and address"
        />

        <View style={styles.closeAccountWrapper}>
          <Pressable
            onPress={handleCloseAccount}
            style={({ pressed }) => [styles.closeAccountButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Close account">
            <Text style={styles.closeAccountText}>Close account</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

interface InfoRowProps {
  label: string;
  value: string | readonly string[];
  isMuted?: boolean;
  onEditPress?: () => void;
  editAccessibilityLabel?: string;
}

function InfoRow({
  label,
  value,
  isMuted = false,
  onEditPress,
  editAccessibilityLabel,
}: InfoRowProps) {
  const lines = Array.isArray(value) ? value : [value];

  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {lines.map((line, index) => (
          <Text
            key={`${label}-${index}`}
            style={[styles.rowValue, isMuted && styles.rowValueMuted]}>
            {line}
          </Text>
        ))}
      </View>

      {onEditPress ? (
        <Pressable
          onPress={onEditPress}
          style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={editAccessibilityLabel ?? `Edit ${label}`}
          hitSlop={8}>
          <MaterialIcons name="edit" size={16} color={COLORS.primaryText} />
        </Pressable>
      ) : null}
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
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.cardBorder,
    marginHorizontal: -2,
  },
  closeAccountWrapper: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  closeAccountButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  closeAccountText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.primaryText,
  },
  pressed: {
    opacity: 0.7,
  },
});
