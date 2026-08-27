import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PrimaryButton } from '@/components/auth/primary-button';
import { useSendFlow } from '@/components/wallet/send-flow-context';
import { SendScreenScaffold } from '@/components/wallet/send-screen-scaffold';
import { COLORS } from '@/constants/colors';
import { useActiveStore } from '@/contexts/active-store-context';
import { useStoreBalance } from '@/hooks/use-store-balance';
import { formatBtcFromSats, formatFiat } from '@/lib/btcpay/balance-format';
import { formatShortAddress, parseBtcAmountToSats } from '@/lib/send/destination';

/**
 * Amount entry for the send flow. All arithmetic is integer satoshis (via
 * BigInt in the parsing helpers) — the typed string is parsed exactly, never
 * with floats. "Available" is the wallet's total (confirmed + unconfirmed)
 * balance, matching what BTCPay can actually spend from. Typing the full
 * balance — or tapping MAX — becomes a MAX send: the network fee is deducted
 * from the amount, since the wallet cannot pay a fee on top of everything.
 */
export default function SendAmountScreen() {
  const router = useRouter();
  const flow = useSendFlow();
  const { activeStore } = useActiveStore();
  const { state: balanceState, refetch } = useStoreBalance(activeStore);

  // Deep-link / stale-state guard: no destination means no flow to continue.
  useEffect(() => {
    if (!flow.destination) {
      router.replace('/wallet/send/scan' as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefill from a BIP21 amount exactly once.
  const [amountText, setAmountText] = useState(() =>
    flow.destination?.amountSats != null
      ? formatBtcFromSats(flow.destination.amountSats)
      : '',
  );

  const availableSats =
    balanceState.kind === 'ready' ? balanceState.balance.totalSats : null;
  const rate = balanceState.kind === 'ready' ? balanceState.balance.rate : null;
  const currency =
    balanceState.kind === 'ready' ? balanceState.balance.currency : 'USD';

  function onChangeAmount(text: string) {
    // Keep it a plausible BTC decimal while typing: digits, one dot, <=8 dp.
    const cleaned = text.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    const normalized =
      firstDot === -1
        ? cleaned
        : cleaned.slice(0, firstDot + 1) +
          cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 8);
    setAmountText(normalized);
  }

  function onMax() {
    if (availableSats == null || availableSats <= 0) return;
    setAmountText(formatBtcFromSats(availableSats));
  }

  const amountSats = useMemo(() => parseBtcAmountToSats(amountText), [amountText]);

  const amountError =
    amountText.length === 0
      ? null
      : amountSats == null
        ? 'Enter a valid amount greater than 0.'
        : availableSats != null && amountSats > availableSats
          ? 'That’s more than this wallet’s available balance.'
          : null;

  const canContinue =
    amountSats != null &&
    availableSats != null &&
    amountSats > 0 &&
    amountSats <= availableSats &&
    !flow.storeMismatch;

  const fiat = amountSats != null ? formatFiat(amountSats, rate, currency) : null;

  function onContinue() {
    if (!canContinue || amountSats == null || availableSats == null) return;
    // Sending the entire balance only works as a MAX send (fee comes out of
    // the amount) — an "exact" send of everything can never afford its fee.
    const isMax = amountSats === availableSats;
    flow.setAmount(amountSats, isMax);
    router.push('/wallet/send/speed' as never);
  }

  return (
    <SendScreenScaffold title="Send bitcoin">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.body}>
          <Text style={styles.destination} numberOfLines={1}>
            {flow.destination ? formatShortAddress(flow.destination.address) : ''}
          </Text>

          <View style={styles.amountBlock}>
            <View style={styles.amountRow}>
              <TextInput
                style={styles.amountInput}
                value={amountText}
                onChangeText={onChangeAmount}
                placeholder="0.00000000"
                placeholderTextColor={COLORS.mutedText}
                keyboardType="decimal-pad"
                autoFocus
                accessibilityLabel="Amount in bitcoin"
              />
              <Text style={styles.amountUnit}>BTC</Text>
            </View>
            <Text style={styles.fiat}>{fiat ?? ' '}</Text>
            {amountError ? <Text style={styles.error}>{amountError}</Text> : null}
          </View>

          <View style={styles.availableRow}>
            {balanceState.kind === 'loading' ? (
              <ActivityIndicator color={COLORS.secondaryText} size="small" />
            ) : balanceState.kind === 'ready' ? (
              <Text style={styles.available}>
                Available: {formatBtcFromSats(balanceState.balance.totalSats)} BTC
              </Text>
            ) : (
              <Pressable onPress={refetch} accessibilityRole="button" accessibilityLabel="Retry loading balance">
                <Text style={styles.availableError}>
                  Couldn’t load the balance — tap to retry.
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={onMax}
              disabled={availableSats == null || availableSats <= 0}
              style={({ pressed }) => [styles.maxButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Send the maximum amount">
              <Text style={styles.maxLabel}>MAX</Text>
            </Pressable>
          </View>

          <View style={styles.footer}>
            <PrimaryButton label="Continue" onPress={onContinue} disabled={!canContinue} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SendScreenScaffold>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
  },
  destination: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.secondaryText,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  amountBlock: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
  },
  amountInput: {
    fontSize: 40,
    fontWeight: '700',
    color: COLORS.primaryText,
    letterSpacing: -1,
    textAlign: 'center',
    padding: 0,
    minWidth: 60,
  },
  amountUnit: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.secondaryText,
  },
  fiat: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.secondaryText,
    minHeight: 20,
  },
  error: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F87171',
    textAlign: 'center',
  },
  availableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 24,
  },
  available: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.secondaryText,
  },
  availableError: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F87171',
  },
  maxButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.card,
  },
  pressed: {
    opacity: 0.7,
  },
  maxLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: COLORS.primaryText,
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
});
