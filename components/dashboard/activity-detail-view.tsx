import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActivityDegradedBanner } from '@/components/dashboard/activity-degraded-banner';
import { InvoiceShareActions } from '@/components/dashboard/invoice-share-actions';
import { CloseButton } from '@/components/auth/close-button';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { useSafeTopInset } from '@/hooks/use-safe-top-inset';
import {
  formatActivityAmount,
  formatActivityDateTime,
  formatCryptoAmount,
  formatEventAmount,
  getActivityPaymentLabel,
  getActivityStatusDescription,
  getExceptionStatusNote,
  getPaymentEventStatusDescription,
  getSourceFeatureLabel,
  isItemEnrichmentDegraded,
  UNAVAILABLE_FIELD_PLACEHOLDER,
} from '@/lib/transactions/activity-utils';
import type { ActivityItem, StoreActivityEvent } from '@/types/activity';

interface ActivityDetailViewProps {
  item: ActivityItem;
  /** Every payment recorded against this invoice, newest first. One invoice can
   * legitimately have several (partial payments, a top-up after underpayment). */
  events: StoreActivityEvent[];
  /** The payment the user tapped in the Activity feed, if any — highlighted so a
   * multi-payment invoice opens on the right transaction. */
  focusPaymentId?: string | null;
  onClose: () => void;
  /** When provided, the degraded banner offers a Retry that re-fetches this record
   * (the detail screen has no pull-to-refresh of its own). */
  onRetryDetails?: () => void;
  /** True while the authoritative fetch is in flight. Lets the invoice actions
   * distinguish "the checkout link is still resolving" from "it is unavailable". */
  isFetching?: boolean;
}

