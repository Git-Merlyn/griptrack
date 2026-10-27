// build-pdf-template logic (WP26 Phase 4), separate from the handler so it
// runs in tests with a fake client: request validation and the Claude call.
import type Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import {
  checkChoice,
  choiceFromSuggestion,
  promptLines,
  SUGGESTION_SCHEMA,
  SYSTEM_PROMPT,
} from '../_shared/pdf/suggest.js';

export const MODEL = 'claude-opus-5-5';
export const DAILY_LIMIT = 5;
const MAX_PAGES = 3;
const MAX_ITEMS_PER_PAGE = 3000;
const MAX_STR = 300;
const MAX_TOTAL_CHARS = 200_000;

export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
}

export class BuildError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * The request body: { pages } with the first pages' text items (what the
 * teach screen already holds), never the PDF file. Throws BuildError(400).
 */
export function parsePagesBody(text: string): PdfTextItem[][] {
  if (text.length > MAX_TOTAL_CHARS * 4) throw new BuildError(413, 'Too much page text.');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new BuildError(400, 'Request body must be JSON.');
  }
  const pages = (body as { pages?: unknown } | null)?.pages;
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > MAX_PAGES) {
    throw new BuildError(400, `pages must hold 1 to ${MAX_PAGES} pages.`);
  }
  let chars = 0;
  const out = pages.map((page) => {
    if (!Array.isArray(page) || page.length > MAX_ITEMS_PER_PAGE) throw new BuildError(400, 'A page is invalid.');
    return page.map((it) => {
      const o = it as Record<string, unknown> | null;
      const t = o?.transform;
      if (
        !o || typeof o.str !== 'string' || o.str.length > MAX_STR ||
        !Array.isArray(t) || t.length !== 6 || !t.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
        typeof o.width !== 'number' || !Number.isFinite(o.width)
      ) {
        throw new BuildError(400, 'A text item is invalid.');
      }
      chars += o.str.length;
      return { str: o.str, transform: t as number[], width: o.width };
    });
  });
  if (chars > MAX_TOTAL_CHARS) throw new BuildError(413, 'Too much page text.');
  return out;
}

export type Choice = NonNullable<ReturnType<typeof choiceFromSuggestion>['choice']>;

/**
 * Ask Claude for the layout choices, then check them against the pages
 * with the same code as a hand-taught layout. Returns the choice and how
 * many rows it reads, or throws BuildError(422) when there is no usable
 * suggestion. Page text is never logged.
 */
export async function suggestLayout(
  client: Pick<Anthropic, 'beta'>,
  pages: PdfTextItem[][],
): Promise<{ choice: Choice; rows: number }> {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // On a safety decline, Anthropic re-runs the request on its recommended
    // fallback model instead of returning a refusal.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SUGGESTION_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: promptLines(pages) }],
  });

  const noSuggestion = "Couldn't work out this layout. Teach it yourself instead.";
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    throw new BuildError(422, noSuggestion, 'no_suggestion');
  }
  const text = response.content.find((b) => b.type === 'text');
  let answer: unknown;
  try {
    answer = JSON.parse(text && text.type === 'text' ? text.text : '');
  } catch {
    throw new BuildError(422, noSuggestion, 'no_suggestion');
  }

  const mapped = choiceFromSuggestion(pages, answer);
  if (!mapped.choice) throw new BuildError(422, noSuggestion, 'no_suggestion');
  const check = checkChoice(pages, mapped.choice);
  if (!check.ok) throw new BuildError(422, noSuggestion, 'no_suggestion');
  return { choice: mapped.choice, rows: check.rows };
}
