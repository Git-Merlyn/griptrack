/**
 * Client-side CSV parsing for rental house import lists.
 *
 * PDF parsing is handled server-side via the Supabase Edge Function
 * `parse-rental-pdf`. React Native's Hermes engine does not support
 * `import.meta`, which pdfjs-dist requires, so PDF extraction cannot
 * run on-device. The mobile app uploads the raw PDF bytes to the Edge
 * Function and receives structured ParsedPDFItem[] in return.
 *
 * This file handles CSV only — pure JS, no native dependencies.
 *
 * Date fields use snake_case (start_date / end_date) to match ItemFields /
 * the Supabase schema.
 */

import { ParsedPDFItem } from './types';
import { generateId } from './db';

// ─── Date helpers ─────────────────────────────────────────────────────────────

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
