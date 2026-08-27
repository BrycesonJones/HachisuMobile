import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { exportStoreReport, ReportExportError } from '@/lib/btcpay/report-export';

/**
 * Reporting periods offered by the Export action. Mirrors the Invoices screen's
 * time-filter concept (a lookback in days, null = everything) rather than
 * introducing a second date model. Kept deliberately short — this is a mobile
 * action sheet, not a reporting console.
 */
interface ExportRangeOption {
  label: string;
  days: number | null;
}

const EXPORT_RANGES: readonly ExportRangeOption[] = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 12 months', days: 365 },
  { label: 'All time', days: null },
];

interface ExportReportButtonProps {
  /** The store to export. Null disables the control (no store selected yet). */
  merchantStoreId: string | null;
}

/**
 * Exports the active store's BTCPay-equivalent reporting CSV to the device's
 * native share/save sheet.
 *
 * The export is scoped to the store the merchant is currently viewing, resolved
 * server-side from their authenticated session — the button carries only the
 * Hachisu store id, never a BTCPay store id or credential. The store id is read
 * at press time, so a store switch can never export the previous store.
 */
export function ExportReportButton({ merchantStoreId }: ExportReportButtonProps) {
  const [busy, setBusy] = useState(false);

  function handlePress() {
    if (!merchantStoreId || busy) return;
    Alert.alert(
      'Export report',
      'Choose the period to export.',
      [
        ...EXPORT_RANGES.map((range) => ({
          text: range.label,
          onPress: () => void runExport(range),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  }

  async function runExport(range: ExportRangeOption) {
    // Re-read the store at execution time: the sheet is asynchronous, so the
    // active store could have changed between opening it and choosing a period.
    if (!merchantStoreId || busy) return;
    setBusy(true);
    try {
      const startDate =
        range.days == null
          ? undefined
          : new Date(Date.now() - range.days * 86_400_000).toISOString();
      const result = await exportStoreReport(merchantStoreId, { startDate });
      if (result.rowCount === 0) {
        Alert.alert(
          'Nothing to export',
          `There are no reportable records for ${range.label.toLowerCase()}.`,
        );
      }
    } catch (error) {
      showExportError(error, range);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={!merchantStoreId || busy}
      style={({ pressed }) => [
        styles.button,
        (pressed || busy) && styles.pressed,
        !merchantStoreId && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !merchantStoreId || busy, busy }}
      accessibilityLabel="Export this store's report as a CSV file"
      hitSlop={8}>
      {busy ? (
        <ActivityIndicator size="small" color={DASHBOARD_COLORS.primaryText} />
      ) : (
        <MaterialIcons
          name="ios-share"
          size={16}
          color={DASHBOARD_COLORS.primaryText}
        />
      )}
      <Text style={styles.label}>Export</Text>
    </Pressable>
  );
}

/**
 * Surfaces a failure in the merchant's terms. A too-large range is the one case
 * with a concrete next step, so it gets its own copy; dismissing the share sheet
 * is not an error and never reaches here.
 */
function showExportError(error: unknown, range: ExportRangeOption): void {
  if (error instanceof ReportExportError && error.code === 'REPORT_TOO_LARGE') {
    Alert.alert(
      'Range too large',
      `${range.label} is too much data to export at once. Try a shorter period.`,
    );
    return;
  }
  const message =
    error instanceof Error ? error.message : 'The report could not be exported.';
  Alert.alert('Export failed', message);
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: DASHBOARD_COLORS.iconBackground,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: DASHBOARD_COLORS.primaryText,
  },
});
