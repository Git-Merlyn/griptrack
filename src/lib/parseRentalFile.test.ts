jest.mock('pdfjs-dist', () => ({
  getDocument: jest.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
}));

jest.mock('./db', () => ({
  generateId: jest.fn(() => 'test-id'),
}));

import { getDocument } from 'pdfjs-dist';
import {
  normalizeDate,
  extractDate,
  splitMergedLines,
  takeLowPercentileMean,
  parsePDF,
  parseCSV,
} from './parseRentalFile';

const mockGetDocument = getDocument as jest.Mock;

// ─── PDF test helpers ─────────────────────────────────────────────────────────

type TextChunk = { str: string; x: number; y: number };

function makePageMock(chunks: TextChunk[]) {
  return {
    getTextContent: jest.fn().mockResolvedValue({
      items: chunks.map(({ str, x, y }) => ({
        str,
        transform: [1, 0, 0, 1, x, y],
      })),
    }),
  };
}

function makePDFMock(pages: TextChunk[][]) {
  return {
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: jest.fn().mockImplementation(async (n: number) => makePageMock(pages[n - 1])),
    }),
  };
}

// ─── normalizeDate ────────────────────────────────────────────────────────────

describe('normalizeDate', () => {
  it('returns empty string for empty input', () => {
    expect(normalizeDate('')).toBe('');
    expect(normalizeDate('   ')).toBe('');
  });

  it('passes through already-ISO dates unchanged', () => {
    expect(normalizeDate('2026-01-15')).toBe('2026-01-15');
  });

  it('converts MM/DD/YYYY to ISO', () => {
    expect(normalizeDate('01/15/2026')).toBe('2026-01-15');
    expect(normalizeDate('1/5/2026')).toBe('2026-01-05');
  });

  it('converts MM-DD-YYYY to ISO', () => {
    expect(normalizeDate('01-15-2026')).toBe('2026-01-15');
  });

  it('converts YYYY/MM/DD to ISO', () => {
    expect(normalizeDate('2026/01/15')).toBe('2026-01-15');
  });

  it('converts DD.MM.YYYY (European) to ISO', () => {
    expect(normalizeDate('15.01.2026')).toBe('2026-01-15');
    expect(normalizeDate('5.1.2026')).toBe('2026-01-05');
  });

  it('returns trimmed original for unrecognised formats', () => {
    expect(normalizeDate('Jan 15, 2026')).toBe('Jan 15, 2026');
  });
});

// ─── extractDate ─────────────────────────────────────────────────────────────

describe('extractDate', () => {
  it('extracts ship date (start)', () => {
    expect(extractDate('Ship Date: 01/15/2026', 'start')).toBe('2026-01-15');
  });

  it('extracts delivery date (start)', () => {
    expect(extractDate('Delivery Date: 03/01/2026', 'start')).toBe('2026-03-01');
  });

  it('extracts return date (end)', () => {
    expect(extractDate('Return Date: 01/22/2026', 'end')).toBe('2026-01-22');
  });

  it('extracts due date (end)', () => {
    expect(extractDate('Due Date: 2026-02-28', 'end')).toBe('2026-02-28');
  });

  it('extracts expected return (end)', () => {
    expect(extractDate('Expected Return: 02/14/2026', 'end')).toBe('2026-02-14');
  });

  it('returns empty string when no date is found', () => {
    expect(extractDate('No date here at all', 'start')).toBe('');
    expect(extractDate('No date here at all', 'end')).toBe('');
  });

  it('is case-insensitive', () => {
    expect(extractDate('SHIP DATE: 01/15/2026', 'start')).toBe('2026-01-15');
    expect(extractDate('return date: 01/22/2026', 'end')).toBe('2026-01-22');
  });
});

// ─── splitMergedLines ─────────────────────────────────────────────────────────

