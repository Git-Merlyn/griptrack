// Import preview rows (WP26 Phase 1, TODO 9.21): the editable table in
// ImportFileModal. Rows are the parser's output; the user can correct any
// value, delete rows and add rows before anything is saved.

export const SCANNED_PDF_MESSAGE =
  "This PDF looks like a scan (images only), so there is no text to read. Ask the supplier for the original PDF, or add the items by hand.";

// Fewer readable characters than this across the whole document means there
// is no real text layer (a scan, sometimes with a stray page number).
export const MIN_PDF_TEXT_CHARS = 20;

/** True when the PDF's text lines hold (almost) no text: an image-only scan. */
export function isScannedPdf(lineTexts) {
  const chars = (lineTexts || []).reduce(
    (n, t) => n + String(t || "").replace(/\s+/g, "").length,
    0,
  );
  return chars < MIN_PDF_TEXT_CHARS;
}

let nextKey = 0;
const rowKey = () => `row-${++nextKey}`;

/**
 * Stable React keys for preview rows. Keying by name re-mounted the row's
 * inputs on every keystroke once names became editable.
 */
export function withRowKeys(rows) {
  return (rows || []).map((r) => (r._rowKey ? r : { ...r, _rowKey: rowKey() }));
}

/** The rows to save, without the preview-only key. */
export function stripRowKeys(rows) {
  return (rows || []).map(({ _rowKey, ...rest }) => rest); // eslint-disable-line no-unused-vars
}

/** A blank row added by hand ("+ Add row"). */
export function newImportRow(defaults = {}) {
  return {
    _rowKey: rowKey(),
    id: "",
    name: "",
    category: "",
    status: "Available",
    source: "",
    quantity: 1,
    startDate: "",
    endDate: "",
    location: "",
    ...defaults,
  };
}

/** Rows that cannot be imported: [{ index, message }] in row order. */
export function rowProblems(rows) {
  const out = [];
  (rows || []).forEach((r, index) => {
    if (!String(r?.name || "").trim()) {
      out.push({ index, message: "add a description or delete the row." });
    } else if (!(Number.isInteger(r?.quantity) && r.quantity >= 1)) {
      out.push({ index, message: "quantity must be a whole number of 1 or more." });
    }
  });
  return out;
}
