import React, { useState, useContext, useEffect } from "react";
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
  const { pdfParsingStatus, setPdfParsingStatus } =
    useContext(EquipmentContext);

  const locationOptions = Array.isArray(allLocations) ? allLocations : [];

  const [parsedData, setParsedData] = useState([]);
  const [defaultLocation, setDefaultLocation] = useState("");
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    if (pdfParsingStatus === "parsing") {
      setShowSpinner(true);
    } else {
      setShowSpinner(false);
    }
  }, [pdfParsingStatus]);

  const parseCsvLine = (line) => {
    // Basic CSV line parser supporting quotes
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
        (h) => h.toLowerCase() === "category"
      );
      const idxName = header.findIndex((h) => h.toLowerCase() === "name");
      const idxQty = header.findIndex(
        (h) => h.toLowerCase() === "quantity" || h.toLowerCase() === "qty"
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

        // If the "name" cell is actually a condition/status row (Unopened/Partial/etc), apply it to last item name
        if (conditionWords.has(nameLower) && currentItemName) {
          const qty = parseInt(rawQty, 10);
          items.push({
            id: "", // internal-only
            name: currentItemName,
            category: currentCategory || "",
            status: prettyStatus(rawName),
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
          id: "", // internal-only; CSV doesn't provide item IDs
          name: rawName,
          category: currentCategory || "",
          status: "Available",
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

      let rawText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item) => item.str);
        rawText += strings.join(" ") + "\n";
      }

      // Debug: inspect the first chunk of text we got from the PDF
      console.log("PDF rawText snippet:", rawText.slice(0, 500));

      // Extract Ship Date and Return Date from the full text
      let shipDate = "";
      let returnDate = "";

      const shipMatch = rawText.match(/Ship Date[:\s]*([0-9./-]+)/i);
      if (shipMatch) shipDate = shipMatch[1].trim();

      const returnMatch = rawText.match(/Return Date[:\s]*([0-9./-]+)/i);
      if (returnMatch) returnDate = returnMatch[1].trim();

      const items = [];

      // ITEMCODE must be 3+ letters followed by 3+ digits (e.g., ALLHA0070, STAND0610)
      const itemPattern =
        /\b([A-Z]{3,}[A-Z0-9]*[0-9]{3,})\b\s+(.+?)\s+(\d+)(?=\s+[A-Z]{3,}[A-Z0-9]*[0-9]{3,}\b\s+.+?\s+\d+|$)/g;

      let m;
      while ((m = itemPattern.exec(rawText)) !== null) {
        items.push({
          id: m[1].trim(),
          name: m[2].trim(),
          category: "",
          quantity: parseInt(m[3], 10) || 1,
          startDate: shipDate,
          endDate: returnDate,
          location: "",
        });
      }

      console.log("Parsed items from PDF:", items);

      if (items.length > 0) {
        setParsedData(items);
        setPdfParsingStatus && setPdfParsingStatus("done");
      } else {
        setPdfParsingStatus && setPdfParsingStatus("error");
        alert(
          "No matching items found in PDF. Try a clearer/digital PDF or check the file format."
        );
      }
    } catch (err) {
      console.error("PDF parse error", err);
      setPdfParsingStatus && setPdfParsingStatus("error");
      alert("There was an error reading the PDF. See console for details.");
      return;
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
      prev.map((it) => ({ ...it, location: defaultLocation }))
    );
  };

  const handleSubmit = () => {
    // Basic validation: ensure every parsed row has a location
    const missing = parsedData.some(
      (r) => !r.location || r.location.trim() === ""
    );
    if (missing) {
      if (
        !confirm(
          "Some rows have no location assigned. Continue and leave them blank?"
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
          `${parsedData.length} item${parsedData.length !== 1 ? "s" : ""} added`
        );
      }

      setParsedData([]);
      setDefaultLocation("");
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
            <div className="flex items-center gap-2">
              <select
                className="border px-2 py-1"
                value={defaultLocation}
                onChange={(e) => setDefaultLocation(e.target.value)}
              >
                <option value="">Assign location to all</option>
                {locationOptions.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
              <button
                onClick={assignAllLocations}
                className="px-3 py-1 bg-accent text-white rounded"
              >
                Assign All
              </button>
            </div>

            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left border">
                <thead>
                  <tr className="bg-gray-200 text-gray-800">
                    <th className="p-2">Description</th>
                    <th className="p-2">Category</th>
                    <th className="p-2">Status</th>
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
                      <td className="p-2">{item.quantity}</td>
                      <td className="p-2">{item.startDate}</td>
                      <td className="p-2">{item.endDate}</td>
                      <td className="p-2">
                        <select
                          className="border px-2 py-1 w-full"
                          value={item.location}
                          onChange={(e) =>
                            handleLocationChange(index, e.target.value)
                          }
                        >
                          <option value="">Select location</option>
                          {locationOptions.map((loc) => (
                            <option key={loc} value={loc}>
                              {loc}
                            </option>
                          ))}
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
