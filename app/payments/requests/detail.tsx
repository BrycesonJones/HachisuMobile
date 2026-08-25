import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import { isShareableCheckoutUrl } from '@/lib/btcpay/checkout-url';
import {
  getCachedPaymentRequest,
  upsertPaymentRequest,
} from '@/lib/btcpay/payment-request-cache';
import {
  getPaymentRequest,
  type HachisuPaymentRequest,
} from '@/lib/btcpay/payment-requests';
import {
  formatActivityAmount,
  formatActivityDateTime,
} from '@/lib/transactions/activity-utils';

/**
 * Payment Request detail. Routed by DURABLE identifiers (merchantStoreId +
 * paymentRequestId), so it survives a cold start, app restart, deep link, cache
 * loss, and store switching: the in-memory cache seed (from the create screen or
 * an earlier visit) only provides instant initial paint — the authoritative
 * record is ALWAYS re-fetched from the backend, which re-reads BTCPay.
 */
export default function PaymentRequestDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    merchantStoreId?: string;
    paymentRequestId?: string;
  }>();
  const merchantStoreId =
    typeof params.merchantStoreId === 'string' ? params.merchantStoreId : '';
  const paymentRequestId =
    typeof params.paymentRequestId === 'string' ? params.paymentRequestId : '';

  const [request, setRequest] = useState<HachisuPaymentRequest | null>(() =>
    merchantStoreId && paymentRequestId
      ? (getCachedPaymentRequest(merchantStoreId, paymentRequestId) ?? null)
      : null,
  );
  const [isFetching, setIsFetching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchAuthoritative = useCallback(async () => {
    if (!merchantStoreId || !paymentRequestId) return;
    setIsFetching(true);
    setLoadError(null);
    try {
      const result = await getPaymentRequest(merchantStoreId, paymentRequestId);
      if (result.ok) {
        setRequest(result.paymentRequest);
        upsertPaymentRequest(merchantStoreId, result.paymentRequest);
      } else if (!getCachedPaymentRequest(merchantStoreId, paymentRequestId)) {
        // Only a miss with NO cached fallback becomes a full-screen error — a
        // transient refresh failure over a seeded record stays quiet.
        setLoadError(result.message);
      }
    } finally {
      setIsFetching(false);
    }
  }, [merchantStoreId, paymentRequestId]);

  useEffect(() => {
    fetchAuthoritative();
  }, [fetchAuthoritative]);

  const requestUrl =
    request && isShareableCheckoutUrl(request.requestUrl) ? request.requestUrl : null;

  // Status drives what is offered — never URL presence. Pending/Processing can
  // still be paid; a Completed request's BTCPay page remains a useful record; an
  // Expired or archived request must not be shared as payable.
  const status = (request?.status ?? '').toLowerCase();
  const payable = !request?.archived && (status === 'pending' || status === 'processing');
  const viewOnly = !payable && !!request && (status === 'completed' || !request.archived);
  const closed = !!request && (request.archived || status === 'expired');

  const handleShare = useCallback(async () => {
    if (!requestUrl || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      // The payload is EXACTLY the URL — `message`, never `url`, on both
      // platforms (same device-verified rules as invoice sharing: `url` breaks
      // iOS pasteboard copy; both fields shares the link twice).
      await Share.share({ message: requestUrl });
    } catch {
      setActionError('Could not open the share menu. Try again.');
    } finally {
      setBusy(false);
    }
  }, [requestUrl, busy]);

  const handleOpen = useCallback(async () => {
    if (!requestUrl || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const supported = await Linking.canOpenURL(requestUrl);
      if (!supported) {
        setActionError('This device can’t open the payment page.');
        return;
      }
      await Linking.openURL(requestUrl);
    } catch {
      setActionError('Could not open the payment page. Try again.');
    } finally {
      setBusy(false);
    }
  }, [requestUrl, busy]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}>
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
        </Pressable>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Payment Request</Text>

        {!request && isFetching ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={COLORS.secondaryText} />
            <Text style={styles.loadingText}>Loading payment request…</Text>
          </View>
        ) : null}

        {!request && !isFetching && loadError ? (
          <View style={styles.errorCard}>
            <MaterialIcons name="error-outline" size={18} color="#F87171" />
            <View style={styles.errorTextBlock}>
              <Text style={styles.errorText}>{loadError}</Text>
              <Pressable
                onPress={fetchAuthoritative}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Try again">
                <Text style={styles.retryLabel}>Try Again</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {request ? (
          <>
            <View style={styles.amountBlock}>
              <Text style={styles.amount}>
                {formatActivityAmount(request.amount, request.currency)}
              </Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusLabel}>
                  {request.archived ? 'Archived' : (request.status ?? 'Unknown')}
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <DetailRow label="Title" value={request.title} />
              {request.memo ? <DetailRow label="Memo" value={request.memo} /> : null}
              {request.referenceId ? (
                <DetailRow label="Reference ID" value={request.referenceId} />
              ) : null}
              {request.recipientEmail ? (
                <DetailRow label="Recipient Email" value={request.recipientEmail} />
              ) : null}
              {request.allowCustomAmounts ? (
                <DetailRow
                  label="Amounts"
                  value="Customers can choose the amount they pay"
                />
              ) : null}
              <DetailRow label="Created" value={formatActivityDateTime(request.createdAt)} />
              <DetailRow
                label="Expires"
                value={
                  request.expiresAt
                    ? formatActivityDateTime(request.expiresAt)
                    : 'No expiration'
                }
              />
              <DetailRow label="Request ID" value={request.btcpayPaymentRequestId} last />
            </View>

            {closed ? (
              <Text style={styles.closedNote}>
                {request.archived
                  ? 'This payment request was archived and should no longer be shared.'
                  : 'This payment request expired and can no longer be paid. Create a new request to ask for payment.'}
              </Text>
            ) : !requestUrl ? (
              isFetching ? (
                <View style={[styles.primaryButton, styles.primaryDisabled, styles.standaloneAction]}>
                  <ActivityIndicator size="small" color={COLORS.secondaryText} />
                  <Text style={styles.primaryDisabledLabel}>Preparing request…</Text>
                </View>
              ) : (
                <View style={styles.errorCard}>
                  <MaterialIcons name="link-off" size={18} color={COLORS.secondaryText} />
                  <View style={styles.errorTextBlock}>
                    <Text style={styles.errorText}>
                      The request link could not be loaded.
                    </Text>
                    <Pressable
                      onPress={fetchAuthoritative}
                      style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel="Try again">
                      <Text style={styles.retryLabel}>Try Again</Text>
                    </Pressable>
                  </View>
                </View>
              )
            ) : (
              <View style={styles.actions}>
                {payable ? (
                  <Pressable
                    onPress={handleShare}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      (pressed || busy) && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Share payment request">
                    <MaterialIcons name="ios-share" size={18} color={COLORS.background} />
                    <Text style={styles.primaryLabel}>Share Request</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={handleOpen}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    (pressed || busy) && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open payment request page">
                  <Text style={styles.secondaryLabel}>
                    {viewOnly ? 'View Request Page' : 'Open Request'}
                  </Text>
                </Pressable>
                {actionError ? <Text style={styles.inlineError}>{actionError}</Text> : null}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[rowStyles.row, last && rowStyles.rowLast]}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value} selectable>
        {value}
      </Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.cardBorder,
    gap: 4,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: COLORS.secondaryText,
  },
  value: {
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.primaryText,
  },
});

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
    paddingBottom: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  pressed: {
    opacity: 0.7,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: COLORS.primaryText,
    marginTop: 8,
  },
  loadingBlock: {
    alignItems: 'center',
    gap: 12,
    marginTop: 64,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.secondaryText,
  },
  amountBlock: {
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 24,
  },
  amount: {
    fontSize: 40,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  statusPill: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: COLORS.card,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.secondaryText,
  },
  card: {
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
  },
  actions: {
    marginTop: 28,
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 16,
    backgroundColor: HachisuColors.cream,
  },
  standaloneAction: {
    marginTop: 28,
  },
  primaryDisabled: {
    backgroundColor: COLORS.card,
  },
  primaryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  primaryDisabledLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.secondaryText,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  secondaryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  inlineError: {
    fontSize: 13,
    textAlign: 'center',
    color: COLORS.secondaryText,
  },
  closedNote: {
    marginTop: 28,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.secondaryText,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 24,
    padding: 14,
    borderRadius: 12,
    backgroundColor: COLORS.card,
  },
  errorTextBlock: {
    flex: 1,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.primaryText,
  },
  retryButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  retryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: HachisuColors.cream,
  },
});
