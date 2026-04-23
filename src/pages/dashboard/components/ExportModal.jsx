import React, { useState } from "react";

// exportType: 'inventory' | 'lowstock' | 'history'

const ExportModal = ({
  isOpen,
  onClose,

  exportUseCurrentView,
  setExportUseCurrentView,

  exportScope,
  setExportScope,

  exportSingleLocation,
  setExportSingleLocation,

  exportMultiLocations,
  setExportMultiLocations,

  exportFormat,
  setExportFormat,

  allLocations,
  getExportRows,

  onDoExport,
  onExportLowStock,
  onExportHistory,
  exportingHistory,
}) => {
  const [exportType, setExportType] = useState("inventory");

  if (!isOpen) return null;

  const handleExport = () => {
    if (exportType === "lowstock") {
      onExportLowStock();
      onClose();
    } else if (exportType === "history") {
      onExportHistory();
      onClose();
    } else {
      onDoExport();
    }
  };

  const exportDisabled =
    exportType === "inventory"
      ? getExportRows().length === 0
      : exportType === "history"
      ? exportingHistory
      : false;

  const exportLabel =
    exportType === "history" && exportingHistory
      ? "Exporting…"
      : "Export";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-xl w-[92%] max-w-lg shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-accent mb-4">Export</h3>

        <div className="flex flex-col gap-4">
          {/* Export type selector */}
          <div>
            <div className="text-sm text-gray-300 mb-2">What to export</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={exportType === "inventory" ? "btn-accent-sm" : "btn-secondary-sm"}
                onClick={() => setExportType("inventory")}
              >
                Inventory
              </button>
              <button
                type="button"
                className={exportType === "lowstock" ? "btn-accent-sm" : "btn-secondary-sm"}
                onClick={() => setExportType("lowstock")}
              >
                Low Stock
              </button>
              <button
                type="button"
                className={exportType === "history" ? "btn-accent-sm" : "btn-secondary-sm"}
                onClick={() => setExportType("history")}
              >
                Audit History
              </button>
            </div>
            {exportType === "lowstock" && (
              <p className="text-xs text-gray-400 mt-2">
                Exports all items currently below their reserve minimum, with a shortage column.
              </p>
            )}
            {exportType === "history" && (
              <p className="text-xs text-gray-400 mt-2">
                Exports the full audit log for this organization as a CSV.
              </p>
            )}
          </div>

          {/* Inventory-specific options */}
          {exportType === "inventory" && (
            <>
              <label className="flex items-center gap-2 text-sm text-gray-300 select-none">
                <input
                  type="checkbox"
                  checked={exportUseCurrentView}
                  onChange={(e) => setExportUseCurrentView(e.target.checked)}
                />
                Export current view only (search + sort)
              </label>

              <div>
                <div className="text-sm text-gray-300 mb-2">Scope</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={exportScope === "all" ? "btn-accent-sm" : "btn-secondary-sm"}
                    onClick={() => setExportScope("all")}
                  >
                    All locations
                  </button>
                  <button
                    type="button"
                    className={exportScope === "single" ? "btn-accent-sm" : "btn-secondary-sm"}
                    onClick={() => setExportScope("single")}
                  >
                    One location
                  </button>
                  <button
                    type="button"
                    className={exportScope === "multi" ? "btn-accent-sm" : "btn-secondary-sm"}
                    onClick={() => setExportScope("multi")}
                  >
                    Multiple
                  </button>
                </div>

                {exportScope === "single" && (
                  <div className="mt-3">
                    <select
                      value={exportSingleLocation}
                      onChange={(e) => setExportSingleLocation(e.target.value)}
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

                {exportScope === "multi" && (
                  <div className="mt-3 max-h-48 overflow-auto border border-white/10 rounded p-2">
                    {allLocations.map((loc) => {
                      const v = String(loc);
                      const checked = exportMultiLocations.includes(v);
                      return (
                        <label
                          key={v}
                          className="flex items-center gap-2 py-1 text-sm text-gray-200"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setExportMultiLocations((prev) =>
                                prev.includes(v)
                                  ? prev.filter((x) => x !== v)
                                  : [...prev, v],
                              )
                            }
                          />
                          {loc}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="text-sm text-gray-300 mb-2">Format</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={exportFormat === "csv" ? "btn-accent-sm" : "btn-secondary-sm"}
                    onClick={() => setExportFormat("csv")}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    className={exportFormat === "pdf" ? "btn-accent-sm" : "btn-secondary-sm"}
                    onClick={() => setExportFormat("pdf")}
                  >
                    PDF
                  </button>
                </div>
                {exportFormat === "pdf" && (
                  <div className="text-xs text-gray-400 mt-2">
                    PDF opens a print dialog — choose "Save as PDF".
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
            {exportType === "inventory" ? (
              <div className="text-sm text-gray-300">
                Items to export: {getExportRows().length}
              </div>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className={exportDisabled ? "btn-disabled" : "btn-accent"}
                disabled={exportDisabled}
                onClick={handleExport}
              >
                {exportLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
