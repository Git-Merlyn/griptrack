import { useState } from "react";
import useProduction from "@/context/useProduction";
import useUser from "@/context/useUser";

// Format a date string (YYYY-MM-DD) into a readable label
function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[Number(m) - 1]} ${Number(day)}, ${y}`;
}

// ── Create Production form ─────────────────────────────────────────────────
function CreateProductionForm({ onCreated, onCancel }) {
  const { createProduction } = useProduction();
  const { authUser } = useUser();

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    const trimmed = name.trim();
    if (!trimmed) { setErr("Name is required"); return; }

    setBusy(true);
    try {
      const prod = await createProduction({
        name: trimmed,
        startDate: startDate || null,
        endDate: endDate || null,
        createdBy: authUser?.email || null,
      });
      onCreated(prod);
    } catch (e2) {
      setErr(e2?.message || "Failed to create production");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 bg-surface border border-gray-700 rounded-xl p-5">
      <h3 className="text-base font-semibold text-text">New Production</h3>

      <div>
        <label className="text-sm text-gray-400">Production name *</label>
        <input
          className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
          value={name}
          onChange={(e) => { setErr(""); setName(e.target.value); }}
          placeholder="e.g. Season 2 — Unit A"
          autoFocus
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-gray-400">Start date</label>
          <input
            type="date"
            className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm text-gray-400">Wrap date</label>
          <input
            type="date"
            className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      {err && <p className="text-red-400 text-sm">{err}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={busy ? "btn-disabled" : "btn-accent"}>
          {busy ? "Creating…" : "Create Production"}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Single production row ──────────────────────────────────────────────────
function ProductionRow({ production, isActive, onSwitch, onArchive, onDelete, canManage }) {
  const [confirming, setConfirming] = useState(false); // delete confirm
  const [busy, setBusy] = useState(false);

  const isArchived = production.status === "archived";

  const handleArchive = async () => {
    setBusy(true);
    try { await onArchive(production.id); }
    catch { /* toast handled upstream */ }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    setBusy(true);
    try { await onDelete(production.id); }
    catch { /* toast handled upstream */ }
    finally { setBusy(false); setConfirming(false); }
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
        isActive
          ? "border-accent bg-accent/10"
          : "border-gray-700 bg-surface"
      }`}
    >
      {/* Status dot */}
      <span
        className={`flex-shrink-0 w-2 h-2 rounded-full ${
          isArchived ? "bg-gray-500" : "bg-green-400"
        }`}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-semibold truncate ${isActive ? "text-accent" : "text-text"}`}>
            {production.name}
          </span>
          {isActive && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold">
              Active
            </span>
          )}
          {isArchived && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400">
              Archived
            </span>
          )}
        </div>
        {(production.start_date || production.end_date) && (
          <p className="text-xs text-gray-400 mt-0.5">
            {fmtDate(production.start_date)}
            {production.end_date ? ` → ${fmtDate(production.end_date)}` : ""}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {!isArchived && !isActive && (
          <button
            type="button"
            className="btn-secondary-sm"
            onClick={() => onSwitch(production.id)}
          >
            Switch to
          </button>
        )}
        {isActive && (
          <button
            type="button"
            className="btn-secondary-sm"
            onClick={() => onSwitch(null)}
          >
            Back to General
          </button>
        )}

        {canManage && !isArchived && (
          <button
            type="button"
            className="btn-secondary-sm text-warning border-warning/30 hover:bg-warning/10"
            onClick={handleArchive}
            disabled={busy}
            title="Archive this production"
          >
            Archive
          </button>
        )}

        {canManage && (
          <button
            type="button"
            className={`btn-secondary-sm text-danger border-danger/30 hover:bg-danger/10 ${confirming ? "bg-danger/20" : ""}`}
            onClick={handleDelete}
            disabled={busy}
            title={confirming ? "Click again to confirm delete" : "Delete production"}
          >
            {confirming ? "Confirm?" : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Productions Page ───────────────────────────────────────────────────────
export default function ProductionsPage() {
  const {
    productions,
    activeProductionId,
    loadingProductions,
    setActiveProductionId,
    archiveProduction,
    deleteProduction,
  } = useProduction();

  const { role } = useUser();
  const canManage = role === "owner" || role === "admin";

  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleCreated = (prod) => {
    setShowCreateForm(false);
    // Automatically switch to the new production
    setActiveProductionId(prod.id);
    window.toast?.success?.(`Switched to "${prod.name}"`);
  };

  const handleSwitch = (id) => {
    setActiveProductionId(id);
    const prod = productions.find((p) => p.id === id);
    if (id) {
      window.toast?.success?.(`Switched to "${prod?.name}"`);
    } else {
      window.toast?.success?.("Switched to General inventory");
    }
  };

  const handleArchive = async (id) => {
    await archiveProduction(id);
    window.toast?.success?.("Production archived");
  };

  const handleDelete = async (id) => {
    await deleteProduction(id);
    window.toast?.success?.("Production deleted");
  };

  const activeProductions = productions.filter((p) => p.status === "active");
  const archivedProductions = productions.filter((p) => p.status === "archived");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-accent">Productions</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Each production has its own isolated equipment list.
          </p>
        </div>

        {canManage && !showCreateForm && (
          <button
            type="button"
            className="btn-accent"
            onClick={() => setShowCreateForm(true)}
          >
            + New Production
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreateForm && (
        <CreateProductionForm
          onCreated={handleCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* General pool row */}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-2">General</h2>
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors cursor-pointer ${
            !activeProductionId
              ? "border-accent bg-accent/10"
              : "border-gray-700 bg-surface hover:border-gray-600"
          }`}
          onClick={() => handleSwitch(null)}
        >
          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-400" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-semibold ${!activeProductionId ? "text-accent" : "text-text"}`}>
                General Inventory
              </span>
              {!activeProductionId && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold">
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Shared equipment not tied to any production
            </p>
          </div>
          {activeProductionId && (
            <button
              type="button"
              className="btn-secondary-sm flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); handleSwitch(null); }}
            >
              Switch to
            </button>
          )}
        </div>
      </div>

      {/* Active productions */}
      {loadingProductions ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <>
          {activeProductions.length > 0 && (
            <div>
              <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-2">
                Active Productions
              </h2>
              <div className="flex flex-col gap-2">
                {activeProductions.map((p) => (
                  <ProductionRow
                    key={p.id}
                    production={p}
                    isActive={activeProductionId === p.id}
                    onSwitch={handleSwitch}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    canManage={canManage}
                  />
                ))}
              </div>
            </div>
          )}

          {archivedProductions.length > 0 && (
            <div>
              <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-2">
                Archived
              </h2>
              <div className="flex flex-col gap-2">
                {archivedProductions.map((p) => (
                  <ProductionRow
                    key={p.id}
                    production={p}
                    isActive={activeProductionId === p.id}
                    onSwitch={handleSwitch}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    canManage={canManage}
                  />
                ))}
              </div>
            </div>
          )}

          {productions.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg mb-1">No productions yet</p>
              {canManage && (
                <p className="text-sm">
                  Create your first production to start tracking its equipment separately.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
