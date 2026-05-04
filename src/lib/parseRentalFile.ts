/**
 * Client-side PDF and CSV parsing for rental house import lists.
 * Ported from web: src/components/ImportFileModal.jsx
 *
 * PDF path uses pdfjs-dist for text extraction, then runs the same regex
 * passes as the web.  Worker is disabled — runs on the main thread in RN.
 *
 * Date fields use snake_case (start_date / end_date) to match ItemFields /
 * the Supabase schema.  The web uses camelCase internally; mapping happens
 * here so nothing else needs to know about it.
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { ParsedPDFItem } from './types';
import { generateId } from './db';

// Disable web worker — React Native has no worker thread for pdfjs
GlobalWorkerOptions.workerSrc = '';

// ─── Date helpers (identical to web) ─────────────────────────────────────────

export function normalizeDate(raw: string): string {
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

export function extractDate(text: string, type: 'start' | 'end'): string {
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

// ─── PDF parser ───────────────────────────────────────────────────────────────

interface LineObj {
  text: string;
  codeX: number;
  descX: number;
  hasCode: boolean;
  pageNum: number;
}

const codeTokenRe = /^([A-Z]{3,}[A-Z0-9]*\d{3,})$/;
const codeGlobalRe = /\b([A-Z]{3,}[A-Z0-9]*\d{3,})\b/g;

async function pageToLines(page: any, pageNum: number): Promise<LineObj[]> {
  const content = await page.getTextContent();
  const chunks = (content.items as TextItem[])
    .map((it) => {
      const t = (it as any).transform as number[] | undefined ?? [];
      return { str: String(it.str || '').trim(), x: t[4] ?? 0, y: t[5] ?? 0 };
    })
    .filter((it) => it.str.length > 0);

  const Y_TOL = 1.0;
  const lineMap = new Map<number, typeof chunks>();

  for (const it of chunks) {
    let key: number | null = null;
    for (const k of lineMap.keys()) {
      if (Math.abs(k - it.y) <= Y_TOL) { key = k; break; }
    }
    if (key === null) key = it.y;
    const arr = lineMap.get(key) ?? [];
    arr.push(it);
    lineMap.set(key, arr);
  }

  const out: LineObj[] = [];
  for (const y of Array.from(lineMap.keys()).sort((a, b) => b - a)) {
    const row = (lineMap.get(y) ?? []).sort((a, b) => a.x - b.x);
    const text = row.map((r) => r.str).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    let hasCode = false;
    let codeX = row[0]?.x ?? 0;
    let descX = row[0]?.x ?? 0;

    for (let i = 0; i < row.length; i++) {
      if (codeTokenRe.test(row[i].str)) {
        hasCode = true;
        codeX = row[i].x;
        descX = row[i + 1]?.x ?? row[i].x;
        break;
      }
    }

    out.push({ text, codeX, descX, hasCode, pageNum });
  }

  return out;
}

export function takeLowPercentileMean(arr: number[], pct = 0.2): number {
  const xs = arr.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const slice = xs.slice(0, Math.max(1, Math.floor(xs.length * pct)));
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function splitMergedLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const matches = Array.from(line.matchAll(codeGlobalRe));
    if (matches.length <= 1) { out.push(line); continue; }
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index ?? 0;
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? line.length) : line.length;
      const seg = line.slice(start, end).replace(/\s+/g, ' ').trim();
      if (seg) out.push(seg);
    }
  }
  return out;
}

export async function parsePDF(data: Uint8Array): Promise<ParsedPDFItem[]> {
  const pdf = await getDocument({ data }).promise;

  let allLineObjs: LineObj[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    allLineObjs = allLineObjs.concat(await pageToLines(await pdf.getPage(i), i));
  }

  // Filter out indented sub-items using per-page x-position baselines
  const pages = Array.from(new Set(allLineObjs.map((l) => l.pageNum)));
  const baselines = new Map<number, { baseCodeX: number; baseDescX: number }>();
  for (const p of pages) {
    const pl = allLineObjs.filter((l) => l.pageNum === p && l.hasCode);
    baselines.set(p, {
      baseCodeX: takeLowPercentileMean(pl.map((l) => l.codeX)),
      baseDescX: takeLowPercentileMean(pl.map((l) => l.descX)),
    });
  }

  const CODE_INDENT = 8, DESC_INDENT = 8;
  const filtered = allLineObjs.filter((l) => {
    if (!l.hasCode) return true;
    const b = baselines.get(l.pageNum) ?? { baseCodeX: 0, baseDescX: 0 };
    const codeIndented = b.baseCodeX > 0 && l.codeX > b.baseCodeX + CODE_INDENT;
    const descIndented = b.baseDescX > 0 && l.descX > b.baseDescX + DESC_INDENT;
    return !(codeIndented || descIndented);
  });

  const allLines = filtered.map((l) => l.text);
  const normalizedLines = splitMergedLines(allLines);
  const fullText = allLines.join('\n');

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

    const leadMatch = remainder.match(/^\s*(\d{1,4})\s+(?![''""″])/);
    const endMatch = remainder.match(qtyEndRe);

    if (leadMatch) {
      const leadToken = leadMatch[1];
      const leadParsed = parseInt(leadToken, 10);
      remainder = remainder.replace(/^\s*\d{1,4}\s+/, '').trim();

      if (leadToken.length === 1 && endMatch?.[1] && String(endMatch[1]).length === 1) {
        const trailToken = String(endMatch[1]);
        const endsWithIsolated = /(?:\)|[A-Za-z])\s+\d\s*$/.test(originalRemainder);
        if (endsWithIsolated) {
          const combinedA = parseInt(`${leadToken}${trailToken}`, 10);
          const combinedB = parseInt(`${trailToken}${leadToken}`, 10);
          const combined = Math.max(
            Number.isFinite(combinedA) ? combinedA : 0,
            Number.isFinite(combinedB) ? combinedB : 0,
          );
          if (combined > 0) {
            qty = combined;
            remainder = remainder.replace(qtyEndRe, '').trim();
          } else if (Number.isFinite(leadParsed)) {
            qty = leadParsed;
          }
        } else if (Number.isFinite(leadParsed)) {
          qty = leadParsed;
        }
      } else if (Number.isFinite(leadParsed)) {
        qty = leadParsed;
      }
    } else if (endMatch) {
      const parsed = parseInt(endMatch[1], 10);
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

  // Fallback: codeless parser (no equipment codes in PDF)
  if (items.length === 0) {
    const codelessRe = /^\s*(\d{1,4})\s+(?:[xX×]\s*)?(.{3,})$/;
    const categoryHeaderRe = /^[A-Z][A-Z\s&/\-]{3,}$/;
    let fallbackCategory = '';

    for (const line of normalizedLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3) continue;

      if (categoryHeaderRe.test(trimmed) && !/\d/.test(trimmed)) {
        fallbackCategory = trimmed;
        continue;
      }

      const m = trimmed.match(codelessRe);
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

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseCSV(text: string): ParsedPDFItem[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < 2) throw new Error('CSV appears empty or missing rows.');

  const headerLine = nonEmpty[0];
  const header = parseCsvLine(headerLine).map((h) => h.trim().toLowerCase());
  const idxName = header.indexOf('name');
  const idxCategory = header.indexOf('category');
  const idxQty = header.findIndex((h) => h === 'quantity' || h === 'qty');

  if (idxName === -1) throw new Error('CSV missing required column: name');

  const items: ParsedPDFItem[] = [];
  let currentCategory = '';
  let currentItemName = '';

  const startIdx = lines.indexOf(headerLine) + 1;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { currentItemName = ''; continue; }

    const cols = parseCsvLine(line);
    const rawCategory = idxCategory >= 0 ? (cols[idxCategory] ?? '').trim() : '';
    const nameClean = (cols[idxName] ?? '').trim().replace(/\s+/g, ' ');
    const qtyClean = idxQty >= 0 ? (cols[idxQty] ?? '').trim() : '';

    if (!nameClean) { if (rawCategory) currentCategory = rawCategory; currentItemName = ''; continue; }
    if (rawCategory) currentCategory = rawCategory;
    if (!qtyClean) { currentItemName = nameClean; continue; }

    const qty = parseInt(qtyClean, 10);
    const finalQty = Number.isFinite(qty) && qty > 0 ? qty : 1;

    items.push({
      id: generateId(),
      name: currentItemName ? currentItemName : nameClean,
      category: currentCategory,
      quantity: finalQty,
      source: '',
      location: '',
      start_date: null,
      end_date: null,
    });

    if (currentItemName) continue; // status row consumed, base name stays sticky
  }

  if (items.length === 0) throw new Error('No importable rows found in CSV.');
  return items;
}
