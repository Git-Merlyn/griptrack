// src/pages/dashboard/utils/export.js

export function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows) {
  const header = [
    "Item ID",
    "Name",
    "Category",
    "Source",
    "Location",
    "Status",
    "Quantity",
    "Reserve Min",
    "Start Date",
    "End Date",
    "Updated By",
  ];

  const lines = [header.map(csvEscape).join(",")];

  for (const it of rows) {
    lines.push(
      [
        it?.itemId || "",
        it?.name || "",
        it?.category || "",
        it?.source || "",
        it?.location || "",
        it?.status || "",
        Number(it?.quantity) || 0,
        Number(it?.reserveMin) || 0,
        it?.rentalStart || "",
        it?.rentalEnd || "",
        it?.updatedBy || "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  // UTF-8 BOM for Excel
  return "\ufeff" + lines.join("\n");
}

export function downloadCsv(csvText, filenameBase = "griptrack-export") {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filenameBase}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function rowsToPrintHtml(rows, title = "GripTrack Export") {
  const stamp = new Date().toISOString().slice(0, 10);
  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)} ${stamp}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 18px; }
    h1 { font-size: 16px; margin: 0 0 12px 0; }
    table { border-collapse: collapse; width: 100%; font-size: 11px; }
    th, td { border: 1px solid #ddd; padding: 6px; vertical-align: top; }
    th { background: #f5f5f5; text-align: left; }
  </style>
</head>
<body>
  <h1>${esc(title)} (${stamp}) — ${rows.length} item(s)</h1>
  <table>
    <thead>
      <tr>
        <th>Item ID</th>
        <th>Name</th>
        <th>Category</th>
        <th>Source</th>
        <th>Location</th>
        <th>Status</th>
        <th>Qty</th>
        <th>Reserve</th>
        <th>Start</th>
        <th>End</th>
        <th>Updated By</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((it) => {
          return `\n<tr>
            <td>${esc(it?.itemId)}</td>
            <td>${esc(it?.name)}</td>
            <td>${esc(it?.category)}</td>
            <td>${esc(it?.source)}</td>
            <td>${esc(it?.location)}</td>
            <td>${esc(it?.status)}</td>
            <td>${esc(it?.quantity)}</td>
            <td>${esc(it?.reserveMin)}</td>
            <td>${esc(it?.rentalStart)}</td>
            <td>${esc(it?.rentalEnd)}</td>
            <td>${esc(it?.updatedBy)}</td>
          </tr>`;
        })
        .join("\n")}
    </tbody>
  </table>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}

/**
 * Build a CSV for items that are below their reserve minimum.
 * Includes an extra "Shortage" column (reserveMin - qty).
 *
 * @param {object[]} allEquipment - Full equipment array (unfiltered)
 * @returns {string} UTF-8 BOM + CSV text
 */
export function lowStockToCsv(allEquipment) {
  const rows = (Array.isArray(allEquipment) ? allEquipment : []).filter((e) => {
    const qty = Number(e?.quantity) || 0;
    const reserve = Number(e?.reserveMin) || 0;
    return reserve > 0 && qty < reserve;
  });

  const header = [
    "Name",
    "Category",
    "Location",
    "Status",
    "Qty",
    "Reserve Min",
    "Shortage",
  ];

  const lines = [header.map(csvEscape).join(",")];

  for (const it of rows) {
    const qty = Number(it?.quantity) || 0;
    const reserve = Number(it?.reserveMin) || 0;
    lines.push(
      [
        it?.name || "",
        it?.category || "",
        it?.location || "",
        it?.status || "",
        qty,
        reserve,
        reserve - qty,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  return "\ufeff" + lines.join("\n");
}

export function openPrintWindow(html, { onBlocked } = {}) {
  const w = window.open("", "_blank");
  if (!w) {
    if (typeof onBlocked === "function") onBlocked();
    return false;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
