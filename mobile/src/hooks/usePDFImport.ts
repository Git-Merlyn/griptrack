import { useState, useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ParsedPDFItem, PdfLayoutUse } from '../lib/types';
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
}

interface UsePDFImportReturn {
  status: PDFImportStatus;
  error: string | null;
  pickAndParse: () => Promise<PDFImportResult | null>;
}

function isLayoutUse(v: unknown): v is PdfLayoutUse {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o.id === 'string' && typeof o.name === 'string' && typeof o.drift === 'boolean';
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

      let items: ParsedPDFItem[];
      let layout: PdfLayoutUse | null = null;

      if (isCsv) {
        const text = await FileSystem.readAsStringAsync(asset.uri);
        items = parseCSV(text);
      } else {
        // Send the PDF to the Edge Function for server-side parsing.
        // Hermes (React Native's JS engine) doesn't support import.meta, so
        // client-side PDF parsing libraries like pdfjs-dist can't run on device.
        if (typeof asset.size === 'number' && asset.size > MAX_PDF_UPLOAD_BYTES) {
          throw new Error(PDF_TOO_LARGE_MESSAGE);
        }
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: 'base64',
        });

        // invokeFn surfaces the function's own error text (e.g. "Unauthorized",
        // "fileBase64 is required") instead of the generic non-2xx message.
        // v: 2 asks for { items, layout } (WP26 Phase 3). A function that
        // predates it still answers with a bare array, so accept both.
        const data = await invokeFn<unknown>('parse-rental-pdf', {
          body: { fileBase64: base64, fileName: asset.name, v: 2 },
        });

        if (Array.isArray(data)) {
          items = data as ParsedPDFItem[];
        } else if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
          items = (data as { items: ParsedPDFItem[] }).items;
          const l = (data as { layout?: unknown }).layout;
          layout = isLayoutUse(l) ? l : null;
        } else {
          throw new Error('Unexpected response from parse-rental-pdf');
        }
      }

      setStatus('done');
      return { items, layout };
    } catch (e: any) {
      const msg = e.message ?? 'Failed to parse file';
      setStatus('error');
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  return { status, error, pickAndParse };
}
