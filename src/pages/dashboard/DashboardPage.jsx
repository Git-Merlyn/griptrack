import React, { useContext, useState, useEffect, useMemo, lazy, Suspense } from "react";
import { NavLink } from "react-router-dom";

// Lazy: ImportFileModal pulls in all of pdfjs-dist (~½ MB minified), and it
// only renders when the user starts an import. Keeping it out of the main
// chunk roughly halves the initial bundle.
const ImportFileModal = lazy(() => import("@/components/ImportFileModal"));
import EquipmentContext from "@/context/EquipmentContext";
import Modal from "@/components/Modal";
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
import { lowStockToCsv, downloadCsv, belowReserveRows } from "./utils/export";
import useBulkSelection from "./hooks/useBulkSelection";
import { bulkDeleteOutcome } from "./utils/bulkDelete";
import useInventoryView from "./hooks/useInventoryView";
import useEditFlow from "./hooks/useEditFlow";
import useLocation from "./hooks/useLocation";
import useExport from "./hooks/useExport";
import { matchFileItemsToEquipment } from "./utils/pdfSelect";
import { validateItemForm } from "./utils/itemValidation";
import { buildImportRows } from "./utils/importRows";
import { fetchTeamItemCounts } from "./utils/teamCounts";
import { planAllows, planLimitMessage, proFeatureMessage } from "@/lib/plan";
import { bulkMoveToLocation } from "./utils/bulkMove";
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

      {/* hidden md:flex: CSS-level guard so buttons never flash on mobile
          during the brief window before isMobile state resolves in JS.
          hideActions={isMobile} is the JS-driven equivalent once it runs. */}
      {!hideActions && (
        <div className="hidden md:flex flex-wrap items-center justify-end gap-2">
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
      <div className="bg-surface border border-text/15 text-text px-4 py-3 rounded shadow-md flex items-start gap-3 max-w-sm">
        <div className="flex-1">
          <div className="font-semibold text-accent">Import Complete</div>
          <div className="text-sm text-text">{message}</div>
        </div>

        <button
          onClick={onDismiss}
          className="text-text/50 hover:text-text ml-2 transition"
          aria-label="dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

const FilterSelect = ({ value, onChange, placeholder, options, label }) => (
  <div className="relative">
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full px-2 py-2 rounded-lg border shadow-xs focus:outline-hidden focus:ring-2 focus:ring-accent/50 focus:border-accent transition appearance-none pr-6 text-sm ${
        value
          ? "bg-accent/10 border-accent text-accent font-medium"
          : "bg-surface border-text/20 text-text/60"
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
  bulkLocations,
  onAddNewLocation,

  onApplyBulkLocation,
  onBulkDelete,
  canDelete = true,
}) => {
  const hasActiveFilters = filterLocation || filterStatus || filterCategory || showBelowReserve;

  return (
    <div className="flex flex-col gap-3 mb-4">
      {/* Row 1: Search */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label="Search inventory by name"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by Name"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-surface text-text border border-text/20 placeholder:text-text/40 shadow-xs focus:outline-hidden focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
        />
        {searchQuery.trim() ? (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="btn-secondary-sm shrink-0"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* Row 2: Action buttons — horizontal on all screen sizes */}
      <div className="flex flex-wrap items-center gap-2">
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
          <span className="text-sm text-text/70">
            Selected: <span className="font-semibold">{selectedCount}</span>
          </span>
        )}

        <button
          type="button"
          onClick={() => setShowBelowReserve((v) => !v)}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
            showBelowReserve
              ? "bg-danger/10 border-danger text-danger"
              : "bg-surface border-text/20 text-text/60 hover:border-text/40"
          }`}
        >
          Below Reserve
        </button>
      </div>

      {/* Row 3: Dropdown filters — 3-column grid keeps all three on one row at any mobile width */}
      <div className="grid grid-cols-3 gap-2">
        <FilterSelect
          value={filterLocation}
          onChange={setFilterLocation}
          placeholder="All Locations"
          label="Filter by location"
          options={allLocations}
        />
        <FilterSelect
          value={filterStatus}
          onChange={setFilterStatus}
          placeholder="All Statuses"
          label="Filter by status"
          options={statusOptions}
        />
        <FilterSelect
          value={filterCategory}
          onChange={setFilterCategory}
          placeholder="All Categories"
          label="Filter by category"
          options={categoryOptions}
        />
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => {
            setFilterLocation("");
            setFilterStatus("");
            setFilterCategory("");
            setShowBelowReserve(false);
          }}
          className="text-xs text-text/50 hover:text-text underline underline-offset-2 transition self-start"
        >
          Clear all filters
        </button>
      )}

      {/* Row 4: Bulk action controls (only in bulk mode) */}
      {bulkMode && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Location for selected items"
            value={bulkLocation}
            onChange={(e) => {
              if (e.target.value === "__add_new__") onAddNewLocation();
              else setBulkLocation(e.target.value);
            }}
            className="px-3 py-2 rounded bg-white text-black min-w-[220px]"
          >
            <option value="">Set location for selected...</option>
            {(bulkLocations ?? allLocations).map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
            {typeof onAddNewLocation === "function" && (
              <option value="__add_new__">➕ Add new location...</option>
            )}
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
          className="flex items-center gap-1 bg-text/5 border border-text/10 rounded-full pl-3 pr-1 py-1"
        >
          <button
            type="button"
            onClick={() => onApply(p.filters)}
            className="text-xs text-text/70 hover:text-accent transition"
          >
            {p.name}
          </button>
          <button
            type="button"
            onClick={() => onDelete(p.id)}
            aria-label={`Delete preset "${p.name}"`}
            className="text-text/40 hover:text-danger transition text-xs px-1"
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
          className="text-xs text-text/50 hover:text-accent underline underline-offset-2 transition"
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
            className="text-xs px-2 py-1 rounded bg-surface border border-text/20 text-text placeholder:text-text/40 focus:outline-hidden focus:border-accent w-36"
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
            className="text-xs text-text/50 hover:text-text transition"
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
// Rendered only for roles that can add items (canAdd). The Locations and
// Staff steps link to admin-only pages, so they appear only when
// showAdminSteps (owner/admin). Steps are numbered by what is shown.
const WelcomeBanner = ({ onAddItem, onImport, onDismiss, showAdminSteps = false }) => {
  const linkClass = "text-accent underline underline-offset-2";
  const steps = [];
  if (showAdminSteps) {
    steps.push({
      key: "locations",
      body: (
        <>
          <NavLink to="/locations" className={linkClass}>
            Add your locations
          </NavLink>{" "}
          — trucks, stages, or anywhere gear lives.
        </>
      ),
    });
  }
  steps.push({
    key: "items",
    body: (
      <>
        <button type="button" onClick={onImport} className={linkClass}>
          Import a rental PDF
        </button>{" "}
        or{" "}
        <button type="button" onClick={onAddItem} className={linkClass}>
          add items manually
        </button>
        .
      </>
    ),
  });
  if (showAdminSteps) {
    steps.push({
      key: "staff",
      body: (
        <>
          <NavLink to="/staff" className={linkClass}>
            Invite your crew
          </NavLink>{" "}
          to see and request gear in real time.
        </>
      ),
    });
  }

  return (
    <div className="bg-accent/10 border border-accent/30 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-accent mb-1">
            Welcome to GripTrack
          </h3>
          <p className="text-sm text-text">
            {steps.length > 1
              ? "Get your inventory set up in three steps."
              : "Get your team's inventory started."}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-text/60 hover:text-text text-xs shrink-0 mt-1 transition"
          aria-label="Dismiss welcome banner"
        >
          Dismiss
        </button>
      </div>

      <ol className="flex flex-col gap-3 text-sm">
        {steps.map((step, i) => (
          <li key={step.key} className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <span className="text-text">{step.body}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

// Shown inside the inventory card when no rows are visible.
const EmptyState = ({ hasActiveFilters, onClearFilters, onAddItem, onImport, canAdd = true }) => {
  if (hasActiveFilters) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-text/70 text-sm">
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
        className="text-text/30"
      >
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
      <div>
        <p className="text-text font-medium mb-1">No inventory yet</p>
        <p className="text-text/60 text-sm max-w-xs">
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

// ── NoTeamAssigned ────────────────────────────────────────────────────────────
// Teams on, no active team, and the user cannot choose one (crew/dept head
// whose membership has no team_id). OrgOverview's team cards would do
// nothing for them, because setActiveTeamId ignores non-switchers.
const NoTeamAssigned = () => (
  <div className="flex flex-col items-center gap-1 py-20 text-center text-text/60">
    <p className="text-lg text-text">No team assigned</p>
    <p className="text-sm">
      You haven&apos;t been assigned to a team yet. Ask your coordinator to add you to one.
    </p>
  </div>
);

// ── OrgOverview ───────────────────────────────────────────────────────────────
// Shown to admin/owner when no team is active. Displays all teams as cards
// so they can jump straight into one without going via the Teams page.
const OrgOverview = () => {
  const { teams, loadingTeams, setActiveTeamId } = useTeam();
  const { orgName } = useUser();

  // Per-team item counts — fetched once on mount
  const [counts, setCounts] = useState({});

  useEffect(() => {
    if (!teams.length) return undefined;
    let cancelled = false;
    fetchTeamItemCounts(supabase, teams.map((t) => t.id))
      .then((c) => {
        if (!cancelled) setCounts(c);
      })
      .catch((e) => console.error("[OrgOverview] team counts failed", e));
    return () => {
      cancelled = true;
    };
  }, [teams]);

  const activeTeams   = teams.filter((t) => t.status !== "archived");
  const archivedTeams = teams.filter((t) => t.status === "archived");

  if (loadingTeams) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-text/50">
        <span className="animate-pulse text-sm">Loading teams…</span>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="1.5"
             strokeLinecap="round" strokeLinejoin="round" className="text-text/30">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <div>
          <p className="text-text font-medium mb-1">No teams yet</p>
          <p className="text-text/60 text-sm max-w-xs">
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
        <p className="text-sm text-text/60 mt-0.5">
          Select a team to view and manage its inventory.
        </p>
      </div>

      {/* Active teams grid */}
      {activeTeams.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-text/40 mb-3">Teams</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeTeams.map((team) => {
              const itemCount = counts[team.id] ?? null;
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setActiveTeamId(team.id)}
                  className="text-left bg-surface border border-text/10 hover:border-accent/60 hover:bg-accent/5 rounded-xl p-5 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-text group-hover:text-accent truncate transition-colors">
                        {team.name}
                      </p>
                      <p className="text-xs text-text/50 mt-0.5">
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
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                    <span className="text-xs text-text/50">Active</span>
                    <span className="text-xs text-text/40 ml-auto">
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
          <p className="text-xs uppercase tracking-widest text-text/40 mb-3">Archived</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {archivedTeams.map((team) => {
              const itemCount = counts[team.id] ?? null;
              return (
                <div
                  key={team.id}
                  className="bg-surface border border-text/10 rounded-xl p-5 opacity-60"
                >
                  <p className="font-semibold text-text/70 truncate">{team.name}</p>
                  <p className="text-xs text-text/50 mt-0.5">
                    {itemCount === null ? "—" : `${itemCount} item${itemCount !== 1 ? "s" : ""}`}
                  </p>
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-text/30 shrink-0" />
                    <span className="text-xs text-text/50">Archived</span>
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
    deleteEquipmentMany,
    updateEquipment,
    moveEquipment,
    addMultipleItems,
    registerLocation,
    locations: locationRows,
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
  const { profile, authUser, orgId, effectivePlan, isCoordinator } = useUser();
  // Pro features on this page: the audit-history export and PDF export (audit M9).
  const canUsePro = planAllows(effectivePlan, "pro");
  // Best-effort human-readable identity for equipment_audit.actor — used
  // wherever this page writes an equipment change (create/edit/bulk-update/move).
  const actorName = profile?.full_name || profile?.email || authUser?.email || "Unknown";
  const { loadingTeams, canChooseTeam } = useTeam();

  const { allLocations } = useLocation({
    contextLocations,
    equipment,
  });

  // Move / bulk "Apply location" destinations. Crew may only move to an
  // existing active location (WP15 Decision 3 = B; move_equipment enforces the
  // same rule server-side, WP05 option C), so crew get the Locations-table list
  // only. Roles that may create locations (canAdd = owner/admin/department_head,
  // the locations INSERT policies) also see names still used by items.
  const destinationLocations = useMemo(
    () =>
      canAdd
        ? allLocations
        : [...(contextLocations || [])].sort((a, b) => a.localeCompare(b)),
    [canAdd, allLocations, contextLocations],
  );

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

  // Inventory view state (search, filter, sort, pagination, pinning).
  // Declared here — above useEditFlow — so filterCategory/filterLocation
  // are in scope when passed as defaults to useEditFlow below.
  const {
    searchQuery,      setSearchQuery,
    filterLocation,   setFilterLocation,
    filterStatus,     setFilterStatus,
    filterCategory,   setFilterCategory,
    showBelowReserve, setShowBelowReserve,
    toggleSort, sortArrow, sortKey, sortDir,
    visibleEquipment,
    sortedEquipment,
    paginatedEquipment,
    page, setPage,
    pageSize, setPageSize,
    totalCount, totalPages,
    pinItem,
  } = useInventoryView({ equipment });

  // Edit/Add modal state and logic handled by useEditFlow below
  const [movingItem, setMovingItem] = useState(null);
  const [moveData, setMoveData] = useState({ qty: 1, newLocation: "" });
  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Bulk delete confirmation modal
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState(null); // { ids: string[] }

  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [addingLocation, setAddingLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [isAddingLocationTo, setIsAddingLocationTo] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [importInProgress, setImportInProgress] = useState(false);

  // PDF modal mode: 'import' adds items, 'select' selects existing items for bulk actions
  const [pdfModalMode, setPdfModalMode] = useState("import");

  // Toast for import summary
  const [showToast, setShowToast] = useState(false);

  const [showSummaryModal, setShowSummaryModal] = useState(false);
  // True while the Add/Edit modal's save request is in flight
  const [savingEdit, setSavingEdit] = useState(false);
  const [exportingHistory, setExportingHistory] = useState(false);

  // Welcome banner — shown once per org when it has no equipment; the
  // dismissal is remembered per org (one browser can hold several orgs).
  const welcomeKey = `${WELCOME_DISMISSED_KEY}_${orgId || "none"}`;
  const [dismissedWelcomeKeys, setDismissedWelcomeKeys] = useState(() => new Set());
  const welcomeDismissedStored = useMemo(() => {
    try {
      return localStorage.getItem(welcomeKey) === "true";
    } catch {
      return false; // storage blocked: show the banner, allow dismissing for this session
    }
  }, [welcomeKey]);
  const welcomeDismissed =
    welcomeDismissedStored || dismissedWelcomeKeys.has(welcomeKey);

  const dismissWelcome = () => {
    try {
      localStorage.setItem(welcomeKey, "true");
    } catch {
      // storage blocked: remembered for this session only
    }
    setDismissedWelcomeKeys((prev) => new Set(prev).add(welcomeKey));
  };

  // Mobile layout
  const [isMobile, setIsMobile] = useState(false);
  // Edit modal state handled by useEditFlow below

  // Mobile "Details" modal
  const [showMobileDetailsModal, setShowMobileDetailsModal] = useState(false);
  const [mobileDetailsItem, setMobileDetailsItem] = useState(null);

  // Pre-fill category and location when the user has those filters active.
  // Memoized: a fresh object literal here re-triggers useEditFlow's reset
  // effect on every render, which loops setState and starves router
  // navigation away from the dashboard.
  const editDefaults = useMemo(
    () => ({
      category: filterCategory || "",
      location: filterLocation || "",
    }),
    [filterCategory, filterLocation],
  );

  // Edit flow modal state and handlers (centralized)
  const {
    editingId,
    newItem,
    setNewItem,
    showMobileEditModal,
    showDesktopEditModal,
    openAdd,
    openEditForItem,
    cancelEdit,
    setField,
  } = useEditFlow({
    isMobile,
    onBeforeOpen: () => {
      // Ensure other overlays don't conflict
      setShowMobileDetailsModal(false);
      setMobileDetailsItem(null);
    },
    defaults: editDefaults,
  });

  useEffect(() => {
    // 767.98px matches the Sidebar and avoids overlapping Tailwind's md: at 768px
    const mq = window.matchMedia("(max-width: 767.98px)");
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

  // Saves the Add/Edit form. Returns true when saved; false keeps the modal
  // open with the user's input. Validation problems are toasted here;
  // updateEquipment/addEquipment toast their own DB errors.
  const handleAddOrUpdate = async () => {
    const check = validateItemForm(newItem);
    if (!check.ok) {
      window.toast?.error?.(check.error);
      return false;
    }

    const payload = {
      ...newItem,
      quantity: check.quantity,
      reserveMin: check.reserveMin,
      updatedBy: actorName,
    };

    setSavingEdit(true);
    try {
      if (editingId !== null) {
        await updateEquipment(editingId, payload);
      } else {
        const result = await addEquipment(payload);
        if (result?.id) pinItem(result.id);
      }
      return true;
    } catch (e) {
      console.error("Save item failed", e);
      return false;
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmAndDelete = (id, name) => {
    if (!id) return;
    setDeleteTarget({ id, name: name || "" });
  };

  const performDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleteBusy(true);
    try {
      // silent: this handler shows the toasts (avoids a duplicate pair)
      await deleteEquipment(deleteTarget.id, { silent: true });
      window.toast?.success?.("Item deleted");
      // Deleted from inside the Edit modal: close it too
      if (String(deleteTarget.id) === String(editingId)) cancelEdit();
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
      // One request per 100 ids; rows RLS refused or that errored stay
      // selected so a retry targets exactly those.
      const result = await deleteEquipmentMany(ids);
      const outcome = bulkDeleteOutcome(ids, result);
      setSelectedIds(outcome.pruneSelection);
      setBulkDeleteTarget(null);
      window.toast?.[outcome.toastType]?.(outcome.message);
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

  // Bulk "Apply location": each selected row is moved whole through the same
  // move_equipment RPC as a single move (merges at the destination, no other
  // field rewritten). Failed rows stay selected so the user can retry them.
  const handleBulkSetLocation = async () => {
    if (selectedIds.length === 0) return;
    if (!bulkLocation) return;

    const { moved, skipped, failed } = await bulkMoveToLocation({
      ids: selectedIds,
      equipment,
      location: bulkLocation,
      actor: actorName,
      moveEquipment,
    });

    if (failed.length === 0) {
      window.toast?.success?.(
        `Moved ${moved} item(s) to ${bulkLocation}` +
          (skipped ? ` (${skipped} already there)` : ""),
      );
      setBulkLocation("");
      clearSelection();
      return;
    }

    failed.forEach((f) => console.error("Bulk move failed", f));
    window.toast?.error?.(
      `Moved ${moved} of ${moved + failed.length}. Not moved: ` +
        failed.map((f) => `${f.name} (${f.message})`).join(", "),
    );
    setSelectedIds(failed.map((f) => f.id));
  };

  // Export full org audit log as a CSV for wrap reports.
  const handleExportHistory = async () => {
    if (!orgId) return;
    if (!canUsePro) {
      setShowExportModal(false);
      window.toast?.error?.(proFeatureMessage("Audit history export"));
      return;
    }
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
    if (!movingItem) return;
    // MoveModal disables Confirm in these cases; this covers any other path.
    const qtyToMove = Number(moveData.qty);
    if (!Number.isInteger(qtyToMove) || qtyToMove <= 0) {
      window.toast?.error?.("Enter a quantity of at least 1.");
      return;
    }
    if (!moveData.newLocation) {
      window.toast?.error?.("Choose a destination location.");
      return;
    }
    try {
      await moveEquipment(movingItem.id, qtyToMove, moveData.newLocation, actorName);
      setMovingItem(null);
      setMoveData({ qty: 1, newLocation: "" });
    } catch (e) {
      console.error(e);
      window.toast?.error?.(e?.message || "Move failed");
    }
  };

  const handleAddNewLocation = async () => {
    const trimmed = newLocationName.trim();
    if (!trimmed || addingLocation) return;

    // WP15 Decision 3 = B: a new location is always saved to the org's shared
    // locations table; there are no device-local locations. Only canAdd roles
    // (owner/admin/department_head, the same rule as the locations INSERT
    // policies) are offered "Add new location"; this guard covers any other path.
    if (!canAdd) {
      window.toast?.error?.("Only owners, admins and department heads can add locations.");
      return;
    }

    const lower = trimmed.toLowerCase();
    // Already an active location: just select it (with its stored spelling)
    let chosen =
      (contextLocations || []).find((l) => String(l).toLowerCase() === lower) ?? null;

    if (!chosen) {
      const archived = (locationRows || []).some(
        (l) => l?.is_active === false && String(l.name).toLowerCase() === lower,
      );
      if (archived) {
        // registerLocation refuses existing names; say why instead of failing silently
        window.toast?.error?.(
          `"${trimmed}" is an archived location. Reactivate it on the Locations page.`,
        );
        return;
      }
      setAddingLocation(true);
      let saveError = null;
      try {
        // throwOnError (Step 42e): a refused insert throws its PostgREST error
        // instead of returning null, so the toast can say why.
        const row = await registerLocation(trimmed, { throwOnError: true });
        chosen = row?.name ?? null;
      } catch (err) {
        saveError = err;
      } finally {
        setAddingLocation(false);
      }
      if (!chosen) {
        // Insert refused or failed. WP09 Option A: the Free plan's 1-active-
        // location limit arrives as a P0001 plan-limit error; WP09's
        // planLimitMessage (src/lib/plan.js) turns it into the neutral server
        // text plus the web upgrade call-to-action and returns null for any
        // other error, which then shows the server's own message (WP09
        // hand-off: planLimitMessage(error) ?? error.message). A null return
        // with no error (name raced in, no org) gets the generic text. Keep
        // the dialog open with the typed name so the user can retry or cancel.
        window.toast?.error?.(
          planLimitMessage(saveError) ??
            (saveError?.message ||
              "Couldn't save the location. Check your connection and try again."),
        );
        return;
      }
    }

    // Route the location into the appropriate field depending on caller
    if (isAddingLocationTo === "new") {
      setNewItem((prev) => ({ ...prev, location: chosen }));
    } else if (isAddingLocationTo === "move") {
      setMoveData((prev) => ({ ...prev, newLocation: chosen }));
    } else if (isAddingLocationTo === "bulk") {
      setBulkLocation(chosen);
    }

    setNewLocationName("");
    setIsAddingLocationTo(null);
    setShowAddLocationModal(false);
  };

  // Import: one batched insert for every row (one request, one realtime
  // event, one accurate "N items added" toast from addMultipleItems). Rows
  // with a blank location are kept and stored as "Unassigned". Throws on
  // failure so ImportFileModal keeps the parsed rows on screen for a retry.
  const handlePdfUpload = async (items) => {
    const { rows, skipped } = buildImportRows(items, actorName);
    if (skipped > 0) {
      window.toast?.info?.(
        `${skipped} row${skipped !== 1 ? "s" : ""} skipped (no name or quantity 0).`,
      );
    }
    if (rows.length === 0) return;
    await addMultipleItems(rows);
  };

  // useInventoryView is declared earlier in the component (above useEditFlow)
  // so that filterCategory/filterLocation are in scope for useEditFlow defaults.

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
    // Count from the data: the BOM shares the header line, so counting CSV
    // lines was off by one (a single below-reserve item exported nothing).
    const count = belowReserveRows(equipment).length;
    if (count === 0) {
      window.toast?.info?.("No items are currently below their reserve minimum.");
      return;
    }
    downloadCsv(lowStockToCsv(equipment), "griptrack-low-stock");
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

  // Escape is handled per dialog by useDialog: it closes only the top-most
  // dialog and runs that dialog's own cancel handler (EditModal → cancelEdit,
  // which also clears editingId).

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
    deselectVisible,
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
      {!hasTeamSelected && !loadingTeams && (canChooseTeam ? <OrgOverview /> : <NoTeamAssigned />)}

      {/* Welcome banner — visible only when team is loaded, org has no equipment, and not dismissed */}
      {canAdd && hasTeamSelected && !loadingEquipment && visibleEquipment.length === 0 && !welcomeDismissed && (
        <WelcomeBanner
          showAdminSteps={isCoordinator}
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
        <div className="flex flex-wrap items-center gap-2 -mb-2">
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

          <button
            type="button"
            onClick={() => setShowSummaryModal(true)}
            className="btn-secondary"
          >
            <span className="whitespace-nowrap">Summary</span>
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
          bulkLocations={destinationLocations}
          // Crew cannot create locations (WP15 Decision 3 = B): no handler, no option
          onAddNewLocation={
            canAdd
              ? () => {
                  setIsAddingLocationTo("bulk");
                  setShowAddLocationModal(true);
                }
              : undefined
          }
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
              deselectVisible={deselectVisible}
              clearSelection={clearSelection}
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
              isSelected={isSelected}
              toggleSelected={toggleSelected}
              selectAllVisible={selectAllVisible}
              deselectVisible={deselectVisible}
              toggleSort={toggleSort}
              sortArrow={sortArrow}
              sortKey={sortKey}
              sortDir={sortDir}
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
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-text/10 text-sm text-text/60">
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
                        : "hover:text-text"
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

      {/* Add/Edit modal — one instance for mobile and desktop */}
      <EditModal
        isOpen={isMobile ? showMobileEditModal : showDesktopEditModal}
        title={editingId ? "Edit Item" : "Add Item"}
        editingId={editingId}
        newItem={newItem}
        saving={savingEdit}
        onChangeField={setField}
        allLocations={allLocations}
        statusOptions={statusOptions}
        onRequestAddLocation={
          canAdd
            ? () => {
                setIsAddingLocationTo("new");
                setShowAddLocationModal(true);
              }
            : undefined
        }
        onCancel={cancelEdit}
        onSave={async () => {
          if (savingEdit) return;
          if (await handleAddOrUpdate()) cancelEdit();
        }}
        // Delete only exists for a saved item (never in Add mode)
        onDelete={canDelete && editingId ? confirmAndDelete : undefined}
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
        allLocations={destinationLocations}
        // Crew cannot create locations (WP15 Decision 3 = B): no handler, no option
        onRequestAddLocation={
          canAdd
            ? () => {
                setIsAddingLocationTo("move");
                setShowAddLocationModal(true);
              }
            : undefined
        }
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
        busy={addingLocation}
      />

      {/* Import File Modal — lazy chunk starts loading on first open */}
      {showUploadModal && (
        <Suspense
          fallback={
            <Modal
              isOpen
              onClose={() => setShowUploadModal(false)}
              title="Import"
            >
              <p className="text-sm text-text/70">Loading importer…</p>
            </Modal>
          }
        >
          <ImportFileModal
            isOpen={showUploadModal}
            onClose={() => {
              setShowUploadModal(false);
              setPdfModalMode("import");
            }}
            // Returns the promise: the modal awaits it before closing
            onUpload={(items) =>
              pdfModalMode === "select"
                ? handlePdfSelect(items)
                : handlePdfUpload(items)
            }
            mode={pdfModalMode}
            setImportInProgress={setImportInProgress}
            allLocations={allLocations}
          />
        </Suspense>
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
          if (exportFormat === "pdf" && !canUsePro) {
            // The dialog stays open so the user can switch to CSV.
            window.toast?.error?.(proFeatureMessage("PDF export"));
            return;
          }
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
