import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useSendFlow } from '@/components/wallet/send-flow-context';
import { SendScreenScaffold } from '@/components/wallet/send-screen-scaffold';
import { COLORS } from '@/constants/colors';
import { markStoreActivityStale } from '@/lib/btcpay/activity-cache';
import {
  broadcastOnchainSend,
  type WalletSendErrorCode,
} from '@/lib/btcpay/wallet-send';
import { formatBtcFromSats } from '@/lib/btcpay/balance-format';

/** Above this, a single QR becomes unreliable — offer copy/share only. */
const MAX_QR_PSBT_CHARS = 1800;

/**
 * The signing boundary — the deliberate seam in Hachisu's non-custodial send.
 *
 * Hachisu holds no keys, so the transaction leaves here UNSIGNED: the merchant
 * exports the PSBT (QR / copy / share) into their own wallet — the wallet whose
 * xpub/descriptor this store watches (Sparrow, Coldcard, BlueWallet, ...) —
 * signs it there, then pastes the signed result back. Only then does the
 * backend verify it against the reviewed transaction and broadcast it. "Sent"
 * appears solely after BTCPay confirms the broadcast.
 */
export default function SendSignScreen() {
  const router = useRouter();
  const flow = useSendFlow();
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [terminalMismatch, setTerminalMismatch] = useState(false);
  // True after an UNCERTAIN broadcast outcome: the transaction may already be
  // on the network, so the only safe actions are "Check status" (server
  // reconciles by txid) — never a fresh paste-and-broadcast.
  const [reconcilePending, setReconcilePending] = useState(false);
  const submittingRef = useRef(false);
  // The last payload we submitted, so Check status can complete the send in
  // one tap if the server reconciles it as not-broadcast.
  const lastSignedRef = useRef<string | null>(null);

  useEffect(() => {
    // A prepared send without its PSBT (post-restart replay) can't be signed —
    // the flow must start over and build a fresh one.
    if (!flow.prepared || !flow.prepared.psbt) {
      router.replace('/wallet/send/scan' as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prepared = flow.prepared;
  const psbt = prepared?.psbt ?? null;

  const onCopyPsbt = useCallback(async () => {
    if (!psbt) return;
    await Clipboard.setStringAsync(psbt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [psbt]);

  const onSharePsbt = useCallback(async () => {
    if (!psbt) return;
    try {
      // `message` (not `url`) — see components/dashboard/invoice-share-actions.
      await Share.share({ message: psbt });
    } catch {
      // User dismissed the sheet — nothing to do.
    }
  }, [psbt]);

  const submitSigned = useCallback(
    async (signed: string) => {
      if (!prepared || !flow.storeId) return;
      if (submittingRef.current) return; // Beats the re-render on a double tap.
      submittingRef.current = true;

      setSubmitting(true);
      setSubmitError(null);
      flow.setStatus('submitting_signature');

      const result = await broadcastOnchainSend({
        merchantStoreId: flow.storeId,
        sendId: prepared.sendId,
        signedTransaction: signed,
      });

      if (result.ok) {
        flow.setBroadcasted(result.value);
        // Feed the send into the existing Activity pipeline (re-fetched from
        // the backend; nothing synthesized locally).
        markStoreActivityStale(flow.storeId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        router.replace('/wallet/send/success' as never);
      } else {
        flow.setStatus('awaiting_signature');
        setSubmitError(result.error);
        const code: WalletSendErrorCode = result.code;
        if (code === 'SIGNED_TRANSACTION_MISMATCH' || code === 'SEND_ALREADY_FAILED') {
          // Terminal for this prepared send — only a brand-new send is safe.
          setTerminalMismatch(true);
        }
        // Uncertain outcome: the tx may already be out. Lock the UI to
        // "Check status" so a duplicate broadcast can't be invited.
        setReconcilePending(code === 'SEND_RECONCILE_REQUIRED');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
      setSubmitting(false);
      submittingRef.current = false;
    },
    [prepared, flow, router],
  );

  // Clipboard is read ONLY here, on an explicit tap.
  const onPasteSigned = useCallback(async () => {
    if (submittingRef.current) return;
    let signed = '';
    try {
      signed = (await Clipboard.getStringAsync()).trim();
    } catch {
      setSubmitError('Could not read the clipboard.');
      return;
    }
    if (!signed) {
      setSubmitError('The clipboard is empty. Copy the signed transaction from your wallet first.');
      return;
    }
    if (signed === psbt) {
      setSubmitError(
        'That’s the unsigned transaction. Sign it in your wallet, then copy the signed result.',
      );
      return;
    }
    lastSignedRef.current = signed;
    await submitSigned(signed);
  }, [psbt, submitSigned]);

  // Re-asks the server for the authoritative outcome; if it reconciles the
  // send as not-broadcast and we still hold the payload, it completes in the
  // same call. Sends no clipboard data.
  const onCheckStatus = useCallback(async () => {
    await submitSigned(lastSignedRef.current ?? '');
  }, [submitSigned]);

  const onStartOver = useCallback(() => {
    flow.reset();
    router.dismissTo('/(tabs)/home');
  }, [flow, router]);

  if (!prepared) return <SendScreenScaffold title="Sign transaction">{null}</SendScreenScaffold>;

  return (
    <SendScreenScaffold title="Sign transaction">
      <View style={styles.body}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={styles.lede}>
            Hachisu never holds your keys. Sign this transaction of{' '}
            {formatBtcFromSats(prepared.totalSats)} BTC in the wallet that holds
            this store’s Bitcoin keys, then paste the signed result below.
          </Text>

          <View style={styles.stepCard}>
            <StepRow index={1} text="Export the transaction to your wallet — scan the QR or copy/share the PSBT." />
            <StepRow index={2} text="Review and sign it in your wallet." />
            <StepRow index={3} text="Copy the signed transaction and paste it here to broadcast." last />
          </View>

          {psbt && psbt.length <= MAX_QR_PSBT_CHARS ? (
            <View style={styles.qrWrap}>
              <QRCode
                value={psbt}
                size={196}
                backgroundColor="#f5f5f7"
                color="#000"
              />
            </View>
          ) : null}

          <View style={styles.exportRow}>
            <Pressable
              onPress={onCopyPsbt}
              style={({ pressed }) => [styles.exportButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Copy the unsigned transaction">
              <MaterialIcons
                name={copied ? 'check' : 'content-copy'}
                size={18}
                color={COLORS.primaryText}
              />
              <Text style={styles.exportLabel}>{copied ? 'Copied' : 'Copy PSBT'}</Text>
            </Pressable>
            <Pressable
              onPress={onSharePsbt}
              style={({ pressed }) => [styles.exportButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Share the unsigned transaction">
              <MaterialIcons name="ios-share" size={18} color={COLORS.primaryText} />
              <Text style={styles.exportLabel}>Share PSBT</Text>
            </Pressable>
          </View>

          {submitError ? (
            <View style={styles.errorCard}>
              <MaterialIcons name="error-outline" size={18} color="#F87171" />
              <Text style={styles.errorText}>{submitError}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {terminalMismatch ? (
            <Pressable
              onPress={onStartOver}
              style={({ pressed }) => [styles.submitButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Start a new send">
              <Text style={styles.submitLabel}>Start over</Text>
            </Pressable>
          ) : reconcilePending ? (
            <Pressable
              onPress={onCheckStatus}
              disabled={submitting}
              style={({ pressed }) => [
                styles.submitButton,
                styles.submitPrimary,
                submitting && styles.submitDisabled,
                pressed && !submitting && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Check status"
              accessibilityHint="Asks the server whether the transaction was actually sent">
              {submitting ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <Text style={[styles.submitLabel, styles.submitPrimaryLabel]}>
                  Check status
                </Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={onPasteSigned}
              disabled={submitting || flow.storeMismatch}
              style={({ pressed }) => [
                styles.submitButton,
                styles.submitPrimary,
                (submitting || flow.storeMismatch) && styles.submitDisabled,
                pressed && !submitting && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Paste signed transaction"
              accessibilityHint="Reads the signed transaction from the clipboard and broadcasts it">
              {submitting ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <Text style={[styles.submitLabel, styles.submitPrimaryLabel]}>
                  Paste signed transaction
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </SendScreenScaffold>
  );
}

function StepRow({ index, text, last }: { index: number; text: string; last?: boolean }) {
  return (
    <View style={[styles.stepRow, !last && styles.stepDivider]}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepIndex}>{index}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: 16,
  },
  scroll: {
    paddingBottom: 16,
  },
  lede: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.secondaryText,
    paddingHorizontal: 4,
    paddingBottom: 16,
  },
  stepCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  stepDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  stepIndex: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.secondaryText,
  },
  qrWrap: {
    alignSelf: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#f5f5f7',
    marginBottom: 20,
  },
  exportRow: {
    flexDirection: 'row',
    gap: 12,
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 14,
    backgroundColor: COLORS.card,
  },
  pressed: {
    opacity: 0.7,
  },
  exportLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingTop: 16,
    paddingHorizontal: 4,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#F87171',
  },
  footer: {
    paddingVertical: 12,
  },
  submitButton: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
  },
  submitPrimary: {
    backgroundColor: COLORS.cream,
  },
  submitDisabled: {
    backgroundColor: COLORS.disabled,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  submitPrimaryLabel: {
    color: '#0B0B0F',
  },
});
