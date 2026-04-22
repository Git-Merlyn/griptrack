// src/pages/dashboard/utils/summary.js
// Pure functions for building inventory summary reports.
// No side effects — safe to call in render.

import { csvEscape, downloadCsv, openPrintWindow } from "./export";

/**
 * Group equipment rows into totals by category, location, and status.
 *
 * @param {object[]} equipment - Normalized equipment rows from EquipmentContext
 * @returns {{ byCategory, byLocation, byStatus, totalItems, totalQty }}
 */
export function buildSummary(equipment) {
  const rows = Array.isArray(equipment) ? equipment : [];

  const tally = (key) => {
    const map = {};
    for (const item of rows) {
      const name = item[key] || (key === "category" ? "(Uncategorized)" : key === "location" ? "(Unassigned)" : "(Unknown)");
      const qty = Number(item.quantity) || 0;
      if (!map[name]) map[name] = { count: 0, qty: 0 };
      map[name].count += 1;
      map[name].qty += qty;
    }
    return Object.entries(map)
      .map(([name, { count, qty }]) => ({ name, count, qty }))
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  };

  const totalItems = rows.length;
  const totalQty = rows.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  return {
    byCategory: tally("category"),
    byLocation: tally("location"),
    byStatus: tally("status"),
    totalItems,
    totalQty,
  };
}

/**
 * Build a multi-section CSV string from a summary object.
 * Suitable for download via downloadCsv().
 */
export function summaryCsv(summary) {
  const { byCategory, byLocation, byStatus, totalItems, totalQty } = summary;
  const stamp = new Date().toISOString().slice(0, 10);

  const section = (title, rows) => {
    const lines = [
      [title, "Items", "Total Qty"].map(csvEscape).join(","),
      ...rows.map((r) =>
        [r.name, r.count, r.qty].map(csvEscape).join(",")
      ),
      ["TOTAL", totalItems, totalQty].map(csvEscape).join(","),
      "",
    ];
    return lines.join("\n");
  };

  return (
    "\ufeff" + // UTF-8 BOM for Excel
    `GripTrack Inventory Summary — ${stamp}\n\n` +
    section("By Category", byCategory) +
    section("By Location", byLocation) +
    section("By Status", byStatus)
  );
}

/** Trigger a browser download of the summary as a CSV file. */
export function downloadSummaryCsv(summary) {
  downloadCsv(summaryCsv(summary), "griptrack-summary");
}

/**
 * Build a print-ready HTML document for the summary report.
 */
export function summaryPrintHtml(summary) {
  const { byCategory, byLocation, byStatus, totalItems, totalQty } = summary;
  const stamp = new Date().toISOString().slice(0, 10);

  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  const table = (title, rows) => `
    <h2>${esc(title)}</h2>
    <table>
      <thead>
        <tr><th>Name</th><th>Items</th><th>Total Qty</th></tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) =>
              `<tr><td>${esc(r.name)}</td><td>${r.count}</td><td>${r.qty}</td></tr>`
          )
          .join("\n")}
        <tr class="total">
          <td><strong>Total</strong></td>
          <td><strong>${totalItems}</strong></td>
          <td><strong>${totalQty}</strong></td>
        </tr>
      </tbody>
    </table>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GripTrack Summary ${stamp}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
    h1 { font-size: 16px; margin: 0 0 16px; }
    h2 { font-size: 13px; margin: 20px 0 6px; color: #444; }
    table { border-collapse: collapse; width: 100%; max-width: 480px; font-size: 11px; margin-bottom: 4px; }
    th, td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; }
    th { background: #f5f5f5; }
    tr.total { background: #f0f0f0; }
  </style>
</head>
<body>
  <h1>GripTrack Inventory Summary — ${esc(stamp)}</h1>
  ${table("By Category", byCategory)}
  ${table("By Location", byLocation)}
  ${table("By Status", byStatus)}
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}

/** Open a print dialog with the summary report. */
export function printSummary(summary, { onBlocked } = {}) {
  return openPrintWindow(summaryPrintHtml(summary), { onBlocked });
}
