import React, { useContext, useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import ImportFileModal from "@/components/ImportFileModal";
import EquipmentContext from "@/context/EquipmentContext";
import useUser from "@/context/useUser";
import { supabase } from "@/lib/supabaseClient";
import DesktopDashboard from "./DesktopDashboard";
import MobileDashboard from "./MobileDashboard";
import EditModal from "./components/EditModal";
import DetailsModal from "./components/DetailsModal";
import ConfirmDeleteModal from "./components/ConfirmDeleteModal";
import MoveModal from "./components/MoveModal";
import AddLocationModal from "./components/AddLocationModal";
import ExportModal from "./components/ExportModal";
import SummaryReportModal from "./components/SummaryReportModal";
import { fetchAndDownloadAuditCsv } from "./utils/auditExport";
import { lowStockToCsv, downloadCsv } from "./utils/export";
import useBulkSelection from "./hooks/useBulkSelection";
import useInventoryView from "./hooks/useInventoryView";
import useEditFlow from "./hooks/useEditFlow";
import useLocation from "./hooks/useLocation";
import useExport from "./hooks/useExport";
import { matchFileItemsToEquipment } from "./utils/pdfSelect";
import useFilterPresets from "./hooks/useFilterPresets";

// --- Presentational components (extracted from DashboardPage for readability) ---

const InventoryCard = ({ children }) => {
  return (
    <div className="bg-surface rounded-xl p-6 shadow-md overflow-x-auto">
      {children}
    </div>
  );
};

const DashboardHeader = ({
  importInProgress,
  onAddItem,
  onImport,
  onExport,
  onSummary,
  hideActions = false,
}) => {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-3xl font-bold text-accent">Dashboard</h2>

      {!hideActions && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onAddItem} className="btn-accent">
            <span className="whitespace-nowrap">Add Item</span>
          </button>

          <button
            type="button"
            onClick={onImport}
            disabled={importInProgress}
            className={importInProgress ? "btn-disabled" : "btn-secondary"}
          >
            <span className="whitespace-nowrap">
              {importInProgress ? "Importing..." : "Import"}
            </span>
          </button>

          <button type="button" onClick={onExport} className="btn-secondary">
            <span className="whitespace-nowrap">Export</span>
          </button>

          <button type="button" onClick={onSummary} className="btn-secondary">
            <span className="whitespace-nowrap">Summary</span>
          </button>
        </div>
      )}
    </div>
  );
};

