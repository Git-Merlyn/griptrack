import React, { useMemo, useState } from "react";
import Modal from "./Modal";

// Simple CSV export helper
const csvEscape = (value) => {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export default function ExportModal({
  isOpen,
  onClose,
  rows = [],
  allLocations = [],
}) {
  const [format, setFormat] = useState("csv"); // 'csv' | 'pdf'
  const [scope, setScope] = useState("all"); // 'all' | 'single' | 'multi'
  const [singleLocation, setSingleLocation] = useState("");
  const [multiLocations, setMultiLocations] = useState([]); // array of strings

  const effectiveRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];

    if (scope === "all") return rows;

    if (scope === "single") {
      if (!singleLocation) return [];
      return rows.filter(
        (r) => String(r?.location || "") === String(singleLocation),
      );
    }

    // multi
    if (multiLocations.length === 0) return [];
    const set = new Set(multiLocations.map(String));
    return rows.filter((r) => set.has(String(r?.location || "")));
  }, [rows, scope, singleLocation, multiLocations]);

  const toggleMulti = (loc) => {
    const v = String(loc);
    setMultiLocations((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  };

  const handleExportCsv = () => {
    const header = [
      "Item ID",
      "Name",
      "Category",
      "Source",
      "Location",
      "Status",
      "Quantity",
      "Start Date",
      "End Date",
      "Updated By",
    ];

    const lines = [header.map(csvEscape).join(",")];

    for (const it of effectiveRows) {
      lines.push(
        [
          it?.itemId || "",
          it?.name || "",
          it?.category || "",
          it?.source || "",
          it?.location || "",
          it?.status || "",
          Number(it?.quantity) || 0,
          it?.rentalStart || "",
          it?.rentalEnd || "",
          it?.updatedBy || "",
        ]
          .map(csvEscape)
          .join(","),
      );
    }

    const csv = "\ufeff" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `griptrack-export-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // PDF option A (no libraries): open a printable window and let user “Save as PDF”
  const handleExportPdfViaPrint = () => {
    const stamp = new Date().toISOString().slice(0, 10);

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GripTrack Export ${stamp}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 18px; }
    h1 { font-size: 16px; margin: 0 0 12px 0; }
    table { border-collapse: collapse; width: 100%; font-size: 11px; }
    th, td { border: 1px solid #ddd; padding: 6px; vertical-align: top; }
    th { background: #f5f5f5; text-align: left; }
  </style>
</head>
<body>
  <h1>GripTrack Export (${stamp}) — ${effectiveRows.length} item(s)</h1>
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
        <th>Start</th>
        <th>End</th>
        <th>Updated By</th>
      </tr>
    </thead>
    <tbody>
      ${effectiveRows
        .map((it) => {
          const esc = (s) =>
            String(s ?? "")
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;");
          return `
          <tr>
            <td>${esc(it?.itemId)}</td>
            <td>${esc(it?.name)}</td>
            <td>${esc(it?.category)}</td>
            <td>${esc(it?.source)}</td>
            <td>${esc(it?.location)}</td>
            <td>${esc(it?.status)}</td>
            <td>${esc(it?.quantity)}</td>
            <td>${esc(it?.rentalStart)}</td>
            <td>${esc(it?.rentalEnd)}</td>
            <td>${esc(it?.updatedBy)}</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>
  <script>
    window.onload = () => window.print();
  </script>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const canExport =
    effectiveRows.length > 0 &&
    (scope !== "single" || !!singleLocation) &&
    (scope !== "multi" || multiLocations.length > 0);

  const doExport = () => {
    if (!canExport) return;
    if (format === "csv") handleExportCsv();
    else handleExportPdfViaPrint();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export">
      <div className="flex flex-col gap-4">
        {/* Scope */}
        <div>
          <div className="text-sm text-gray-300 mb-2">Export scope</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={scope === "all" ? "btn-accent-sm" : "btn-secondary-sm"}
              onClick={() => setScope("all")}
            >
              All locations
            </button>
            <button
              type="button"
              className={
                scope === "single" ? "btn-accent-sm" : "btn-secondary-sm"
              }
              onClick={() => setScope("single")}
            >
              One location
            </button>
            <button
              type="button"
              className={
                scope === "multi" ? "btn-accent-sm" : "btn-secondary-sm"
              }
              onClick={() => setScope("multi")}
            >
              Multiple locations
            </button>
          </div>

          {scope === "single" && (
            <div className="mt-3">
              <select
                value={singleLocation}
                onChange={(e) => setSingleLocation(e.target.value)}
                className="w-full px-3 py-2 rounded bg-white text-black"
              >
                <option value="">Select a location…</option>
                {allLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === "multi" && (
            <div className="mt-3 max-h-48 overflow-auto border border-white/10 rounded p-2">
              {allLocations.map((loc) => (
                <label
                  key={loc}
                  className="flex items-center gap-2 py-1 text-sm text-gray-200"
                >
                  <input
                    type="checkbox"
                    checked={multiLocations.includes(String(loc))}
                    onChange={() => toggleMulti(loc)}
                  />
                  {loc}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Format */}
        <div>
          <div className="text-sm text-gray-300 mb-2">Format</div>
          <div className="flex gap-2">
            <button
              type="button"
              className={
                format === "csv" ? "btn-accent-sm" : "btn-secondary-sm"
              }
              onClick={() => setFormat("csv")}
            >
              CSV
            </button>
            <button
              type="button"
              className={
                format === "pdf" ? "btn-accent-sm" : "btn-secondary-sm"
              }
              onClick={() => setFormat("pdf")}
            >
              PDF
            </button>
          </div>

          {format === "pdf" && (
            <div className="text-xs text-gray-400 mt-2">
              PDF exports will open a print dialog — choose “Save as PDF”.
            </div>
          )}
        </div>

        {/* Summary + actions */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-300">
            Exporting{" "}
            <span className="text-text font-semibold">
              {effectiveRows.length}
            </span>{" "}
            item(s)
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={canExport ? "btn-accent" : "btn-disabled"}
              onClick={doExport}
              disabled={!canExport}
            >
              Export
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
