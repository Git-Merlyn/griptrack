import { useCallback, useState } from "react";
import {
  downloadCsv,
  openPrintWindow,
  rowsToCsv,
  rowsToPrintHtml,
} from "../utils/export";

export default function useExport({ sortedEquipment, visibleEquipment } = {}) {
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState("csv"); // 'csv' | 'pdf'
  const [exportScope, setExportScope] = useState("all"); // 'all' | 'single' | 'multi'
  const [exportUseCurrentView, setExportUseCurrentView] = useState(true);
  const [exportSingleLocation, setExportSingleLocation] = useState("");
  const [exportMultiLocations, setExportMultiLocations] = useState([]);

  const getExportRows = useCallback(() => {
    const base = exportUseCurrentView
      ? Array.isArray(sortedEquipment)
        ? sortedEquipment
        : []
      : Array.isArray(visibleEquipment)
        ? visibleEquipment
        : [];

    if (exportScope === "all") return base;

    if (exportScope === "single") {
      if (!exportSingleLocation) return [];
      return base.filter(
        (r) => String(r?.location || "") === String(exportSingleLocation),
      );
    }

    if (
      !Array.isArray(exportMultiLocations) ||
      exportMultiLocations.length === 0
    )
      return [];
    const set = new Set(exportMultiLocations.map((x) => String(x)));
    return base.filter((r) => set.has(String(r?.location || "")));
  }, [
    exportUseCurrentView,
    sortedEquipment,
    visibleEquipment,
    exportScope,
    exportSingleLocation,
    exportMultiLocations,
  ]);

  const exportRowsToCsv = useCallback((rows) => {
    const csv = rowsToCsv(rows);
    downloadCsv(csv);
  }, []);

  const exportRowsToPdf = useCallback((rows) => {
    const html = rowsToPrintHtml(rows, "GripTrack Export");
    openPrintWindow(html, {
      onBlocked: () =>
        window.toast?.error?.("Popup blocked — allow popups to export PDF"),
    });
  }, []);

  const doExport = useCallback(() => {
    const rows = getExportRows();
    if (!Array.isArray(rows) || rows.length === 0) return { count: 0 };

    if (exportFormat === "csv") exportRowsToCsv(rows);
    else exportRowsToPdf(rows);

    return { count: rows.length };
  }, [exportFormat, exportRowsToCsv, exportRowsToPdf, getExportRows]);

  return {
    showExportModal,
    setShowExportModal,
    exportFormat,
    setExportFormat,
    exportScope,
    setExportScope,
    exportUseCurrentView,
    setExportUseCurrentView,
    exportSingleLocation,
    setExportSingleLocation,
    exportMultiLocations,
    setExportMultiLocations,
    getExportRows,
    doExport,
  };
}
