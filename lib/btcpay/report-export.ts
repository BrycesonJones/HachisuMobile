import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { isDevAuthActive } from '@/lib/auth/dev-session';
import { readFunctionError } from '@/lib/btcpay/function-error';
import { supabase } from '@/lib/supabase';
import type { StoreReportExportResponse } from '@/types/activity';

/** Subdirectory of the cache dir the export file is written to. */
const EXPORT_DIR = 'reports';
/** Conservative filename guard applied to the SERVER-authored name. */
const SAFE_FILENAME = /^[A-Za-z0-9._-]+\.csv$/;

export interface ExportedReport {
  filename: string;
  rowCount: number;
  invoiceCount: number;
  range: { startDate: string; endDate: string };
  /** True when the server capped the export; the caller must surface this. */
  truncated: boolean;
}

export interface ExportStoreReportOptions {
  startDate?: string;
  endDate?: string;
}

/** A classified export failure, so the UI can say what actually went wrong. */
export class ReportExportError extends Error {
  readonly code:
    | 'UNAVAILABLE_IN_DEV'
    | 'REQUEST_FAILED'
    | 'INVALID_RESPONSE'
    | 'FILE_WRITE_FAILED'
    | 'SHARING_UNAVAILABLE'
    | 'SHARE_FAILED';

  constructor(code: ReportExportError['code'], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReportExportError';
    this.code = code;
  }
}

/**
 * Exports the active store's authoritative BTCPay-backed reporting CSV and hands
 * it to the device's native share/save sheet.
 *
 * The BTCPay Greenfield credential stays server-side: the Edge Function resolves
 * the caller's owned store, builds the report from BTCPay's own invoice/payment
 * data, and returns only CSV text. Nothing about BTCPay reaches this module
 * except that text and a server-authored filename.
 */
export async function exportStoreReport(
  merchantStoreId: string,
  options: ExportStoreReportOptions = {},
): Promise<ExportedReport> {
  if (isDevAuthActive()) {
    throw new ReportExportError(
      'UNAVAILABLE_IN_DEV',
      'Exporting is unavailable in developer mode.',
    );
  }

  const { data, error } = await supabase.functions.invoke<StoreReportExportResponse>(
    'export-btcpay-store-report',
    {
      method: 'POST',
      body: {
        merchantStoreId,
        startDate: options.startDate,
        endDate: options.endDate,
      },
    },
  );

  if (error) {
    throw new ReportExportError(
      'REQUEST_FAILED',
      (await readFunctionError(error)) ?? error.message,
    );
  }
  if (!data?.ok) {
    throw new ReportExportError(
      'REQUEST_FAILED',
      data?.error ?? 'Could not build the report.',
    );
  }
  if (typeof data.csv !== 'string' || typeof data.filename !== 'string') {
    throw new ReportExportError('INVALID_RESPONSE', 'The report response was malformed.');
  }

  // The filename is authored server-side from an allow-list, but it is still
  // validated here before it is ever used as a path component — a name is never
  // trusted just because it came from our own backend.
  const filename = SAFE_FILENAME.test(data.filename) ? data.filename : 'hachisu-report.csv';

  let file: File;
  try {
    const directory = new Directory(Paths.cache, EXPORT_DIR);
    if (!directory.exists) directory.create({ intermediates: true });
    file = new File(directory, filename);
    // Overwrite any previous export of the same range rather than accumulating.
    if (file.exists) file.delete();
    file.create();
    file.write(data.csv);
  } catch (cause) {
    throw new ReportExportError(
      'FILE_WRITE_FAILED',
      'The report could not be saved to this device.',
      { cause },
    );
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new ReportExportError(
      'SHARING_UNAVAILABLE',
      'Sharing is not available on this device.',
    );
  }

  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'Export report',
    });
  } catch (cause) {
    throw new ReportExportError('SHARE_FAILED', 'The report could not be shared.', {
      cause,
    });
  }

  return {
    filename,
    rowCount: data.rowCount ?? 0,
    invoiceCount: data.invoiceCount ?? 0,
    range: data.range ?? { startDate: '', endDate: '' },
    truncated: data.truncated === true,
  };
}
