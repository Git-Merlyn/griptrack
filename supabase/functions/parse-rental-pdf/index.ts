/**
 * parse-rental-pdf — Supabase Edge Function
 *
 * Accepts a base64-encoded PDF, extracts text via pdfjs-serverless (no browser
 * APIs required), then runs the same regex passes as ImportFileModal.jsx to
 * produce structured rental line items.
 *
 * Called by mobile (React Native/Hermes cannot run pdfjs-dist client-side).
 * Web continues to parse in-browser via pdfjs-dist — this function is available
 * for web to adopt in the future if consistent server-side parsing is desired.
 *
 * Request body: { fileBase64: string, fileName: string }
 * Response:     ParsedPDFItem[]
 *
 * Notes:
 * - fileName is accepted for future use (logging, CSV detection) but not
 *   currently used in the parsing logic.
 * - Auth: the handler verifies a real signed-in user via auth.getUser().
 *   Gateway JWT verification alone is not enough — the public anon key
 *   passes it, so without the in-handler check anyone could burn compute.
 * - Payload size: base64 inflates PDF size by ~33%. Typical rental PDFs are
 *   fine, but very large multi-page documents may approach Edge Function
 *   request limits. Consider streaming or chunking if this becomes an issue.
 *
 * ParsedPDFItem shape (snake_case to match Supabase schema):
 *   { id, name, category, quantity, source, location, start_date, end_date }
 */

// pdfjs-serverless is a single slim pdf.js build for Deno/workers. The old
// npm:pdf-parse dependency vendored FOUR full pdf.js copies selected by a
// dynamic require, so the deploy bundle ballooned to ~31MB and the platform
// rejected it with 413. extractPdfText() below reproduces pdf-parse's exact
// line-reconstruction algorithm so the regex parsers see identical text.
import { getDocument } from 'npm:pdfjs-serverless';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Date helpers (identical to ImportFileModal.jsx) ─────────────────────────

function normalizeDate(raw: string): string {
  const s = String(raw || '').trim().replace(/\s+/g, '');
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  const ymd = s.match(/^(\d{4})[/\-](\d{2})[/\-](\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return raw.trim();
}

function extractDate(text: string, type: 'start' | 'end'): string {
  const pats =
    type === 'start'
      ? [
          /(?:ship|out|start|delivery|pickup|rental\s*start)\s*date\s*[:\-]?\s*([0-9][0-9./\-]+)/i,
          /date\s*(?:out|shipped|start)\s*[:\-]?\s*([0-9][0-9./\-]+)/i,
        ]
      : [
          /(?:return|due|end|rental\s*end)\s*date\s*[:\-]?\s*([0-9][0-9./\-]+)/i,
          /date\s*(?:in|due|return|back)\s*[:\-]?\s*([0-9][0-9./\-]+)/i,
          /expected\s*return\s*[:\-]?\s*([0-9][0-9./\-]+)/i,
        ];
  for (const re of pats) {
    const m = text.match(re);
    if (m?.[1]) return normalizeDate(m[1]);
  }
  return '';
}

// ─── Line helpers (ported from ImportFileModal.jsx) ──────────────────────────

// pdf-parse returns a flat text string; split into lines and normalise whitespace.
function textToLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

// When OCR merges multiple table rows into one line (multiple equipment codes
// on the same line), split at each code boundary.
const codeGlobalRe = /\b([A-Z]{3,}[A-Z0-9]*\d{3,})\b/g;

function splitMergedLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const matches = Array.from(line.matchAll(codeGlobalRe));
    if (matches.length <= 1) {
      out.push(line);
      continue;
    }
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index ?? 0;
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? line.length) : line.length;
      const seg = line.slice(start, end).replace(/\s+/g, ' ').trim();
      if (seg) out.push(seg);
    }
  }
  return out;
}

// ─── ID generation ───────────────────────────────────────────────────────────
//
// The web parser sets item.id to the extracted equipment code string (e.g.
// "ARRI123") for use as a React key and to populate item_id on insert via
// normalizeItemForInsert. Mobile diverges intentionally on both counts:
//
//  1. PDFReviewScreen uses item.id as a FlatList keyExtractor — equipment
//     codes are not guaranteed unique within a rental, so a UUID is safer.
//  2. addMultipleItems hardcodes item_id: null; parsed.id is never written
//     to the DB, so preserving the code string in id buys nothing.
//
// If the web ever calls this function, normalizeItemForInsert will need to
// be updated to source item_id from a separate field rather than id.

function generateId(): string {
  return crypto.randomUUID();
}

// ─── Item shape returned to callers ──────────────────────────────────────────

interface ParsedPDFItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  source: string;
  location: string;
  start_date: string | null;
  end_date: string | null;
}

// ─── Core parsing logic (ported from ImportFileModal.jsx extractDataFromPDF) ─

