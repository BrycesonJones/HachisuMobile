import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';

export interface SwitchSettingsRow {
  id: string;
  label: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export interface SwitchSettingsSection {
  id: string;
  title: string;
  rows: readonly SwitchSettingsRow[];
}

interface SwitchSettingsScreenProps {
  title: string;
  sections: readonly SwitchSettingsSection[];
}

/** Account settings screen made of titled sections of rounded cards with
 * label/subtitle/toggle rows. Mirrors AccountListScreen's header and card
 * styling so the Account area stays visually consistent. */
export function SwitchSettingsScreen({ title, sections }: SwitchSettingsScreenProps) {
  const router = useRouter();

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
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.card}>
              {section.rows.map((row, index) => (
                <Fragment key={row.id}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <ToggleRow row={row} />
                </Fragment>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({ row }: { row: SwitchSettingsRow }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{row.label}</Text>
        <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
      </View>
      <Switch
        value={row.value}
        onValueChange={row.onValueChange}
        disabled={row.disabled}
        trackColor={{ false: COLORS.cardBorder, true: COLORS.primary }}
        thumbColor={HachisuColors.white}
        ios_backgroundColor={COLORS.cardBorder}
        accessibilityLabel={row.label}
      />
    </View>
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  section: {
    marginTop: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primaryText,
    marginBottom: 14,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    gap: 16,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.primaryText,
  },
  rowSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: COLORS.secondaryText,
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.cardBorder,
  },
  pressed: {
    opacity: 0.7,
  },
});
