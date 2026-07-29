import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CloseButton } from '@/components/auth/close-button';
import { ActivityDetailView } from '@/components/dashboard/activity-detail-view';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { useAuth } from '@/contexts/auth-context';
import { useActivityDetail } from '@/hooks/use-activity-detail';
import { ACTIVITY_ROUTE } from '@/lib/auth/onboarding-routing';
import type { ActivityDetailErrorCode } from '@/types/activity';

/**
 * Durable Activity DETAIL screen.
 *
 * The route carries stable identifiers (merchantStoreId + invoiceId) so a payment
 * detail is recoverable from the backend after an app restart, a bundle reload, a
 * deep link, or a cleared in-memory cache — the screen never depends on the
 * Activity LIST having been visited first, and it NEVER silently navigates back
 * because a cached record is missing. Every outcome renders an explicit state.
 *
 * The fetch is bound to the ROUTE's merchantStoreId, so switching the globally
 * active store while this screen is open never changes what is shown.
 */
export default function ActivityDetailsScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const params = useLocalSearchParams<{
    merchantStoreId?: string;
    invoiceId?: string;
    source?: string;
  }>();

  const merchantStoreId = normalizeParam(params.merchantStoreId);
  const invoiceId = normalizeParam(params.invoiceId);
  const paramsValid = merchantStoreId != null && invoiceId != null;

  // Only issue the fetch once authenticated with well-formed params; otherwise the
  // hook stays idle and the screen renders the auth/invalid-route state instead.
  const enabled = isAuthenticated && paramsValid;
  const { item, isLoading, error, refetch } = useActivityDetail(
    enabled ? merchantStoreId : null,
    enabled ? invoiceId : null,
  );

  // Deep links and cold starts may have no useful back history — fall back to the
  // Activity route deterministically rather than trusting router.back().
  const returnToActivity = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(ACTIVITY_ROUTE);
  }, [router]);

  // --- Auth gate. Never reveal whether a private invoice exists before auth. ---
  if (authLoading) {
    return <LoadingState />;
  }
  if (!isAuthenticated) {
    return <Redirect href="/auth/login" />;
  }

  // --- Invalid route: do NOT make a backend request with malformed identifiers. ---
  if (!paramsValid) {
    return (
      <DetailMessageState
        title="Payment details unavailable"
        subtitle="This link is incomplete or invalid."
        onReturn={returnToActivity}
      />
    );
  }

  // --- Success (cached initial data or authoritative fetch). Takes priority over a
  // background-refresh error so valid data is never replaced by a transient failure. ---
  if (item) {
    return <ActivityDetailView item={item} onClose={returnToActivity} onRetryDetails={refetch} />;
  }

  // --- Loading: a fetch is in flight and there is nothing to show yet. ---
  if (isLoading) {
    return <LoadingState />;
  }

  // --- Error: map the stable code to a distinct, non-collapsed state. ---
  if (error) {
    if (error.code === 'UNAUTHORIZED') {
      // Session expired mid-view — a retry won't help; send to login.
      return <Redirect href="/auth/login" />;
    }
    return (
      <DetailMessageState
        {...copyForErrorCode(error.code)}
        onReturn={returnToActivity}
        onRetry={error.retryable ? refetch : undefined}
      />
    );
  }

  // Defensive: no item, not loading, no error (shouldn't happen) — keep mounted.
  return <LoadingState />;
}

/** Trims a possibly-array route param down to a non-empty string, or null. */
function normalizeParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

interface MessageCopy {
  title: string;
  subtitle: string;
}

function copyForErrorCode(code: ActivityDetailErrorCode | undefined): MessageCopy {
  switch (code) {
    case 'INVOICE_NOT_FOUND':
    case 'STORE_NOT_FOUND':
      return {
        title: 'Payment not found',
        subtitle: 'This payment may have been removed or the link may no longer be valid.',
      };
    case 'STORE_ACCESS_DENIED':
      return {
        title: 'You do not have access to this payment.',
        subtitle: 'This payment belongs to a different account.',
      };
    case 'INVALID_REQUEST':
      return {
        title: 'Payment details unavailable',
        subtitle: 'This link is incomplete or invalid.',
      };
    default:
      // BTCPAY_DETAIL_FETCH_FAILED / _TIMEOUT / INVALID_BTCPAY_RESPONSE / SERVER_MISCONFIGURED
      return {
        title: 'Payment details could not be loaded.',
        subtitle: 'Something went wrong while loading this payment.',
      };
  }
}

function LoadingState() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.centered}>
        <ActivityIndicator color={DASHBOARD_COLORS.primaryText} />
        <Text style={styles.loadingLabel}>Loading payment details…</Text>
      </View>
    </SafeAreaView>
  );
}

interface DetailMessageStateProps {
  title: string;
  subtitle: string;
  onReturn: () => void;
  /** When provided, shows a primary "Try Again" action above "Return to Activity". */
  onRetry?: () => void;
}

function DetailMessageState({ title, subtitle, onReturn, onRetry }: DetailMessageStateProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <CloseButton onPress={onReturn} />
      </View>
      <View style={styles.centered}>
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateSubtitle}>{subtitle}</Text>

        {onRetry ? (
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Try again">
            <Text style={styles.primaryLabel}>Try Again</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onReturn}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Return to Activity">
          <Text style={styles.secondaryLabel}>Return to Activity</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DASHBOARD_COLORS.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  loadingLabel: {
    marginTop: 14,
    fontSize: 15,
    color: DASHBOARD_COLORS.secondaryText,
  },
  stateTitle: {
    fontSize: 22,
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
  primaryButton: {
    marginTop: 20,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: DASHBOARD_COLORS.bitcoinOrange,
  },
  primaryLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  secondaryButton: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: DASHBOARD_COLORS.iconBackground,
  },
  secondaryLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  pressed: {
    opacity: 0.7,
  },
});