export function ActivityDetailView({
  item,
  events,
  focusPaymentId,
  onClose,
  onRetryDetails,
  isFetching,
}: ActivityDetailViewProps) {
  const amount = formatActivityAmount(item.amount, item.currency);
  const cryptoAmount = formatCryptoAmount(item.cryptoAmount, item.cryptoAsset);
  const hasCrypto = item.multiMethod || item.cryptoAmount != null;
  const paymentLabel = getActivityPaymentLabel(item);
  // Enrichment failed for THIS item: the base status stays authoritative, but the
  // payment details could not be loaded. Show them explicitly as unavailable
  // (never fabricated) rather than hiding them, so a settled invoice with a failed
  // lookup can't read as an ordinary payment with no details.
  const degraded = isItemEnrichmentDegraded(item);
  // BTCPay's own exception status: the difference between a plainly settled
  // invoice and one that was underpaid, overpaid, or paid after expiry.
  const exceptionNote = getExceptionStatusNote(item.exceptionStatus);

  // This screen is presented as a fullScreenModal, where iOS reports a 0 top
  // inset — so the header is padded from a window-derived inset instead of
  // relying on SafeAreaView's 'top' edge (see useSafeTopInset).
  const safeTop = useSafeTopInset();

  async function handleCopyInvoiceId() {
    await Clipboard.setStringAsync(item.btcpayInvoiceId);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
      <View style={[styles.header, { paddingTop: safeTop + HEADER_TOP_GAP }]}>
        <CloseButton
          onPress={onClose}
          accessibilityLabel="Close payment details and return to Activity"
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {degraded ? (
          <ActivityDegradedBanner
            message={
              onRetryDetails
                ? 'Some payment details are temporarily unavailable.'
                : 'Some payment details for this record couldn’t be loaded. Pull to refresh on the activity screen to try again.'
            }
            onRetry={onRetryDetails}
          />
        ) : null}
        <View style={styles.summary}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.dateTime}>{formatActivityDateTime(item.createdAt)}</Text>
          {item.description ? (
            <Text style={styles.description}>{item.description}</Text>
          ) : null}
          <Text style={styles.amount}>{amount}</Text>
          {item.multiMethod ? (
            <Text style={styles.btcAmount}>Paid with multiple methods</Text>
          ) : item.cryptoAmount ? (
            <Text style={styles.btcAmount}>{cryptoAmount}</Text>
          ) : null}
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Payment details</Text>

        <DetailRow
          icon="check-circle"
          title={item.displayStatus}
          subtitle={getActivityStatusDescription(item.status)}
          hint={exceptionNote ?? undefined}
        />

        <DetailRow
          icon="attach-money"
          title="Invoice amount"
          subtitle={`${item.amount} ${item.currency}`}
        />

        {degraded ? (
          // Enriched fields could not be loaded — surface each as unavailable
          // instead of hiding it, so the missing data is explicit (not fabricated).
          <>
            <DetailRow
              icon="currency-bitcoin"
              title="Amount received"
              subtitle={UNAVAILABLE_FIELD_PLACEHOLDER}
              hint="Details unavailable"
            />
            <DetailRow
              icon="account-balance-wallet"
              title="Payment method"
              subtitle={UNAVAILABLE_FIELD_PLACEHOLDER}
              hint="Details unavailable"
            />
          </>
        ) : item.multiMethod ? (
          item.breakdown.map((leg, index) => (
            <DetailRow
              key={`${leg.paymentMethodId ?? 'leg'}-${index}`}
              icon={leg.paymentRail === 'lightning' ? 'bolt' : 'currency-bitcoin'}
              title={formatCryptoAmount(leg.cryptoAmount, leg.cryptoAsset)}
              subtitle={leg.paymentMethodLabel}
            />
          ))
        ) : (
          <>
            {hasCrypto ? (
              <DetailRow
                icon="currency-bitcoin"
                title="Amount received"
                subtitle={cryptoAmount}
              />
            ) : null}

            <DetailRow
              icon="account-balance-wallet"
              title="Payment method"
              subtitle={paymentLabel}
            />
          </>
        )}

        <DetailRow icon="storefront" title="Source" subtitle={getSourceFeatureLabel(item)} />

        <DetailRow
          icon="schedule"
          title="Created"
          subtitle={formatActivityDateTime(item.createdAt)}
        />

        {item.paidAt ? (
          <DetailRow icon="payments" title="Paid" subtitle={formatActivityDateTime(item.paidAt)} />
        ) : degraded && item.unavailableFields.includes('paidAt') ? (
          <DetailRow
            icon="payments"
            title="Paid"
            subtitle={UNAVAILABLE_FIELD_PLACEHOLDER}
            hint="Details unavailable"
          />
        ) : null}

        {item.settledAt ? (
          <DetailRow
            icon="verified"
            title="Settled"
            subtitle={formatActivityDateTime(item.settledAt)}
          />
        ) : degraded && item.unavailableFields.includes('settledAt') ? (
          <DetailRow
            icon="verified"
            title="Settled"
            subtitle={UNAVAILABLE_FIELD_PLACEHOLDER}
            hint="Details unavailable"
          />
        ) : null}

        {item.paidAmount ? (
          <DetailRow
            icon="account-balance"
            title="Amount paid"
            subtitle={formatActivityAmount(item.paidAmount, item.currency)}
            hint={exceptionNote ?? undefined}
          />
        ) : null}

        {item.orderId ? (
          <DetailRow icon="tag" title="Order ID" subtitle={item.orderId} />
        ) : null}

        <DetailRow
          icon="receipt-long"
          title="Invoice ID"
          subtitle={item.btcpayInvoiceId}
          trailingIcon="content-copy"
          onTrailingPress={handleCopyInvoiceId}
        />

        {/* Individual payments. An invoice is not always one payment: partial
            payments, a follow-up top-up, or an invalid payment each appear here
            as their own record, keyed by BTCPay's own payment id. */}
        {events.length > 0 ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>
              {events.length === 1 ? 'Payment' : `Payments (${events.length})`}
            </Text>
            {events.map((event) => (
              <DetailRow
                key={event.id}
                icon={event.paymentRail === 'lightning' ? 'bolt' : 'currency-bitcoin'}
                title={`${formatEventAmount(event)} · ${formatCryptoAmount(
                  event.cryptoAmount,
                  event.cryptoAsset,
                )}`}
                subtitle={`${getActivityPaymentLabel(event)} · ${formatActivityDateTime(
                  event.receivedAt,
                )}`}
                hint={
                  (event.paymentId === focusPaymentId ? 'This payment · ' : '') +
                  getPaymentEventStatusDescription(event)
                }
              />
            ))}
          </>
        ) : null}

        {/* Invoice delivery. BTCPay does not send the invoice to the buyer — the
            merchant shares the checkout link. Only for invoices Hachisu created,
            so records from other features are unaffected. */}
        {item.sourceFeature === 'invoice' ? (
          <InvoiceShareActions
            item={item}
            isFetching={isFetching}
            onRetry={onRetryDetails}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

interface DetailRowProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  /** Optional muted note under the subtitle (e.g. "Details unavailable"). */
  hint?: string;
  trailingIcon?: keyof typeof MaterialIcons.glyphMap;
  onTrailingPress?: () => void;
}

function DetailRow({ icon, title, subtitle, hint, trailingIcon, onTrailingPress }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <MaterialIcons name={icon} size={24} color={DASHBOARD_COLORS.primaryText} />

      <View style={styles.detailContent}>
        <Text style={styles.detailTitle}>{title}</Text>
        <Text style={styles.detailSubtitle}>{subtitle}</Text>
        {hint ? <Text style={styles.detailHint}>{hint}</Text> : null}
      </View>

      {trailingIcon ? (
        <Pressable
          onPress={onTrailingPress}
          style={({ pressed }) => [styles.trailingButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${title} action`}>
          <MaterialIcons name={trailingIcon} size={20} color={DASHBOARD_COLORS.secondaryText} />
        </Pressable>
      ) : (
        <View style={styles.trailingSpacer} />
      )}
    </View>
  );
}

/** Breathing room between the system status area and the close control. */
const HEADER_TOP_GAP = 8;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DASHBOARD_COLORS.background,
  },
  header: {
    paddingHorizontal: 20,
    // paddingTop is applied inline from the safe-area inset.
    paddingBottom: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  pressed: {
    opacity: 0.7,
  },
  summary: {
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  dateTime: {
    fontSize: 15,
    color: DASHBOARD_COLORS.secondaryText,
  },
  description: {
    fontSize: 15,
    color: DASHBOARD_COLORS.secondaryText,
  },
  amount: {
    marginTop: 28,
    fontSize: 44,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  btcAmount: {
    fontSize: 16,
    color: DASHBOARD_COLORS.secondaryText,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: DASHBOARD_COLORS.divider,
    marginVertical: 28,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 28,
  },
  detailContent: {
    flex: 1,
    gap: 4,
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
  detailSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: DASHBOARD_COLORS.secondaryText,
  },
  detailHint: {
    fontSize: 13,
    color: DASHBOARD_COLORS.warningText,
  },
  trailingButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailingSpacer: {
    width: 32,
  },
});
