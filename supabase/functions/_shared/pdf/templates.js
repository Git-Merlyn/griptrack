// Supplier templates for rental-list PDFs (WP26 Phase 3, TODO 9.21).
//
// A template is DATA describing one supplier's layout: which x range holds
// the item name, the quantity and (optionally) the category and code, where
// the item table starts and ends, and which lines to skip. It is applied
// deterministically to the PDF's own text items, so every imported value
// still comes from the PDF; a template (hand-made by "teach it", or later
// proposed by a model) can never inject a value.
//
// Markers are plain text, never regular expressions: a line matches a marker
// when its "marker key" (letters only, upper case, first three words)
// starts with the marker. That keeps a stored template from ever running a
// pathological pattern.
//
// Shared by the web importer and the parse-rental-pdf edge function, like
// rows.js. The database enforces the same shape (pdf_templates trigger).

import { extractDates, groupItemsByLine } from "./rows.js";

export const TEMPLATE_VERSION = 1;
export const LIMITS = Object.freeze({
  tokens: 16, // fingerprint tokens
  tokenLength: 40,
  markers: 20, // skip markers
  markerLength: 80,
  nameLength: 80, // template display name
});
export const MIN_COVERAGE = 0.7; // below this share of candidate lines read, warn about drift
const FAR_RIGHT = 100000; // open-ended last column

/**
 * @typedef {{ x_min: number, x_max: number }} XRange
 * @typedef {{
 *   version: 1,
 *   fingerprint: { tokens: string[] },
 *   table: { start_after?: string, end_before?: string },
 *   columns: { name: XRange, quantity: XRange, category?: XRange, code?: XRange },
 *   skip: string[],
 *   category_from: "column" | "heading" | "none",
 * }} PdfTemplate
 * @typedef {{ str: string, x: number, y: number, width: number }} LineItem
 */

// ─── Text helpers ────────────────────────────────────────────────────────────

/** Upper-case words of 3+ letters (digits and punctuation dropped). */
export function wordTokens(text) {
  return (
    String(text || "")
      .toUpperCase()
      .match(/[A-Z]{3,}/g) || []
  );
}