describe('splitMergedLines', () => {
  it('passes through lines with no equipment code unchanged', () => {
    const lines = ['4 Baby Stand', 'GRIP EQUIPMENT'];
    expect(splitMergedLines(lines)).toEqual(lines);
  });

  it('passes through a line with exactly one code unchanged', () => {
    const lines = ['ARRI001 Alexa LF Camera'];
    expect(splitMergedLines(lines)).toEqual(lines);
  });

  it('splits a line containing two codes into two segments', () => {
    const line = 'ARRI001 Alexa LF ARRI002 Alexa 35';
    const result = splitMergedLines([line]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('ARRI001 Alexa LF');
    expect(result[1]).toBe('ARRI002 Alexa 35');
  });

  it('splits a line containing three codes into three segments', () => {
    const line = 'ABC001 Desc A DEF002 Desc B GHI003 Desc C';
    const result = splitMergedLines([line]);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('ABC001 Desc A');
    expect(result[1]).toBe('DEF002 Desc B');
    expect(result[2]).toBe('GHI003 Desc C');
  });

  it('handles a mix of code and non-code lines', () => {
    const lines = ['no code here', 'ARRI001 cam 1 ARRI002 cam 2', 'also no code'];
    const result = splitMergedLines(lines);
    expect(result).toHaveLength(4);
    expect(result[0]).toBe('no code here');
    expect(result[1]).toBe('ARRI001 cam 1');
    expect(result[2]).toBe('ARRI002 cam 2');
    expect(result[3]).toBe('also no code');
  });
});

// ─── takeLowPercentileMean ────────────────────────────────────────────────────

describe('takeLowPercentileMean', () => {
  it('returns 0 for an empty array', () => {
    expect(takeLowPercentileMean([])).toBe(0);
  });

  it('returns the single value for a one-element array', () => {
    expect(takeLowPercentileMean([42])).toBe(42);
  });

  it('returns the mean of the bottom 20% (rounded up to 1) for small arrays', () => {
    // 5 elements: bottom 20% = 1 element = lowest = 10
    expect(takeLowPercentileMean([10, 20, 30, 40, 50])).toBe(10);
  });

  it('returns mean of bottom 20% for larger arrays', () => {
    // 10 elements, bottom 20% = 2: values [1, 2], mean = 1.5
    expect(takeLowPercentileMean([5, 9, 3, 7, 1, 8, 2, 6, 4, 10])).toBe(1.5);
  });

  it('ignores non-finite values', () => {
    expect(takeLowPercentileMean([Infinity, NaN, 10, 20])).toBe(10);
  });
});

// ─── parsePDF ─────────────────────────────────────────────────────────────────

describe('parsePDF', () => {
  beforeEach(() => jest.clearAllMocks());

  it('extracts an item with a leading qty after the code', async () => {
    mockGetDocument.mockReturnValueOnce(
      makePDFMock([[
        { str: 'ARRI001', x: 10, y: 100 },
        { str: '3',       x: 80, y: 100 },
        { str: 'Alexa',   x: 95, y: 100 },
        { str: 'LF',      x: 120, y: 100 },
        { str: 'Camera',  x: 135, y: 100 },
      ]])
    );

    const items = await parsePDF(new Uint8Array());
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Alexa LF Camera');
    expect(items[0].quantity).toBe(3);
  });

  it('extracts an item with a trailing qty at the end of the line', async () => {
    mockGetDocument.mockReturnValueOnce(
      makePDFMock([[
        { str: 'GRIP001', x: 10, y: 100 },
        { str: 'Baby',    x: 80, y: 100 },
        { str: 'Stand',   x: 110, y: 100 },
        { str: '5',       x: 145, y: 100 },
      ]])
    );

    const items = await parsePDF(new Uint8Array());
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Baby Stand');
    expect(items[0].quantity).toBe(5);
  });

  it('defaults qty to 1 when no quantity token is present', async () => {
    mockGetDocument.mockReturnValueOnce(
      makePDFMock([[
        { str: 'LENS001', x: 10, y: 100 },
        { str: 'Cooke',   x: 80, y: 100 },
        { str: 'S5',      x: 100, y: 100 },
        { str: '75mm',    x: 115, y: 100 },
      ]])
    );

    const items = await parsePDF(new Uint8Array());
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Cooke S5 75mm');
    expect(items[0].quantity).toBe(1);
  });

  it('skips lines whose description is shorter than 3 characters', async () => {
    mockGetDocument.mockReturnValueOnce(
      makePDFMock([[
        { str: 'GRIP001', x: 10, y: 100 },
        { str: 'OK',      x: 80, y: 100 },  // 2 chars — too short
      ]])
    );

    const items = await parsePDF(new Uint8Array());
    expect(items).toHaveLength(0);
  });

  it('extracts start and end dates from the full text', async () => {
    mockGetDocument.mockReturnValueOnce(
      makePDFMock([[
        { str: 'Ship Date: 01/15/2026',   x: 10, y: 200 },
        { str: 'Return Date: 01/22/2026', x: 10, y: 190 },
        { str: 'ARRI001',                 x: 10, y: 100 },
        { str: 'Alexa',                   x: 80, y: 100 },
        { str: 'LF',                      x: 100, y: 100 },
      ]])
    );

    const items = await parsePDF(new Uint8Array());
    expect(items).toHaveLength(1);
    expect(items[0].start_date).toBe('2026-01-15');
    expect(items[0].end_date).toBe('2026-01-22');
  });

  it('sets start_date and end_date to null when no dates present', async () => {
    mockGetDocument.mockReturnValueOnce(
      makePDFMock([[
        { str: 'ARRI001', x: 10, y: 100 },
        { str: 'Alexa',   x: 80, y: 100 },
        { str: 'Camera',  x: 100, y: 100 },
      ]])
    );

    const items = await parsePDF(new Uint8Array());
    expect(items[0].start_date).toBeNull();
    expect(items[0].end_date).toBeNull();
  });

  it('splits merged lines (two codes on same Y) into separate items', async () => {
    // Both codes on the same y-coordinate, so pageToLines groups them into one line.
    // splitMergedLines then separates them before the regex pass runs.
    mockGetDocument.mockReturnValueOnce(
      makePDFMock([[
        { str: 'ARRI001', x: 10,  y: 100 },
        { str: 'Alexa',   x: 80,  y: 100 },
        { str: 'LF',      x: 100, y: 100 },
        { str: 'ARRI002', x: 130, y: 100 },
        { str: 'Alexa',   x: 200, y: 100 },
        { str: 'Mini',    x: 220, y: 100 },  // "Mini" avoids trailing-digit qty parse
      ]])
    );

    const items = await parsePDF(new Uint8Array());
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('Alexa LF');
    expect(items[1].name).toBe('Alexa Mini');
  });

  it('filters out indented sub-items using per-page x-position baseline', async () => {
    // Five normal-position items (codeX≈10) and one indented item (codeX=30)
    const normalItems: TextChunk[] = [
      { str: 'ARRI001', x: 10, y: 500 },
      { str: 'Camera A', x: 80, y: 500 },
      { str: 'ARRI002', x: 10, y: 490 },
      { str: 'Camera B', x: 80, y: 490 },
      { str: 'ARRI003', x: 10, y: 480 },
      { str: 'Camera C', x: 80, y: 480 },
      { str: 'ARRI004', x: 10, y: 470 },
      { str: 'Camera D', x: 80, y: 470 },
      { str: 'ARRI005', x: 10, y: 460 },
      { str: 'Camera E', x: 80, y: 460 },
    ];
    const indentedItem: TextChunk[] = [
      { str: 'ARRI999', x: 30, y: 450 }, // codeX=30, baseCodeX≈10, 30 > 10+8 → filtered
      { str: 'Sub item', x: 100, y: 450 },
    ];

    mockGetDocument.mockReturnValueOnce(
      makePDFMock([[...normalItems, ...indentedItem]])
    );

    const items = await parsePDF(new Uint8Array());
    expect(items).toHaveLength(5);
    expect(items.every((i) => !i.name.includes('Sub item'))).toBe(true);
  });

  it('uses the codeless fallback parser when no equipment codes are present', async () => {
    mockGetDocument.mockReturnValueOnce(
      makePDFMock([[
        { str: 'GRIP',   x: 10, y: 200 },
        { str: 'EQUIPMENT', x: 50, y: 200 },
        { str: '4',      x: 10, y: 180 },
        { str: 'Baby',   x: 30, y: 180 },
        { str: 'Stand',  x: 55, y: 180 },
        { str: '2',      x: 10, y: 160 },
        { str: 'Apple',  x: 30, y: 160 },
        { str: 'Box',    x: 60, y: 160 },
      ]])
    );

    const items = await parsePDF(new Uint8Array());
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: 'Baby Stand', quantity: 4, category: 'GRIP EQUIPMENT' });
    expect(items[1]).toMatchObject({ name: 'Apple Box',  quantity: 2, category: 'GRIP EQUIPMENT' });
  });

  it('codeless fallback skips financial/summary lines', async () => {
    mockGetDocument.mockReturnValueOnce(
      makePDFMock([[
        { str: '2',     x: 10, y: 180 },
        { str: 'Baby',  x: 30, y: 180 },
        { str: 'Stand', x: 55, y: 180 },
        { str: '1',     x: 10, y: 160 },
        { str: 'Total:',x: 30, y: 160 },
        { str: '$500',  x: 70, y: 160 },
      ]])
    );

    const items = await parsePDF(new Uint8Array());
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Baby Stand');
  });

  it('returns an empty array when no items are parseable', async () => {
    mockGetDocument.mockReturnValueOnce(
      makePDFMock([[
        { str: 'Page 1 of 1', x: 10, y: 100 },
        { str: 'Total:',      x: 10, y: 90 },
      ]])
    );

    const items = await parsePDF(new Uint8Array());
    expect(items).toHaveLength(0);
  });

  it('parses items across multiple pages', async () => {
    mockGetDocument.mockReturnValueOnce(
      makePDFMock([
        // page 1
        [
          { str: 'ARRI001', x: 10, y: 100 },
          { str: 'Camera',  x: 80, y: 100 },
        ],
        // page 2
        [
          { str: 'GRIP001', x: 10, y: 100 },
          { str: 'C-Stand', x: 80, y: 100 },
        ],
      ])
    );

    const items = await parsePDF(new Uint8Array());
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('Camera');
    // dash-normalisation: "C-Stand" → "C - Stand"
    expect(items[1].name).toBe('C - Stand');
  });
});

