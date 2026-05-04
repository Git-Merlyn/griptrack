import { useState, useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ParsedPDFItem } from '../lib/types';
import { parsePDF, parseCSV } from '../lib/parseRentalFile';

export type PDFImportStatus = 'idle' | 'parsing' | 'done' | 'error';

interface UsePDFImportReturn {
  status: PDFImportStatus;
  error: string | null;
  pickAndParse: () => Promise<ParsedPDFItem[] | null>;
}

export function usePDFImport(): UsePDFImportReturn {
  const [status, setStatus] = useState<PDFImportStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const pickAndParse = useCallback(async (): Promise<ParsedPDFItem[] | null> => {
    setError(null);
    setStatus('idle');

    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'text/csv', 'text/comma-separated-values'],
    });
    if (result.canceled || !result.assets?.length) return null;

    const asset = result.assets[0];
    setStatus('parsing');

    try {
      const isCsv =
        asset.mimeType === 'text/csv' ||
        asset.mimeType === 'text/comma-separated-values' ||
        asset.name.toLowerCase().endsWith('.csv');

      let items: ParsedPDFItem[];

      if (isCsv) {
        const text = await FileSystem.readAsStringAsync(asset.uri);
        items = parseCSV(text);
      } else {
        // Read PDF as base64, convert to Uint8Array for pdfjs-dist
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: 'base64',
        });
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        items = await parsePDF(bytes);
      }

      setStatus('done');
      return items;
    } catch (e: any) {
      const msg = e.message ?? 'Failed to parse file';
      setStatus('error');
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  return { status, error, pickAndParse };
}
