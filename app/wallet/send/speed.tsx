import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/auth/primary-button';
import { useSendFlow } from '@/components/wallet/send-flow-context';
import { SendScreenScaffold } from '@/components/wallet/send-screen-scaffold';
import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';
import { fetchSendFeeOptions, type SendSpeed } from '@/lib/btcpay/wallet-send';

const SPEED_META: Record<SendSpeed, { title: string; subtitle: string }> = {
  fast: { title: 'Fast', subtitle: 'Approximately 10 minutes' },
  standard: { title: 'Standard', subtitle: 'Approximately 1 hour' },
  economy: { title: 'Economy', subtitle: 'Approximately 6–24 hours' },
};

const SPEED_ORDER: SendSpeed[] = ['fast', 'standard', 'economy'];

/**
 * Network-speed selection. The three options hide the raw fee-rate mechanics;
 * the sat/vB shown under the selected option comes from BTCPay's real fee
 * estimation (per confirmation block target) — nothing is hardcoded. The final
 * fee in BTC is decided by the actual PSBT on the review screen.
 */
export default function SendSpeedScreen() {
  const router = useRouter();
  const flow = useSendFlow();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SendSpeed>(flow.speed);

  useEffect(() => {
    if (!flow.destination || flow.amountSats == null) {
      router.replace('/wallet/send/scan' as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFees = useCallback(async () => {
    if (!flow.storeId) return;
    setLoading(true);
    setLoadError(null);
    flow.setStatus('fetching_fee');
    const result = await fetchSendFeeOptions(flow.storeId);
    if (result.ok) {
      flow.setFeeOptions(result.value);
    } else {
      setLoadError(result.error);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.storeId]);

  useEffect(() => {
    loadFees();
  }, [loadFees]);

  const options = flow.feeOptions;

  function rateFor(speed: SendSpeed): number | null {
    const option = options?.find((o) => o.speed === speed);
    return option ? option.feeRateSatPerVb : null;
  }

  function onContinue() {
    if (!options) return;
    flow.setSpeed(selected);
    flow.setStatus('ready_for_review');
    router.push('/wallet/send/review' as never);
  }

  return (
    <SendScreenScaffold title="Network speed">
      <View style={styles.body}>
        <Text style={styles.lede}>
          How quickly should this transaction confirm? Faster costs a higher
          network fee.
        </Text>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={COLORS.primaryText} />
          </View>
        ) : loadError ? (
          <View style={styles.centerBox}>
            <MaterialIcons name="error-outline" size={24} color="#F87171" />
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable
              onPress={loadFees}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Retry loading fees">
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.optionList}>
            {SPEED_ORDER.map((speed) => {
              const isSelected = speed === selected;
              const rate = rateFor(speed);
              return (
                <Pressable
                  key={speed}
                  onPress={() => setSelected(speed)}
                  style={({ pressed }) => [
                    styles.option,
                    isSelected && styles.optionSelected,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${SPEED_META[speed].title}, ${SPEED_META[speed].subtitle}`}>
                  <View style={styles.optionBody}>
                    <Text style={styles.optionTitle}>{SPEED_META[speed].title}</Text>
                    <Text style={styles.optionSubtitle}>{SPEED_META[speed].subtitle}</Text>
                    {isSelected && rate != null ? (
                      <Text style={styles.optionRate}>
                        Estimated fee rate: {formatRate(rate)} sat/vB
                      </Text>
                    ) : null}
                  </View>
                  <MaterialIcons
                    name={isSelected ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={22}
                    color={isSelected ? HachisuColors.primary : COLORS.mutedText}
                  />
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.footer}>
          <PrimaryButton
            label="Continue"
            onPress={onContinue}
            disabled={loading || !!loadError || !options || flow.storeMismatch}
          />
        </View>
      </View>
    </SendScreenScaffold>
  );
}

/** Renders a sat/vB rate with up to 3 decimals, trailing zeros trimmed. */
function formatRate(rate: number): string {
  return rate
    .toFixed(3)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: 16,
  },
  lede: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.secondaryText,
    paddingHorizontal: 8,
    paddingBottom: 20,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.secondaryText,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.card,
  },
  retryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  optionList: {
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  optionSelected: {
    borderColor: HachisuColors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  optionBody: {
    flex: 1,
    gap: 3,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  optionSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.secondaryText,
  },
  optionRate: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.mutedText,
    paddingTop: 2,
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
});
