import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';

export interface AccountListItem {
  id: string;
  label: string;
  onPress?: () => void;
}

interface AccountListScreenProps {
  title: string;
  items: readonly AccountListItem[];
}

export function AccountListScreen({ title, items }: AccountListScreenProps) {
  const router = useRouter();

  function handleBack() {
    router.back();
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
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.card}>
        {items.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <ListRow item={item} />
          </Fragment>
        ))}
      </View>
    </SafeAreaView>
  );
}

interface ListRowProps {
  item: AccountListItem;
}

function ListRow({ item }: ListRowProps) {
  return (
    <Pressable
      onPress={item.onPress}
      disabled={!item.onPress}
      style={({ pressed }) => [styles.row, pressed && item.onPress && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={item.label}>
      <Text style={styles.rowLabel}>{item.label}</Text>
      <MaterialIcons name="chevron-right" size={20} color={COLORS.secondaryText} />
    </Pressable>
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
  card: {
    marginHorizontal: 16,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    gap: 12,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.primaryText,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.cardBorder,
  },
  pressed: {
    opacity: 0.7,
  },
});
