import { ParsedPDFItem } from './types';

// Import review rows (WP26 Phase 1, TODO 9.21). Same rules as the web
// importer (src/lib/importRows.js): every row needs a name and a whole
// quantity of 1 or more before anything is imported.

/** A blank row added by hand ("+ Add row"). */
export function newParsedItem(id: string, defaults: Partial<ParsedPDFItem> = {}): ParsedPDFItem {
  return {
    id,
    name: '',
    category: '',
    quantity: 1,
    source: '',
    location: '',
    start_date: null,
    end_date: null,
    ...defaults,
  };
}

export interface RowProblem {
  index: number;
  message: string;
}

/** Rows that cannot be imported, in row order. */
export function parsedItemProblems(items: ParsedPDFItem[]): RowProblem[] {
  const out: RowProblem[] = [];
  items.forEach((item, index) => {
    if (!item.name.trim()) {
      out.push({ index, message: 'add a name or remove the row.' });
    } else if (!(Number.isInteger(item.quantity) && item.quantity >= 1)) {
      out.push({ index, message: 'quantity must be 1 or more.' });
    }
  });
  return out;
}
