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
}) => {
  const { pdfParsingStatus, setPdfParsingStatus, registerLocation } =
    useContext(EquipmentContext);

  const locationOptions = Array.isArray(allLocations) ? allLocations : [];

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

      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trimEnd())
        .filter((l) => l.length > 0);

      if (lines.length < 2) {
        setPdfParsingStatus && setPdfParsingStatus("error");
        alert("CSV appears empty or missing rows.");
        return;
      }

      const header = parseCsvLine(lines[0]).map((h) => String(h).trim());
      const idxCategory = header.findIndex(
        (h) => h.toLowerCase() === "category",
      );
      const idxName = header.findIndex((h) => h.toLowerCase() === "name");
      const idxQty = header.findIndex(
        (h) => h.toLowerCase() === "quantity" || h.toLowerCase() === "qty",
      );

      if (idxName === -1) {
        setPdfParsingStatus && setPdfParsingStatus("error");
        alert("CSV missing required column: Name");
        return;
      }

      const items = [];
      let currentCategory = "";
      let currentItemName = "";

      const normalizeCondition = (s) =>
        String(s || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");

      const prettyStatus = (s) =>
        normalizeCondition(s)
          .split(" ")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

      const conditionWords = new Set([
        "unopened",
        "partial",
        "nearly empty",
        "nearlyempty",
        "almost empty",
        "opened",
        "empty",
      ]);

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const rawCategory =
          idxCategory >= 0 ? String(cols[idxCategory] ?? "").trim() : "";
        const rawName = String(cols[idxName] ?? "").trim();
        const rawQty = idxQty >= 0 ? String(cols[idxQty] ?? "").trim() : "";

        // Section/header rows: category set but no name -> set current category and skip
        if (!rawName) {
          if (rawCategory) currentCategory = rawCategory;
          continue;
        }

        // Keep category sticky if present
        if (rawCategory) currentCategory = rawCategory;

        // If this is an item header row (name present, qty missing), remember it and skip creating an item
        if (!rawQty) {
          currentItemName = rawName;
          continue;
        }

        const nameLower = normalizeCondition(rawName);

        // If the "name" cell is actually a condition/status row, apply it to last item name
        if (conditionWords.has(nameLower) && currentItemName) {
          const qty = parseInt(rawQty, 10);
          items.push({
            id: "",
            name: currentItemName,
            category: currentCategory || "",
            status: prettyStatus(rawName),
            source: "",
            quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
            startDate: "",
            endDate: "",
            location: "",
          });
          continue;
        }

        // Otherwise, treat as a normal inventory row
        currentItemName = rawName;
        const qty = parseInt(rawQty, 10);

        items.push({
          id: "",
          name: rawName,
          category: currentCategory || "",
          status: "Available",
          source: "",
          quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
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
        alert("No importable rows found in CSV.");
      }
    } catch (err) {
      console.error("CSV parse error", err);
      setPdfParsingStatus && setPdfParsingStatus("error");
      alert("There was an error reading the CSV. See console for details.");
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

      // Build human-ish lines from positioned PDF text chunks
      const pageToLines = async (page) => {
        const content = await page.getTextContent();
        const items = (content.items || [])
          .map((it) => {
            const t = it.transform || [];
            const x = t[4] ?? 0;
            const y = t[5] ?? 0;
            return { str: String(it.str || "").trim(), x, y };
          })
          .filter((it) => it.str.length > 0);

        // Group by Y within tolerance
        const Y_TOL = 1.0;
        const lines = new Map();

        for (const it of items) {
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

        for (const y of ys) {
          const row = lines.get(y) || [];
          row.sort((a, b) => a.x - b.x);

          const line = row
            .map((r) => r.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();

          if (line) out.push(line);
        }

        return out;
      };

      let allLines = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const lines = await pageToLines(page);
        allLines = allLines.concat(lines);
      }

      console.log("PDF lines sample:", allLines.slice(0, 30));

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
        alert(
          "No matching items found in PDF. (Line parsing found zero rows.)",
        );
      }
    } catch (err) {
      console.error("PDF parse error", err);
      setPdfParsingStatus && setPdfParsingStatus("error");
      alert("There was an error reading the PDF. See console for details.");
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

  const promptAddLocation = () => {
    const entered = prompt("New location name?");
    const trimmed = String(entered || "").trim();
    if (!trimmed) return "";
    if (typeof registerLocation === "function") registerLocation(trimmed);
    return trimmed;
  };

  const promptAddSource = () => {
    const entered = prompt("New source name?");
    const trimmed = String(entered || "").trim();
    if (!trimmed) return "";

    setCustomSources((prev) => {
      const exists = prev.some(
        (s) => String(s).toLowerCase() === trimmed.toLowerCase(),
      );
      return exists ? prev : [...prev, trimmed];
    });

    return trimmed;
  };

  const handleSubmit = () => {
    const missing = parsedData.some(
      (r) => !r.location || r.location.trim() === "",
    );
    if (missing) {
      if (
        !confirm(
          "Some rows have no location assigned. Continue and leave them blank?",
        )
      )
        return;
    }

    try {
      setPdfParsingStatus && setPdfParsingStatus("uploading");
      if (setImportInProgress) setImportInProgress(true);

      onUpload(parsedData);

      if (window.toast) {
        window.toast(
          `${parsedData.length} item${parsedData.length !== 1 ? "s" : ""} added`,
        );
      }

      setParsedData([]);
      setDefaultLocation("");
      setDefaultSource("");
      setPdfParsingStatus && setPdfParsingStatus("idle");
      onClose();
    } finally {
      if (setImportInProgress) setImportInProgress(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upload Rental List (PDF/CSV)"
    >
      <div className="flex flex-col gap-4">
        <input
          type="file"
          accept="application/pdf,text/csv,.csv"
          onChange={handleFileChange}
        />

        {showSpinner && (
          <div className="flex items-center justify-center gap-2 text-accent font-semibold">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            Parsing PDF, please wait...
          </div>
        )}

        {pdfParsingStatus === "uploading" && (
          <div className="flex items-center justify-center gap-2 text-blue-500 font-semibold">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            Uploading items, please wait...
          </div>
        )}

        {pdfParsingStatus === "error" && (
          <div className="text-red-500 font-medium">
            Error parsing PDF/CSV. Please try again or upload a cleaner version.
          </div>
        )}

        {pdfParsingStatus === "done" && parsedData.length === 0 && (
          <div className="text-yellow-500 font-medium">
            Parsing complete but no items were detected.
          </div>
        )}

        {parsedData.length > 0 && (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <select
                  className="border px-2 py-1 w-72"
                  value={defaultLocation}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__add_new__") {
                      const created = promptAddLocation();
                      if (created) setDefaultLocation(created);
                      return;
                    }
                    setDefaultLocation(v);
                  }}
                >
                  <option value="">Assign location to all</option>
                  {locationOptions.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                  <option value="__add_new__">➕ Add new location…</option>
                </select>
                <button
                  onClick={assignAllLocations}
                  className="px-3 py-1 bg-accent text-white rounded"
                >
                  Apply
                </button>
              </div>

              <div className="flex items-center gap-2">
                <select
                  className="border px-2 py-1 w-72"
                  value={defaultSource}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__add_new__") {
                      const created = promptAddSource();
                      if (created) setDefaultSource(created);
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
                  onClick={assignAllSources}
                  className="px-3 py-1 bg-accent text-white rounded"
                >
                  Apply
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left border">
                <thead>
                  <tr className="bg-gray-200 text-gray-800">
                    <th className="p-2">Description</th>
                    <th className="p-2">Category</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Source</th>
                    <th className="p-2">Quantity</th>
                    <th className="p-2">Start Date</th>
                    <th className="p-2">End Date</th>
                    <th className="p-2">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedData.map((item, index) => (
                    <tr key={`${item.id || item.name}-${index}`}>
                      <td className="p-2">{item.name}</td>
                      <td className="p-2">{item.category || "-"}</td>
                      <td className="p-2">{item.status || "-"}</td>
                      <td className="p-2">
                        <select
                          className="border px-2 py-1 w-full"
                          value={item.source || ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "__add_new__") {
                              const created = promptAddSource();
                              if (created) handleSourceChange(index, created);
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
                      <td className="p-2">{item.quantity}</td>
                      <td className="p-2">{item.startDate}</td>
                      <td className="p-2">{item.endDate}</td>
                      <td className="p-2">
                        <select
                          className="border px-2 py-1 w-full"
                          value={item.location}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "__add_new__") {
                              const created = promptAddLocation();
                              if (created) handleLocationChange(index, created);
                              return;
                            }
                            handleLocationChange(index, v);
                          }}
                        >
                          <option value="">Select location</option>
                          {locationOptions.map((loc) => (
                            <option key={loc} value={loc}>
                              {loc}
                            </option>
                          ))}
                          <option value="__add_new__">
                            ➕ Add new location…
                          </option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-accent text-white rounded"
              >
                Submit
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default UploadPDFModal;
