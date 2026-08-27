import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/auth/primary-button';
import { useSendFlow } from '@/components/wallet/send-flow-context';
import { SendScreenScaffold } from '@/components/wallet/send-screen-scaffold';
import { COLORS } from '@/constants/colors';
import { formatBtcFromSats } from '@/lib/btcpay/balance-format';
import {
  createOnchainSend,
  newSendIdempotencyKey,
  type SendSpeed,
  type WalletSendErrorCode,
} from '@/lib/btcpay/wallet-send';
import { formatShortAddress } from '@/lib/send/destination';

const SPEED_LABEL: Record<SendSpeed, string> = {
  fast: 'Fast · ~10 minutes',
  standard: 'Standard · ~1 hour',
  economy: 'Economy · ~6–24 hours',
};

/** Error codes where retrying the same prepared attempt cannot succeed. */
const NON_RETRYABLE: WalletSendErrorCode[] = [
  'INSUFFICIENT_FUNDS',
  'INVALID_DESTINATION',
  'INVALID_AMOUNT',
  'WALLET_NOT_CONNECTED',
  'WALLET_DISABLED',
  'STORE_ACCESS_DENIED',
  'UNAUTHORIZED',
];

/**
 * Transaction review. On mount the backend has BTCPay build the REAL unsigned
 * PSBT, and every number on this screen — amount, network fee, total — is
 * decoded from that PSBT, not estimated. Confirm & Sign hands the already-built
 * PSBT to the signing screen; nothing is signed or broadcast from here.
 */
export default function SendReviewScreen() {
  const router = useRouter();
  const flow = useSendFlow();
  const [preparing, setPreparing] = useState(true);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [prepareCode, setPrepareCode] = useState<WalletSendErrorCode | null>(null);

  // One idempotency key per prepare ATTEMPT, reused across retries of that
  // attempt so a retry replays the same prepared send instead of building a
  // competing transaction. Cleared only when the inputs change (new mount).
  const idempotencyKeyRef = useRef<string | null>(null);
  const preparingRef = useRef(false);
  // The backend never persists the PSBT, so a replayed attempt comes back
  // without one. That's recoverable exactly once: retire the key and prepare a
  // fresh attempt (the orphaned row is inert — nothing was reserved).
  const replayRetriedRef = useRef(false);
  // Always points at the latest `prepare`, so the replay path can re-enter it.
  const prepareRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!flow.destination || flow.amountSats == null) {
      router.replace('/wallet/send/scan' as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prepare = useCallback(async () => {
    const { storeId, destination, amountSats, speed, isMax } = flow;
    if (!storeId || !destination || amountSats == null) return;
    if (preparingRef.current) return;
    preparingRef.current = true;

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newSendIdempotencyKey();
    }

    setPreparing(true);
    setPrepareError(null);
    setPrepareCode(null);
    flow.setStatus('creating_transaction');

    const result = await createOnchainSend({
      merchantStoreId: storeId,
      idempotencyKey: idempotencyKeyRef.current,
      destination: destination.address,
      amountSats,
      speed,
      mode: isMax ? 'max' : 'exact',
    });

    if (result.ok && result.value.psbt == null) {
      idempotencyKeyRef.current = null;
      if (!replayRetriedRef.current) {
        replayRetriedRef.current = true;
        setPreparing(false);
        preparingRef.current = false;
        prepareRef.current?.();
        return;
      }
      setPrepareError('This send needs to be prepared again. Please retry.');
      setPrepareCode('PSBT_CREATE_FAILED');
      flow.setStatus('ready_for_review');
    } else if (result.ok) {
      flow.setPrepared(result.value);
    } else {
      setPrepareError(result.error);
      setPrepareCode(result.code);
      flow.setStatus('ready_for_review');
      if (NON_RETRYABLE.includes(result.code)) {
        // This attempt can never succeed as-is; a changed send is a new attempt.
        idempotencyKeyRef.current = null;
      }
    }
    setPreparing(false);
    preparingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.storeId, flow.destination, flow.amountSats, flow.speed, flow.isMax]);

  useEffect(() => {
    prepareRef.current = prepare;
  }, [prepare]);

  useEffect(() => {
    if (flow.prepared) {
      // Returning from the signing screen — the prepared send is still valid.
      setPreparing(false);
      return;
    }
    prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prepared = flow.prepared;

  function onConfirm() {
    if (!prepared || flow.storeMismatch) return;
    router.push('/wallet/send/sign' as never);
  }

  return (
    <SendScreenScaffold title="Review transaction">
      {preparing ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={COLORS.primaryText} />
          <Text style={styles.centerText}>Building your transaction…</Text>
        </View>
      ) : prepareError || !prepared ? (
        <View style={styles.centerBox}>
          <MaterialIcons name="error-outline" size={28} color="#F87171" />
          <Text style={styles.centerText}>
            {prepareError ?? 'The transaction could not be prepared.'}
          </Text>
          {prepareCode === 'INSUFFICIENT_FUNDS' ? (
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Change amount">
              <Text style={styles.retryLabel}>Change amount</Text>
            </Pressable>
          ) : prepareCode && NON_RETRYABLE.includes(prepareCode) ? null : (
            <Pressable
              onPress={prepare}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Try again">
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.body}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.card}>
              <ReviewRow label="To" value={formatShortAddress(prepared.destination)} mono />
              <ReviewRow label="Amount" value={`${formatBtcFromSats(prepared.amountSats)} BTC`} />
              <ReviewRow
                label="Network fee"
                value={`${formatBtcFromSats(prepared.feeSats)} BTC`}
              />
              <ReviewRow label="Network speed" value={SPEED_LABEL[prepared.speed]} />
              <ReviewRow
                label="Total"
                value={`${formatBtcFromSats(prepared.totalSats)} BTC`}
                emphasized
                last
              />
            </View>

            {prepared.subtractFee ? (
              <Text style={styles.note}>
                You’re sending your full balance, so the network fee is deducted
                from the amount — the recipient receives{' '}
                {formatBtcFromSats(prepared.amountSats)} BTC.
              </Text>
            ) : null}

            <Text style={styles.note}>
              Next you’ll sign this transaction with your own Bitcoin wallet.
              Nothing is sent until it’s signed and broadcast.
            </Text>
          </ScrollView>

          <View style={styles.footer}>
            <PrimaryButton
              label="Confirm & Sign"
              onPress={onConfirm}
              disabled={flow.storeMismatch}
            />
          </View>
        </View>
      )}
    </SendScreenScaffold>
  );
}

interface ReviewRowProps {
  label: string;
  value: string;
  mono?: boolean;
  emphasized?: boolean;
  last?: boolean;
}

function ReviewRow({ label, value, mono, emphasized, last }: ReviewRowProps) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          mono && styles.rowValueMono,
          emphasized && styles.rowValueEmphasized,
        ]}
        numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: 16,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
    paddingBottom: 64,
  },
  centerText: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.card,
  },
  pressed: {
    opacity: 0.7,
  },
  retryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  card: {
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 15,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.secondaryText,
  },
  rowValue: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  rowValueMono: {
    fontVariant: ['tabular-nums'],
  },
  rowValueEmphasized: {
    fontSize: 16,
    fontWeight: '700',
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.mutedText,
    paddingTop: 16,
    paddingHorizontal: 4,
  },
  footer: {
    paddingVertical: 12,
  },
});
