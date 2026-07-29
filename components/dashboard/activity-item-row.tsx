import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import {
  formatActivityAmount,
  formatActivityListDate,
  isItemEnrichmentDegraded,
  isMutedActivity,
} from '@/lib/transactions/activity-utils';
import type { ActivityItem } from '@/types/activity';

interface ActivityItemRowProps {
  item: ActivityItem;
  onPress: (item: ActivityItem) => void;
}

export function ActivityItemRow({ item, onPress }: ActivityItemRowProps) {
  const muted = isMutedActivity(item.status);
  const amount = formatActivityAmount(item.amount, item.currency);
  const dateLabel = formatActivityListDate(item.createdAt);
  const degraded = isItemEnrichmentDegraded(item);

  function handlePress() {
    onPress(item);
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={
        `${item.title}, ${amount}, ${item.displayStatus}` +
        (degraded ? ', some payment details unavailable' : '')
      }>
      <ActivityAvatar item={item} muted={muted} />

      <View style={styles.content}>
        <Text style={[styles.title, muted && styles.mutedText]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.subtitle, muted && styles.mutedText]} numberOfLines={1}>
          {item.description ?? item.displayStatus}
        </Text>
        <Text style={[styles.dateLine, muted && styles.mutedText]} numberOfLines={1}>
          {dateLabel} · {item.displayStatus}
        </Text>
        {degraded ? (
          <Text style={styles.degradedMarker} numberOfLines={1}>
            Some details unavailable
          </Text>
        ) : null}
      </View>

      <Text style={[styles.amount, muted && styles.mutedAmount]}>{amount}</Text>
    </Pressable>
  );
}

interface ActivityAvatarProps {
  item: ActivityItem;
  muted: boolean;
}

function ActivityAvatar({ item, muted }: ActivityAvatarProps) {
  const icon = item.paymentRail === 'lightning' ? 'bolt' : 'currency-bitcoin';
  return (
    <View style={[styles.avatar, muted ? styles.mutedAvatar : styles.bitcoinAvatar]}>
      <MaterialIcons name={icon} size={22} color={HachisuColors.white} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 14,
  },
  pressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bitcoinAvatar: {
    backgroundColor: DASHBOARD_COLORS.bitcoinOrange,
  },
  mutedAvatar: {
    backgroundColor: DASHBOARD_COLORS.iconBackground,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  subtitle: {
    fontSize: 15,
    color: DASHBOARD_COLORS.secondaryText,
  },
  dateLine: {
    fontSize: 14,
    color: DASHBOARD_COLORS.secondaryText,
  },
  degradedMarker: {
    fontSize: 13,
    color: DASHBOARD_COLORS.warningText,
  },
  amount: {
    fontSize: 17,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
    minWidth: 72,
    textAlign: 'right',
  },
  mutedText: {
    color: DASHBOARD_COLORS.mutedText,
  },
  mutedAmount: {
    color: DASHBOARD_COLORS.failedText,
  },
});
