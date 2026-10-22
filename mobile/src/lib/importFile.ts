// Helpers for the PDF / CSV import flow (usePDFImport → PDFReviewScreen →
// useEquipmentMutations.addMultipleItems). Pure functions — unit-tested in
// importFile.test.ts.
import type { ParsedPDFItem } from './types';
import { isIsoDate } from './validation';

/**
 * MIME filter for the document picker. Android content providers (Downloads,
 * Drive, some file managers) often report .csv files as text/plain,
 * application/vnd.ms-excel or application/octet-stream; without those
 * entries the system picker greys CSV files out. Because the wider filter
 * also lets other files through, callers must check the pick with
 * classifyImportFile().
 */
export const IMPORT_MIME_TYPES: string[] = [
  'application/pdf',
  'text/csv',
  'text/comma-separated-values',
  'text/plain',
  'application/vnd.ms-excel',
  'application/octet-stream',
];

export type ImportFileKind = 'csv' | 'pdf';

/** Decides how a picked file is parsed; null means "not a PDF or CSV". */
export function classifyImportFile(file: {
  name: string;
  mimeType?: string | null;
}): ImportFileKind | null {
  const name = (file.name ?? '').toLowerCase();
  const mime = (file.mimeType ?? '').toLowerCase();
  if (name.endsWith('.csv') || mime === 'text/csv' || mime === 'text/comma-separated-values') {
    return 'csv';
  }
  if (name.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  return null;
}

export const UNNAMED_ITEM = '(Unnamed)';
export const UNASSIGNED_LOCATION = 'Unassigned';

export interface NormalizedImportRow {
  name: string;
  category: string | null;
  source: string | null;
  location: string;
  quantity: number;
  start_date: string | null;
  end_date: string | null;
}

/**
 * Turns a reviewed import row into column values safe to insert. Mirrors the
 * web app's normalizeItemForInsert (src/context/EquipmentContext.jsx): blank
 * name → "(Unnamed)", blank location → "Unassigned", bad quantity → 1, and a
 * date that is not YYYY-MM-DD → null (one bad date would otherwise fail the
 * whole batch insert).
 */
export function normalizeImportRow(parsed: ParsedPDFItem): NormalizedImportRow {
  const qty = Math.trunc(Number(parsed.quantity));
  const date = (v: string | null | undefined) => (v && isIsoDate(v) ? v : null);
  return {
    name: (parsed.name ?? '').trim() || UNNAMED_ITEM,
    category: (parsed.category ?? '').trim() || null,
    source: (parsed.source ?? '').trim() || null,
    location: (parsed.location ?? '').trim() || UNASSIGNED_LOCATION,
    quantity: Number.isFinite(qty) && qty >= 0 ? qty : 1,
    start_date: date(parsed.start_date),
    end_date: date(parsed.end_date),
  };
}
