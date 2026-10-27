// Rental-list PDF parser shared by the web app and the parse-rental-pdf
// edge function (WP26 Phase 2, TODO 9.21). Plain JavaScript so the same file
// runs in the browser (Vite), in Vitest and in Deno without a build step.
//
// Input: the text items pdf.js returns per page (page.getTextContent().items:
// { str, transform }, transform[4] = x, transform[5] = y). Output: neutral
// rows; each caller maps them to its own shape.
//
// The algorithm is the web importer's (ImportFileModal.jsx before WP26),
// moved here unchanged: group items into lines by y, find equipment codes,
// drop indented sub-items using per-page baselines, split lines that hold
// several codes, then read quantity and description per line. A codeless
// pass ("2 Baby Stand") runs only when the code pass finds nothing.
//
// Every value comes from the PDF's own text: no model is involved here.

/**
 * @typedef {{ str?: string, transform?: number[], width?: number }} PdfTextItem
 * @typedef {{ text: string, codeX: number, descX: number, hasCode: boolean, pageNum: number }} PdfLine
 * @typedef {{ code: string, name: string, category: string, quantity: number, startDate: string, endDate: string }} PdfRow
 */

/**
 * Group one page's text items into rows of items by y (tolerance 1.0),
 * top to bottom, each row sorted left to right. Shared by the generic
 * parser (pageToLines) and templates (templates.js).
 * @param {PdfTextItem[]} items
 * @returns {{ str: string, x: number, y: number, width: number }[][]}
 */
export function groupItemsByLine(items) {
  const chunks = (items || [])
    .map((it) => {
      const t = it.transform || [];
      const x = t[4] ?? 0;
      const y = t[5] ?? 0;
      const width = Number.isFinite(it.width) ? it.width : 0;
      return { str: String(it.str || "").trim(), x, y, width };
    })
    .filter((it) => it.str.length > 0);

  const Y_TOL = 1.0;
  const lines = new Map();

  for (const it of chunks) {
    let key = null;
    for (const k of lines.keys()) {
      if (Math.abs(k - it.y) <= Y_TOL) {
        key = k;
        break;
      }
    }
    if (key === null) key = it.y;
    const arr = lines.get(key) || [];
    arr.push(it);
    lines.set(key, arr);
  }

  const ys = Array.from(lines.keys()).sort((a, b) => b - a);
  return ys.map((y) => (lines.get(y) || []).sort((a, b) => a.x - b.x));
}

/**
 * One page's pdf.js text items to lines, top to bottom.
 * @param {PdfTextItem[]} items
 * @param {number} pageNum 1-based
 * @returns {PdfLine[]}
 */
export function pageToLines(items, pageNum) {
  const out = [];

  const codeTokenRe = /^([A-Z]{3,}[A-Z0-9]*\d{3,})$/;

  for (const row of groupItemsByLine(items)) {
    const text = row
      .map((r) => r.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) continue;

    let hasCode = false;
    let codeX = row.length ? row[0].x : 0;
    let descX = row.length ? row[0].x : 0;

    for (let i = 0; i < row.length; i++) {
      const token = row[i].str;
      if (codeTokenRe.test(token)) {
        hasCode = true;
        codeX = row[i].x;
        descX = row[i + 1] ? row[i + 1].x : row[i].x;
        break;
      }
    }

    out.push({ text, codeX, descX, hasCode, pageNum });
  }

  return out;
}

/**
 * Every page's text items to lines.
 * @param {PdfTextItem[][]} pages one array of text items per page, in order
 * @returns {PdfLine[]}
 */
export function linesFromPages(pages) {
  return (pages || []).flatMap((items, i) => pageToLines(items, i + 1));
}

// Normalise raw date strings to YYYY-MM-DD for Supabase.
// Handles: MM/DD/YYYY, MM-DD-YYYY, YYYY/MM/DD, DD.MM.YYYY, and existing ISO.
function normalizeDate(raw) {
  const s = String(raw || "").trim().replace(/\s+/g, "");
  if (!s) return "";
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY or MM-DD-YYYY (US)
  const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (mdy) {
    return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  }
  // YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  // DD.MM.YYYY (European)
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return raw.trim(); // unknown format — store as-is
}

// Try multiple field-name aliases used by different rental houses.
function extractDate(text, type) {
  const pats =
    type === "start"
      ? [
          /(?:ship|out|start|delivery|pickup|rental\s*start)\s*date\s*[:-]?\s*([0-9][0-9./-]+)/i,
          /date\s*(?:out|shipped|start)\s*[:-]?\s*([0-9][0-9./-]+)/i,
        ]
      : [
          /(?:return|due|end|rental\s*end)\s*date\s*[:-]?\s*([0-9][0-9./-]+)/i,
          /date\s*(?:in|due|return|back)\s*[:-]?\s*([0-9][0-9./-]+)/i,
          /expected\s*return\s*[:-]?\s*([0-9][0-9./-]+)/i,
        ];
  for (const re of pats) {
    const m = text.match(re);
    if (m?.[1]) return normalizeDate(m[1]);
  }
  return "";
}