/** Letters only, upper case, first three words: what markers are compared on. */
export function markerKey(text) {
  return String(text || "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
}

const lineText = (items) =>
  items
    .map((i) => i.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/** Text of the items whose x falls in [x_min, x_max). */
function cell(items, range) {
  if (!range) return "";
  return lineText(items.filter((i) => i.x >= range.x_min && i.x < range.x_max));
}

/** Every page as lines of positioned items (top to bottom). */
export function itemLines(pages) {
  return (pages || []).map((items) => groupItemsByLine(items));
}

// ─── Fingerprint and matching ────────────────────────────────────────────────

/** Tokens found anywhere on page 1. */
export function pageOneTokens(pages) {
  const firstPage = itemLines(pages)[0] || [];
  return new Set(firstPage.flatMap((line) => wordTokens(lineText(line))));
}

/**
 * Fingerprint for a new template: the column-heading line's words plus the
 * top line's (usually the supplier's name), de-duplicated and capped.
 */
export function fingerprintFor(headerText, topLineText) {
  const tokens = [...new Set([...wordTokens(topLineText), ...wordTokens(headerText)])];
  return { tokens: tokens.slice(0, LIMITS.tokens) };
}

/**
 * Best stored template for these pages, or null. A template matches when
 * every fingerprint token is on page 1; more tokens (more specific) wins,
 * then more successful imports.
 * @param {{ template: PdfTemplate, success_count?: number }[]} records
 */
export function matchTemplate(records, pages) {
  const tokens = pageOneTokens(pages);
  let best = null;
  for (const rec of records || []) {
    const fp = rec?.template?.fingerprint?.tokens || [];
    if (fp.length === 0 || !fp.every((t) => tokens.has(t))) continue;
    if (
      !best ||
      fp.length > best.template.fingerprint.tokens.length ||
      (fp.length === best.template.fingerprint.tokens.length &&
        (rec.success_count || 0) > (best.success_count || 0))
    ) {
      best = rec;
    }
  }
  return best;
}

// ─── Columns from a heading line ─────────────────────────────────────────────

/**
 * Split a column-heading line into headings: items closer than `gap` (PDF
 * units) belong to the same heading ("Item" "Description"). Each heading's
 * x range runs from the midpoint with the previous heading to the midpoint
 * with the next, so right-aligned numbers under "Qty" still fall inside.
 * @param {LineItem[]} items one line, sorted left to right
 * @returns {{ label: string, range: XRange }[]}
 */
export function headingsFromLine(items, gap = 12) {
  const groups = [];
  for (const it of items || []) {
    const last = groups[groups.length - 1];
    if (last && it.x - last.end < gap) {
      last.items.push(it);
      last.end = Math.max(last.end, it.x + (it.width || 0));
    } else {
      groups.push({ items: [it], start: it.x, end: it.x + (it.width || 0) });
    }
  }
  return groups.map((g, i) => {
    const prev = groups[i - 1];
    const next = groups[i + 1];
    return {
      label: lineText(g.items),
      range: {
        x_min: prev ? round((prev.end + g.start) / 2) : 0,
        x_max: next ? round((g.end + next.start) / 2) : FAR_RIGHT,
      },
    };
  });
}

const round = (n) => Math.round(n * 10) / 10;

// ─── Validation (same rules as the database trigger) ─────────────────────────

const isRange = (r) =>
  r && Number.isFinite(r.x_min) && Number.isFinite(r.x_max) && r.x_min >= 0 && r.x_max > r.x_min && r.x_max <= FAR_RIGHT;
const isMarker = (m) => typeof m === "string" && m.length > 0 && m.length <= LIMITS.markerLength;

/** Problems with a template, as plain sentences; [] when it is valid. */
export function validateTemplate(t) {
  const errors = [];
  if (!t || typeof t !== "object") return ["Template is missing."];
  if (t.version !== TEMPLATE_VERSION) errors.push("Unknown template version.");
  const tokens = t.fingerprint?.tokens;
  if (!Array.isArray(tokens) || tokens.length === 0 || tokens.length > LIMITS.tokens) {
    errors.push(`Fingerprint needs 1 to ${LIMITS.tokens} words.`);
  } else if (!tokens.every((x) => typeof x === "string" && /^[A-Z]{3,}$/.test(x) && x.length <= LIMITS.tokenLength)) {
    errors.push("Fingerprint words must be upper-case letters.");
  }
  if (!isRange(t.columns?.name)) errors.push("Name column is missing.");
  if (!isRange(t.columns?.quantity)) errors.push("Quantity column is missing.");
  for (const key of ["category", "code"]) {
    if (t.columns?.[key] !== undefined && !isRange(t.columns[key])) errors.push(`The ${key} column is invalid.`);
  }
  for (const key of ["start_after", "end_before"]) {
    const m = t.table?.[key];
    if (m !== undefined && !isMarker(m)) errors.push(`Table ${key.replace("_", " ")} marker is invalid.`);
  }
  if (!Array.isArray(t.skip) || t.skip.length > LIMITS.markers || !t.skip.every(isMarker)) {
    errors.push(`Up to ${LIMITS.markers} skip markers are allowed.`);
  }
  if (!["column", "heading", "none"].includes(t.category_from)) errors.push("Category source is invalid.");
  if (t.category_from === "column" && !isRange(t.columns?.category)) errors.push("Category column is missing.");
  return errors;
}

// ─── Apply ───────────────────────────────────────────────────────────────────

/**
 * Apply a template to pages of pdf.js text items.
 * - The table starts after the line matching `start_after` on each page
 *   where that line appears (pages without it are continuation pages).
 * - `end_before` ends the table for the rest of the document.
 * - A line is a candidate when its quantity cell has text; it becomes a row
 *   when that text holds a whole number of 1 or more and the name cell has
 *   2+ characters.
 * - With category_from "heading", a line with no quantity text becomes the
 *   category for the rows below it.
 * @param {PdfTemplate} template
 * @returns {{ rows: import("./rows.js").PdfRow[], candidates: number, drift: boolean }}
 */
export function applyTemplate(template, pages) {
  const lines = itemLines(pages);
  const { startDate, endDate } = extractDates(lines.flat().map(lineText).join("\n"));
  const { columns, table = {}, skip = [], category_from } = template;
  const start = table.start_after ? markerKey(table.start_after) : "";
  const end = table.end_before ? markerKey(table.end_before) : "";
  const skips = skip.map(markerKey).filter(Boolean);

  const rows = [];
  let candidates = 0;
  let heading = "";
  let ended = false;

  for (const page of lines) {
    if (ended) break;
    const startIdx = start ? page.findIndex((l) => markerKey(lineText(l)).startsWith(start)) : -1;
    for (let i = startIdx + 1; i < page.length; i++) {
      const line = page[i];
      const text = lineText(line);
      const key = markerKey(text);
      if (end && key.startsWith(end)) {
        ended = true;
        break;
      }
      if (skips.some((s) => key.startsWith(s))) continue;

      const qtyText = cell(line, columns.quantity);
      if (!qtyText) {
        if (category_from === "heading" && /[A-Za-z]{2,}/.test(text)) heading = text;
        continue;
      }
      candidates++;
      const qtyMatch = qtyText.match(/\d{1,5}/);
      const quantity = qtyMatch ? parseInt(qtyMatch[0], 10) : 0;
      const name = cell(line, columns.name);
      if (quantity < 1 || name.length < 2) continue;

      rows.push({
        code: cell(line, columns.code),
        name,
        category: category_from === "column" ? cell(line, columns.category) : category_from === "heading" ? heading : "",
        quantity,
        startDate,
        endDate,
      });
    }
  }

  const drift = rows.length === 0 || (candidates > 0 && rows.length / candidates < MIN_COVERAGE);
  return { rows, candidates, drift };
}
