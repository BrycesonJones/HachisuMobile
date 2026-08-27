import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { isDevAuthActive } from '@/lib/auth/dev-session';
import { readFunctionError } from '@/lib/btcpay/function-error';
import { supabase } from '@/lib/supabase';
import type {
  StoreReportExportErrorCode,
  StoreReportExportResponse,
} from '@/types/activity';

/** Subdirectory of the cache dir the export file is written to. */
const EXPORT_DIR = 'reports';
/** Conservative filename guard applied to the SERVER-authored name. */
const SAFE_FILENAME = /^[A-Za-z0-9._-]+\.csv$/;

export interface ExportedReport {
  filename: string;
  rowCount: number;
  invoiceCount: number;
  /** `startDate` is null when the export covered all available history. */
  range: { startDate: string | null; endDate: string };
}

export interface ExportStoreReportOptions {
  /** ISO start bound. Omit to export all available history. */
  startDate?: string;
  /** ISO end bound. Omit to end at the moment the request is served. */
  endDate?: string;
}

type ReportExportErrorCode =
  | StoreReportExportErrorCode
  | 'UNAVAILABLE_IN_DEV'
  | 'REQUEST_FAILED'
  | 'INVALID_RESPONSE'
  | 'FILE_WRITE_FAILED'
  | 'SHARING_UNAVAILABLE'
  | 'SHARE_FAILED';

/** A classified export failure, so the UI can say what actually went wrong. */
export class ReportExportError extends Error {
  readonly code: ReportExportErrorCode;

  constructor(code: ReportExportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReportExportError';
    this.code = code;
  }
}

/**
 * Exports the active store's BTCPay-equivalent reporting CSV and hands it to the
 * device's native share/save sheet.
 *
 * The output is derived from authoritative Greenfield invoice/payment data; it is
 * not the canonical file BTCPay itself generates (BTCPay exposes no API for that
 * — see supabase/functions/_shared/report-rows.ts).
 *
 * Completeness: the server returns a CSV covering the WHOLE requested range or
 * fails outright. There is no partial-export path, so a file that reaches this
 * function is always complete for its range.
 *
 * The BTCPay Greenfield credential stays server-side: the Edge Function resolves
 * the caller's owned store and returns only CSV text.
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
    const parsed = await readExportError(error);
    throw new ReportExportError(
      parsed.code ?? 'REQUEST_FAILED',
      parsed.message ?? error.message,
    );
  }
  if (!data?.ok) {
    throw new ReportExportError(
      data?.code ?? 'REQUEST_FAILED',
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
    range: data.range ?? { startDate: null, endDate: '' },
  };
}

/** Reads `{ code, error }` from a non-2xx functions.invoke response body. */
async function readExportError(
  error: unknown,
): Promise<{ code?: StoreReportExportErrorCode; message?: string }> {
  const context = (error as { context?: unknown })?.context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = await (context as Response).json();
      return {
        code:
          typeof body?.code === 'string'
            ? (body.code as StoreReportExportErrorCode)
            : undefined,
        message: typeof body?.error === 'string' ? body.error : undefined,
      };
    } catch {
      // Body was not JSON — fall back to the generic message.
    }
  }
  return { message: await readFunctionError(error) };
}
