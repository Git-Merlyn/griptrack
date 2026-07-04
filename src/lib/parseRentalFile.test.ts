// PDF parsing moved to the parse-rental-pdf Edge Function (Hermes can't run
// pdfjs-dist), so this file only covers the client-side pieces that remain:
// date helpers and the CSV parser.

let mockIdCounter = 0;

jest.mock('./db', () => ({
  generateId: jest.fn(() => `id-${++mockIdCounter}`),
}));

import { normalizeDate, extractDate, parseCSV } from './parseRentalFile';

beforeEach(() => {
  mockIdCounter = 0;
});

// ─── normalizeDate ────────────────────────────────────────────────────────────

describe('normalizeDate', () => {
  it('returns empty string for empty input', () => {
    expect(normalizeDate('')).toBe('');
    expect(normalizeDate('   ')).toBe('');
  });

  it('passes through already-ISO dates unchanged', () => {
    expect(normalizeDate('2026-05-01')).toBe('2026-05-01');
  });

  it('converts MM/DD/YYYY to ISO', () => {
    expect(normalizeDate('5/1/2026')).toBe('2026-05-01');
    expect(normalizeDate('12/31/2026')).toBe('2026-12-31');
  });

  it('converts MM-DD-YYYY to ISO', () => {
    expect(normalizeDate('5-1-2026')).toBe('2026-05-01');
  });

  it('converts YYYY/MM/DD to ISO', () => {
    expect(normalizeDate('2026/05/01')).toBe('2026-05-01');
  });

  it('converts DD.MM.YYYY (European) to ISO', () => {
    expect(normalizeDate('1.5.2026')).toBe('2026-05-01');
    expect(normalizeDate('31.12.2026')).toBe('2026-12-31');
  });

  it('returns trimmed original for unrecognised formats', () => {
    expect(normalizeDate(' May 1st ')).toBe('May 1st');
  });
});

// ─── extractDate ──────────────────────────────────────────────────────────────

describe('extractDate', () => {
  it('extracts ship date (start)', () => {
    expect(extractDate('Ship Date: 05/01/2026', 'start')).toBe('2026-05-01');
  });

  it('extracts delivery date (start)', () => {
    expect(extractDate('Delivery Date - 5/1/2026', 'start')).toBe('2026-05-01');
  });

  it('extracts return date (end)', () => {
    expect(extractDate('Return Date: 06/30/2026', 'end')).toBe('2026-06-30');
  });

  it('extracts due date (end)', () => {
    expect(extractDate('Due Date: 6/30/2026', 'end')).toBe('2026-06-30');
  });

  it('extracts expected return (end)', () => {
    expect(extractDate('Expected Return: 06/30/2026', 'end')).toBe('2026-06-30');
  });

  it('returns empty string when no date is found', () => {
    expect(extractDate('no dates here', 'start')).toBe('');
    expect(extractDate('no dates here', 'end')).toBe('');
  });

  it('is case-insensitive', () => {
    expect(extractDate('SHIP DATE: 05/01/2026', 'start')).toBe('2026-05-01');
  });
});

// ─── parseCSV ─────────────────────────────────────────────────────────────────

describe('parseCSV', () => {
  it('throws on an empty file', () => {
    expect(() => parseCSV('')).toThrow('CSV appears empty');
    expect(() => parseCSV('name,qty\n')).toThrow('CSV appears empty');
  });

  it('throws when the name column is missing', () => {
    expect(() => parseCSV('category,qty\nGrip,4')).toThrow('missing required column: name');
  });

  it('throws when no importable rows exist', () => {
    expect(() => parseCSV('name,quantity\n,\n')).toThrow('No importable rows');
  });

  it('parses simple name/category/quantity rows', () => {
    const items = parseCSV(
      ['name,category,quantity', 'C-Stand 40in,Grip,12', 'Sandbag 25lb,Grip,30'].join('\n')
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: 'C-Stand 40in', category: 'Grip', quantity: 12 });
    expect(items[1]).toMatchObject({ name: 'Sandbag 25lb', category: 'Grip', quantity: 30 });
  });

  it('accepts qty as a header alias for quantity', () => {
    const items = parseCSV('name,qty\nApple Box,6');
    expect(items[0].quantity).toBe(6);
  });

  it('defaults invalid or non-positive quantities to 1', () => {
    const items = parseCSV(
      ['name,quantity', 'Apple Box,abc', 'Turtle Base,0', 'Low Boy,-2'].join('\n')
    );
    expect(items.map((i) => i.quantity)).toEqual([1, 1, 1]);
  });

  it('carries a category forward to later rows (sticky category)', () => {
    const items = parseCSV(
      ['name,category,quantity', 'C-Stand,Grip,4', 'Sandbag,,6'].join('\n')
    );
    expect(items[1].category).toBe('Grip');
  });

  it('treats a category-only row as a section header', () => {
    const items = parseCSV(
      ['name,category,quantity', ',Electric,', 'SkyPanel S60,,2'].join('\n')
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'SkyPanel S60', category: 'Electric', quantity: 2 });
  });

  it('uses a preceding name-only row as the sticky base name for status rows', () => {
    const items = parseCSV(
      ['name,category,quantity', 'ARRI SkyPanel S60,Electric,', 'Available,,3'].join('\n')
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'ARRI SkyPanel S60', quantity: 3 });
  });

  it('handles quoted fields containing commas', () => {
    const items = parseCSV('name,category,quantity\n"Clamp, Cardellini",Grip,15');
    expect(items[0].name).toBe('Clamp, Cardellini');
    expect(items[0].quantity).toBe(15);
  });

  it('collapses repeated whitespace in names', () => {
    const items = parseCSV('name,quantity\nC-Stand    40in,4');
    expect(items[0].name).toBe('C-Stand 40in');
  });

  it('assigns a unique id to every parsed item', () => {
    const items = parseCSV(['name,quantity', 'A,1', 'B,2'].join('\n'));
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(items.length);
  });
});
