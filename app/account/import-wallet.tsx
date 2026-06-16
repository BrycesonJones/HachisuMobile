import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/auth/back-button';
import { COLORS } from '@/constants/colors';

export default function ImportWalletScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <BackButton />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Choose your import method</Text>
        <Text style={styles.subtitle}>
          The following methods assume that you already have an existing wallet created and
          backed up.
        </Text>

        <MethodRow
          icon="vpn-key"
          title="Enter extended public key"
          subtitle="Input the key string manually"
          onPress={() => router.push('/account/import-xpub')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

interface MethodRowProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}

function MethodRow({ icon, title, subtitle, onPress }: MethodRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <MaterialIcons name={icon} size={24} color={COLORS.primaryText} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color={COLORS.secondaryText} />
    </Pressable>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    padding: 16,
    marginBottom: 14,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: COLORS.secondaryText,
  },
});