// ─── parseCSV ─────────────────────────────────────────────────────────────────

describe('parseCSV', () => {
  it('parses a minimal CSV with name and qty columns', () => {
    const csv = 'name,qty\nC-Stand,4\nApple Box,10\n';
    const items = parseCSV(csv);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: 'C-Stand',   quantity: 4  });
    expect(items[1]).toMatchObject({ name: 'Apple Box', quantity: 10 });
  });

  it('accepts "quantity" as an alias for "qty"', () => {
    const csv = 'name,quantity\nBaby Stand,3\n';
    const items = parseCSV(csv);
    expect(items[0].quantity).toBe(3);
  });

  it('throws when the name column is absent', () => {
    const csv = 'description,qty\nC-Stand,4\n';
    expect(() => parseCSV(csv)).toThrow('CSV missing required column: name');
  });

  it('throws when the CSV has fewer than 2 non-empty lines', () => {
    expect(() => parseCSV('')).toThrow('CSV appears empty or missing rows.');
    expect(() => parseCSV('name,qty\n')).toThrow('CSV appears empty or missing rows.');
  });

  it('throws when no importable data rows are found', () => {
    // A name-only row (no qty) becomes a base-name row and produces no items.
    const csv = 'name,qty\nC-Stand\n';
    expect(() => parseCSV(csv)).toThrow('No importable rows found in CSV.');
  });

  it('propagates sticky category from a category-only row', () => {
    const csv = 'name,category,qty\n,Grip,\nC-Stand,,4\n';
    const items = parseCSV(csv);
    expect(items).toHaveLength(1);
    expect(items[0].category).toBe('Grip');
  });

  it('updates sticky category when a new category row appears', () => {
    const csv = 'name,category,qty\n,Grip,\nC-Stand,,4\n,Electric,\nHMI,,2\n';
    const items = parseCSV(csv);
    expect(items).toHaveLength(2);
    expect(items[0].category).toBe('Grip');
    expect(items[1].category).toBe('Electric');
  });

  it('uses the inline category when provided on the data row', () => {
    const csv = 'name,category,qty\nC-Stand,Grip,4\n';
    const items = parseCSV(csv);
    expect(items[0].category).toBe('Grip');
  });

  it('handles base-name grouping: pushes base name with status-row qty', () => {
    // Rental CSV format: name row with no qty sets the base name;
    // subsequent rows with qty are "status" rows that use the base name.
    const csv = [
      'name,category,qty',
      'Arri Alexa LF,,',      // base name row (no qty)
      'Available,,2',          // status row → name="Arri Alexa LF", qty=2
      'Out,,1',                // status row → name="Arri Alexa LF", qty=1
    ].join('\n');

    const items = parseCSV(csv);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: 'Arri Alexa LF', quantity: 2 });
    expect(items[1]).toMatchObject({ name: 'Arri Alexa LF', quantity: 1 });
  });

  it('resets base-name grouping after a blank line', () => {
    const csv = [
      'name,category,qty',
      'Arri Alexa LF,,',
      'Available,,2',
      '',                    // blank → resets currentItemName
      'Boom Pole,,1',        // normal row, NOT grouped under Arri Alexa LF
    ].join('\n');

    const items = parseCSV(csv);
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ name: 'Boom Pole', quantity: 1 });
  });

  it('defaults qty to 1 when the qty value is not a positive integer', () => {
    const csv = 'name,qty\nC-Stand,abc\nApple Box,0\n';
    const items = parseCSV(csv);
    expect(items[0].quantity).toBe(1);
    expect(items[1].quantity).toBe(1);
  });

  it('handles quoted fields with embedded commas', () => {
    const csv = 'name,category,qty\n"Stand, C-type",Grip,3\n';
    const items = parseCSV(csv);
    expect(items[0].name).toBe('Stand, C-type');
    expect(items[0].category).toBe('Grip');
    expect(items[0].quantity).toBe(3);
  });

  it('handles CRLF line endings', () => {
    const csv = 'name,qty\r\nC-Stand,4\r\nApple Box,2\r\n';
    const items = parseCSV(csv);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('C-Stand');
  });

  it('sets start_date and end_date to null for CSV items', () => {
    const csv = 'name,qty\nC-Stand,4\n';
    const items = parseCSV(csv);
    expect(items[0].start_date).toBeNull();
    expect(items[0].end_date).toBeNull();
  });

  it('assigns a generated id to each item', () => {
    const csv = 'name,qty\nC-Stand,4\n';
    const items = parseCSV(csv);
    expect(items[0].id).toBe('test-id');
  });
});