function parseLinesIntoItems(lines: string[], fullText: string): ParsedPDFItem[] {
  const normalizedLines = splitMergedLines(lines);

  const start_date = extractDate(fullText, 'start') || null;
  const end_date = extractDate(fullText, 'end') || null;

  const items: ParsedPDFItem[] = [];
  const codeRe = /\b([A-Z]{3,}[A-Z0-9]*\d{3,})\b/;
  const qtyEndRe = /\b(\d+)\s*$/;

  for (const line of normalizedLines) {
    if (!line.match(codeRe)) continue;

    let remainder = line.replace(codeRe, '').trim();
    let qty = 1;
    const originalRemainder = remainder;

    const qtyAfterCodeMatch = remainder.match(/^\s*(\d{1,4})\s+(?![''""″])/);
    const qtyAtEndMatch = remainder.match(qtyEndRe);

    if (qtyAfterCodeMatch) {
      const leadingToken = qtyAfterCodeMatch[1];
      const leadingParsed = parseInt(leadingToken, 10);
      remainder = remainder.replace(/^\s*\d{1,3}\s+/, '').trim();

      // Heuristic: some OCR layers split 2-digit quantities across leading/trailing
      // tokens (e.g. "3" near code and "2" at end = 32). Try both concatenations.
      if (
        leadingToken.length === 1 &&
        qtyAtEndMatch?.[1] &&
        String(qtyAtEndMatch[1]).length === 1
      ) {
        const trailingToken = String(qtyAtEndMatch[1]);
        const endsWithIsolatedDigit = /(?:\)|[A-Za-z])\s+\d\s*$/.test(originalRemainder);

        if (endsWithIsolatedDigit) {
          const combinedA = parseInt(`${leadingToken}${trailingToken}`, 10);
          const combinedB = parseInt(`${trailingToken}${leadingToken}`, 10);
          const combined = Math.max(
            Number.isFinite(combinedA) ? combinedA : 0,
            Number.isFinite(combinedB) ? combinedB : 0,
          );
          if (combined > 0) {
            qty = combined;
            remainder = remainder.replace(qtyEndRe, '').trim();
          } else if (Number.isFinite(leadingParsed)) {
            qty = leadingParsed;
          }
        } else if (Number.isFinite(leadingParsed)) {
          qty = leadingParsed;
        }
      } else if (Number.isFinite(leadingParsed)) {
        qty = leadingParsed;
      }
    } else if (qtyAtEndMatch) {
      const parsed = parseInt(qtyAtEndMatch[1], 10);
      if (Number.isFinite(parsed)) qty = parsed;
      remainder = remainder.replace(qtyEndRe, '').trim();
    }

    const desc = remainder.replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim();
    if (!desc || desc.length < 3) continue;

    items.push({
      id: generateId(),
      name: desc,
      category: '',
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      source: '',
      location: '',
      start_date,
      end_date,
    });
  }

  // ── Fallback: codeless parser ─────────────────────────────────────────────
  // Runs only when the code-based pass found nothing (rental house PDFs with
  // no equipment codes, e.g. "2 Baby Stand").
  if (items.length === 0) {
    const codelessQtyRe = /^\s*(\d{1,4})\s+(?:[xX×]\s*)?(.{3,})$/;
    const categoryHeaderRe = /^[A-Z][A-Z\s&/\-]{3,}$/;
    let fallbackCategory = '';

    for (const line of normalizedLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3) continue;

      if (categoryHeaderRe.test(trimmed) && !/\d/.test(trimmed)) {
        fallbackCategory = trimmed;
        continue;
      }

      const m = trimmed.match(codelessQtyRe);
      if (!m) continue;

      const qty = parseInt(m[1], 10);
      const desc = m[2].trim();

      if (qty <= 0 || qty > 9999 || desc.length < 3) continue;
      if (/^\$|^total|^subtotal|^tax|^amount/i.test(desc)) continue;

      items.push({
        id: generateId(),
        name: desc,
        category: fallbackCategory,
        quantity: qty,
        source: '',
        location: '',
        start_date,
        end_date,
      });
    }
  }

  return items;
}

// ─── PDF → text ───────────────────────────────────────────────────────────────
//
// Mirrors pdf-parse's default render_page: text items on the same baseline
// (transform[5], the Y coordinate) are concatenated; a Y change starts a new
// line. Pages are separated by a newline. Identical output shape to what the
// regex passes were written against.

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  let fullText = '';

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    let lastY: number | undefined;
    let pageText = '';
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (typeof item.str !== 'string') continue;
      const y = item.transform?.[5];
      if (lastY === y || lastY === undefined) {
        pageText += item.str;
      } else {
        pageText += '\n' + item.str;
      }
      lastY = y;
    }
    fullText += pageText + '\n';
  }

  return fullText;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Require a real signed-in user, not just the (public) anon key.
    // Gateway JWT verification alone accepts the anon key, which ships in
    // every client bundle — without this check anyone could burn compute here.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { fileBase64, fileName } = await req.json() as {
      fileBase64: string;
      fileName: string;
    };

    if (!fileBase64) {
      return new Response(
        JSON.stringify({ error: 'fileBase64 is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Decode base64 → Uint8Array → Buffer (pdf-parse expects a Buffer-like object)
    const binary = atob(fileBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const fullText = await extractPdfText(bytes);
    const lines = textToLines(fullText);

    const items = parseLinesIntoItems(lines, fullText);

    return new Response(
      JSON.stringify(items),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('parse-rental-pdf error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? 'Parse failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
