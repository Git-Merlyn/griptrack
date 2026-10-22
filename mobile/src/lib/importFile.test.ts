import {
  IMPORT_MIME_TYPES,
  classifyImportFile,
  normalizeImportRow,
  UNASSIGNED_LOCATION,
  UNNAMED_ITEM,
} from './importFile';
import type { ParsedPDFItem } from './types';

const row = (patch: Partial<ParsedPDFItem> = {}): ParsedPDFItem => ({
  id: 'tmp-1',
  name: 'C-Stand',
  category: 'Grip',
  quantity: 4,
  source: 'Rental house',
  location: 'Truck 1',
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  ...patch,
});

describe('IMPORT_MIME_TYPES', () => {
  it('includes the MIME types Android reports for CSV files', () => {
    expect(IMPORT_MIME_TYPES).toEqual(
      expect.arrayContaining([
        'application/pdf',
        'text/csv',
        'text/comma-separated-values',
        'text/plain',
        'application/vnd.ms-excel',
        'application/octet-stream',
      ])
    );
  });
});

describe('classifyImportFile', () => {
  it('treats .csv files as CSV whatever MIME type Android reports', () => {
    expect(classifyImportFile({ name: 'order.csv', mimeType: 'text/csv' })).toBe('csv');
    expect(classifyImportFile({ name: 'order.CSV', mimeType: 'text/plain' })).toBe('csv');
    expect(classifyImportFile({ name: 'order.csv', mimeType: 'application/vnd.ms-excel' })).toBe('csv');
    expect(classifyImportFile({ name: 'order.csv', mimeType: 'application/octet-stream' })).toBe('csv');
    expect(classifyImportFile({ name: 'order', mimeType: 'text/comma-separated-values' })).toBe('csv');
  });

  it('treats PDFs as PDF', () => {
    expect(classifyImportFile({ name: 'quote.pdf', mimeType: 'application/pdf' })).toBe('pdf');
    expect(classifyImportFile({ name: 'quote.PDF', mimeType: null })).toBe('pdf');
    expect(classifyImportFile({ name: 'quote', mimeType: 'application/pdf' })).toBe('pdf');
  });

  it('rejects anything else', () => {
    expect(classifyImportFile({ name: 'notes.txt', mimeType: 'text/plain' })).toBeNull();
    expect(classifyImportFile({ name: 'sheet.xls', mimeType: 'application/vnd.ms-excel' })).toBeNull();
    expect(classifyImportFile({ name: 'blob', mimeType: 'application/octet-stream' })).toBeNull();
  });
});

describe('normalizeImportRow', () => {
  it('trims and keeps valid values', () => {
    expect(normalizeImportRow(row({ name: '  C-Stand ', location: ' Truck 1 ' }))).toEqual({
      name: 'C-Stand',
      category: 'Grip',
      source: 'Rental house',
      location: 'Truck 1',
      quantity: 4,
      start_date: '2026-10-01',
      end_date: '2026-10-31',
    });
  });

  it('fills a blank location and name like the web importer', () => {
    const out = normalizeImportRow(row({ name: '   ', location: '' }));
    expect(out.name).toBe(UNNAMED_ITEM);
    expect(out.location).toBe(UNASSIGNED_LOCATION);
    expect(UNASSIGNED_LOCATION).toBe('Unassigned');
    expect(UNNAMED_ITEM).toBe('(Unnamed)');
  });

  it('turns blank category and source into null', () => {
    const out = normalizeImportRow(row({ category: ' ', source: '' }));
    expect(out.category).toBeNull();
    expect(out.source).toBeNull();
  });

  it('keeps 0, truncates fractions, and replaces a bad quantity with 1', () => {
    expect(normalizeImportRow(row({ quantity: 0 })).quantity).toBe(0);
    expect(normalizeImportRow(row({ quantity: 3.7 })).quantity).toBe(3);
    expect(normalizeImportRow(row({ quantity: NaN })).quantity).toBe(1);
    expect(normalizeImportRow(row({ quantity: -2 })).quantity).toBe(1);
  });

  it('drops dates that are not YYYY-MM-DD instead of failing the batch', () => {
    const out = normalizeImportRow(row({ start_date: '10/01/2026', end_date: null }));
    expect(out.start_date).toBeNull();
    expect(out.end_date).toBeNull();
  });
});
