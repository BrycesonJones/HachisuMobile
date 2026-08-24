import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { isShareableCheckoutUrl } from '@/lib/btcpay/checkout-url';
import type { ActivityItem } from '@/types/activity';

interface InvoiceShareActionsProps {
  item: ActivityItem;
  /** True while the authoritative detail fetch is in flight (the URL may still
   * be resolving). Used only to distinguish "not loaded yet" from "unavailable". */
  isFetching?: boolean;
  /** Re-runs the authoritative detail fetch when the checkout URL is missing. */
  onRetry?: () => void;
}

/**
 * Merchant delivery actions for an invoice: hand the BTCPay checkout URL to a
 * customer via the native share sheet, or open it to present/preview the
 * payment page.
 *
 * BTCPay does not deliver invoices to buyers — the merchant does. These actions
 * are the delivery step of the invoice flow.
 *
 * Two rules this component does not bend:
 *   - Availability is decided by the NORMALIZED invoice status, never by whether
 *     a checkout URL happens to exist. An expired invoice must not be offered as
 *     though it can still be paid.
 *   - The URL is BTCPay's, validated before use (https, real host). It is never
 *     constructed from a hostname + invoice id, and a missing URL is reported as
 *     missing rather than guessed.
 */
export function InvoiceShareActions({ item, isFetching, onRetry }: InvoiceShareActionsProps) {
  const [shareError, setShareError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checkoutUrl = isShareableCheckoutUrl(item.checkoutUrl) ? item.checkoutUrl : null;

  // Status drives what is offered. `new`/`processing` can still be paid; a
  // settled invoice's BTCPay page stays useful as a receipt (verified against the
  // deployed server) but must not invite another payment.
  const payable = item.status === 'new' || item.status === 'processing';
  const receiptOnly = item.status === 'settled';
  const closed = !payable && !receiptOnly; // expired / invalid / failed

  const handleShare = useCallback(async () => {
    if (!checkoutUrl || busy) return;
    setBusy(true);
    setShareError(null);
    try {
      // The share payload is EXACTLY the checkout URL — no title, amount,
      // description, or explanatory text. The merchant writes their own message.
      //
      // `message` (never `url`) on BOTH platforms, deliberately:
      //   iOS   — `url` becomes a bare NSURL activity item, and the sheet's Copy
      //           activity then puts a `public.url` OBJECT on the pasteboard, not
      //           `public.plain-text` — so pasting into Safari's address bar,
      //           Notes, or any plain text field yields nothing (observed on a
      //           real device). `message` becomes an NSString, Copy writes plain
      //           text, and paste works everywhere. Messages/Mail still linkify
      //           a plain URL string; the rich sheet-header preview is lost,
      //           which is acceptable — clipboard correctness wins.
      //           Never send BOTH fields: RCTActionSheetManager appends them as
      //           two separate items, sharing the same link twice.
      //   Android — Share.js forwards only `message` (as EXTRA_TEXT) and drops
      //           `url` entirely, so `message` is the only option anyway. `title`
      //           stays omitted (it would become an EXTRA_SUBJECT email subject).
      await Share.share({ message: checkoutUrl });
      // A dismissed share sheet resolves normally with action 'dismissedAction'.
      // That is ordinary user behavior, not a failure — nothing is surfaced.
    } catch {
      setShareError('Could not open the share menu. Try again.');
    } finally {
      setBusy(false);
    }
  }, [checkoutUrl, busy]);

  const handleOpen = useCallback(async () => {
    if (!checkoutUrl || busy) return;
    setBusy(true);
    setShareError(null);
    try {
      const supported = await Linking.canOpenURL(checkoutUrl);
      if (!supported) {
        setShareError('This device can’t open the checkout page.');
        return;
      }
      await Linking.openURL(checkoutUrl);
    } catch {
      setShareError('Could not open the checkout page. Try again.');
    } finally {
      setBusy(false);
    }
  }, [checkoutUrl, busy]);

  if (closed) {
    // Never present a dead invoice as payable. The record itself stays visible
    // above; this only explains why there is nothing to share.
    return (
      <View style={styles.container}>
        <Text style={styles.closedNote}>
          {item.status === 'expired'
            ? 'This invoice expired and can no longer be paid. Create a new invoice to request payment.'
            : 'This invoice can no longer be paid.'}
        </Text>
      </View>
    );
  }

  // Detail loaded but the URL is not here yet. While the authoritative fetch is
  // still running this is "preparing"; once it has finished it is a real failure
  // — and either way the rest of Payment Details stays fully usable.
  if (!checkoutUrl) {
    if (isFetching) {
      return (
        <View style={styles.container}>
          <View style={[styles.primaryButton, styles.primaryDisabled]}>
            <ActivityIndicator size="small" color={DASHBOARD_COLORS.secondaryText} />
            <Text style={styles.primaryDisabledLabel}>Preparing invoice…</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <View style={styles.errorCard}>
          <MaterialIcons name="link-off" size={18} color={DASHBOARD_COLORS.secondaryText} />
          <Text style={styles.errorText}>Invoice link could not be loaded.</Text>
        </View>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Try again">
            <Text style={styles.secondaryLabel}>Try Again</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {payable ? (
        <Pressable
          onPress={handleShare}
          disabled={busy}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || busy) && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Share invoice">
          <MaterialIcons name="ios-share" size={18} color={DASHBOARD_COLORS.background} />
          <Text style={styles.primaryLabel}>Share Invoice</Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={handleOpen}
        disabled={busy}
        style={({ pressed }) => [styles.secondaryButton, (pressed || busy) && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={receiptOnly ? 'Open receipt' : 'Open checkout'}>
        <Text style={styles.secondaryLabel}>
          {receiptOnly ? 'Open Receipt' : 'Open Checkout'}
        </Text>
      </Pressable>

      {shareError ? <Text style={styles.inlineError}>{shareError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
    backgroundColor: DASHBOARD_COLORS.avatarBackground,
  },
  primaryDisabled: {
    backgroundColor: DASHBOARD_COLORS.iconBackground,
  },
  primaryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: DASHBOARD_COLORS.background,
  },
  primaryDisabledLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: DASHBOARD_COLORS.secondaryText,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  secondaryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: DASHBOARD_COLORS.primaryText,
  },
  pressed: {
    opacity: 0.7,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: DASHBOARD_COLORS.iconBackground,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: DASHBOARD_COLORS.primaryText,
  },
  inlineError: {
    fontSize: 13,
    textAlign: 'center',
    color: DASHBOARD_COLORS.secondaryText,
  },
  closedNote: {
    fontSize: 13,
    lineHeight: 19,
    color: DASHBOARD_COLORS.secondaryText,
  },
});
