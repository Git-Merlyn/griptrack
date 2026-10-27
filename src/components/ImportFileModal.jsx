import React, { useEffect, useState, useContext } from "react";
import Modal from "./Modal";
import useDialog from "@/hooks/useDialog";
import EquipmentContext from "../context/EquipmentContext";
import useUser from "@/context/useUser";
import { planAllows, PDF_IMPORT_PRO_MESSAGE } from "@/lib/plan";
import {
  SCANNED_PDF_MESSAGE,
  isScannedPdf,
  newImportRow,
  rowProblems,
  stripRowKeys,
  withRowKeys,
} from "@/lib/importRows";
// pdf.js 6.4.299, the same version the parse-rental-pdf function runs (via
// unpdf), so web and mobile read a PDF's text identically (WP26). The legacy
// build supports Safari 18+ / Chrome 125+; the default build needs newer.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { linesFromPages, rowsFromLines } from "@pdf/rows.js";
import { applyTemplate, matchTemplate } from "@pdf/templates.js";
import { supabase } from "@/lib/supabaseClient";
import TeachLayoutDialog from "./import/TeachLayoutDialog";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// Stable default: a fresh [] each render would re-run the allLocations effect.
const EMPTY_LOCATIONS = [];

const ImportFileModal = ({
  isOpen,
  onClose,
  onUpload,
  setImportInProgress,
  allLocations = EMPTY_LOCATIONS,
  mode = "import", // 'import' | 'select'
}) => {
  const { pdfParsingStatus, setPdfParsingStatus, registerLocation } =
    useContext(EquipmentContext);
  // PDF import is a Pro feature (audit M9); CSV import and select-from-file stay free.
  const { effectivePlan } = useUser();

  // keep a local copy so we can optimistically add new locations inline
  useEffect(() => {
    setLocalLocations(Array.isArray(allLocations) ? allLocations : []);
  }, [allLocations]);

  const SOURCE_PRESETS = ["Dean", "White's"];
  const [customSources, setCustomSources] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("griptrack_custom_sources");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCustomSources(parsed);
      }
    } catch (e) {
      console.warn("Failed to load custom sources", e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "griptrack_custom_sources",
        JSON.stringify(customSources),
      );
    } catch (e) {
      console.warn("Failed to save custom sources", e);
    }
  }, [customSources]);

  const sourceOptions = Array.from(
    new Set([
      ...SOURCE_PRESETS,
      ...(Array.isArray(customSources) ? customSources : []),
    ]),
  ).sort();

  const [parsedData, setParsedData] = useState([]);
  // Rows the last Submit refused (empty name, quantity under 1); cleared as
  // soon as they are fixed.
  const [showRowProblems, setShowRowProblems] = useState(false);
  // Supplier layouts (WP26 Phase 3): the PDF's text items (kept for "teach
  // it"), the saved layout used for this import, and whether it still fits.
  const [pdfPages, setPdfPages] = useState(null);
  const [layoutUse, setLayoutUse] = useState(null); // { record, drift } | null
  const [teachOpen, setTeachOpen] = useState(false);
  const problemRows = new Set(
    showRowProblems ? rowProblems(parsedData).map((p) => p.index) : [],
  );
  const [defaultLocation, setDefaultLocation] = useState("");
  const [defaultSource, setDefaultSource] = useState("");
  const [showSpinner, setShowSpinner] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [showMissingLocationConfirm, setShowMissingLocationConfirm] =
    useState(false);
  const confirmDialog = useDialog({
    isOpen: showMissingLocationConfirm,
    onClose: () => setShowMissingLocationConfirm(false),
  });

  // Inline add-new controls (no browser prompt)
  const [localLocations, setLocalLocations] = useState([]);
  const [addingLocation, setAddingLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");

  const [addingSource, setAddingSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");

  useEffect(() => {
    setShowSpinner(pdfParsingStatus === "parsing");
  }, [pdfParsingStatus]);

  const parseCsvLine = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }

    out.push(cur);
    return out;
  };

  const extractDataFromCSV = async (file) => {
    setPdfPages(null);
    setLayoutUse(null);
    try {
      setPdfParsingStatus && setPdfParsingStatus("parsing");
      setImportInProgress && setImportInProgress(true);
      setErrorMessage("");

      const text = await file.text();
      const lines = text.split(/\r?\n/).map((l) => l.trimEnd());

      const nonEmptyLines = lines.filter(
        (l) => String(l || "").trim().length > 0,
      );
      if (nonEmptyLines.length < 2) {
        setPdfParsingStatus && setPdfParsingStatus("error");
        setErrorMessage("CSV appears empty or missing rows.");
        return;
      }

      const headerLine = nonEmptyLines[0];
      const header = parseCsvLine(headerLine).map((h) => String(h).trim());
      const idxCategory = header.findIndex(
        (h) => h.toLowerCase() === "category",
      );
      const idxName = header.findIndex((h) => h.toLowerCase() === "name");
      const idxQty = header.findIndex(
        (h) => h.toLowerCase() === "quantity" || h.toLowerCase() === "qty",
      );

      if (idxName === -1) {
        setPdfParsingStatus && setPdfParsingStatus("error");
        setErrorMessage("CSV missing required column: Name");
        return;
      }

      const items = [];
      let currentCategory = "";
      let currentItemName = ""; // base-name header (sticky until blank line)

      const prettyStatus = (s) =>
        String(s || "")
          .trim()
          .replace(/\s+/g, " ")
          .split(" ")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

      // Start data parsing after the header line we used
      const headerIndexInLines = lines.findIndex((l) => l === headerLine);
      const startIdx = headerIndexInLines >= 0 ? headerIndexInLines + 1 : 1;

      for (let i = startIdx; i < lines.length; i++) {
        const line = String(lines[i] ?? "");
        const trimmedLine = line.trim();

        // A fully blank row resets grouping
        if (!trimmedLine) {
          currentItemName = "";
          continue;
        }

        const cols = parseCsvLine(line);
        const rawCategory =
          idxCategory >= 0 ? String(cols[idxCategory] ?? "").trim() : "";
        const rawName = String(cols[idxName] ?? "").trim();
        const rawQty = idxQty >= 0 ? String(cols[idxQty] ?? "").trim() : "";

        const nameClean = rawName.replace(/\s+/g, " ").trim();
        const qtyClean = rawQty.replace(/\s+/g, " ").trim();

        // Category header rows: category set but no name
        // Treat as a section boundary: reset any active base-name grouping
        if (!nameClean) {
          if (rawCategory) currentCategory = rawCategory;
          currentItemName = "";
          continue;
        }

        // Keep category sticky if present
        if (rawCategory) currentCategory = rawCategory;

        // Rule: Name but no qty => base item name header; subsequent rows are statuses until a blank line
        if (nameClean && !qtyClean) {
          currentItemName = nameClean;
          continue;
        }

        const qty = parseInt(qtyClean, 10);
        const finalQty = Number.isFinite(qty) && qty > 0 ? qty : 1;

        if (currentItemName) {
          // Status row under the current base name
          items.push({
            id: "",
            name: currentItemName,
            category: currentCategory || "",
            status: prettyStatus(nameClean),
            source: "",
            quantity: finalQty,
            startDate: "",
            endDate: "",
            location: "",
          });
          continue;
        }

        // Normal row when not in a base-name group
        items.push({
          id: "",
          name: nameClean,
          category: currentCategory || "",
          status: "Available",
          source: "",
          quantity: finalQty,
          startDate: "",
          endDate: "",
          location: "",
        });
      }

      if (items.length > 0) {
        setShowRowProblems(false);
        setParsedData(withRowKeys(items));
        setPdfParsingStatus && setPdfParsingStatus("done");
      } else {
        setPdfParsingStatus && setPdfParsingStatus("error");
        setErrorMessage("No importable rows found in CSV.");
      }
    } catch (err) {
      console.error("CSV parse error", err);
      setPdfParsingStatus && setPdfParsingStatus("error");
      setErrorMessage(
        "There was an error reading the CSV. See console for details.",
      );
    } finally {
      setImportInProgress && setImportInProgress(false);
    }
  };

  // The org's saved layouts plus global ones (RLS). Never blocks an import:
  // on any error the general reader is used.
  const loadLayouts = async () => {
    try {
      const { data, error } = await supabase
        .from("pdf_templates")
        .select("id, name, scope, template, success_count");
      return error || !Array.isArray(data) ? [] : data;
    } catch {
      return [];
    }
  };

  const readRows = (pages, lineObjs, layouts) => {
    const record = matchTemplate(layouts, pages);
    if (record) {
      const result = applyTemplate(record.template, pages);
      if (result.rows.length > 0) {
        return { rows: result.rows, use: { record, drift: result.drift } };
      }
      return { rows: rowsFromLines(lineObjs), use: { record, drift: true } };
    }
    return { rows: rowsFromLines(lineObjs), use: null };
  };

  const toItem = (r) => ({
    id: r.code,
    name: r.name,
    category: r.category,
    status: "Available",
    source: "",
    quantity: r.quantity,
    startDate: r.startDate,
    endDate: r.endDate,
    location: "",
  });

  // A layout was just taught: read this PDF with it straight away.
  const handleLayoutSaved = (record) => {
    setTeachOpen(false);
    const result = applyTemplate(record.template, pdfPages);
    setLayoutUse({ record, drift: result.drift });
    if (result.rows.length > 0) {
      setShowRowProblems(false);
      setParsedData(
        withRowKeys(
          result.rows.map((r) => ({
            ...toItem(r),
            location: mode === "import" ? defaultLocation : "",
            source: mode === "import" ? defaultSource : "",
          })),
        ),
      );
      setPdfParsingStatus && setPdfParsingStatus("done");
      setErrorMessage("");
    }
    window.toast?.success?.(`Saved the layout "${record.name}".`);
  };

  const extractDataFromPDF = async (file) => {
    try {
      if (setPdfParsingStatus) setPdfParsingStatus("parsing");
      if (setImportInProgress) setImportInProgress(true);

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setErrorMessage("");

      // Text items per page; parsing itself lives in the module shared with
      // the parse-rental-pdf edge function (WP26 Phase 2).
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items || []);
      }
      const allLineObjs = linesFromPages(pages);

      // A scanned (image-only) PDF has no text layer: say so instead of
      // "no items found" (WP26 Phase 1).
      if (isScannedPdf(allLineObjs.map((l) => l.text))) {
        setPdfParsingStatus && setPdfParsingStatus("error");
        setErrorMessage(SCANNED_PDF_MESSAGE);
        window.toast?.error?.(SCANNED_PDF_MESSAGE);
        return;
      }

      // A saved layout for this supplier wins; otherwise the general reader.
      setPdfPages(pages);
      const { rows, use } = readRows(pages, allLineObjs, await loadLayouts());
      setLayoutUse(use);
      const items = rows.map(toItem);

      if (items.length > 0) {
        setShowRowProblems(false);
        setParsedData(withRowKeys(items));
        setPdfParsingStatus && setPdfParsingStatus("done");
      } else {
        setPdfParsingStatus && setPdfParsingStatus("error");
        const msg =
          "No items found in PDF. Teach GripTrack this supplier's layout below, or export a CSV from the rental house's system.";
        setErrorMessage(msg);
        window.toast?.error?.(msg);
      }
    } catch (err) {
      console.error("PDF parse error", err);
      setPdfParsingStatus && setPdfParsingStatus("error");
      setErrorMessage(
        "There was an error reading the PDF. See console for details.",
      );
      window.toast?.error?.(
        "There was an error reading the PDF. See console for details.",
      );
    } finally {
      if (setImportInProgress) setImportInProgress(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const name = (file.name || "").toLowerCase();
    const isCsv = file.type === "text/csv" || name.endsWith(".csv");

    if (isCsv) return extractDataFromCSV(file);
    if (mode === "import" && !planAllows(effectivePlan, "pro")) {
      setErrorMessage(PDF_IMPORT_PRO_MESSAGE);
      event.target.value = "";
      return;
    }
    return extractDataFromPDF(file);
  };

  // Editable preview (WP26 Phase 1): every parsed value can be corrected,
  // junk rows deleted and missed rows added before anything is saved.
  const updateRow = (index, patch) => {
    setErrorMessage("");
    setParsedData((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  const deleteRow = (index) => {
    setErrorMessage("");
    setParsedData((prev) => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setErrorMessage("");
    setParsedData((prev) => [
      ...prev,
      newImportRow({
        location: mode === "import" ? defaultLocation : "",
        source: mode === "import" ? defaultSource : "",
        startDate: prev[0]?.startDate ?? "",
        endDate: prev[0]?.endDate ?? "",
      }),
    ]);
  };

  const handleLocationChange = (index, value) => {
    setParsedData((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], location: value };
      return copy;
    });
  };

  const assignAllLocations = () => {
    if (!defaultLocation) return;
    setParsedData((prev) =>
      prev.map((it) => ({ ...it, location: defaultLocation })),
    );
  };

  const assignAllSources = () => {
    if (!defaultSource) return;
    setParsedData((prev) =>
      prev.map((it) => ({ ...it, source: defaultSource })),
    );
  };

  const handleSourceChange = (index, value) => {
    setParsedData((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], source: value };
      return copy;
    });
  };

  const addLocationInline = () => {
    const trimmed = String(newLocationName || "").trim();
    if (!trimmed) return;

    if (typeof registerLocation === "function") registerLocation(trimmed);

    // Optimistically add for this modal session
    setLocalLocations((prev) => {
      const exists = prev.some(
        (l) => String(l).toLowerCase() === trimmed.toLowerCase(),
      );
      return exists ? prev : [...prev, trimmed].sort();
    });

    setDefaultLocation(trimmed);
    setAddingLocation(false);
    setNewLocationName("");
  };

  const addSourceInline = () => {
    const trimmed = String(newSourceName || "").trim();
    if (!trimmed) return;

    setCustomSources((prev) => {
      const exists = prev.some(
        (s) => String(s).toLowerCase() === trimmed.toLowerCase(),
      );
      return exists ? prev : [...prev, trimmed];
    });

    setDefaultSource(trimmed);
    setAddingSource(false);
    setNewSourceName("");
  };

  // Waits for the dashboard to finish (one batched insert in import mode).
  // The dashboard shows the result toast with the real count; on failure the
  // parsed rows stay on screen so the user can retry.
  const doSubmit = async () => {
    setShowMissingLocationConfirm(false);
    setErrorMessage("");
    setPdfParsingStatus && setPdfParsingStatus("uploading");
    if (setImportInProgress) setImportInProgress(true);
    try {
      await onUpload(stripRowKeys(parsedData));
      if (layoutUse?.record?.id) {
        // Usage count for the layout library (Phase 4); failures don't matter.
        supabase
          .rpc("record_pdf_template_use", { p_template: layoutUse.record.id, p_ok: true })
          .then(() => {}, () => {});
      }

      setParsedData([]);
      setDefaultLocation("");
      setDefaultSource("");
      setPdfParsingStatus && setPdfParsingStatus("idle");
      onClose();
    } catch (e) {
      console.error("Import failed", e);
      setPdfParsingStatus && setPdfParsingStatus("done");
      setErrorMessage(
        `Import failed: ${e?.message || "unknown error"}. Nothing was added — please try again.`,
      );
    } finally {
      if (setImportInProgress) setImportInProgress(false);
    }
  };
  const handleSubmit = () => {
    const problems = rowProblems(parsedData);
    setShowRowProblems(problems.length > 0);
    if (problems.length > 0) {
      setErrorMessage(
        problems.length === 1
          ? `Row ${problems[0].index + 1}: ${problems[0].message}`
          : `${problems.length} rows need fixing (highlighted below). Row ${problems[0].index + 1}: ${problems[0].message}`,
      );
      return;
    }
    if (mode === "import") {
      const missing = parsedData.some(
        (r) => !r.location || r.location.trim() === "",
      );
      if (missing) {
        setShowMissingLocationConfirm(true);
        return;
      }
    }

    doSubmit();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        mode === "select"
          ? "Select Items From Rental List (PDF/CSV)"
          : "Upload Rental List (PDF/CSV)"
      }
    >
      <div className="flex flex-col gap-4">
        <input
          type="file"
          accept="application/pdf,text/csv,.csv"
          onChange={handleFileChange}
        />
        {errorMessage && (
          <div className="text-danger font-medium">{errorMessage}</div>
        )}

        {showSpinner && (
          <div className="flex items-center justify-center gap-2 text-accent font-semibold">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            Parsing PDF, please wait...
          </div>
        )}

        {pdfParsingStatus === "uploading" && (
          <div className="flex items-center justify-center gap-2 text-accent font-semibold">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            Uploading items, please wait...
          </div>
        )}

        {pdfPages && pdfParsingStatus !== "parsing" && (
          <LayoutBanner use={layoutUse} onTeach={() => setTeachOpen(true)} />
        )}

        {pdfParsingStatus === "error" && !errorMessage && (
          <div className="text-danger font-medium">
            Error parsing PDF/CSV. Please try again or upload a cleaner version.
          </div>
        )}

        {pdfParsingStatus === "done" && parsedData.length === 0 && (
          <div className="text-warning font-medium">
            Parsing complete but no items were detected.
          </div>
        )}

        {parsedData.length > 0 && (
          <>
            {mode === "import" && (
              <div className="flex flex-col gap-2">
                {/* Assign location to all */}
                <div className="flex items-center gap-2">
                  <select
                    className="border px-2 py-1 w-72"
                    value={defaultLocation}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__add_new__") {
                        setAddingLocation(true);
                        return;
                      }
                      setDefaultLocation(v);
                    }}
                  >
                    <option value="">Assign location to all</option>
                    {localLocations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                    <option value="__add_new__">➕ Add new location…</option>
                  </select>
                  <button
                    type="button"
                    onClick={assignAllLocations}
                    className="btn-accent-sm"
                  >
                    Apply
                  </button>
                </div>

                {addingLocation && (
                  <div className="flex items-center gap-2">
                    <input
                      className="border px-2 py-1 w-72"
                      placeholder="New location name"
                      value={newLocationName}
                      onChange={(e) => setNewLocationName(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={addLocationInline}
                      className="btn-accent-sm"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingLocation(false);
                        setNewLocationName("");
                      }}
                      className="btn-secondary-sm"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Apply source to all */}
                <div className="flex items-center gap-2">
                  <select
                    className="border px-2 py-1 w-72"
                    value={defaultSource}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__add_new__") {
                        setAddingSource(true);
                        return;
                      }
                      setDefaultSource(v);
                    }}
                  >
                    <option value="">Apply source to all</option>
                    {sourceOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    <option value="__add_new__">➕ Add new source…</option>
                  </select>
                  <button
                    type="button"
                    onClick={assignAllSources}
                    className="btn-accent-sm"
                  >
                    Apply
                  </button>
                </div>

                {addingSource && (
                  <div className="flex items-center gap-2">
                    <input
                      className="border px-2 py-1 w-72"
                      placeholder="New source name"
                      value={newSourceName}
                      onChange={(e) => setNewSourceName(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={addSourceInline}
                      className="btn-accent-sm"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingSource(false);
                        setNewSourceName("");
                      }}
                      className="btn-secondary-sm"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* relative: contains the sr-only "Delete" header, which otherwise
                positions against the dialog and widens its scroll area. */}
            <div className="relative overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left border">
                <thead>
                  <tr className="bg-gray-200 text-gray-800">
                    <th className="p-2">Description</th>
                    <th className="p-2">Category</th>
                    <th className="p-2">Status</th>
                    {mode === "import" && <th className="p-2">Source</th>}
                    <th className="p-2">Quantity</th>
                    {mode === "import" && <th className="p-2">Start Date</th>}
                    {mode === "import" && <th className="p-2">End Date</th>}
                    {mode === "import" && <th className="p-2">Location</th>}
                    <th className="p-2"><span className="sr-only">Delete</span></th>
                  </tr>
                </thead>

                <tbody>
                  {parsedData.map((item, index) => {
                    const bad = problemRows.has(index);
                    return (
                    <tr
                      key={item._rowKey || `${item.id || item.name}-${index}`}
                      className={bad ? "bg-danger/10" : undefined}
                      data-testid={`import-row-${index}`}
                    >
                      <td className="p-2">
                        <input
                          className={`border px-2 py-1 w-full min-w-48 ${bad && !String(item.name || "").trim() ? "border-danger" : ""}`}
                          aria-label={`Description, row ${index + 1}`}
                          value={item.name || ""}
                          onChange={(e) => updateRow(index, { name: e.target.value })}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="border px-2 py-1 w-full min-w-32"
                          aria-label={`Category, row ${index + 1}`}
                          value={item.category || ""}
                          onChange={(e) => updateRow(index, { category: e.target.value })}
                        />
                      </td>
                      <td className="p-2">{item.status || "-"}</td>

                      {mode === "import" && (
                        <td className="p-2">
                          <select
                            className="border px-2 py-1 w-full"
                            value={item.source || ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "__add_new__") {
                                setAddingSource(true);
                                return;
                              }
                              handleSourceChange(index, v);
                            }}
                          >
                            <option value="">-</option>
                            {sourceOptions.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                            <option value="__add_new__">
                              ➕ Add new source…
                            </option>
                          </select>
                        </td>
                      )}

                      <td className="p-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          className={`border px-2 py-1 w-20 ${bad && !(item.quantity >= 1) ? "border-danger" : ""}`}
                          aria-label={`Quantity, row ${index + 1}`}
                          value={item.quantity === "" || item.quantity == null ? "" : item.quantity}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            updateRow(index, { quantity: raw === "" ? "" : parseInt(raw, 10) });
                          }}
                        />
                      </td>

                      {mode === "import" && (
                        <td className="p-2">{item.startDate}</td>
                      )}
                      {mode === "import" && (
                        <td className="p-2">{item.endDate}</td>
                      )}

                      {mode === "import" && (
                        <td className="p-2">
                          <select
                            className="border px-2 py-1 w-full"
                            value={item.location}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "__add_new__") {
                                setAddingLocation(true);
                                return;
                              }
                              handleLocationChange(index, v);
                            }}
                          >
                            <option value="">Select location</option>
                            {localLocations.map((loc) => (
                              <option key={loc} value={loc}>
                                {loc}
                              </option>
                            ))}
                            <option value="__add_new__">
                              ➕ Add new location…
                            </option>
                          </select>
                        </td>
                      )}
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => deleteRow(index)}
                          className="text-gray-500 hover:text-danger px-1"
                          aria-label={`Delete row ${index + 1}`}
                          title="Delete row"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center mt-4">
              <button type="button" onClick={addRow} className="btn-secondary-sm">
                + Add row
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pdfParsingStatus === "uploading"}
                className={
                  pdfParsingStatus === "uploading" ? "btn-disabled" : "btn-accent"
                }
              >
                {mode === "select" ? "Apply Selection" : "Submit"}
              </button>
            </div>
          </>
        )}
      </div>
      {teachOpen && pdfPages && (
        <TeachLayoutDialog
          isOpen
          pages={pdfPages}
          existing={layoutUse?.record?.scope === "org" ? layoutUse.record : null}
          onClose={() => setTeachOpen(false)}
          onSaved={handleLayoutSaved}
        />
      )}
      {showMissingLocationConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
          onClick={() => setShowMissingLocationConfirm(false)}
        >
          <div
            ref={confirmDialog.panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmDialog.titleId}
            tabIndex={-1}
            className="bg-surface p-6 rounded-xl w-[90%] max-w-sm shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id={confirmDialog.titleId}
              className="text-lg font-bold text-accent mb-2"
            >
              Continue without locations?
            </h3>
            <p className="text-sm text-gray-300 mb-4">
              Some rows have no location assigned. They will be added to
              &ldquo;Unassigned&rdquo; — you can move them later.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMissingLocationConfirm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="button" onClick={doSubmit} className="btn-accent">
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// Which reader produced the rows, and the way into "teach it" (WP26 Phase 3).
function LayoutBanner({ use, onTeach }) {
  const name = use?.record?.name;
  const [tone, text, action] = !use
    ? ["text-gray-400", "Read with the general reader.", "Rows look wrong? Teach GripTrack this layout"]
    : use.drift
      ? [
          "text-warning",
          `This supplier's layout seems to have changed since "${name}" was saved. Check the rows below.`,
          "Teach it again",
        ]
      : ["text-gray-400", `Read with your saved layout "${name}".`, "Wrong columns? Teach it again"];
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${tone}`} data-testid="layout-banner">
      <span>{text}</span>
      <button type="button" className="text-accent underline underline-offset-2" onClick={onTeach}>
        {action}
      </button>
    </div>
  );
}

export default ImportFileModal;
