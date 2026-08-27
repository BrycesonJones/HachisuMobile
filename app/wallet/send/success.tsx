import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/auth/primary-button';
import { useSendFlow } from '@/components/wallet/send-flow-context';
import { SendScreenScaffold } from '@/components/wallet/send-screen-scaffold';
import { COLORS } from '@/constants/colors';
import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { formatBtcFromSats } from '@/lib/btcpay/balance-format';
import { formatShortAddress } from '@/lib/send/destination';

/**
 * Terminal success screen. Reachable ONLY after the backend confirms BTCPay
 * accepted the broadcast — the flow context can't enter 'broadcast' any other
 * way. The store-switch guard is off: this transaction already happened.
 */
export default function SendSuccessScreen() {
  const router = useRouter();
  const flow = useSendFlow();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!flow.broadcasted) {
      router.replace('/wallet/send/scan' as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sent = flow.broadcasted;

  const onCopyTxid = useCallback(async () => {
    if (!sent?.txid) return;
    await Clipboard.setStringAsync(sent.txid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [sent]);

  const onDone = useCallback(() => {
    flow.reset();
    router.dismissTo('/(tabs)/home');
  }, [flow, router]);

  if (!sent) return <SendScreenScaffold title="">{null}</SendScreenScaffold>;

  return (
    <SendScreenScaffold title="" guardStoreMismatch={false}>
      <View style={styles.body}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <MaterialIcons name="check" size={36} color={DASHBOARD_COLORS.bitcoinGreen} />
          </View>
          <Text style={styles.title}>Bitcoin sent</Text>
          <Text style={styles.amount}>{formatBtcFromSats(sent.amountSats)} BTC</Text>
        </View>

        <View style={styles.card}>
          <DetailRow label="To" value={formatShortAddress(sent.destination)} />
          <DetailRow label="Network fee" value={`${formatBtcFromSats(sent.feeSats)} BTC`} />
          {sent.txid ? (
            <Pressable
              onPress={onCopyTxid}
              style={({ pressed }) => [styles.row, pressed && styles.pressedRow]}
              accessibilityRole="button"
              accessibilityLabel="Copy transaction ID">
              <Text style={styles.rowLabel}>Transaction ID</Text>
              <View style={styles.txidValue}>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {formatShortAddress(sent.txid)}
                </Text>
                <MaterialIcons
                  name={copied ? 'check' : 'content-copy'}
                  size={16}
                  color={COLORS.secondaryText}
                />
              </View>
            </Pressable>
          ) : null}
        </View>

        {sent.syncWarning ? (
          <Text style={styles.note}>
            The transaction was broadcast, but its record may take a moment to
            appear in Activity.
          </Text>
        ) : null}

        <View style={styles.footer}>
          <PrimaryButton label="Done" onPress={onDone} />
        </View>
      </View>
    </SendScreenScaffold>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.row, styles.rowDivider]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
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
  hero: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 32,
    gap: 10,
  },
  heroBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  amount: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.secondaryText,
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
  pressedRow: {
    opacity: 0.7,
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
    fontVariant: ['tabular-nums'],
  },
  txidValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.mutedText,
    textAlign: 'center',
    paddingTop: 16,
    paddingHorizontal: 8,
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
});
