import React, { useContext, useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import ImportFileModal from "@/components/ImportFileModal";
import EquipmentContext from "@/context/EquipmentContext";
import useUser from "@/context/useUser";
import useTeam from "@/context/useTeam";
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
import { PAGE_SIZE_OPTIONS } from "./hooks/useInventoryView";

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
  canAdd = true,
}) => {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-3xl font-bold text-accent">Dashboard</h2>

      {!hideActions && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canAdd && (
            <button type="button" onClick={onAddItem} className="btn-accent">
              <span className="whitespace-nowrap">Add Item</span>
            </button>
          )}

          {canAdd && (
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
          )}

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
  canDelete = true,
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

          {canDelete && (
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
          )}
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
const EmptyState = ({ hasActiveFilters, onClearFilters, onAddItem, onImport, canAdd = true }) => {
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
      {canAdd && (
        <div className="flex gap-2 mt-1">
          <button type="button" onClick={onAddItem} className="btn-accent">
            Add Item
          </button>
          <button type="button" onClick={onImport} className="btn-secondary">
            Import
          </button>
        </div>
      )}
    </div>
  );
};

// ── OrgOverview ───────────────────────────────────────────────────────────────
// Shown to admin/owner when no team is active. Displays all teams as cards
// so they can jump straight into one without going via the Teams page.
const OrgOverview = () => {
  const { teams, loadingTeams, setActiveTeamId } = useTeam();
  const { orgName } = useUser();

  // Per-team item counts — fetched once on mount
  const [counts, setCounts] = useState({});

  useEffect(() => {
    const fetchCounts = async () => {
      if (!teams.length) return;
      const ids = teams.map((t) => t.id);
      const { data, error } = await supabase
        .from("equipment_items")
        .select("team_id")
        .in("team_id", ids);

      if (error || !data) return;

      const c = {};
      for (const row of data) {
        c[row.team_id] = (c[row.team_id] || 0) + 1;
      }
      setCounts(c);
    };

    fetchCounts();
  }, [teams]);

  const activeTeams   = teams.filter((t) => t.status !== "archived");
  const archivedTeams = teams.filter((t) => t.status === "archived");

  if (loadingTeams) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-gray-500">
        <span className="animate-pulse text-sm">Loading teams…</span>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="1.5"
             strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <div>
          <p className="text-gray-200 font-medium mb-1">No teams yet</p>
          <p className="text-gray-500 text-sm max-w-xs">
            Create your first team to start tracking equipment by department.
          </p>
        </div>
        <NavLink to="/teams" className="btn-accent">
          Create a Team
        </NavLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-text">
          {orgName || "Your Organization"}
        </h3>
        <p className="text-sm text-gray-400 mt-0.5">
          Select a team to view and manage its inventory.
        </p>
      </div>

      {/* Active teams grid */}
      {activeTeams.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">Teams</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeTeams.map((team) => {
              const itemCount = counts[team.id] ?? null;
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setActiveTeamId(team.id)}
                  className="text-left bg-surface border border-gray-700 hover:border-accent/60 hover:bg-accent/5 rounded-xl p-5 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-text group-hover:text-accent truncate transition-colors">
                        {team.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {itemCount === null
                          ? "—"
                          : `${itemCount} item${itemCount !== 1 ? "s" : ""}`}
                      </p>
                    </div>
                    <span className="text-accent opacity-0 group-hover:opacity-100 transition-opacity text-xl leading-none">
                      →
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500">Active</span>
                    <span className="text-xs text-gray-600 ml-auto">
                      {team.max_seats} seat{team.max_seats !== 1 ? "s" : ""}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Archived teams — collapsed section */}
      {archivedTeams.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">Archived</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {archivedTeams.map((team) => {
              const itemCount = counts[team.id] ?? null;
              return (
                <div
                  key={team.id}
                  className="bg-surface border border-gray-800 rounded-xl p-5 opacity-60"
                >
                  <p className="font-semibold text-gray-400 truncate">{team.name}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {itemCount === null ? "—" : `${itemCount} item${itemCount !== 1 ? "s" : ""}`}
                  </p>
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-600 flex-shrink-0" />
                    <span className="text-xs text-gray-600">Archived</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="pt-2">
        <NavLink to="/teams" className="text-sm text-accent hover:underline">
          Manage teams →
        </NavLink>
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
    // Role-based permission flags (mirrors DB RLS)
    canAdd    = true,
    canDelete = true,
    canEdit   = true,
    hasTeamSelected = true,
    loadingEquipment = false,
  } = useContext(EquipmentContext);
  const { user, orgId } = useUser();
  const { loadingTeams } = useTeam();

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
      }).then((result) => {
        if (result?.id) pinItem(result.id);
      }).catch(() => {});
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
    searchQuery,      setSearchQuery,
    filterLocation,   setFilterLocation,
    filterStatus,     setFilterStatus,
    filterCategory,   setFilterCategory,
    showBelowReserve, setShowBelowReserve,
    toggleSort, sortArrow,
    visibleEquipment,
    sortedEquipment,      // full list — used for exports
    paginatedEquipment,   // current page slice — used for rendering
    page, setPage,
    pageSize, setPageSize,
    totalCount, totalPages,
    pinItem,
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
    visibleRows: paginatedEquipment,
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
        canAdd={canAdd}
      />

      {/* No team selected — admin/owner sees org overview with team cards.
          Wait for loadingTeams to settle so we don't flash this on initial hydration. */}
      {!hasTeamSelected && !loadingTeams && <OrgOverview />}

      {/* Welcome banner — visible only when team is loaded, org has no equipment, and not dismissed */}
      {hasTeamSelected && !loadingEquipment && visibleEquipment.length === 0 && !welcomeDismissed && (
        <WelcomeBanner
          onAddItem={openAdd}
          onImport={() => {
            setPdfModalMode("import");
            setShowUploadModal(true);
          }}
          onDismiss={dismissWelcome}
        />
      )}

      {hasTeamSelected && <ImportToast
        show={showToast}
        message={importSummaryMessage}
        onDismiss={() => {
          setShowToast(false);
          if (typeof clearImportSummary === "function") clearImportSummary();
        }}
      />}

      {hasTeamSelected && isMobile && (
        <div className="flex items-center justify-start gap-2 -mb-2">
          {canAdd && (
            <button type="button" onClick={openAdd} className="btn-accent">
              <span className="whitespace-nowrap">Add Item</span>
            </button>
          )}

          {canAdd && (
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
          )}

          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="btn-secondary"
          >
            <span className="whitespace-nowrap">Export</span>
          </button>
        </div>
      )}

      {hasTeamSelected && <InventoryCard>
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
          canDelete={canDelete}
        />

        <FilterPresets
          presets={presets}
          activeFilters={activeFilters}
          onApply={applyPreset}
          onSave={savePreset}
          onDelete={deletePreset}
        />

        {/* Empty state — no results after filters, or genuinely empty inventory.
            Suppressed while loading so we don't flash "No inventory" during fetch. */}
        {sortedEquipment.length === 0 && !loadingEquipment && (
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
            canAdd={canAdd}
          />
        )}

        {/* Inventory List — only mounts when there are rows to show */}
        {sortedEquipment.length > 0 && (
          isMobile ? (
            <MobileDashboard
              sortedEquipment={paginatedEquipment}
              bulkMode={bulkMode}
              selectedIds={selectedIds}
              isSelected={isSelected}
              toggleSelected={toggleSelected}
              selectAllVisible={selectAllVisible}
              clearSelection={clearSelection}
              editingId={editingId}
              canEdit={canEdit}
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
              sortedEquipment={paginatedEquipment}
              bulkMode={bulkMode}
              selectedIds={selectedIds}
              isSelected={isSelected}
              toggleSelected={toggleSelected}
              selectAllVisible={selectAllVisible}
              clearSelection={clearSelection}
              toggleSort={toggleSort}
              sortArrow={sortArrow}
              editingId={editingId}
              canEdit={canEdit}
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

        {/* Pagination controls */}
        {sortedEquipment.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-gray-700 text-sm text-gray-400">
            {/* Count + page size selector */}
            <div className="flex items-center gap-3">
              <span>
                {pageSize === 0
                  ? `${totalCount} item${totalCount !== 1 ? "s" : ""}`
                  : `${Math.min((page - 1) * pageSize + 1, totalCount)}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`}
              </span>
              <div className="flex items-center gap-1">
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPageSize(opt.value)}
                    className={`px-2 py-0.5 rounded text-xs transition ${
                      pageSize === opt.value
                        ? "bg-accent/20 text-accent font-semibold"
                        : "hover:text-gray-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Prev / Next */}
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={page === 1 ? "btn-disabled-sm" : "btn-secondary-sm"}
                >
                  ← Prev
                </button>
                <span className="text-xs">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={page === totalPages ? "btn-disabled-sm" : "btn-secondary-sm"}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </InventoryCard>}

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
        onDelete={canDelete ? () => {
          const id = editingId;
          const name = newItem?.name;
          if (!id) return;
          confirmAndDelete(id, name);
        } : undefined}
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
        onDelete={canDelete ? () => {
          const id = editingId;
          const name = newItem?.name;
          if (!id) return;
          confirmAndDelete(id, name);
        } : undefined}
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