/**
 * Rental start and end dates from the document's text (any page).
 * @param {string} fullText
 * @returns {{ startDate: string, endDate: string }}
 */
export function extractDates(fullText) {
  return { startDate: extractDate(fullText, "start"), endDate: extractDate(fullText, "end") };
}

/**
 * Lines to rental rows.
 * @param {PdfLine[]} allLineObjs
 * @returns {PdfRow[]}
 */
export function rowsFromLines(allLineObjs) {
  // Ignore indented sub-items (even if they have codes) using robust baselines PER PAGE.
  // Baselines are computed from the LEFT-most 20% of rows so indented rows can't skew them.
  const takeLowPercentileMean = (arr, pct = 0.2) => {
    const xs = (arr || [])
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (!xs.length) return 0;
    const take = Math.max(1, Math.floor(xs.length * pct));
    const slice = xs.slice(0, take);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  };

  // Build per-page baselines
  const baselinesByPage = new Map();
  const pages = Array.from(new Set(allLineObjs.map((l) => l.pageNum))).sort(
    (a, b) => a - b,
  );

  for (const p of pages) {
    const pageLines = allLineObjs.filter(
      (l) => l.pageNum === p && l.hasCode,
    );
    const codeXs = pageLines
      .filter((l) => Number.isFinite(l.codeX))
      .map((l) => l.codeX);
    const descXs = pageLines
      .filter((l) => Number.isFinite(l.descX))
      .map((l) => l.descX);

    baselinesByPage.set(p, {
      baseCodeX: takeLowPercentileMean(codeXs, 0.2),
      baseDescX: takeLowPercentileMean(descXs, 0.2),
    });
  }

  // Thresholds: lower = more aggressive filtering (catches more child rows)
  const CODE_INDENT = 8;
  const DESC_INDENT = 8;

  const filteredLineObjs = allLineObjs.filter((l) => {
    if (!l.hasCode) return true;

    const b = baselinesByPage.get(l.pageNum) || {
      baseCodeX: 0,
      baseDescX: 0,
    };
    const baseCodeX = b.baseCodeX;
    const baseDescX = b.baseDescX;

    const codeIndented =
      Number.isFinite(baseCodeX) &&
      baseCodeX > 0 &&
      Number.isFinite(l.codeX)
        ? l.codeX > baseCodeX + CODE_INDENT
        : false;

    const descIndented =
      Number.isFinite(baseDescX) &&
      baseDescX > 0 &&
      Number.isFinite(l.descX)
        ? l.descX > baseDescX + DESC_INDENT
        : false;

    // If either column is shifted right, treat as child/sub-item.
    return !(codeIndented || descIndented);
  });

  const allLines = filteredLineObjs.map((l) => l.text);

  // Some scanned PDFs/OCR layers merge multiple table rows into one line.
  // If a line contains multiple equipment codes, split it into one segment per code.
  const codeGlobalRe = /\b([A-Z]{3,}[A-Z0-9]*\d{3,})\b/g;
  const splitMergedLines = (lines) => {
    const out = [];
    for (const line of lines) {
      const matches = Array.from(line.matchAll(codeGlobalRe));
      if (matches.length <= 1) {
        out.push(line);
        continue;
      }

      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index ?? 0;
        const end =
          i + 1 < matches.length
            ? (matches[i + 1].index ?? line.length)
            : line.length;
        const seg = line.slice(start, end).replace(/\s+/g, " ").trim();
        if (seg) out.push(seg);
      }
    }
    return out;
  };

  const normalizedLines = splitMergedLines(allLines);

  const fullTextForDates = allLines.join("\n");

  const { startDate: shipDate, endDate: returnDate } = extractDates(fullTextForDates);

  const items = [];
  const codeRe = /\b([A-Z]{3,}[A-Z0-9]*\d{3,})\b/;
  const qtyEndRe = /\b(\d+)\s*$/;

  for (const line of normalizedLines) {
    const codeMatch = line.match(codeRe);
    if (!codeMatch) continue;

    const code = codeMatch[1].trim();

    // Description is everything after removing the first code token
    let remainder = line.replace(codeRe, "").trim();

    // Prefer quantity right after the code ONLY when it looks like a standalone qty token.
    // Avoid stripping leading dimension text like: 1' x 4'
    let qty = 1;

    const originalRemainder = remainder;

    // Leading qty token (must be followed by whitespace and NOT immediately followed by a quote/apostrophe)
    const qtyAfterCodeMatch = remainder.match(
      /^\s*(\d{1,4})\s+(?![‘’””″])/,
    );

    // Trailing qty token (at end of remainder)
    const qtyAtEndMatch = remainder.match(qtyEndRe);

    if (qtyAfterCodeMatch) {
      const leadingToken = qtyAfterCodeMatch[1];
      const leadingParsed = parseInt(leadingToken, 10);

      // Remove the leading qty token first
      // Remove exactly the token the match found (1-4 digits plus the
      // surrounding whitespace), so it can't drift from the match regex.
      remainder = remainder.slice(qtyAfterCodeMatch[0].length).trim();

      // Heuristic: some OCR layers split 2-digit quantities like "32" into "2" near the code and "3" at the end.
      // If we see a 1-digit leading token AND a 1-digit trailing token, combine them into a 2-digit quantity.
      // Only do this when the remainder doesn't look like it's supposed to end with a number.
      if (
        leadingToken.length === 1 &&
        qtyAtEndMatch &&
        qtyAtEndMatch[1] &&
        String(qtyAtEndMatch[1]).length === 1
      ) {
        const trailingToken = String(qtyAtEndMatch[1]);

        // If the original remainder ends with something like  ... ) 3  (i.e. digit is isolated), treat as split qty digit.
        const endsWithIsolatedDigit = /(?:\)|[A-Za-z])\s+\d\s*$/.test(
          originalRemainder,
        );

        if (endsWithIsolatedDigit) {
          // OCR can swap digit order depending on how the circled number is represented.
          // Try both concatenations and pick the larger (more common for rental quantities).
          const combinedA = parseInt(`${leadingToken}${trailingToken}`, 10);
          const combinedB = parseInt(`${trailingToken}${leadingToken}`, 10);
          const combined = Math.max(
            Number.isFinite(combinedA) ? combinedA : 0,
            Number.isFinite(combinedB) ? combinedB : 0,
          );

          if (combined > 0) {
            qty = combined;
            // Remove the trailing digit from the remainder as well
            remainder = remainder.replace(qtyEndRe, "").trim();
          } else if (Number.isFinite(leadingParsed)) {
            qty = leadingParsed;
          }
        } else if (Number.isFinite(leadingParsed)) {
          qty = leadingParsed;
        }
      } else if (Number.isFinite(leadingParsed)) {
        qty = leadingParsed;
      }
    } else {
      // Fallback: quantity at end of line
      if (qtyAtEndMatch) {
        const parsed = parseInt(qtyAtEndMatch[1], 10);
        if (Number.isFinite(parsed)) qty = parsed;
        remainder = remainder.replace(qtyEndRe, "").trim();
      }
    }

    let desc = remainder
      .replace(/\s*-\s*/g, " - ")
      .replace(/\s+/g, " ")
      .trim();

    if (!desc || desc.length < 3) continue;

    items.push({
      code,
      name: desc,
      category: "",
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      startDate: shipDate,
      endDate: returnDate,
    });
  }

  // ── Fallback: codeless parser ─────────────────────────────────────────
  // Used when the rental house PDF has no equipment codes (e.g. "2 Baby Stand").
  // Runs only if the code-based pass found nothing.
  if (items.length === 0) {
    // Pattern: line starts with 1-4 digits, optional "x/×", then description
    const codelessQtyRe = /^\s*(\d{1,4})\s+(?:[xX×]\s*)?(.{3,})$/;
    // Category header: ALL CAPS words only, no digits, 4+ chars total
    const categoryHeaderRe = /^[A-Z][A-Z\s&/-]{3,}$/;

    let fallbackCategory = "";

    for (const line of normalizedLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3) continue;

      // Section header → update sticky category
      if (categoryHeaderRe.test(trimmed) && !/\d/.test(trimmed)) {
        fallbackCategory = trimmed;
        continue;
      }

      const m = trimmed.match(codelessQtyRe);
      if (!m) continue;

      const qty = parseInt(m[1], 10);
      const desc = m[2].trim();

      if (qty <= 0 || qty > 9999 || desc.length < 3) continue;
      // Skip financial/summary lines
      if (/^\$|^total|^subtotal|^tax|^amount/i.test(desc)) continue;

      items.push({
        code: "",
        name: desc,
        category: fallbackCategory,
        quantity: qty,
        startDate: shipDate,
        endDate: returnDate,
      });
    }

  }

  return items;
}

/**
 * Convenience: pages of pdf.js text items straight to rows.
 * @param {PdfTextItem[][]} pages
 * @returns {PdfRow[]}
 */
export function parseRentalPages(pages) {
  return rowsFromLines(linesFromPages(pages));
}
