import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ActivityDegradedBanner } from '@/components/dashboard/activity-degraded-banner';
import { ActivityItemRow } from '@/components/dashboard/activity-item-row';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import {
  getActivityDegradedBannerCopy,
  groupActivityByMonth,
} from '@/lib/transactions/activity-utils';
import type { ActivityFeedEnrichment, ActivityItem } from '@/types/activity';

interface ActivityListProps {
  items: ActivityItem[];
  enrichment: ActivityFeedEnrichment;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  onItemPress: (item: ActivityItem) => void;
}

export function ActivityList({
  items,
  enrichment,
  loading,
  refreshing,
  error,
  onRefresh,
  onItemPress,
}: ActivityListProps) {
  const sections = groupActivityByMonth(items);
  const isEmpty = items.length === 0;
  const degradedCopy = getActivityDegradedBannerCopy(enrichment, items.length);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ActivityItemRow item={item} onPress={onItemPress} />}
      renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
      ListHeaderComponent={
        <View>
          <DashboardHeader />
          <View style={styles.titleRow}>
            <Text style={styles.pageTitle}>Activity</Text>
          </View>
          {degradedCopy ? (
            <ActivityDegradedBanner
              message={degradedCopy.message}
              onRetry={degradedCopy.showRetry ? onRefresh : undefined}
            />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <ActivityEmptyState
          loading={loading}
          error={error}
          onRetry={onRefresh}
        />
      }
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={isEmpty ? styles.emptyContentContainer : styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={DASHBOARD_COLORS.primaryText}
          colors={[DASHBOARD_COLORS.primaryText]}
        />
      }
    />
  );
}

interface ActivityEmptyStateProps {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function ActivityEmptyState({ loading, error, onRetry }: ActivityEmptyStateProps) {
  if (loading) {
    return (
      <View style={styles.stateContainer}>
        <ActivityIndicator color={DASHBOARD_COLORS.primaryText} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.stateContainer}>
        <Text style={styles.stateTitle}>Couldn’t load activity</Text>
        <Text style={styles.stateSubtitle}>{error}</Text>
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Retry loading activity">
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.stateContainer}>
      <Text style={styles.stateTitle}>No activity yet</Text>
      <Text style={styles.stateSubtitle}>
        Payments and invoices will appear here after customers pay.
      </Text>
    </View>
  );
}

interface SectionHeaderProps {
  title: string;
}

function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingBottom: 32,
  },
  emptyContentContainer: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  titleRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: DASHBOARD_COLORS.background,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
    gap: 10,
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
    textAlign: 'center',
  },
  stateSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: DASHBOARD_COLORS.secondaryText,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: DASHBOARD_COLORS.iconBackground,
  },
  retryLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  pressed: {
    opacity: 0.7,
  },
});
