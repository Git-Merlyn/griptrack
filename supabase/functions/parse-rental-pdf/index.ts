/**
 * parse-rental-pdf — Supabase Edge Function
 *
 * Accepts a base64-encoded PDF, extracts pdf.js text items via
 * unpdf (no browser APIs required), then runs the parser shared
 * with the web importer (../_shared/pdf/rows.js, WP26 Phase 2) to produce
 * structured rental line items.
 *
 * Called by mobile (React Native/Hermes cannot run pdfjs-dist client-side).
 * Web parses in the browser with pdfjs-dist and the same shared parser, so a
 * PDF gives the same rows on both (up to pdf.js version differences in how
 * text items are split; see WP26).
 *
 * Request body: { fileBase64: string, fileName: string, v?: 2 }
 * Response:     200 ParsedPDFItem[]  (v absent: what shipped apps expect)
 *               200 { items: ParsedPDFItem[], layout: { id, name, drift } | null }  (v: 2)
 *               400 bad JSON, missing or invalid fileBase64
 *               401 not signed in
 *               402 org is on the Free plan: { error: "Plan limit: …", code: "plan_limit:pdf_import" }
 *               413 PDF over 10 MB
 *               415 not a PDF
 *               422 over 50 pages, password-protected, damaged, or too slow;
 *                   a scan with no text: { error, code: "pdf_no_text" }
 *               500 anything else (generic message; details only in logs)
 *               Every other error body is { error: string }.
 *
 * Notes:
 * - fileName is accepted for future use (logging, CSV detection) but not
 *   currently used in the parsing logic.
 * - Auth: the handler verifies a real signed-in user via auth.getUser().
 *   Gateway JWT verification alone is not enough — the public anon key
 *   passes it, so without the in-handler check anyone could burn compute.
 * - Limits (audit L73) live in ./limits.ts: 10 MB decoded, 50 pages, 25 s of
 *   extraction. The mobile app checks the same 10 MB before uploading
 *   (mobile/src/hooks/usePDFImport.ts). The document is always destroyed.
 *
 * ParsedPDFItem shape (snake_case to match Supabase schema):
 *   { id, name, category, quantity, source, location, start_date, end_date }
 */

// unpdf ships a single serverless pdf.js build for Deno/workers. (The old
// npm:pdf-parse dependency vendored FOUR full pdf.js copies, so the deploy
// bundle hit ~31MB and was rejected with 413.) Exact pin (audit L77): 1.9.1
// bundles pdf.js 6.4.299, the same version the web importer uses
// (pdfjs-dist 6.4.299), so both read a PDF's text identically (WP26).
// It replaced pdfjs-serverless 1.3.1 (pdf.js 6.1.200) in 2026-10.
import { getResolvedPDFJS } from 'npm:unpdf@1.9.1';
import { requireUser } from '../_shared/auth.ts';
import { linesFromPages, rowsFromLines } from '../_shared/pdf/rows.js';
import { applyTemplate, matchTemplate } from '../_shared/pdf/templates.js';
import { createClient } from '../_shared/deps.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import {
  assertHasText,
  classifyPdfError,
  decodePdfBase64,
  MAX_BODY_CHARS,
  MAX_PAGES,
  PARSE_DEADLINE_MS,
  parseRequestBody,
  PdfRequestError,
  TOO_LARGE_MESSAGE,
  TOO_MANY_PAGES_MESSAGE,
  TOO_SLOW_MESSAGE,
} from './limits.ts';

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

// The shared parser returns the equipment code as `code`. Mobile keys its
// review list by `id`, and codes are not unique within a rental, so `id` is
// a fresh UUID here (the web keeps the code as its id). Mobile never writes
// `id` to the database (addMultipleItems sets item_id: null).
function toParsedPDFItem(r: PdfRow): ParsedPDFItem {
  return {
    id: crypto.randomUUID(),
    name: r.name,
    category: r.category,
    quantity: r.quantity,
    source: '',
    location: '',
    start_date: r.startDate || null,
    end_date: r.endDate || null,
  };
}

interface PdfRow {
  code: string;
  name: string;
  category: string;
  quantity: number;
  startDate: string;
  endDate: string;
}

// ─── PDF → text items ─────────────────────────────────────────────────────────
//
// pdf.js text items ({ str, transform }) per page, exactly what the web
// importer passes to the same shared parser (WP26 Phase 2). Until 2026-10
// this function rebuilt pdf-parse's plain text and ran its own copy of the
// regexes, which had drifted from the web.

/** What the shared parser reads from each pdf.js text item. */
interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
}

