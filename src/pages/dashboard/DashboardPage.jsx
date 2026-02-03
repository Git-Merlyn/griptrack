import React, { useContext, useState, useEffect, useMemo } from "react";
import ImportFileModal from "@/components/ImportFileModal";
import EquipmentContext from "@/context/EquipmentContext";
import useUser from "@/context/useUser";
import DesktopDashboard from "./DesktopDashboard";
import MobileDashboard from "./MobileDashboard";

const DashboardPage = () => {
  const {
    equipment,
    allLocations: contextLocations,
    addEquipment,
    deleteEquipment,
    updateEquipment,
    moveEquipment,
    // importSummaryMessage and clearImportSummary are optional — if your EquipmentContext
    // provides them they will be used to show an import toast after PDF imports.
    importSummaryMessage,
    clearImportSummary,
  } = useContext(EquipmentContext);
  const { user } = useUser();

  // Custom locations (so we don't pollute inventory with __placeholder__ rows)
  const [customLocations, setCustomLocations] = useState([]);

  // Load custom locations once
  useEffect(() => {
    try {
      const raw = localStorage.getItem("griptrack_custom_locations");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCustomLocations(parsed);
      }
    } catch (e) {
      console.warn("Failed to load custom locations", e);
    }
  }, []);

  // Persist custom locations
  useEffect(() => {
    try {
      localStorage.setItem(
        "griptrack_custom_locations",
        JSON.stringify(customLocations),
      );
    } catch (e) {
      console.warn("Failed to save custom locations", e);
    }
  }, [customLocations]);

  const allLocations = Array.from(
    new Set([
      ...(Array.isArray(contextLocations) ? contextLocations : []),
      ...equipment.map((e) => e.location).filter(Boolean),
      ...customLocations.filter(Boolean),
    ]),
  ).sort();

  const statusOptions = Array.from(
    new Set([
      "Available",
      "Out",
      "Damaged",
      ...equipment.map((e) => e.status).filter(Boolean),
    ]),
  ).sort((a, b) => String(a).localeCompare(String(b)));

  const [newItem, setNewItem] = useState({
    itemId: "",
    name: "",
    category: "",
    source: "",
    location: "",
    status: "Available",
    rentalStart: "",
    rentalEnd: "",
    quantity: 1,
    reserveMin: 0,
  });

  const [editingId, setEditingId] = useState(null);
  const [movingItem, setMovingItem] = useState(null);
  const [moveData, setMoveData] = useState({ qty: 1, newLocation: "" });
  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Bulk delete confirmation modal
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState(null); // { ids: string[] }

  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [isAddingLocationTo, setIsAddingLocationTo] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [importInProgress, setImportInProgress] = useState(false);

  // PDF modal mode: 'import' adds items, 'select' selects existing items for bulk actions
  const [pdfModalMode, setPdfModalMode] = useState("import");

  // Quick Edit state
  const [quickName, setQuickName] = useState("");
  const [quickFromId, setQuickFromId] = useState("");
  const [quickQty, setQuickQty] = useState(1);
  const [quickTo, setQuickTo] = useState("");

  // Toast for import summary
  const [showToast, setShowToast] = useState(false);
  // Bulk select mode
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]); // array of item.id strings
  const [bulkLocation, setBulkLocation] = useState("");

  // Table sorting
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc"); // 'asc' | 'desc'
  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Mobile layout
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileEditModal, setShowMobileEditModal] = useState(false);
  const [showDesktopEditModal, setShowDesktopEditModal] = useState(false);

  // Mobile "Details" modal
  const [showMobileDetailsModal, setShowMobileDetailsModal] = useState(false);
  const [mobileDetailsItem, setMobileDetailsItem] = useState(null);

  // Export modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState("csv"); // 'csv' | 'pdf'
  const [exportScope, setExportScope] = useState("all"); // 'all' | 'single' | 'multi'
  const [exportUseCurrentView, setExportUseCurrentView] = useState(true);
  const [exportSingleLocation, setExportSingleLocation] = useState("");
  const [exportMultiLocations, setExportMultiLocations] = useState([]); // array of strings

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const sortArrow = (key) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  useEffect(() => {
    if (importSummaryMessage) {
      setShowToast(true);
      const t = setTimeout(() => {
        setShowToast(false);
        if (typeof clearImportSummary === "function") clearImportSummary();
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [importSummaryMessage, clearImportSummary]);

  // Escape hatch: close any open modal/backdrop with Escape
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setShowUploadModal(false);
      setShowAddLocationModal(false);
      setMovingItem(null);
      setDeleteTarget(null);
      setBulkDeleteTarget(null);
      setShowExportModal(false);
      setShowMobileDetailsModal(false);
      setMobileDetailsItem(null);
      setShowDesktopEditModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleAddOrUpdate = () => {
    if (!newItem.name || !newItem.location || newItem.quantity <= 0) return;
    if (newItem.rentalEnd && newItem.rentalStart > newItem.rentalEnd) return;

    if (editingId !== null) {
      updateEquipment(editingId, {
        ...newItem,
        reserveMin: Number(newItem.reserveMin) || 0,
        updatedBy: user?.username || "admin",
      });
      setEditingId(null);
    } else {
      addEquipment({
        ...newItem,
        reserveMin: Number(newItem.reserveMin) || 0,
        updatedBy: user?.username || "admin",
      });
    }

    setNewItem({
      itemId: "",
      name: "",
      category: "",
      source: "",
      location: "",
      status: "Available",
      rentalStart: "",
      rentalEnd: "",
      quantity: 1,
      reserveMin: 0,
    });
  };

  const handleEdit = (item) => {
    setNewItem({
      itemId: item.itemId || "",
      name: item.name,
      category: item.category || "",
      source: item.source || "",
      location: item.location,
      status: item.status,
      rentalStart: item.rentalStart || "",
      rentalEnd: item.rentalEnd || "",
      quantity: item.quantity || 1,
      reserveMin: Number(item.reserveMin) || 0,
    });
    setEditingId(item.id);
  };

  const confirmAndDelete = (id, name) => {
    if (!id) return;
    setDeleteTarget({ id, name: name || "" });
  };

  const performDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleteBusy(true);
    try {
      await Promise.resolve(deleteEquipment(deleteTarget.id));
      window.toast?.success?.("Item deleted");
      setDeleteTarget(null);
    } catch (e) {
      console.error(e);
      window.toast?.error?.(e?.message || "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewItem({
      itemId: "",
      name: "",
      category: "",
      source: "",
      location: "",
      status: "Available",
      rentalStart: "",
      rentalEnd: "",
      quantity: 1,
      reserveMin: 0,
    });
  };

  const statusClass = (status) => {
    const s = String(status || "")
      .trim()
      .toLowerCase();
    if (s === "available") return "text-success";
    if (s === "out") return "text-warning";
    if (s === "damaged") return "text-danger";
    return "text-text";
  };

  const getQty = (row) => {
    const q = row?.quantity;
    const n = typeof q === "number" ? q : parseInt(String(q ?? ""), 10);
    return Number.isFinite(n) ? n : 0;
  };

  // Reserve highlighting rules:
  // - Red when reserveMin > 0 AND quantity === 0
  // - Yellow when reserveMin > 0 AND 0 < quantity < reserveMin
  const qtyTextClass = (row) => {
    const q = getQty(row);
    const rRaw = row?.reserveMin;
    const r =
      typeof rRaw === "number" ? rRaw : parseInt(String(rRaw ?? ""), 10) || 0;

    if (r > 0 && q === 0) return "text-danger font-semibold";
    if (r > 0 && q > 0 && q < r) return "text-warning font-semibold";
    return "";
  };

  // Date warning helpers (text-only coloring, no boxes)
  const parseDateLoose = (value) => {
    if (!value || typeof value !== "string") return null;
    const s = value.trim();
    if (!s) return null;

    // yyyy-mm-dd (HTML date input)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = new Date(`${s}T00:00:00`);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    // mm/dd/yyyy
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      const mm = Number(mdy[1]);
      const dd = Number(mdy[2]);
      const yyyy = Number(mdy[3]);
      const d = new Date(yyyy, mm - 1, dd);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    // fallback
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const startOfDay = (d) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());

  // Returns a Tailwind text color class only (no badge/pill)
  // mode: 'start' | 'end'
  const dateTextClass = (dateStr, mode) => {
    const d = parseDateLoose(dateStr);
    if (!d) return "text-gray-300";

    const today = startOfDay(new Date());
    const target = startOfDay(d);
    const diffDays = Math.floor((target - today) / (1000 * 60 * 60 * 24));

    const isWithinWeekUpcoming = diffDays >= 0 && diffDays <= 7;

    if (mode === "start") {
      // Yellow only for upcoming pickups within a week; normal after it passes
      return isWithinWeekUpcoming ? "text-yellow-300" : "text-gray-200";
    }

    // mode === 'end'
    if (target < today) return "text-red-400";
    if (isWithinWeekUpcoming) return "text-yellow-300";
    return "text-gray-200";
  };

  const handleInlineChange = (field, value) => {
    setNewItem((prev) => ({ ...prev, [field]: value }));
  };
  const isSelected = (id) => selectedIds.includes(String(id));

  const toggleSelected = (id) => {
    const sid = String(id);
    setSelectedIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid],
    );
  };

  const selectAllVisible = () => {
    const ids = sortedEquipment.map((it) => String(it.id));
    setSelectedIds(ids);
  };

  const clearSelection = () => setSelectedIds([]);

  useEffect(() => {
    if (!bulkMode) {
      setSelectedIds([]);
      setBulkLocation("");
    }
    // If someone toggles modes while a details modal is open, close it
    setShowMobileDetailsModal(false);
    setMobileDetailsItem(null);
  }, [bulkMode]);

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setBulkDeleteTarget({ ids: [...selectedIds] });
  };

  const performBulkDelete = async () => {
    const ids = bulkDeleteTarget?.ids;
    if (!Array.isArray(ids) || ids.length === 0) return;

    setDeleteBusy(true);
    try {
      for (const id of ids) {
        await Promise.resolve(deleteEquipment(id));
      }
      window.toast?.success?.(`Deleted ${ids.length} item(s)`);
      setBulkDeleteTarget(null);
      clearSelection();
    } catch (e) {
      console.error(e);
      window.toast?.error?.(e?.message || "Bulk delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };
  const normalizeName = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[\u2019']/g, "'")
      .replace(/[^a-z0-9\s']/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // Select existing DB rows based on parsed PDF lines (no DB writes)
  const handlePdfSelect = (items) => {
    if (!Array.isArray(items) || items.length === 0) return;

    // Build indexes for fast matching
    const byItemId = new Map(); // itemId -> equipment row id
    const byName = new Map(); // normalized name -> array of equipment row ids

    for (const row of visibleEquipment) {
      const rid = String(row?.id || "");
      if (!rid) continue;

      const iid = String(row?.itemId || "").trim();
      if (iid) byItemId.set(iid, rid);

      const nk = normalizeName(row?.name);
      if (!nk) continue;
      if (!byName.has(nk)) byName.set(nk, []);
      byName.get(nk).push(rid);
    }

    const selected = new Set();
    let notFound = 0;
    let ambiguous = 0;

    for (const line of items) {
      // ImportFileModal provides parsed items shaped for import.
      // Prefer matching by internal itemId when present; fallback to name.
      const lineItemId = String(line?.id || "").trim();
      const lineNameKey = normalizeName(line?.name);

      if (lineItemId && byItemId.has(lineItemId)) {
        selected.add(byItemId.get(lineItemId));
        continue;
      }

      if (lineNameKey && byName.has(lineNameKey)) {
        const matches = byName.get(lineNameKey);
        if (matches.length > 1) ambiguous += 1;
        // V1: select ALL matching rows with that name (safer than guessing one)
        matches.forEach((id) => selected.add(id));
      } else {
        notFound += 1;
      }
    }

    const ids = Array.from(selected);

    // Ensure multi-select is enabled so users can act immediately
    setBulkMode(true);
    setSelectedIds(ids);

    // Feedback
    if (ids.length === 0) {
      window.toast?.error?.(
        "No matches found in the database for the uploaded PDF items",
      );
    } else {
      const parts = [`Selected ${ids.length} item(s)`];
      if (ambiguous) parts.push(`${ambiguous} name(s) matched multiple rows`);
      if (notFound) parts.push(`${notFound} line(s) not found`);
      window.toast?.success?.(parts.join(" • "));
    }

    // Close modal
    setShowUploadModal(false);
    setPdfModalMode("import");
  };

  const handleBulkSetLocation = async () => {
    if (selectedIds.length === 0) return;
    if (!bulkLocation) return;

    try {
      for (const id of selectedIds) {
        const row = equipment.find((e) => String(e.id) === String(id));
        if (!row) continue;

        await Promise.resolve(
          updateEquipment(row.id, {
            itemId: row.itemId || "",
            name: row.name,
            category: row.category || "",
            source: row.source || "",
            location: bulkLocation,
            status: row.status || "Available",
            rentalStart: row.rentalStart || "",
            rentalEnd: row.rentalEnd || "",
            quantity: row.quantity || 1,
            reserveMin: Number(row.reserveMin) || 0,
            updatedBy: user?.username || "admin",
          }),
        );
      }

      window.toast?.success?.(
        `Updated location for ${selectedIds.length} item(s)`,
      );
      setBulkLocation("");
      clearSelection();
    } catch (e) {
      console.error(e);
      window.toast?.error?.(e?.message || "Bulk location update failed");
    }
  };

  const handleMoveSubmit = async () => {
    if (!movingItem || moveData.qty <= 0 || !moveData.newLocation) return;
    try {
      console.log("[MoveSubmit] movingItem", movingItem);
      window.toast?.info?.(
        `MoveSubmit id=${movingItem?.id || "-"} itemId=${
          movingItem?.itemId || "-"
        } name=${movingItem?.name || "-"}`,
      );
      const qtyToMove = Math.max(1, Number(moveData.qty) || 1);
      await moveEquipment(movingItem.id, qtyToMove, moveData.newLocation);
      setMovingItem(null);
      setMoveData({ qty: 1, newLocation: "" });
    } catch (e) {
      console.error(e);
      window.toast?.error?.(e?.message || "Move failed");
    }
  };

  const handleAddNewLocation = () => {
    const trimmed = newLocationName.trim();
    if (!trimmed) return;

    // Register location without polluting inventory
    setCustomLocations((prev) => {
      const exists = prev.some(
        (l) => String(l).toLowerCase() === String(trimmed).toLowerCase(),
      );
      return exists ? prev : [...prev, trimmed];
    });

    // Route the new location into the appropriate field depending on caller
    if (isAddingLocationTo === "new") {
      setNewItem((prev) => ({ ...prev, location: trimmed }));
    } else if (isAddingLocationTo === "move") {
      setMoveData((prev) => ({ ...prev, newLocation: trimmed }));
    } else if (isAddingLocationTo === "quick") {
      setQuickTo(trimmed);
    } else if (isAddingLocationTo === "bulk") {
      setBulkLocation(trimmed);
    }

    setNewLocationName("");
    setIsAddingLocationTo(null);
    setShowAddLocationModal(false);
  };

  // Quick Edit helpers
  const names = Array.from(
    new Set(
      equipment.map((e) => e.name).filter((n) => n && n !== "__placeholder__"),
    ),
  ).sort();

  const entriesForName = (name) =>
    equipment.filter((e) => e.name === name && e.name !== "__placeholder__");

  const handleQuickNameChange = (name) => {
    setQuickName(name);
    setQuickFromId("");
    setQuickQty(1);
    setQuickTo("");
  };

  const handleQuickFromChange = (id) => {
    setQuickFromId(id);
  };

  const handleQuickMove = async () => {
    if (!quickName || !quickFromId || !quickTo) return;

    const entry = equipment.find((e) => String(e.id) === String(quickFromId));

    if (!entry) {
      window.toast?.error?.(
        "Quick move failed: could not resolve selected item",
      );
      return;
    }

    const max = Number(entry.quantity) || 1;
    const qtyToMove = Math.min(Math.max(Number(quickQty) || 1, 1), max);

    try {
      console.log("[QuickMove] entry", entry);
      window.toast?.info?.(
        `QuickMove id=${entry?.id} itemId=${entry?.itemId || "-"} name=${
          entry?.name || "-"
        }`,
      );
      await moveEquipment(entry.id, qtyToMove, quickTo);
      window.toast?.success?.(`Moved ${qtyToMove} to ${quickTo}`);

      // clear
      setQuickName("");
      setQuickFromId("");
      setQuickQty(1);
      setQuickTo("");
    } catch (e) {
      console.error(e);
      window.toast?.error?.(e?.message || "Quick move failed");
    }
  };

  const handlePdfUpload = (items) => {
    if (!Array.isArray(items) || items.length === 0) return;

    items.forEach((item) => {
      if (!item.name || !item.location || item.quantity <= 0) return;

      addEquipment({
        itemId: item.id || "",
        name: item.name,
        category: item.category || "", // ✅ add this
        source: item.source || "",
        location: item.location,
        status: item.status || "Available", // ✅ optional but recommended
        rentalStart: item.startDate || "",
        rentalEnd: item.endDate || "",
        quantity: item.quantity || 1,
        reserveMin: Number(item.reserveMin) || 0,
        updatedBy: user?.username || "admin",
      });
    });
  };

  const visibleEquipment = useMemo(() => {
    const list = Array.isArray(equipment) ? equipment : [];
    return list.filter((item) => item?.name && item.name !== "__placeholder__");
  }, [equipment]);

  const filteredVisibleEquipment = useMemo(() => {
    const q = String(searchQuery || "")
      .trim()
      .toLowerCase();
    if (!q) return visibleEquipment;

    return visibleEquipment.filter((e) => {
      const hay = [
        e?.name,
        e?.itemId,
        e?.category,
        e?.source,
        e?.location,
        e?.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [visibleEquipment, searchQuery]);

  const sortedEquipment = useMemo(() => {
    const rows = [...filteredVisibleEquipment];

    rows.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      const getVal = (row) => {
        switch (sortKey) {
          case "qty":
            return Number(row.quantity) || 0;
          case "start":
            return row.rentalStart || "";
          case "end":
            return row.rentalEnd || "";
          case "status":
            return row.status || "";
          case "location":
            return row.location || "";
          case "category":
            return row.category || "";
          case "source":
            return row.source || "";
          case "updatedBy":
            return row.updatedBy || "";
          case "name":
          default:
            return row.name || "";
        }
      };

      const av = getVal(a);
      const bv = getVal(b);

      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }

      return (
        String(av).toLowerCase().localeCompare(String(bv).toLowerCase()) * dir
      );
    });

    return rows;
  }, [filteredVisibleEquipment, sortKey, sortDir]);

  // CSV export helpers
  const csvEscape = (value) => {
    if (value === null || value === undefined) return "";
    const s = String(value);
    // Escape quotes and wrap fields that contain commas/newlines/quotes
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const getExportRows = () => {
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

    // multi
    if (
      !Array.isArray(exportMultiLocations) ||
      exportMultiLocations.length === 0
    )
      return [];
    const set = new Set(exportMultiLocations.map((x) => String(x)));
    return base.filter((r) => set.has(String(r?.location || "")));
  };

  const exportRowsToCsv = (rows) => {
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

  const exportRowsToPdf = (rows) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const esc = (s) =>
      String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");

    const html = `<!doctype html>
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
  <h1>GripTrack Export (${stamp}) — ${rows.length} item(s)</h1>
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

    const w = window.open("", "_blank");
    if (!w) {
      window.toast?.error?.("Popup blocked — allow popups to export PDF");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="px-3 sm:px-6 md:p-8 flex flex-col gap-6 text-text relative">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-3xl font-bold text-accent">Dashboard</h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="btn-secondary"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => {
              setPdfModalMode("import");
              setShowUploadModal(true);
            }}
            disabled={importInProgress}
            className={importInProgress ? "btn-disabled" : "btn-accent"}
          >
            {importInProgress ? "Importing..." : "Upload"}
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500 mb-2"></div>

      {/* Toast / Import summary */}
      {showToast && importSummaryMessage && (
        <div className="fixed right-6 top-6 z-50">
          <div className="bg-surface border border-gray-700 text-text px-4 py-3 rounded shadow-md flex items-start gap-3 max-w-sm">
            <div className="flex-1">
              <div className="font-semibold text-accent">Import Complete</div>
              <div className="text-sm text-gray-300">
                {importSummaryMessage}
              </div>
            </div>
            <button
              onClick={() => {
                setShowToast(false);
                if (typeof clearImportSummary === "function")
                  clearImportSummary();
              }}
              className="text-gray-400 hover:text-gray-200 ml-2"
              aria-label="dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-xl p-6 shadow-md overflow-x-auto">
        {/* Bulk toolbar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, ID, category, location, status…"
              className="w-full max-w-md px-3 py-2 rounded-lg bg-surface border border-gray-700 text-text placeholder:text-text/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            {searchQuery.trim() ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="btn-secondary-sm"
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setBulkMode((v) => !v)}
              className="btn-secondary-sm"
            >
              {bulkMode ? "Exit Multi-Select" : "Multi-Select"}
            </button>

            {bulkMode && (
              <button
                type="button"
                onClick={() => {
                  setPdfModalMode("select");
                  setShowUploadModal(true);
                }}
                className="btn-secondary-sm"
              >
                Select from File
              </button>
            )}

            {bulkMode && (
              <span className="text-sm text-gray-300">
                Selected:{" "}
                <span className="font-semibold">{selectedIds.length}</span>
              </span>
            )}
          </div>

          {bulkMode && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkLocation}
                onChange={(e) => {
                  if (e.target.value === "__add_new__") {
                    setIsAddingLocationTo("bulk");
                    setShowAddLocationModal(true);
                  } else {
                    setBulkLocation(e.target.value);
                  }
                }}
                className="px-3 py-2 rounded bg-white text-black min-w-[220px]"
              >
                <option value="">Set location for selected...</option>
                {allLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
                <option value="__add_new__">➕ Add new location...</option>
              </select>

              <button
                type="button"
                onClick={handleBulkSetLocation}
                disabled={selectedIds.length === 0 || !bulkLocation}
                className={
                  selectedIds.length === 0 || !bulkLocation
                    ? "btn-disabled-sm"
                    : "btn-accent-sm"
                }
              >
                Apply
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={selectedIds.length === 0}
                className={
                  selectedIds.length === 0 ? "btn-disabled-sm" : "btn-danger-sm"
                }
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Inventory List */}
        {isMobile ? (
          <MobileDashboard
            sortedEquipment={sortedEquipment}
            bulkMode={bulkMode}
            selectedIds={selectedIds}
            isSelected={isSelected}
            toggleSelected={toggleSelected}
            selectAllVisible={selectAllVisible}
            clearSelection={clearSelection}
            statusClass={statusClass}
            qtyTextClass={qtyTextClass}
            getQty={getQty}
            editingId={editingId}
            onOpenDetails={(item) => {
              setMobileDetailsItem(item);
              setShowMobileDetailsModal(true);
            }}
            onOpenEdit={(item) => {
              handleEdit(item);
              setShowMobileEditModal(true);
            }}
            onOpenMove={(item) => {
              setMovingItem({ ...item });
              setMoveData({ qty: 1, newLocation: "" });
            }}
          />
        ) : (
          <DesktopDashboard
            sortedEquipment={sortedEquipment}
            bulkMode={bulkMode}
            selectedIds={selectedIds}
            isSelected={isSelected}
            toggleSelected={toggleSelected}
            selectAllVisible={selectAllVisible}
            clearSelection={clearSelection}
            toggleSort={toggleSort}
            sortArrow={sortArrow}
            statusClass={statusClass}
            qtyTextClass={qtyTextClass}
            getQty={getQty}
            dateTextClass={dateTextClass}
            allLocations={allLocations}
            statusOptions={statusOptions}
            editingId={editingId}
            showDesktopEditModal={showDesktopEditModal}
            newItem={newItem}
            handleInlineChange={handleInlineChange}
            onRequestAddLocation={() => {
              setIsAddingLocationTo("new");
              setShowAddLocationModal(true);
            }}
            onOpenDetails={(item) => {
              setMobileDetailsItem(item);
              setShowMobileDetailsModal(true);
            }}
            onOpenEdit={(item) => {
              handleEdit(item);
              setShowDesktopEditModal(true);
            }}
            onOpenMove={(item) => {
              setMovingItem({ ...item });
              setMoveData({ qty: 1, newLocation: "" });
            }}
            onCancelInlineEdit={handleCancelEdit}
            onSaveInlineEdit={handleAddOrUpdate}
            onRequestDeleteInline={() => {
              const id = editingId;
              const name = newItem?.name;
              if (!id) return;
              confirmAndDelete(id, name);
            }}
          />
        )}
      </div>

      <div className="hidden md:block bg-surface p-6 rounded-xl w-full shadow-md">
        <h3 className="text-xl font-bold mb-4 text-center text-accent">
          {editingId && !showDesktopEditModal
            ? "Edit Equipment"
            : "Add New Equipment"}
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Name"
            value={newItem.name}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
          />
          <input
            type="text"
            placeholder="Category"
            value={newItem.category}
            onChange={(e) =>
              setNewItem({ ...newItem, category: e.target.value })
            }
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
          />
          <input
            type="text"
            placeholder="Source"
            value={newItem.source}
            onChange={(e) => setNewItem({ ...newItem, source: e.target.value })}
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
          />
          <select
            value={newItem.location}
            onChange={(e) => {
              if (e.target.value === "__add_new__") {
                setIsAddingLocationTo("new");
                setShowAddLocationModal(true);
              } else {
                setNewItem({ ...newItem, location: e.target.value });
              }
            }}
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
          >
            <option value="">Select location</option>
            {allLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
            <option value="__add_new__">➕ Add new location...</option>
          </select>

          <input
            type="number"
            placeholder="Qty"
            min="0"
            value={newItem.quantity === "" ? "" : newItem.quantity}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                setNewItem({ ...newItem, quantity: "" });
                return;
              }
              const v = parseInt(raw, 10);
              setNewItem({ ...newItem, quantity: Number.isFinite(v) ? v : 0 });
            }}
            className="flex-1 min-w-[100px] px-3 py-2 rounded bg-white text-black"
          />
          <input
            type="number"
            placeholder="Reserve"
            min="0"
            value={newItem.reserveMin}
            onChange={(e) =>
              setNewItem({
                ...newItem,
                reserveMin: parseInt(e.target.value, 10) || 0,
              })
            }
            className="flex-1 min-w-[120px] px-3 py-2 rounded bg-white text-black"
          />
          <select
            value={newItem.status}
            onChange={(e) => setNewItem({ ...newItem, status: e.target.value })}
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={newItem.rentalStart}
            onChange={(e) =>
              setNewItem({ ...newItem, rentalStart: e.target.value })
            }
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
          />
          <input
            type="date"
            value={newItem.rentalEnd}
            onChange={(e) =>
              setNewItem({ ...newItem, rentalEnd: e.target.value })
            }
            className="flex-1 min-w-[150px] px-3 py-2 rounded bg-white text-black"
          />
          <button onClick={handleAddOrUpdate} className="btn-accent">
            {editingId && !showDesktopEditModal ? "Update" : "Add"}
          </button>
          {editingId && !showDesktopEditModal && (
            <button onClick={handleCancelEdit} className="btn-secondary">
              Cancel
            </button>
          )}
          {editingId && !showDesktopEditModal && (
            <button
              type="button"
              onClick={() => {
                const id = editingId;
                const name = newItem?.name;
                if (!id) return;
                confirmAndDelete(id, name);
              }}
              className="btn-danger"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Quick Edit Section */}
      <div className="hidden md:block bg-surface p-6 rounded-xl w-full shadow-md">
        <h3 className="text-xl font-bold mb-4 text-center text-accent">
          Quick Edit
        </h3>
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <select
            value={quickName}
            onChange={(e) => handleQuickNameChange(e.target.value)}
            className="px-4 py-2 rounded w-[220px] text-black"
          >
            <option value="">Select item</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <select
            value={quickFromId}
            onChange={(e) => handleQuickFromChange(e.target.value)}
            className="px-4 py-2 rounded w-[220px] text-black"
            disabled={!quickName}
          >
            <option value="">From (location - qty)</option>
            {entriesForName(quickName).map((entry, idx) => (
              <option
                key={`${entry.id}-${entry.location}-${idx}`}
                value={entry.id}
              >
                {entry.location} — {getQty(entry)}
              </option>
            ))}
          </select>

          <input
            type="number"
            min="1"
            value={quickQty === "" ? "" : quickQty}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                setQuickQty("");
                return;
              }
              const v = parseInt(raw, 10);
              if (!Number.isFinite(v)) return;
              setQuickQty(v);
            }}
            className="px-4 py-2 rounded w-[120px] text-black text-center"
            disabled={!quickFromId}
          />

          <select
            value={quickTo}
            onChange={(e) => {
              if (e.target.value === "__add_new__") {
                setIsAddingLocationTo("quick");
                setShowAddLocationModal(true);
              } else {
                setQuickTo(e.target.value);
              }
            }}
            className="px-4 py-2 rounded w-[220px] text-black"
            disabled={!quickFromId}
          >
            <option value="">To (location)</option>
            {allLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
            <option value="__add_new__">➕ Add new location...</option>
          </select>

          <button
            onClick={handleQuickMove}
            className="btn-accent w-[140px]"
            disabled={!quickName || !quickFromId || !quickTo}
          >
            Quick Move
          </button>
        </div>
      </div>

      {/* Mobile Edit Modal */}
      {isMobile && showMobileEditModal && editingId !== null && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
          onClick={() => {
            setShowMobileEditModal(false);
            handleCancelEdit();
          }}
        >
          <div
            className="bg-surface rounded-xl w-[94%] max-w-md shadow-lg max-h-[calc(100dvh-24px)] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-[calc(env(safe-area-inset-top)+12px)] pb-4">
              <h3 className="text-xl font-bold text-accent">Edit Item</h3>
            </div>

            <div className="px-6 pb-6 overflow-y-auto flex-1">
              <div className="flex flex-col gap-3">
                <label className="text-sm text-gray-300">Name</label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => handleInlineChange("name", e.target.value)}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />

                <label className="text-sm text-gray-300">Category</label>
                <input
                  type="text"
                  value={newItem.category}
                  onChange={(e) =>
                    handleInlineChange("category", e.target.value)
                  }
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />

                <label className="text-sm text-gray-300">Location</label>
                <select
                  value={newItem.location}
                  onChange={(e) => {
                    if (e.target.value === "__add_new__") {
                      setIsAddingLocationTo("new");
                      setShowAddLocationModal(true);
                    } else {
                      handleInlineChange("location", e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                >
                  <option value="">Select location</option>
                  {allLocations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                  <option value="__add_new__">➕ Add new location...</option>
                </select>

                <label className="text-sm text-gray-300">Status</label>
                <select
                  value={newItem.status}
                  onChange={(e) => handleInlineChange("status", e.target.value)}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <label className="text-sm text-gray-300">Quantity</label>
                <input
                  type="number"
                  min="0"
                  value={newItem.quantity === "" ? "" : newItem.quantity}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      handleInlineChange("quantity", "");
                      return;
                    }
                    const v = parseInt(raw, 10);
                    handleInlineChange("quantity", Number.isFinite(v) ? v : 0);
                  }}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />
                <label className="text-sm text-gray-300">Reserve minimum</label>
                <input
                  type="number"
                  min="0"
                  value={newItem.reserveMin}
                  onChange={(e) =>
                    handleInlineChange(
                      "reserveMin",
                      parseInt(e.target.value, 10) || 0,
                    )
                  }
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />
              </div>
            </div>

            <div className="px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+16px)] border-t border-white/10 bg-surface">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileEditModal(false);
                    handleCancelEdit();
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleAddOrUpdate();
                    setShowMobileEditModal(false);
                  }}
                  className="btn-accent"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = editingId;
                    const name = newItem?.name;
                    if (!id) return;
                    confirmAndDelete(id, name);
                  }}
                  className="btn-danger"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Desktop Edit Modal */}
      {!isMobile && showDesktopEditModal && editingId !== null && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
          onClick={() => {
            setShowDesktopEditModal(false);
            handleCancelEdit();
          }}
        >
          <div
            className="bg-surface rounded-xl w-[94%] max-w-xl shadow-lg max-h-[calc(100dvh-24px)] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-xl font-bold text-accent">Edit Item</h3>
              {newItem?.name ? (
                <div className="text-sm text-gray-300 mt-1 truncate">
                  {newItem.name}
                </div>
              ) : null}
            </div>

            <div className="px-6 pb-6 overflow-y-auto flex-1">
              <div className="flex flex-col gap-3">
                <label className="text-sm text-gray-300">Name</label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => handleInlineChange("name", e.target.value)}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />

                <label className="text-sm text-gray-300">Category</label>
                <input
                  type="text"
                  value={newItem.category}
                  onChange={(e) =>
                    handleInlineChange("category", e.target.value)
                  }
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />

                <label className="text-sm text-gray-300">Source</label>
                <input
                  type="text"
                  value={newItem.source}
                  onChange={(e) => handleInlineChange("source", e.target.value)}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                />

                <label className="text-sm text-gray-300">Location</label>
                <select
                  value={newItem.location}
                  onChange={(e) => {
                    if (e.target.value === "__add_new__") {
                      setIsAddingLocationTo("new");
                      setShowAddLocationModal(true);
                    } else {
                      handleInlineChange("location", e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                >
                  <option value="">Select location</option>
                  {allLocations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                  <option value="__add_new__">➕ Add new location...</option>
                </select>

                <label className="text-sm text-gray-300">Status</label>
                <select
                  value={newItem.status}
                  onChange={(e) => handleInlineChange("status", e.target.value)}
                  className="w-full px-3 py-2 rounded bg-white text-black"
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-gray-300">Quantity</label>
                    <input
                      type="number"
                      min="0"
                      value={newItem.quantity === "" ? "" : newItem.quantity}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") {
                          handleInlineChange("quantity", "");
                          return;
                        }
                        const v = parseInt(raw, 10);
                        handleInlineChange(
                          "quantity",
                          Number.isFinite(v) ? v : 0,
                        );
                      }}
                      className="w-full px-3 py-2 rounded bg-white text-black"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-gray-300">
                      Reserve minimum
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newItem.reserveMin}
                      onChange={(e) =>
                        handleInlineChange(
                          "reserveMin",
                          parseInt(e.target.value, 10) || 0,
                        )
                      }
                      className="w-full px-3 py-2 rounded bg-white text-black"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-gray-300">Start date</label>
                    <input
                      type="date"
                      value={newItem.rentalStart || ""}
                      onChange={(e) =>
                        handleInlineChange("rentalStart", e.target.value)
                      }
                      className="w-full px-3 py-2 rounded bg-white text-black"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-gray-300">End date</label>
                    <input
                      type="date"
                      value={newItem.rentalEnd || ""}
                      onChange={(e) =>
                        handleInlineChange("rentalEnd", e.target.value)
                      }
                      className="w-full px-3 py-2 rounded bg-white text-black"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 pt-4 pb-6 border-t border-white/10 bg-surface">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDesktopEditModal(false);
                    handleCancelEdit();
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleAddOrUpdate();
                    setShowDesktopEditModal(false);
                  }}
                  className="btn-accent"
                >
                  Save
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const id = editingId;
                    const name = newItem?.name;
                    if (!id) return;
                    confirmAndDelete(id, name);
                  }}
                  className="btn-danger"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal (mobile + desktop). Desktop also shows Item ID. */}
      {showMobileDetailsModal && mobileDetailsItem && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
          onClick={() => {
            setShowMobileDetailsModal(false);
            setMobileDetailsItem(null);
          }}
        >
          <div
            className="bg-surface rounded-xl w-[94%] max-w-md shadow-lg max-h-[calc(100dvh-24px)] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-[calc(env(safe-area-inset-top)+12px)] pb-4">
              <h3 className="text-xl font-bold text-accent">Details</h3>
              <div className="text-sm text-gray-300 mt-1 truncate">
                {mobileDetailsItem.name}
              </div>
            </div>

            <div className="px-6 pb-6 overflow-y-auto flex-1">
              <div className="flex flex-col gap-3 text-sm">
                {!isMobile && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-400">Item ID</span>
                    <span className="text-gray-200 text-right">
                      {mobileDetailsItem.itemId || "-"}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Category</span>
                  <span className="text-gray-200 text-right">
                    {mobileDetailsItem.category || "-"}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Source</span>
                  <span className="text-gray-200 text-right">
                    {mobileDetailsItem.source || "-"}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Location</span>
                  <span className="text-gray-200 text-right">
                    {mobileDetailsItem.location || "-"}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Status</span>
                  <span
                    className={
                      "text-right " + statusClass(mobileDetailsItem.status)
                    }
                  >
                    {mobileDetailsItem.status || "-"}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Quantity</span>
                  <span className="text-gray-200 text-right">
                    {getQty(mobileDetailsItem)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Reserve minimum</span>
                  <span className="text-gray-200 text-right">
                    {Number(mobileDetailsItem.reserveMin) || 0}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Start date</span>
                  <span
                    className={
                      "text-right " +
                      dateTextClass(mobileDetailsItem.rentalStart, "start")
                    }
                  >
                    {mobileDetailsItem.rentalStart || "-"}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">End date</span>
                  <span
                    className={
                      "text-right " +
                      dateTextClass(mobileDetailsItem.rentalEnd, "end")
                    }
                  >
                    {mobileDetailsItem.rentalEnd || "-"}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Updated by</span>
                  <span className="text-gray-200 text-right">
                    {mobileDetailsItem.updatedBy || "-"}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+16px)] border-t border-white/10 bg-surface">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileDetailsModal(false);
                    setMobileDetailsItem(null);
                  }}
                  className="btn-accent"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteTarget && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
          onClick={() => {
            if (deleteBusy) return;
            setBulkDeleteTarget(null);
          }}
        >
          <div
            className="bg-surface p-6 rounded-xl w-[90%] max-w-sm shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-accent mb-2">
              Delete selected items?
            </h3>
            <p className="text-sm text-gray-300 mb-4">
              This will permanently delete{" "}
              <span className="font-semibold text-text">
                {bulkDeleteTarget.ids.length}
              </span>{" "}
              item(s).
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkDeleteTarget(null)}
                disabled={deleteBusy}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performBulkDelete}
                disabled={deleteBusy}
                className="btn-danger"
              >
                {deleteBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
          onClick={() => {
            if (deleteBusy) return;
            setDeleteTarget(null);
          }}
        >
          <div
            className="bg-surface p-6 rounded-xl w-[90%] max-w-sm shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-accent mb-2">Delete item?</h3>
            <p className="text-sm text-gray-300 mb-4">
              This will permanently delete{" "}
              <span className="font-semibold text-text">
                {deleteTarget.name ? `"${deleteTarget.name}"` : "this item"}
              </span>
              .
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteBusy}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performDelete}
                disabled={deleteBusy}
                className="btn-danger"
              >
                {deleteBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {movingItem && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
          onClick={() => setMovingItem(null)}
        >
          <div
            className="bg-surface p-6 rounded-xl w-[90%] max-w-md shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-accent mb-4">
              Move {movingItem.name}
            </h3>
            <div className="flex flex-col gap-3">
              <label className="text-sm text-gray-300">
                Quantity to move (max {movingItem.quantity}):
              </label>
              <input
                type="number"
                min="1"
                max={movingItem.quantity}
                value={moveData.qty}
                onChange={(e) =>
                  setMoveData({
                    ...moveData,
                    qty: parseInt(e.target.value) || 1,
                  })
                }
                className="px-3 py-2 rounded bg-white text-black"
              />
              <label className="text-sm text-gray-300">New location:</label>
              <select
                value={moveData.newLocation}
                onChange={(e) => {
                  if (e.target.value === "__add_new__") {
                    setIsAddingLocationTo("move");
                    setShowAddLocationModal(true);
                  } else {
                    setMoveData({ ...moveData, newLocation: e.target.value });
                  }
                }}
                className="px-3 py-2 rounded bg-white text-black"
              >
                <option value="">Select location</option>
                {allLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
                <option value="__add_new__">➕ Add new location...</option>
              </select>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setMovingItem(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button onClick={handleMoveSubmit} className="btn-accent">
                  Confirm Move
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Location Modal */}
      {showAddLocationModal && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
          onClick={() => {
            setShowAddLocationModal(false);
            setNewLocationName("");
            setIsAddingLocationTo(null);
          }}
        >
          <div
            className="bg-surface p-6 rounded-xl w-[90%] max-w-sm shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-accent mb-4">
              Add New Location
            </h3>
            <input
              type="text"
              placeholder="New location name"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              className="w-full px-3 py-2 mb-4 rounded bg-white text-black"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAddLocationModal(false);
                  setNewLocationName("");
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button onClick={handleAddNewLocation} className="btn-accent">
                Add
              </button>
            </div>
          </div>
        </div>
      )}
      {showUploadModal && (
        <ImportFileModal
          isOpen={showUploadModal}
          onClose={() => {
            setShowUploadModal(false);
            setPdfModalMode("import");
          }}
          onUpload={(items) => {
            if (pdfModalMode === "select") handlePdfSelect(items);
            else handlePdfUpload(items);
          }}
          mode={pdfModalMode}
          setImportInProgress={setImportInProgress}
          allLocations={allLocations}
        />
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
          onClick={() => setShowExportModal(false)}
        >
          <div
            className="bg-surface p-6 rounded-xl w-[92%] max-w-lg shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-accent mb-4">Export</h3>

            <div className="flex flex-col gap-4">
              {/* Toggle current view */}
              <label className="flex items-center gap-2 text-sm text-gray-300 select-none">
                <input
                  type="checkbox"
                  checked={exportUseCurrentView}
                  onChange={(e) => setExportUseCurrentView(e.target.checked)}
                />
                Export current view only (search + sort)
              </label>

              {/* Scope */}
              <div>
                <div className="text-sm text-gray-300 mb-2">Scope</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={
                      exportScope === "all"
                        ? "btn-accent-sm"
                        : "btn-secondary-sm"
                    }
                    onClick={() => setExportScope("all")}
                  >
                    All locations
                  </button>
                  <button
                    type="button"
                    className={
                      exportScope === "single"
                        ? "btn-accent-sm"
                        : "btn-secondary-sm"
                    }
                    onClick={() => setExportScope("single")}
                  >
                    One location
                  </button>
                  <button
                    type="button"
                    className={
                      exportScope === "multi"
                        ? "btn-accent-sm"
                        : "btn-secondary-sm"
                    }
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

              {/* Format */}
              <div>
                <div className="text-sm text-gray-300 mb-2">Format</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={
                      exportFormat === "csv"
                        ? "btn-accent-sm"
                        : "btn-secondary-sm"
                    }
                    onClick={() => setExportFormat("csv")}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    className={
                      exportFormat === "pdf"
                        ? "btn-accent-sm"
                        : "btn-secondary-sm"
                    }
                    onClick={() => setExportFormat("pdf")}
                  >
                    PDF
                  </button>
                </div>
                {exportFormat === "pdf" && (
                  <div className="text-xs text-gray-400 mt-2">
                    PDF opens a print dialog — choose “Save as PDF”.
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
                <div className="text-sm text-gray-300">
                  Items to export: {getExportRows().length}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowExportModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={
                      getExportRows().length === 0
                        ? "btn-disabled"
                        : "btn-accent"
                    }
                    disabled={getExportRows().length === 0}
                    onClick={() => {
                      const rows = getExportRows();
                      if (rows.length === 0) return;
                      if (exportFormat === "csv") {
                        exportRowsToCsv(rows);
                      } else {
                        exportRowsToPdf(rows);
                      }
                      window.toast?.success?.(
                        `Exported ${rows.length} item(s)`,
                      );
                      setShowExportModal(false);
                    }}
                  >
                    Export
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
