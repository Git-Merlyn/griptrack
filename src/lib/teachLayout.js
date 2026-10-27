// "Teach it" for PDF imports (WP26 Phase 3, TODO 9.21): turns the choices
// made in TeachLayoutDialog into a supplier template. Pure, so the dialog
// and the tests share it. The template format and engine live in
// supabase/functions/_shared/pdf/templates.js (shared with the server).
import {
  fingerprintFor,
  headingsFromLine,
  itemLines,
  LIMITS,
  markerKey,
  validateTemplate,
} from "@pdf/templates.js";

export const lineText = (items) =>
  (items || [])
    .map((i) => i.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

// Markers are stored in their compared form (letters only, upper case, first
// three words), so a template never keeps numbers or other text from the
// rental it was taught on ("Total items 44" is stored as "TOTAL ITEMS").
const marker = (text) => markerKey(text).slice(0, LIMITS.markerLength);

/** Page 1 of the PDF as lines of positioned items. */
export function pageOneLines(pages) {
  return itemLines(pages)[0] || [];
}

/**
 * The column headings of the chosen heading line.
 * @returns {{ label: string, range: { x_min: number, x_max: number } }[]}
 */
export function headingsFor(pages, headerIndex) {
  const line = pageOneLines(pages)[headerIndex];
  return line ? headingsFromLine(line) : [];
}

/**
 * Template from the teacher's choices, or { errors } when something
 * required is missing.
 * @param {object} choice
 * @param {number} choice.headerIndex page-1 line holding the column headings
 * @param {number} choice.nameColumn index into the headings
 * @param {number} choice.quantityColumn
 * @param {number} [choice.categoryColumn] -1 for none
 * @param {number} [choice.codeColumn] -1 for none
 * @param {"column"|"heading"|"none"} choice.categoryFrom
 * @param {number} [choice.endIndex] page-1 line where the items end, -1 for none
 * @param {number[]} [choice.skipIndexes] page-1 lines whose kind should be skipped
 */
export function buildTemplate(pages, choice) {
  const lines = pageOneLines(pages);
  const header = lines[choice.headerIndex];
  if (!header) return { errors: ["Choose the line with the column headings."] };
  const headings = headingsFromLine(header);
  const col = (i) => (Number.isInteger(i) && i >= 0 ? headings[i]?.range : undefined);

  const columns = { name: col(choice.nameColumn), quantity: col(choice.quantityColumn) };
  if (col(choice.categoryColumn)) columns.category = col(choice.categoryColumn);
  if (col(choice.codeColumn)) columns.code = col(choice.codeColumn);

  const table = { start_after: marker(lineText(header)) };
  const end = Number.isInteger(choice.endIndex) && choice.endIndex >= 0 ? lines[choice.endIndex] : null;
  const endMarker = end ? marker(lineText(end)) : "";
  if (endMarker) table.end_before = endMarker;

  const skip = [
    ...new Set((choice.skipIndexes || []).map((i) => marker(lineText(lines[i]))).filter(Boolean)),
  ].slice(0, LIMITS.markers);

  const template = {
    version: 1,
    fingerprint: fingerprintFor(lineText(header), lineText(lines[0])),
    table,
    columns,
    skip,
    category_from: choice.categoryFrom,
  };
  const errors = validateTemplate(template);
  return errors.length ? { errors, template } : { template };
}

/** Default name for a new layout: the top line of page 1 (usually the supplier). */
export function defaultLayoutName(pages) {
  return lineText(pageOneLines(pages)[0]).slice(0, LIMITS.nameLength) || "Supplier layout";
}
