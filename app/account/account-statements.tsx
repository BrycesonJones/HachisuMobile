import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Fragment, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import { useActiveStore } from '@/contexts/active-store-context';
import { exportStoreReport, ReportExportError } from '@/lib/btcpay/report-export';
import {
  listStatementYears,
  statementFilename,
  statementMonthRange,
  type StatementMonth,
} from '@/lib/statements/statement-months';

/**
 * Account statements: a thin presentation layer over the existing Activity CSV
 * export. Nothing is generated or stored ahead of time — the month list is
 * derived on render from the active store's created_at and today's date, and
 * tapping a month runs the SAME export path as Activity → Export, scoped to
 * that calendar month ([start of month, start of next month), local time).
 *
 * The current month is intentionally listed: it exports month-to-date, not an
 * immutable bank-style statement.
 */
export default function AccountStatementsScreen() {
  const router = useRouter();
  const { activeStore, activeMerchantStoreId, loading } = useActiveStore();

  const sections = useMemo(
    () => listStatementYears(activeStore?.created_at),
    [activeStore?.created_at],
  );

  const [selectedMonth, setSelectedMonth] = useState<StatementMonth | null>(null);
  const [exporting, setExporting] = useState(false);

  function closeFormatSheet() {
    // The sheet stays up while an export is running so its progress state
    // remains visible and a second tap cannot start a duplicate.
    if (exporting) return;
    setSelectedMonth(null);
  }

  async function handleExportCsv() {
    // Re-read everything at press time: the sheet is asynchronous state, so the
    // active store could in principle have changed since the month was tapped.
    if (!selectedMonth || !activeMerchantStoreId || exporting) return;
    const month = selectedMonth;
    setExporting(true);
    try {
      await exportStoreReport(activeMerchantStoreId, {
        ...statementMonthRange(month),
        filename: statementFilename(activeStore?.name ?? '', month),
      });
      // An empty month still yields a valid header-only CSV — sharing it is the
      // intended behavior, so success needs no extra messaging.
      setSelectedMonth(null);
    } catch (error) {
      // Keep the sheet open so the user can retry or cancel.
      showStatementError(error, month);
    } finally {
      setExporting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
        </Pressable>
        <Text style={styles.title}>Account statements</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading && !activeStore ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={COLORS.secondaryText} />
        </View>
      ) : !activeStore ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Statements become available once you have a store.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {sections.map((section) => (
            <View key={section.year}>
              <Text style={styles.yearHeading}>{section.year}</Text>
              <View style={styles.card}>
                {section.months.map((month, index) => (
                  <Fragment key={month.key}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <Pressable
                      onPress={() => setSelectedMonth(month)}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`${month.label} statement`}>
                      <Text style={styles.rowLabel}>{month.label}</Text>
                    </Pressable>
                  </Fragment>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <StatementFormatSheet
        month={selectedMonth}
        exporting={exporting}
        onClose={closeFormatSheet}
        onExportCsv={() => void handleExportCsv()}
      />
    </SafeAreaView>
  );
}

interface StatementFormatSheetProps {
  /** The month being exported; null hides the sheet. */
  month: StatementMonth | null;
  exporting: boolean;
  onClose: () => void;
  onExportCsv: () => void;
}

/**
 * The "Statement format" selector. CSV is the only format: BTCPay provides no
 * PDF statement/export path, so PDF is intentionally not offered.
 */
function StatementFormatSheet({
  month,
  exporting,
  onClose,
  onExportCsv,
}: StatementFormatSheetProps) {
  return (
    <Modal
      visible={month != null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheetCard} onPress={() => {}} accessibilityViewIsModal>
          <Text style={styles.sheetTitle}>Statement format</Text>

          <Pressable
            onPress={onExportCsv}
            disabled={exporting}
            style={({ pressed }) => [styles.sheetRow, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel={
              month ? `Export ${month.label} statement as CSV` : 'Export as CSV'
            }
            accessibilityState={{ disabled: exporting, busy: exporting }}>
            <Text style={styles.sheetRowLabel}>.csv</Text>
            {exporting ? (
              <ActivityIndicator size="small" color={COLORS.secondaryText} />
            ) : null}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Failure copy in the merchant's terms, mirroring the Activity export button. */
function showStatementError(error: unknown, month: StatementMonth): void {
  if (error instanceof ReportExportError && error.code === 'REPORT_TOO_LARGE') {
    Alert.alert(
      'Statement too large',
      `${month.label} has too much data to export at once. Use the Activity export with a shorter period instead.`,
    );
    return;
  }
  const message =
    error instanceof Error ? error.message : 'The statement could not be exported.';
  Alert.alert('Export failed', message);
}

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
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  yearHeading: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primaryText,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  card: {
    marginHorizontal: 16,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: 18,
  },
  row: {
    paddingVertical: 18,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.primaryText,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.cardBorder,
  },
  pressed: {
    opacity: 0.7,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  sheetCard: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.secondaryText,
    marginBottom: 4,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    gap: 12,
  },
  sheetRowLabel: {
    fontSize: 18,
    fontWeight: '500',
    color: COLORS.primaryText,
  },
});
