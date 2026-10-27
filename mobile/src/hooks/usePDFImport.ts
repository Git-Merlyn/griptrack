import { useState, useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ParsedPDFItem, PdfLayoutUse, PdfFileRef } from '../lib/types';
import type { PdfPages } from '../lib/pdfLayouts';
import { parseCSV } from '../lib/parseRentalFile';
import { IMPORT_MIME_TYPES, classifyImportFile } from '../lib/importFile';
import { invokeFn } from '../lib/invokeFn';

export type PDFImportStatus = 'idle' | 'parsing' | 'done' | 'error';

/**
 * Largest PDF sent to parse-rental-pdf. Mirrors MAX_PDF_BYTES in
 * supabase/functions/parse-rental-pdf/limits.ts, which answers 413 above it.
 * Checking here skips base64-encoding and uploading a file that will be refused.
 */
export const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;
export const PDF_TOO_LARGE_MESSAGE = 'This PDF is too large. The limit is 10 MB.';

export interface PDFImportResult {
  items: ParsedPDFItem[];
  /** Saved supplier layout the server used; null for CSV or the general reader. */
  layout: PdfLayoutUse | null;
  /** First pages' text items, for "teach it" (WP26 Phase 3b); null for CSV. */
  pages: PdfPages | null;
  /** The picked PDF, so "teach it" can read it again after saving; null for CSV. */
  file: PdfFileRef | null;
}

function isLayoutUse(v: unknown): v is PdfLayoutUse {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o.id === 'string' && typeof o.name === 'string' && typeof o.drift === 'boolean';
}

function isPages(v: unknown): v is PdfPages {
  return Array.isArray(v) && v.every((p) => Array.isArray(p));
}

/**
 * Upload one PDF to parse-rental-pdf and return its rows, the saved layout
 * used (if any) and the first pages' text items. Also used by "teach it" to
 * re-read the same file once a layout is saved.
 */
export async function parsePdfFile(file: PdfFileRef): Promise<PDFImportResult> {
  // Hermes (React Native's JS engine) doesn't support import.meta, so
  // client-side PDF parsing libraries like pdfjs-dist can't run on device.
  if (typeof file.size === 'number' && file.size > MAX_PDF_UPLOAD_BYTES) {
    throw new Error(PDF_TOO_LARGE_MESSAGE);
  }
  const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });

  // invokeFn surfaces the function's own error text (e.g. "Unauthorized",
  // "fileBase64 is required") instead of the generic non-2xx message.
  // v: 2 asks for { items, layout } (WP26 Phase 3) and pages: true for the
  // teach-it pages (3b). A function that predates them answers with a bare
  // array or without pages, so accept all three.
  const data = await invokeFn<unknown>('parse-rental-pdf', {
    body: { fileBase64: base64, fileName: file.name, v: 2, pages: true },
  });

  if (Array.isArray(data)) return { items: data as ParsedPDFItem[], layout: null, pages: null, file };
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    const d = data as { items: ParsedPDFItem[]; layout?: unknown; pages?: unknown };
    return {
      items: d.items,
      layout: isLayoutUse(d.layout) ? d.layout : null,
      pages: isPages(d.pages) ? d.pages : null,
      file,
    };
  }
  throw new Error('Unexpected response from parse-rental-pdf');
}

interface UsePDFImportReturn {
  status: PDFImportStatus;
  error: string | null;
  pickAndParse: () => Promise<PDFImportResult | null>;
}

export function usePDFImport(): UsePDFImportReturn {
  const [status, setStatus] = useState<PDFImportStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const pickAndParse = useCallback(async (): Promise<PDFImportResult | null> => {
    setError(null);
    setStatus('idle');

    const result = await DocumentPicker.getDocumentAsync({
      type: IMPORT_MIME_TYPES,
    });
    if (result.canceled || !result.assets?.length) return null;

    const asset = result.assets[0];
    setStatus('parsing');

    try {
      // The picker filter is wide (Android reports CSVs under several MIME
      // types), so reject anything that is not a PDF or CSV here instead of
      // uploading it to parse-rental-pdf.
      const kind = classifyImportFile(asset);
      if (!kind) {
        throw new Error('Unsupported file type. Choose a PDF or CSV file.');
      }
      const isCsv = kind === 'csv';

      let result: PDFImportResult;
      if (isCsv) {
        const text = await FileSystem.readAsStringAsync(asset.uri);
        result = { items: parseCSV(text), layout: null, pages: null, file: null };
      } else {
        result = await parsePdfFile({ uri: asset.uri, name: asset.name, size: asset.size ?? null });
      }

      setStatus('done');
      return result;
    } catch (e: any) {
      const msg = e.message ?? 'Failed to parse file';
      setStatus('error');
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  return { status, error, pickAndParse };
}