async function extractPdfPages(bytes: Uint8Array): Promise<PdfTextItem[][]> {
  const deadline = Date.now() + PARSE_DEADLINE_MS;
  const { getDocument } = await getResolvedPDFJS();
  const loadingTask = getDocument({ data: bytes, useSystemFonts: true });
  try {
    const doc = await loadingTask.promise;
    if (doc.numPages > MAX_PAGES) {
      throw new PdfRequestError(422, TOO_MANY_PAGES_MESSAGE);
    }

    const pages: PdfTextItem[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      if (Date.now() > deadline) throw new PdfRequestError(422, TOO_SLOW_MESSAGE);
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items as PdfTextItem[]);
      page.cleanup();
    }

    return pages;
  } finally {
    // Frees the parsed document and its worker-side state on every path,
    // including password/invalid-PDF errors (audit L73).
    await loadingTask.destroy().catch(() => {});
  }
}

// ─── Saved supplier layouts ─────────────────────────────────────────────────

type PdfTemplate = Parameters<typeof applyTemplate>[0];

interface LayoutRecord {
  id: string;
  name: string;
  scope: string;
  template: PdfTemplate;
  success_count: number;
}

// The caller's org layouts plus global ones. Read with the service role, so
// the org is resolved here (organization_members allows one org per user).
async function loadLayouts(
  // deno-lint-ignore no-explicit-any
  admin: { from: (table: string) => any },
  userId: string,
): Promise<LayoutRecord[]> {
  try {
    const { data: member } = await admin
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    const orgId = (member as { org_id?: string } | null)?.org_id;
    const filter = orgId ? `scope.eq.global,org_id.eq.${orgId}` : 'scope.eq.global';
    const { data, error } = await admin
      .from('pdf_templates')
      .select('id, name, scope, template, success_count')
      .or(filter);
    if (error) {
      console.error('parse-rental-pdf: layout lookup failed', error);
      return [];
    }
    return (data ?? []) as LayoutRecord[];
  } catch (err) {
    console.error('parse-rental-pdf: layout lookup failed', err);
    return [];
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Require a real signed-in user, not just the (public) anon key.
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { user } = auth;

    // Plan gate (audit M9): PDF import is not on the Free plan. This text is
    // shown inside the iOS/Android apps, so it stays neutral (no upgrade
    // wording, prices or URLs); `code` is the machine-readable reason. Fails
    // OPEN on a lookup error so a DB hiccup never blocks a paying org.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: effectivePlan, error: planErr } = await admin.rpc(
      'user_effective_plan',
      { p_user: user.id },
    );
    if (planErr) {
      console.error('parse-rental-pdf: plan lookup failed', planErr);
    } else if (effectivePlan === 'free') {
      return json(
        {
          error: "Plan limit: PDF import is not included in this organization's plan.",
          code: 'plan_limit:pdf_import',
        },
        402,
      );
    }

    // Reject oversized uploads before reading the body (audit L73).
    const declaredLength = Number(req.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_BODY_CHARS) {
      return json({ error: TOO_LARGE_MESSAGE }, 413);
    }

    // 400 bad JSON / missing fileBase64, 413 too large, 415 not a PDF.
    // fileName is accepted for future use but not used in parsing.
    const { fileBase64, version } = parseRequestBody(await req.text());
    const bytes = decodePdfBase64(fileBase64);

    const pages = await extractPdfPages(bytes);
    const lines = linesFromPages(pages);
    // 422 pdf_no_text for an image-only scan (WP26 Phase 1).
    assertHasText(lines.map((l: { text: string }) => l.text).join('\n'));

    // A saved supplier layout for the caller's org (or a global one) wins;
    // otherwise the general reader (WP26 Phase 3). Never blocks an import.
    const layouts = await loadLayouts(admin, user.id);
    const record = matchTemplate(layouts, pages) as LayoutRecord | null;
    let rows = rowsFromLines(lines) as PdfRow[];
    let layout: { id: string; name: string; drift: boolean } | null = null;
    if (record) {
      const result = applyTemplate(record.template, pages) as { rows: PdfRow[]; drift: boolean };
      if (result.rows.length > 0) rows = result.rows;
      layout = { id: record.id, name: record.name, drift: result.rows.length === 0 || result.drift };
    }

    const items = rows.map(toParsedPDFItem);
    return json(version === 2 ? { items, layout } : items);
  } catch (err) {
    const { status, error, code } = classifyPdfError(err);
    if (status >= 500) console.error('parse-rental-pdf error:', err);
    return json(code ? { error, code } : { error }, status);
  }
});
