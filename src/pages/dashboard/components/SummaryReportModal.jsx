import React, { useState, useMemo } from "react";
import { buildSummary, downloadSummaryCsv, printSummary } from "../utils/summary";

const TABS = [
  { id: "category", label: "By Category" },
  { id: "location", label: "By Location" },
  { id: "status",   label: "By Status"   },
];

const SummaryTable = ({ rows, totalItems, totalQty }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wide">
          <th className="text-left py-2 pr-4 font-medium">Name</th>
          <th className="text-right py-2 pr-4 font-medium w-20">Items</th>
          <th className="text-right py-2 font-medium w-24">Total Qty</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.name}
            className="border-b border-white/5 hover:bg-white/5 transition"
          >
            <td className="py-2 pr-4 text-gray-200">{r.name}</td>
            <td className="py-2 pr-4 text-right text-gray-400">{r.count}</td>
            <td className="py-2 text-right text-gray-200 font-medium">{r.qty}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-white/20 text-accent font-semibold">
          <td className="pt-3 pr-4">Total</td>
          <td className="pt-3 pr-4 text-right">{totalItems}</td>
          <td className="pt-3 text-right">{totalQty}</td>
        </tr>
      </tfoot>
    </table>
  </div>
);

/**
 * Modal showing inventory totals grouped by category, location, and status.
 *
 * @param {{ isOpen: boolean, onClose: () => void, equipment: object[] }} props
 *   equipment — the currently visible/filtered rows (e.g. sortedEquipment from dashboard)
 */
const SummaryReportModal = ({ isOpen, onClose, equipment }) => {
  const [activeTab, setActiveTab] = useState("category");

  const summary = useMemo(() => buildSummary(equipment), [equipment]);

  const handlePrint = () => {
    const ok = printSummary(summary, {
      onBlocked: () =>
        window.toast?.error?.(
          "Pop-up blocked — allow pop-ups to open the print dialog.",
        ),
    });
    if (!ok) return;
  };

  const handleCsv = () => {
    downloadSummaryCsv(summary);
    window.toast?.success?.("Summary exported");
  };

  if (!isOpen) return null;

  const tabRows = {
    category: summary.byCategory,
    location: summary.byLocation,
    status:   summary.byStatus,
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl w-[94%] max-w-lg shadow-lg max-h-[calc(100dvh-32px)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xl font-bold text-accent">Inventory Summary</h3>
            <span className="text-xs text-gray-500">
              {summary.totalItems} items · {summary.totalQty} total qty
            </span>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0 border-b border-white/10 mt-3">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? "border-accent text-accent"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {tabRows[activeTab].length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No data.</p>
          ) : (
            <SummaryTable
              rows={tabRows[activeTab]}
              totalItems={summary.totalItems}
              totalQty={summary.totalQty}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-surface flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            Based on {summary.totalItems} currently visible item{summary.totalItems !== 1 ? "s" : ""}.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={handleCsv} className="btn-secondary-sm">
              Export CSV
            </button>
            <button type="button" onClick={handlePrint} className="btn-secondary-sm">
              Print
            </button>
            <button type="button" onClick={onClose} className="btn-accent">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SummaryReportModal;
