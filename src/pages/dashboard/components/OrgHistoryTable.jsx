import React, { useContext, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import useUser from "@/context/useUser";
import EquipmentContext from "@/context/EquipmentContext";
import useOrgAuditLog from "../hooks/useOrgAuditLog";
import { getActionMeta } from "../utils/actionMeta";
import { fetchAndDownloadAuditCsv } from "../utils/auditExport";

const RANGE_OPTIONS = [
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

// Explicit filter chips per the request (Move / Add / Delete) plus All, which
// shows every action type including merge/update/damage.
const ACTION_FILTERS = [
  { value: "all", label: "All" },
  { value: "create", label: "Add" },
  { value: "move", label: "Move" },
  { value: "delete", label: "Delete" },
];

const formatTimestamp = (ts) => {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
};

// Resolve a display name for the item a row refers to: prefer the item's
// current name (nameMap), then fall back to whatever snapshot the row itself
// carried at write time (covers renamed/deleted items), else a placeholder.
const resolveItemName = (row, nameMap) => {
  if (nameMap[row.equipment_id]) return nameMap[row.equipment_id];
  const snapshot = row.snapshot_after || row.snapshot_before;
  if (snapshot?.name) return snapshot.name;
  return "(deleted item)";
};

const ActionBadge = ({ action }) => {
  const meta = getActionMeta(action);
  return (
    <span
      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${meta.className}`}
    >
      {meta.label}
    </span>
  );
};

export default function OrgHistoryTable() {
  const { orgId } = useUser();
  const { equipment } = useContext(EquipmentContext) || {};

  const [range, setRange] = useState("30");
  const [actionFilter, setActionFilter] = useState("all");
  const [exporting, setExporting] = useState(false);

  const days = range === "all" ? null : Number(range);
  const { logs, total, truncated, loading, error, refresh } = useOrgAuditLog({
    orgId,
    days,
    action: actionFilter,
  });

  const nameMap = useMemo(() => {
    const map = {};
    for (const item of equipment || []) {
      map[String(item.id)] = item.name || "";
    }
    return map;
  }, [equipment]);

  const handleExport = async () => {
    if (!orgId) return;
    setExporting(true);
    try {
      const count = await fetchAndDownloadAuditCsv(supabase, orgId, nameMap);
      window.toast?.success?.(`Exported ${count} event${count !== 1 ? "s" : ""}`);
    } catch (e) {
      console.error("[OrgHistoryTable] export failed", e);
      window.toast?.error?.(e?.message || "Failed to export history");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="bg-surface border border-text/10 rounded-xl px-5">
      <div className="flex items-start justify-between gap-4 py-4 border-b border-text/10">
        <div>
          <h2 className="text-sm font-semibold text-text">Full History</h2>
          <p className="text-xs text-text/50 mt-0.5">
            Every action across your entire inventory — additions, moves, edits, and deletions.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="btn-secondary-sm shrink-0"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-text/10">
        <div className="flex gap-1.5">
          {ACTION_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setActionFilter(f.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                actionFilter === f.value
                  ? "bg-accent/80 text-slate-900"
                  : "bg-text/10 text-text/70 hover:text-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="bg-background border border-text/20 rounded-lg px-2.5 py-1 text-xs text-text"
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Body */}
      <div className="py-3">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-text/60 text-sm">
            Loading history…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-10 text-sm">
            <span className="text-danger">{error}</span>
            <button type="button" onClick={refresh} className="btn-secondary-sm">
              Retry
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-text/50 text-sm">
            No matching events in this range.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text/50 text-xs">
                  <th className="pb-2 pr-3 font-medium">Date / Time</th>
                  <th className="pb-2 pr-3 font-medium">Action</th>
                  <th className="pb-2 pr-3 font-medium">Item</th>
                  <th className="pb-2 pr-3 font-medium">Actor</th>
                  <th className="pb-2 pr-3 font-medium">From → To</th>
                  <th className="pb-2 font-medium">Qty Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-text/5">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 pr-3 text-text/70 whitespace-nowrap">
                      {formatTimestamp(log.at)}
                    </td>
                    <td className="py-2 pr-3">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="py-2 pr-3 text-text max-w-[220px] truncate">
                      {resolveItemName(log, nameMap)}
                    </td>
                    <td className="py-2 pr-3 text-text/70">{log.actor || "—"}</td>
                    <td className="py-2 pr-3 text-text/70 whitespace-nowrap">
                      {log.from_location || log.to_location
                        ? `${log.from_location || "—"} → ${log.to_location || "—"}`
                        : "—"}
                    </td>
                    <td className="py-2 text-text/70">
                      {log.delta_qty != null
                        ? log.delta_qty > 0
                          ? `+${log.delta_qty}`
                          : log.delta_qty
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && !error && logs.length > 0 && (
        <div className="pb-4 text-xs text-text/40">
          {truncated
            ? `Showing the most recent ${logs.length} of ${total.toLocaleString()} matching events — narrow the range, or use "Export CSV" above for the full set.`
            : `${total} event${total !== 1 ? "s" : ""}`}
        </div>
      )}
    </section>
  );
}
