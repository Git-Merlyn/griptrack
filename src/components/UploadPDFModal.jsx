import React, { useEffect, useState, useContext } from "react";
import Modal from "./Modal";
import EquipmentContext from "../context/EquipmentContext";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const UploadPDFModal = ({
  isOpen,
  onClose,
  onUpload,
  setImportInProgress,
  allLocations = [],
  mode = "import", // 'import' | 'select'
}) => {
  const { pdfParsingStatus, setPdfParsingStatus, registerLocation } =
    useContext(EquipmentContext);

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
  const [defaultLocation, setDefaultLocation] = useState("");
  const [defaultSource, setDefaultSource] = useState("");
  const [showSpinner, setShowSpinner] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [showMissingLocationConfirm, setShowMissingLocationConfirm] =
    useState(false);

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
        setParsedData(items);
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

  const extractDataFromPDF = async (file) => {
    try {
      if (setPdfParsingStatus) setPdfParsingStatus("parsing");
      if (setImportInProgress) setImportInProgress(true);

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setErrorMessage("");

      // Build human-ish lines from positioned PDF text chunks
      const pageToLines = async (page, pageNum) => {
        const content = await page.getTextContent();
        const chunks = (content.items || [])
          .map((it) => {
            const t = it.transform || [];
            const x = t[4] ?? 0;
            const y = t[5] ?? 0;
            return { str: String(it.str || "").trim(), x, y };
          })
          .filter((it) => it.str.length > 0);

        const Y_TOL = 1.0;
        const lines = new Map();

        for (const it of chunks) {
          let key = null;
          for (const k of lines.keys()) {
            if (Math.abs(k - it.y) <= Y_TOL) {
              key = k;
              break;
            }
          }
          if (key === null) key = it.y;
          const arr = lines.get(key) || [];
          arr.push(it);
          lines.set(key, arr);
        }

        const ys = Array.from(lines.keys()).sort((a, b) => b - a);
        const out = [];
        const codeTokenRe = /^([A-Z]{3,}[A-Z0-9]*\d{3,})$/;

        for (const y of ys) {
          const row = lines.get(y) || [];
          row.sort((a, b) => a.x - b.x);

          const text = row
            .map((r) => r.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();

          if (!text) continue;

          let hasCode = false;
          let codeX = row.length ? row[0].x : 0;
          let descX = row.length ? row[0].x : 0;

          for (let i = 0; i < row.length; i++) {
            const token = row[i].str;
            if (codeTokenRe.test(token)) {
              hasCode = true;
              codeX = row[i].x;
              descX = row[i + 1] ? row[i + 1].x : row[i].x;
              break;
            }
          }

          out.push({ text, codeX, descX, hasCode, pageNum });
        }

        return out;
      };

      let allLineObjs = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const lineObjs = await pageToLines(page, i);
        allLineObjs = allLineObjs.concat(lineObjs);
      }

      console.log(
        "PDF lines sample:",
        allLineObjs.slice(0, 30).map((l) => l.text),
      );

      // Ignore indented sub-items (even if they have codes) using robust baselines PER PAGE.
      // Baselines are computed from the LEFT-most 20% of rows so indented rows can't skew them.
      const takeLowPercentileMean = (arr, pct = 0.2) => {
        const xs = (arr || [])
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b);
        if (!xs.length) return 0;
        const take = Math.max(1, Math.floor(xs.length * pct));
        const slice = xs.slice(0, take);
        return slice.reduce((a, b) => a + b, 0) / slice.length;
      };

      // Build per-page baselines
      const baselinesByPage = new Map();
      const pages = Array.from(new Set(allLineObjs.map((l) => l.pageNum))).sort(
        (a, b) => a - b,
      );

      for (const p of pages) {
        const pageLines = allLineObjs.filter(
          (l) => l.pageNum === p && l.hasCode,
        );
        const codeXs = pageLines
          .filter((l) => Number.isFinite(l.codeX))
          .map((l) => l.codeX);
        const descXs = pageLines
          .filter((l) => Number.isFinite(l.descX))
          .map((l) => l.descX);

        baselinesByPage.set(p, {
          baseCodeX: takeLowPercentileMean(codeXs, 0.2),
          baseDescX: takeLowPercentileMean(descXs, 0.2),
        });
      }

      // Thresholds: lower = more aggressive filtering (catches more child rows)
      const CODE_INDENT = 8;
      const DESC_INDENT = 8;

      const filteredLineObjs = allLineObjs.filter((l) => {
        if (!l.hasCode) return true;

        const b = baselinesByPage.get(l.pageNum) || {
          baseCodeX: 0,
          baseDescX: 0,
        };
        const baseCodeX = b.baseCodeX;
        const baseDescX = b.baseDescX;

        const codeIndented =
          Number.isFinite(baseCodeX) &&
          baseCodeX > 0 &&
          Number.isFinite(l.codeX)
            ? l.codeX > baseCodeX + CODE_INDENT
            : false;

        const descIndented =
          Number.isFinite(baseDescX) &&
          baseDescX > 0 &&
          Number.isFinite(l.descX)
            ? l.descX > baseDescX + DESC_INDENT
            : false;

        // If either column is shifted right, treat as child/sub-item.
        return !(codeIndented || descIndented);
      });

      const allLines = filteredLineObjs.map((l) => l.text);

      // Some scanned PDFs/OCR layers merge multiple table rows into one line.
      // If a line contains multiple equipment codes, split it into one segment per code.
      const codeGlobalRe = /\b([A-Z]{3,}[A-Z0-9]*\d{3,})\b/g;
      const splitMergedLines = (lines) => {
        const out = [];
        for (const line of lines) {
          const matches = Array.from(line.matchAll(codeGlobalRe));
          if (matches.length <= 1) {
            out.push(line);
            continue;
          }

          for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index ?? 0;
            const end =
              i + 1 < matches.length
                ? (matches[i + 1].index ?? line.length)
                : line.length;
            const seg = line.slice(start, end).replace(/\s+/g, " ").trim();
            if (seg) out.push(seg);
          }
        }
        return out;
      };

      const normalizedLines = splitMergedLines(allLines);

      const fullTextForDates = allLines.join("\n");
      let shipDate = "";
      let returnDate = "";

      const shipMatch = fullTextForDates.match(/Ship Date[:\s]*([0-9./-]+)/i);
      if (shipMatch) shipDate = shipMatch[1].trim();

      const returnMatch = fullTextForDates.match(
        /Return Date[:\s]*([0-9./-]+)/i,
      );
      if (returnMatch) returnDate = returnMatch[1].trim();

      const items = [];
      const codeRe = /\b([A-Z]{3,}[A-Z0-9]*\d{3,})\b/;
      const qtyEndRe = /\b(\d+)\s*$/;

      for (const line of normalizedLines) {
        const codeMatch = line.match(codeRe);
        if (!codeMatch) continue;

        const code = codeMatch[1].trim();

        // Description is everything after removing the first code token
        let remainder = line.replace(codeRe, "").trim();

        // Prefer quantity right after the code ONLY when it looks like a standalone qty token.
        // Avoid stripping leading dimension text like: 1' x 4'
        let qty = 1;

        const originalRemainder = remainder;

        // Leading qty token (must be followed by whitespace and NOT immediately followed by a quote/apostrophe)
        const qtyAfterCodeMatch = remainder.match(
          /^\s*(\d{1,3})\s+(?!['’"”″])/,
        );

        // Trailing qty token (at end of remainder)
        const qtyAtEndMatch = remainder.match(qtyEndRe);

        if (qtyAfterCodeMatch) {
          const leadingToken = qtyAfterCodeMatch[1];
          const leadingParsed = parseInt(leadingToken, 10);

          // Remove the leading qty token first
          remainder = remainder.replace(/^\s*\d{1,3}\s+/, "").trim();

          // Heuristic: some OCR layers split 2-digit quantities like "32" into "2" near the code and "3" at the end.
          // If we see a 1-digit leading token AND a 1-digit trailing token, combine them into a 2-digit quantity.
          // Only do this when the remainder doesn't look like it's supposed to end with a number.
          if (
            leadingToken.length === 1 &&
            qtyAtEndMatch &&
            qtyAtEndMatch[1] &&
            String(qtyAtEndMatch[1]).length === 1
          ) {
            const trailingToken = String(qtyAtEndMatch[1]);

            // If the original remainder ends with something like  ... ) 3  (i.e. digit is isolated), treat as split qty digit.
            const endsWithIsolatedDigit = /(?:\)|[A-Za-z])\s+\d\s*$/.test(
              originalRemainder,
            );

            if (endsWithIsolatedDigit) {
              // OCR can swap digit order depending on how the circled number is represented.
              // Try both concatenations and pick the larger (more common for rental quantities).
              const combinedA = parseInt(`${leadingToken}${trailingToken}`, 10);
              const combinedB = parseInt(`${trailingToken}${leadingToken}`, 10);
              const combined = Math.max(
                Number.isFinite(combinedA) ? combinedA : 0,
                Number.isFinite(combinedB) ? combinedB : 0,
              );

              if (combined > 0) {
                qty = combined;
                // Remove the trailing digit from the remainder as well
                remainder = remainder.replace(qtyEndRe, "").trim();
              } else if (Number.isFinite(leadingParsed)) {
                qty = leadingParsed;
              }
            } else if (Number.isFinite(leadingParsed)) {
              qty = leadingParsed;
            }
          } else if (Number.isFinite(leadingParsed)) {
            qty = leadingParsed;
          }
        } else {
          // Fallback: quantity at end of line
          if (qtyAtEndMatch) {
            const parsed = parseInt(qtyAtEndMatch[1], 10);
            if (Number.isFinite(parsed)) qty = parsed;
            remainder = remainder.replace(qtyEndRe, "").trim();
          }
        }

        let desc = remainder
          .replace(/\s*-\s*/g, " - ")
          .replace(/\s+/g, " ")
          .trim();

        if (!desc || desc.length < 3) continue;

        items.push({
          id: code,
          name: desc,
          category: "",
          status: "Available",
          source: "",
          quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
          startDate: shipDate,
          endDate: returnDate,
          location: "",
        });
      }

      console.log("Parsed items from PDF (line-based, split-merged):", items);

      if (items.length > 0) {
        setParsedData(items);
        setPdfParsingStatus && setPdfParsingStatus("done");
      } else {
        setPdfParsingStatus && setPdfParsingStatus("error");
        setErrorMessage(
          "No matching items found in PDF. (Line parsing found zero rows.)",
        );
        window.toast?.error?.(
          "No matching items found in PDF. (Line parsing found zero rows.)",
        );
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
    return extractDataFromPDF(file);
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

  const doSubmit = () => {
    try {
      setPdfParsingStatus && setPdfParsingStatus("uploading");
      if (setImportInProgress) setImportInProgress(true);

      onUpload(parsedData);

      if (mode === "import") {
        window.toast?.success?.(
          `${parsedData.length} item${parsedData.length !== 1 ? "s" : ""} added`,
        );
      } else {
        window.toast?.success?.(
          `${parsedData.length} item${parsedData.length !== 1 ? "s" : ""} selected`,
        );
      }

      setParsedData([]);
      setDefaultLocation("");
      setDefaultSource("");
      setPdfParsingStatus && setPdfParsingStatus("idle");
      setShowMissingLocationConfirm(false);
      setErrorMessage("");
      onClose();
    } finally {
      if (setImportInProgress) setImportInProgress(false);
    }
  };
  const handleSubmit = () => {
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

        {pdfParsingStatus === "error" && (
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

            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
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
                  </tr>
                </thead>

                <tbody>
                  {parsedData.map((item, index) => (
                    <tr key={`${item.id || item.name}-${index}`}>
                      <td className="p-2">{item.name}</td>
                      <td className="p-2">{item.category || "-"}</td>
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

                      <td className="p-2">{item.quantity}</td>

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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={handleSubmit}
                className="btn-accent"
              >
                {mode === "select" ? "Apply Selection" : "Submit"}
              </button>
            </div>
          </>
        )}
      </div>
      {showMissingLocationConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
          onClick={() => setShowMissingLocationConfirm(false)}
        >
          <div
            className="bg-surface p-6 rounded-xl w-[90%] max-w-sm shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-accent mb-2">
              Continue without locations?
            </h3>
            <p className="text-sm text-gray-300 mb-4">
              Some rows have no location assigned. Continue and leave them
              blank?
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

export default UploadPDFModal;
