import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ActivityItemRow } from '@/components/dashboard/activity-item-row';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { ExportReportButton } from '@/components/dashboard/export-report-button';
import { ListLoadMoreFooter } from '@/components/dashboard/list-load-more-footer';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { groupActivityByMonth } from '@/lib/transactions/activity-utils';
import type { StoreActivityEvent } from '@/types/activity';

interface ActivityListProps {
  events: StoreActivityEvent[];
  merchantStoreId: string | null;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onRefresh: () => void;
  onLoadMore: () => void;
  onItemPress: (event: StoreActivityEvent) => void;
}

export function ActivityList({
  events,
  merchantStoreId,
  loading,
  refreshing,
  loadingMore,
  hasMore,
  error,
  onRefresh,
  onLoadMore,
  onItemPress,
}: ActivityListProps) {
  const sections = groupActivityByMonth(events);
  const isEmpty = events.length === 0;
  // An error with rows already on screen belongs to the tail (a failed
  // load-more), so it is shown in the footer instead of replacing the list.
  const listError = isEmpty ? error : null;
  const footerError = isEmpty ? null : error;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(event) => event.id}
      renderItem={({ item }) => <ActivityItemRow event={item} onPress={onItemPress} />}
      renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
      ListHeaderComponent={
        <View>
          <DashboardHeader />
          <View style={styles.titleRow}>
            <Text style={styles.pageTitle}>Activity</Text>
            <ExportReportButton merchantStoreId={merchantStoreId} />
          </View>
        </View>
      }
      ListEmptyComponent={
        <ActivityEmptyState loading={loading} error={listError} onRetry={onRefresh} />
      }
      ListFooterComponent={
        <ListLoadMoreFooter
          hasMore={hasMore}
          loadingMore={loadingMore}
          error={footerError}
          itemCount={events.length}
          label="activity"
          onLoadMore={onLoadMore}
        />
      }
      onEndReached={hasMore && !loadingMore && !refreshing ? onLoadMore : undefined}
      onEndReachedThreshold={0.5}
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

  // A failure is never rendered as "no activity" — the merchant must be able to
  // tell an empty store from data that could not be loaded.
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
      <Text style={styles.stateTitle}>No payments yet</Text>
      <Text style={styles.stateSubtitle}>
        Payments appear here once a customer pays one of your invoices.
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
