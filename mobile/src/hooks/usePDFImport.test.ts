import { renderHook, act } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { usePDFImport, MAX_PDF_UPLOAD_BYTES, PDF_TOO_LARGE_MESSAGE } from './usePDFImport';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ readAsStringAsync: jest.fn() }));
jest.mock('../lib/parseRentalFile', () => ({ parseCSV: jest.fn(() => []) }));
jest.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const pick = DocumentPicker.getDocumentAsync as jest.Mock;
const read = FileSystem.readAsStringAsync as jest.Mock;
const invoke = supabase.functions.invoke as jest.Mock;

function pdfAsset(size: number | undefined) {
  return {
    canceled: false,
    assets: [{ uri: 'file:///tmp/list.pdf', name: 'list.pdf', mimeType: 'application/pdf', size }],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  read.mockResolvedValue('JVBERi0=');
  invoke.mockResolvedValue({ data: [], error: null, response: { status: 200 } });
});

describe('usePDFImport size limit (audit L73)', () => {
  it('limit matches the edge function (10 MB)', () => {
    expect(MAX_PDF_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });

  it('rejects a PDF over the limit without reading or uploading it', async () => {
    pick.mockResolvedValue(pdfAsset(MAX_PDF_UPLOAD_BYTES + 1));
    const { result } = await renderHook(() => usePDFImport());
    let caught: unknown;
    await act(async () => {
      try {
        await result.current.pickAndParse();
      } catch (e) {
        caught = e;
      }
    });
    expect((caught as Error).message).toBe(PDF_TOO_LARGE_MESSAGE);
    expect(read).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(PDF_TOO_LARGE_MESSAGE);
  });

  it('uploads a PDF at exactly the limit', async () => {
    pick.mockResolvedValue(pdfAsset(MAX_PDF_UPLOAD_BYTES));
    const { result } = await renderHook(() => usePDFImport());
    await act(async () => {
      await expect(result.current.pickAndParse()).resolves.toEqual([]);
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      'parse-rental-pdf',
      expect.objectContaining({ body: { fileBase64: 'JVBERi0=', fileName: 'list.pdf' } }),
    );
  });

  it('uploads when the picker does not report a size', async () => {
    pick.mockResolvedValue(pdfAsset(undefined));
    const { result } = await renderHook(() => usePDFImport());
    await act(async () => {
      await expect(result.current.pickAndParse()).resolves.toEqual([]);
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
