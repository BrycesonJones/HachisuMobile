import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';
import { exportStoreReport, ReportExportError } from '@/lib/btcpay/report-export';

interface ExportReportButtonProps {
  /** The store to export. Null disables the control (no store selected yet). */
  merchantStoreId: string | null;
}

/**
 * Exports the active store's BTCPay-backed reporting CSV to the device's native
 * share/save sheet.
 *
 * The export is scoped to the store the merchant is currently viewing, resolved
 * server-side from their authenticated session — the button carries only the
 * Hachisu store id, never a BTCPay store id or credential.
 */
export function ExportReportButton({ merchantStoreId }: ExportReportButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handlePress() {
    if (!merchantStoreId || busy) return;
    setBusy(true);
    try {
      const result = await exportStoreReport(merchantStoreId);
      if (result.truncated) {
        // Never let a capped export read as a complete set of books.
        Alert.alert(
          'Partial export',
          `This export contains ${result.rowCount} rows but reached the maximum ` +
            'number of invoices per export. Export a shorter date range to capture ' +
            'the rest.',
        );
      }
    } catch (error) {
      const message =
        error instanceof ReportExportError || error instanceof Error
          ? error.message
          : 'The report could not be exported.';
      Alert.alert('Export failed', message);
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