const ImportToast = ({ show, message, onDismiss }) => {
  if (!show || !message) return null;

  return (
    <div className="fixed right-6 top-6 z-50">
      <div className="bg-surface border border-gray-700 text-text px-4 py-3 rounded shadow-md flex items-start gap-3 max-w-sm">
        <div className="flex-1">
          <div className="font-semibold text-accent">Import Complete</div>
          <div className="text-sm text-gray-300">{message}</div>
        </div>

        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-200 ml-2"
          aria-label="dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

const FilterSelect = ({ value, onChange, placeholder, options }) => (
  <div className="relative flex items-center">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`px-3 py-2 rounded-lg border shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition appearance-none pr-8 ${
        value
          ? "bg-accent/10 border-accent text-accent font-medium"
          : "bg-white/90 border-gray-300 text-gray-500"
      }`}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
    {value && (
      <button
        type="button"
        onClick={() => onChange("")}
        className="absolute right-1 top-1/2 -translate-y-1/2 text-accent hover:text-accent/70 text-xs font-bold px-1"
        aria-label={`Clear ${placeholder} filter`}
      >
        ✕
      </button>
    )}
  </div>
);

const BulkToolbar = ({
  searchQuery,
  setSearchQuery,

  filterLocation,
  setFilterLocation,
  filterStatus,
  setFilterStatus,
  filterCategory,
  setFilterCategory,
  showBelowReserve,
  setShowBelowReserve,
  allLocations,
  statusOptions,
  categoryOptions,

  bulkMode,
  toggleBulkMode,

  onSelectFromFile,
  selectedCount,

  bulkLocation,
  setBulkLocation,
  onAddNewLocation,

  onApplyBulkLocation,
  onBulkDelete,
}) => {
  const hasActiveFilters = filterLocation || filterStatus || filterCategory || showBelowReserve;

  return (
    <div className="flex flex-col gap-3 mb-4">
      {/* Row 1: Search + Multi-select controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Name"
            className="w-full max-w-md px-3 py-2 rounded-lg bg-white/90 text-text border border-gray-300 placeholder:text-gray-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
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

        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleBulkMode}
              className="btn-secondary-sm"
            >
              {bulkMode ? "Exit Multi-Select" : "Multi-Select"}
            </button>

            {bulkMode && (
              <button
                type="button"
                onClick={onSelectFromFile}
                className="btn-secondary-sm"
              >
                Select from File
              </button>
            )}

            {bulkMode && (
              <span className="text-sm text-gray-300">
                Selected: <span className="font-semibold">{selectedCount}</span>
              </span>
            )}
          </div>

          {/* Below Reserve sits directly under Multi-Select */}
          <button
            type="button"
            onClick={() => setShowBelowReserve((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
              showBelowReserve
                ? "bg-danger/10 border-danger text-danger"
                : "bg-white/90 border-gray-300 text-gray-500 hover:border-gray-400"
            }`}
          >
            Below Reserve
          </button>
        </div>
      </div>

      {/* Row 2: Dropdown filters */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          value={filterLocation}
          onChange={setFilterLocation}
          placeholder="All Locations"
          options={allLocations}
        />
        <FilterSelect
          value={filterStatus}
          onChange={setFilterStatus}
          placeholder="All Statuses"
          options={statusOptions}
        />
        <FilterSelect
          value={filterCategory}
          onChange={setFilterCategory}
          placeholder="All Categories"
          options={categoryOptions}
        />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setFilterLocation("");
              setFilterStatus("");
              setFilterCategory("");
              setShowBelowReserve(false);
            }}
            className="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2 transition"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Row 3: Bulk action controls (only in bulk mode) */}
      {bulkMode && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={bulkLocation}
            onChange={(e) => {
              if (e.target.value === "__add_new__") onAddNewLocation();
              else setBulkLocation(e.target.value);
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
            onClick={onApplyBulkLocation}
            disabled={selectedCount === 0 || !bulkLocation}
            className={
              selectedCount === 0 || !bulkLocation
                ? "btn-disabled-sm"
                : "btn-accent-sm"
            }
          >
            Apply
          </button>

          <button
            type="button"
            onClick={onBulkDelete}
            disabled={selectedCount === 0}
            className={
              selectedCount === 0 ? "btn-disabled-sm" : "btn-danger-sm"
            }
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Saved filter preset chips + inline save form.
 *
 * Props:
 *   presets       — array of { id, name, filters }
 *   activeFilters — current filter state object (to save)
 *   onApply       — (filters) => void  — apply a preset's filters
 *   onSave        — (name, filters) => void  — persist new preset
 *   onDelete      — (id) => void
 */
const FilterPresets = ({ presets, activeFilters, onApply, onSave, onDelete }) => {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const hasAnyFilter = Object.values(activeFilters).some((v) =>
    typeof v === "boolean" ? v : Boolean(v),
  );

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim(), { ...activeFilters });
    setName("");
    setSaving(false);
  };

  if (presets.length === 0 && !hasAnyFilter) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 -mt-1 mb-1">
      {/* Existing preset chips */}
      {presets.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full pl-3 pr-1 py-1"
        >
          <button
            type="button"
            onClick={() => onApply(p.filters)}
            className="text-xs text-gray-300 hover:text-accent transition"
          >
            {p.name}
          </button>
          <button
            type="button"
            onClick={() => onDelete(p.id)}
            aria-label={`Delete preset "${p.name}"`}
            className="text-gray-600 hover:text-danger transition text-xs px-1"
          >
            ✕
          </button>
        </div>
      ))}

      {/* Save current filters as a new preset */}
      {hasAnyFilter && !saving && (
        <button
          type="button"
          onClick={() => setSaving(true)}
          className="text-xs text-gray-500 hover:text-accent underline underline-offset-2 transition"
        >
          + Save as preset
        </button>
      )}

      {saving && (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") { setSaving(false); setName(""); }
            }}
            placeholder="Preset name…"
            className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-accent w-36"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className={name.trim() ? "btn-accent-sm" : "btn-disabled-sm"}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => { setSaving(false); setName(""); }}
            className="text-xs text-gray-500 hover:text-gray-300 transition"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

const WELCOME_DISMISSED_KEY = "griptrack_welcome_dismissed";

// Shown the first time a new org lands on the dashboard with no inventory.
const WelcomeBanner = ({ onAddItem, onImport, onDismiss }) => (
  <div className="bg-accent/10 border border-accent/30 rounded-xl p-5 flex flex-col gap-4">
    <div className="flex items-start justify-between gap-2">
      <div>
        <h3 className="text-lg font-bold text-accent mb-1">
          Welcome to GripTrack
        </h3>
        <p className="text-sm text-gray-300">
          Get your inventory set up in three steps.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-gray-500 hover:text-gray-300 text-xs shrink-0 mt-1 transition"
        aria-label="Dismiss welcome banner"
      >
        Dismiss
      </button>
    </div>

    <ol className="flex flex-col gap-3 text-sm">
      <li className="flex items-start gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">
          1
        </span>
        <span className="text-gray-300">
          <NavLink to="/locations" className="text-accent underline underline-offset-2">
            Add your locations
          </NavLink>{" "}
          — trucks, stages, or anywhere gear lives.
        </span>
      </li>

      <li className="flex items-start gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">
          2
        </span>
        <span className="text-gray-300">
          <button
            type="button"
            onClick={onImport}
            className="text-accent underline underline-offset-2"
          >
            Import a rental PDF
          </button>{" "}
          or{" "}
          <button
            type="button"
            onClick={onAddItem}
            className="text-accent underline underline-offset-2"
          >
            add items manually
          </button>
          .
        </span>
      </li>

      <li className="flex items-start gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">
          3
        </span>
        <span className="text-gray-300">
          <NavLink to="/staff" className="text-accent underline underline-offset-2">
            Invite your crew
          </NavLink>{" "}
          to see and request gear in real time.
        </span>
      </li>
    </ol>
  </div>
);

// Shown inside the inventory card when no rows are visible.
const EmptyState = ({ hasActiveFilters, onClearFilters, onAddItem, onImport }) => {
  if (hasActiveFilters) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-gray-400 text-sm">
          No items match your current filters.
        </p>
        <button
          type="button"
          onClick={onClearFilters}
          className="btn-secondary-sm"
        >
          Clear filters
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      {/* Box icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-gray-600"
      >
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
      <div>
        <p className="text-gray-200 font-medium mb-1">No inventory yet</p>
        <p className="text-gray-500 text-sm max-w-xs">
          Add your first item manually or import a rental PDF or CSV to get
          started.
        </p>
      </div>
      <div className="flex gap-2 mt-1">
        <button type="button" onClick={onAddItem} className="btn-accent">
          Add Item
        </button>
        <button type="button" onClick={onImport} className="btn-secondary">
          Import
        </button>
      </div>
    </div>
  );
};

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
  const { user, orgId } = useUser();

  const { allLocations, addCustomLocation } = useLocation({
    contextLocations,
    equipment,
  });

  const statusOptions = Array.from(
    new Set([
      "Available",
      "Out",
      "Damaged",
      ...equipment.map((e) => e.status).filter(Boolean),
    ]),
  ).sort((a, b) => String(a).localeCompare(String(b)));

  const categoryOptions = Array.from(
    new Set(equipment.map((e) => e.category).filter(Boolean)),
  ).sort((a, b) => String(a).localeCompare(String(b)));

  // Edit/Add modal state and logic handled by useEditFlow below
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

  // Toast for import summary
  const [showToast, setShowToast] = useState(false);

  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [exportingHistory, setExportingHistory] = useState(false);

  // Welcome banner — shown once when org has no equipment, dismissed via localStorage
  const [welcomeDismissed, setWelcomeDismissed] = useState(
    () => localStorage.getItem(WELCOME_DISMISSED_KEY) === "true",
  );

  const dismissWelcome = () => {
    localStorage.setItem(WELCOME_DISMISSED_KEY, "true");
    setWelcomeDismissed(true);
  };

  // Mobile layout
  const [isMobile, setIsMobile] = useState(false);
  // Edit modal state handled by useEditFlow below

  // Mobile "Details" modal
  const [showMobileDetailsModal, setShowMobileDetailsModal] = useState(false);
  const [mobileDetailsItem, setMobileDetailsItem] = useState(null);

  // Edit flow modal state and handlers (centralized)
  const {
    editingId,
    setEditingId,
    newItem,
    setNewItem,
    showMobileEditModal,
    showDesktopEditModal,
    openAdd,
    openEditForItem,
    closeEdit,
    cancelEdit,
    setField,
  } = useEditFlow({
    isMobile,
    onBeforeOpen: () => {
      // Ensure other overlays don't conflict
      setShowMobileDetailsModal(false);
      setMobileDetailsItem(null);
    },
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

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

  const handleAddOrUpdate = () => {
    const qtyNum = newItem.quantity === "" ? 0 : Number(newItem.quantity) || 0;
    const reserveNum = Number(newItem.reserveMin) || 0;
    if (!newItem.name || !newItem.location) return;
    // Allow qty 0 only when reserveMin > 0
    if (qtyNum <= 0 && reserveNum <= 0) return;
    if (newItem.rentalEnd && newItem.rentalStart > newItem.rentalEnd) return;

    if (editingId !== null) {
      updateEquipment(editingId, {
        ...newItem,
        quantity: qtyNum,
        reserveMin: Number(newItem.reserveMin) || 0,
        updatedBy: user?.username || "admin",
      });
      setEditingId(null);
    } else {
      addEquipment({
        ...newItem,
        quantity: qtyNum,
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

  // Select existing DB rows based on parsed PDF lines (no DB writes)
  const handlePdfSelect = (items) => {
    if (!Array.isArray(items) || items.length === 0) return;

    const { ids, ambiguous, notFound } = matchFileItemsToEquipment({
      items,
      equipment, // ✅ FULL DB match (Option B)
    });

    // Ensure multi-select is enabled so users can act immediately
    setBulkMode(true);
    setSelectedIds(ids);

    // Feedback
    if (ids.length === 0) {
      window.toast?.error?.(
        "No matches found in the database for the uploaded file items",
      );
    } else {
      const parts = [`Selected ${ids.length} item(s)`];
      if (ambiguous) parts.push(`${ambiguous} line(s) matched multiple rows`);
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

  // Export full org audit log as a CSV for wrap reports.
  const handleExportHistory = async () => {
    if (!orgId) return;
    setExportingHistory(true);
    try {
      // Build equipment_id → name lookup from the current equipment array
      const nameMap = {};
      for (const item of equipment) {
        nameMap[String(item.id)] = item.name || "";
      }

      const count = await fetchAndDownloadAuditCsv(supabase, orgId, nameMap);
      window.toast?.success?.(`Exported ${count} movement event${count !== 1 ? "s" : ""}`);
    } catch (e) {
      console.error("[ExportHistory]", e);
      window.toast?.error?.(e?.message || "Failed to export history");
    } finally {
      setExportingHistory(false);
    }
  };

  const handleMoveSubmit = async () => {
    if (!movingItem || moveData.qty <= 0 || !moveData.newLocation) return;
    try {
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
    addCustomLocation(trimmed);

    // Route the new location into the appropriate field depending on caller
    if (isAddingLocationTo === "new") {
      setNewItem((prev) => ({ ...prev, location: trimmed }));
    } else if (isAddingLocationTo === "move") {
      setMoveData((prev) => ({ ...prev, newLocation: trimmed }));
    } else if (isAddingLocationTo === "bulk") {
      setBulkLocation(trimmed);
    }

    setNewLocationName("");
    setIsAddingLocationTo(null);
    setShowAddLocationModal(false);
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

  const {
    searchQuery,
    setSearchQuery,
    filterLocation,
    setFilterLocation,
    filterStatus,
    setFilterStatus,
    filterCategory,
    setFilterCategory,
    showBelowReserve,
    setShowBelowReserve,
    toggleSort,
    sortArrow,
    visibleEquipment,
    sortedEquipment,
  } = useInventoryView({ equipment });

  const { presets, savePreset, deletePreset } = useFilterPresets({ orgId });

  // The current active filter state — passed to FilterPresets for saving
  const activeFilters = {
    searchQuery,
    filterLocation,
    filterStatus,
    filterCategory,
    showBelowReserve,
  };

  // Apply a saved preset by restoring all its filter values
  const applyPreset = (filters) => {
    if (filters.searchQuery !== undefined) setSearchQuery(filters.searchQuery);
    if (filters.filterLocation !== undefined) setFilterLocation(filters.filterLocation);
    if (filters.filterStatus !== undefined) setFilterStatus(filters.filterStatus);
    if (filters.filterCategory !== undefined) setFilterCategory(filters.filterCategory);
    if (filters.showBelowReserve !== undefined) setShowBelowReserve(filters.showBelowReserve);
  };

  const handleExportLowStock = () => {
    const csv = lowStockToCsv(equipment);
    // Count rows: split by newline, subtract header, ignore BOM
    const count = csv.split("\n").length - 2; // -1 header -1 BOM line
    if (count <= 0) {
      window.toast?.info?.("No items are currently below their reserve minimum.");
      return;
    }
    downloadCsv(csv, "griptrack-low-stock");
    window.toast?.success?.(`Exported ${count} below-reserve item${count !== 1 ? "s" : ""}`);
  };

  const {
    showExportModal,
    setShowExportModal,
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
    getExportRows,
    doExport,
  } = useExport({
    sortedEquipment,
    visibleEquipment,
  });

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
      setShowSummaryModal(false);
      setShowMobileDetailsModal(false);
      setMobileDetailsItem(null);
      closeEdit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeEdit, setShowExportModal]);

  const {
    bulkMode,
    setBulkMode,
    selectedIds,
    setSelectedIds,
    bulkLocation,
    setBulkLocation,
    isSelected,
    toggleSelected,
    selectAllVisible,
    clearSelection,
  } = useBulkSelection({
    visibleRows: sortedEquipment,
    onExitBulkMode: () => {
      setShowMobileDetailsModal(false);
      setMobileDetailsItem(null);
    },
  });

  return (
    <div className="px-3 sm:px-6 md:p-8 flex flex-col gap-6 text-text relative">
      <DashboardHeader
        importInProgress={importInProgress}
        onAddItem={openAdd}
        onImport={() => {
          setPdfModalMode("import");
          setShowUploadModal(true);
        }}
        onExport={() => setShowExportModal(true)}
        onSummary={() => setShowSummaryModal(true)}
        hideActions={isMobile}
      />

      {/* Welcome banner — visible only when org has no equipment and not dismissed */}
      {visibleEquipment.length === 0 && !welcomeDismissed && (
        <WelcomeBanner
          onAddItem={openAdd}
          onImport={() => {
            setPdfModalMode("import");
            setShowUploadModal(true);
          }}
          onDismiss={dismissWelcome}
        />
      )}

      <ImportToast
        show={showToast}
        message={importSummaryMessage}
        onDismiss={() => {
          setShowToast(false);
          if (typeof clearImportSummary === "function") clearImportSummary();
        }}
      />

      {isMobile && (
        <div className="flex items-center justify-start gap-2 -mb-2">
          <button type="button" onClick={openAdd} className="btn-accent">
            <span className="whitespace-nowrap">Add Item</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPdfModalMode("import");
              setShowUploadModal(true);
            }}
            disabled={importInProgress}
            className={importInProgress ? "btn-disabled" : "btn-secondary"}
          >
            <span className="whitespace-nowrap">
              {importInProgress ? "Importing..." : "Import"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="btn-secondary"
          >
            <span className="whitespace-nowrap">Export</span>
          </button>
        </div>
      )}

      <InventoryCard>
        <BulkToolbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filterLocation={filterLocation}
          setFilterLocation={setFilterLocation}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          showBelowReserve={showBelowReserve}
          setShowBelowReserve={setShowBelowReserve}
          allLocations={allLocations}
          statusOptions={statusOptions}
          categoryOptions={categoryOptions}
          bulkMode={bulkMode}
          toggleBulkMode={() => setBulkMode((v) => !v)}
          onSelectFromFile={() => {
            setPdfModalMode("select");
            setShowUploadModal(true);
          }}
          selectedCount={selectedIds.length}
          bulkLocation={bulkLocation}
          setBulkLocation={setBulkLocation}
          onAddNewLocation={() => {
            setIsAddingLocationTo("bulk");
            setShowAddLocationModal(true);
          }}
          onApplyBulkLocation={handleBulkSetLocation}
          onBulkDelete={handleBulkDelete}
        />

        <FilterPresets
          presets={presets}
          activeFilters={activeFilters}
          onApply={applyPreset}
          onSave={savePreset}
          onDelete={deletePreset}
        />

        {/* Empty state — no results after filters, or genuinely empty inventory */}
        {sortedEquipment.length === 0 && (
          <EmptyState
            hasActiveFilters={
              !!(filterLocation || filterStatus || filterCategory || searchQuery.trim() || showBelowReserve)
            }
            onClearFilters={() => {
              setFilterLocation("");
              setFilterStatus("");
              setFilterCategory("");
              setSearchQuery("");
              setShowBelowReserve(false);
            }}
            onAddItem={openAdd}
            onImport={() => {
              setPdfModalMode("import");
              setShowUploadModal(true);
            }}
          />
        )}

        {/* Inventory List — only mounts when there are rows to show */}
        {sortedEquipment.length > 0 && (
          isMobile ? (
            <MobileDashboard
              sortedEquipment={sortedEquipment}
              bulkMode={bulkMode}
              selectedIds={selectedIds}
              isSelected={isSelected}
              toggleSelected={toggleSelected}
              selectAllVisible={selectAllVisible}
              clearSelection={clearSelection}
              editingId={editingId}
              onOpenDetails={(item) => {
                setMobileDetailsItem(item);
                setShowMobileDetailsModal(true);
              }}
              onOpenEdit={(item) => {
                openEditForItem(item);
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
              editingId={editingId}
              onOpenDetails={(item) => {
                setMobileDetailsItem(item);
                setShowMobileDetailsModal(true);
              }}
              onOpenEdit={(item) => {
                openEditForItem(item);
              }}
              onOpenMove={(item) => {
                setMovingItem({ ...item });
                setMoveData({ qty: 1, newLocation: "" });
              }}
            />
          )
        )}
      </InventoryCard>

      {/* Desktop inline Add/Edit form removed */}

      {/* Quick Edit Section removed */}

      {/* Edit Modals */}
      <EditModal
        isOpen={isMobile && showMobileEditModal}
        variant="mobile"
        title={editingId ? "Edit Item" : "Add Item"}
        newItem={newItem}
        onChangeField={setField}
        handleInlineChange={setField}
        allLocations={allLocations}
        statusOptions={statusOptions}
        onRequestAddLocation={() => {
          setIsAddingLocationTo("new");
          setShowAddLocationModal(true);
        }}
        onCancel={() => {
          cancelEdit();
        }}
        onSave={() => {
          handleAddOrUpdate();
          closeEdit();
        }}
        onDelete={() => {
          const id = editingId;
          const name = newItem?.name;
          if (!id) return;
          confirmAndDelete(id, name);
        }}
      />

      <EditModal
        isOpen={!isMobile && showDesktopEditModal}
        variant="desktop"
        title={editingId ? "Edit Item" : "Add Item"}
        newItem={newItem}
        onChangeField={setField}
        handleInlineChange={setField}
        allLocations={allLocations}
        statusOptions={statusOptions}
        onRequestAddLocation={() => {
          setIsAddingLocationTo("new");
          setShowAddLocationModal(true);
        }}
        onCancel={() => {
          cancelEdit();
        }}
        onSave={() => {
          handleAddOrUpdate();
          closeEdit();
        }}
        onDelete={() => {
          const id = editingId;
          const name = newItem?.name;
          if (!id) return;
          confirmAndDelete(id, name);
        }}
      />

      {/* Details Modal */}
      <DetailsModal
        isOpen={showMobileDetailsModal && !!mobileDetailsItem}
        item={mobileDetailsItem}
        isMobile={isMobile}
        onClose={() => {
          setShowMobileDetailsModal(false);
          setMobileDetailsItem(null);
        }}
      />

      {/* Bulk Delete */}
      <ConfirmDeleteModal
        isOpen={!!bulkDeleteTarget}
        target={bulkDeleteTarget}
        busy={deleteBusy}
        onCancel={() => setBulkDeleteTarget(null)}
        onConfirm={performBulkDelete}
      />

      {/* Single Delete */}
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        target={deleteTarget}
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={performDelete}
      />

      {/* Move */}
      <MoveModal
        isOpen={!!movingItem}
        movingItem={movingItem}
        moveData={moveData}
        setMoveData={setMoveData}
        allLocations={allLocations}
        onRequestAddLocation={() => {
          setIsAddingLocationTo("move");
          setShowAddLocationModal(true);
        }}
        onCancel={() => setMovingItem(null)}
        onConfirm={handleMoveSubmit}
      />

      {/* Add Location */}
      <AddLocationModal
        isOpen={showAddLocationModal}
        value={newLocationName}
        onChange={setNewLocationName}
        onCancel={() => {
          setShowAddLocationModal(false);
          setNewLocationName("");
          setIsAddingLocationTo(null);
        }}
        onAdd={handleAddNewLocation}
      />

      {/* Import File Modal (keep as-is) */}
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

      {/* Summary Report */}
      <SummaryReportModal
        isOpen={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        equipment={sortedEquipment}
      />

      {/* Export */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        exportUseCurrentView={exportUseCurrentView}
        setExportUseCurrentView={setExportUseCurrentView}
        exportScope={exportScope}
        setExportScope={setExportScope}
        exportSingleLocation={exportSingleLocation}
        setExportSingleLocation={setExportSingleLocation}
        exportMultiLocations={exportMultiLocations}
        setExportMultiLocations={setExportMultiLocations}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        allLocations={allLocations}
        getExportRows={getExportRows}
        onDoExport={() => {
          const result = doExport();
          if (!result?.count) return;
          window.toast?.success?.(`Exported ${result.count} item(s)`);
          setShowExportModal(false);
        }}
        onExportLowStock={handleExportLowStock}
        onExportHistory={handleExportHistory}
        exportingHistory={exportingHistory}
      />
    </div>
  );
};

export default DashboardPage;
