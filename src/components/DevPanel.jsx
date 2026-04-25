// src/components/DevPanel.jsx
// Dev-only floating panel for testing permission levels without switching accounts.
// Rendered only when import.meta.env.DEV is true — never ships to production.

import { useState } from "react";
import useUser from "@/context/useUser";
import useTeam from "@/context/useTeam";
import { useContext } from "react";
import EquipmentContext from "@/context/EquipmentContext";

const ROLES = [
  { value: null,              label: "Real role" },
  { value: "owner",           label: "Owner" },
  { value: "admin",           label: "Admin" },
  { value: "department_head", label: "Dept Head" },
  { value: "crew",            label: "Crew" },
];

export default function DevPanel() {
  const [open, setOpen] = useState(false);

  const {
    role,
    devRoleOverride,
    setDevRoleOverride,
    orgId,
    teamId,
    isCoordinator,
    isDepartmentHead,
    canSwitchTeams,
  } = useUser();

  const { activeTeamId, activeTeam, teams } = useTeam();
  const { hasTeamSelected, canAdd, canDelete, canEdit, canMove, loadingEquipment } =
    useContext(EquipmentContext);

  const flag = (v) => (
    <span className={v ? "text-green-400" : "text-red-400"}>{v ? "✓" : "✗"}</span>
  );

  return (
    <div className="fixed bottom-4 left-4 z-[9999] font-mono text-xs">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="bg-yellow-400 text-black font-bold px-3 py-1.5 rounded-lg shadow-lg hover:bg-yellow-300 transition"
        title="Toggle DevPanel"
      >
        {open ? "✕ Dev" : "🛠 Dev"}
      </button>

      {open && (
        <div className="mt-2 w-64 bg-gray-900 border border-yellow-400/50 rounded-xl shadow-2xl p-4 flex flex-col gap-3">
          <p className="text-yellow-400 font-bold text-sm">DevPanel</p>

          {/* Role override */}
          <div>
            <p className="text-gray-400 mb-1">Role override</p>
            <div className="flex flex-wrap gap-1">
              {ROLES.map((r) => (
                <button
                  key={String(r.value)}
                  type="button"
                  onClick={() => setDevRoleOverride(r.value)}
                  className={`px-2 py-0.5 rounded text-xs border transition ${
                    devRoleOverride === r.value
                      ? "bg-yellow-400 text-black border-yellow-400 font-bold"
                      : "bg-transparent text-gray-300 border-gray-600 hover:border-gray-400"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Current state */}
          <div className="flex flex-col gap-1 border-t border-gray-700 pt-3">
            <p className="text-gray-400 mb-0.5">Current state</p>
            <Row label="Real role"   value={role ?? "—"} />
            <Row label="Override"    value={devRoleOverride ?? "none"} highlight={!!devRoleOverride} />
            <Row label="Org ID"      value={orgId ? orgId.slice(0, 8) + "…" : "—"} />
            <Row label="Assigned team" value={teamId ? teamId.slice(0, 8) + "…" : "none"} />
            <Row label="Active team" value={activeTeam?.name ?? (activeTeamId ? activeTeamId.slice(0,8)+"…" : "none")} />
          </div>

          {/* Permission flags */}
          <div className="flex flex-col gap-1 border-t border-gray-700 pt-3">
            <p className="text-gray-400 mb-0.5">Permissions</p>
            <FlagRow label="isCoordinator"   value={isCoordinator} />
            <FlagRow label="isDeptHead"       value={isDepartmentHead} />
            <FlagRow label="canSwitchTeams"   value={canSwitchTeams} />
            <FlagRow label="hasTeamSelected"  value={hasTeamSelected} />
            <FlagRow label="canAdd"           value={canAdd} />
            <FlagRow label="canEdit"          value={canEdit} />
            <FlagRow label="canDelete"        value={canDelete} />
            <FlagRow label="canMove"          value={canMove} />
            <FlagRow label="loadingEquipment" value={loadingEquipment} />
          </div>

          {/* Team switcher */}
          {teams.length > 0 && (
            <div className="border-t border-gray-700 pt-3">
              <p className="text-gray-400 mb-1">Teams ({teams.length})</p>
              <div className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
                {teams.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-1">
                    <span className={`truncate ${t.id === activeTeamId ? "text-yellow-400" : "text-gray-300"}`}>
                      {t.id === activeTeamId ? "▶ " : ""}{t.name}
                    </span>
                    <span className={`text-xs px-1 rounded ${t.status === "archived" ? "text-gray-600" : "text-green-400"}`}>
                      {t.status === "archived" ? "archived" : "active"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight = false }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className={highlight ? "text-yellow-400 font-bold" : "text-gray-200"}>{value}</span>
    </div>
  );
}

function FlagRow({ label, value }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className={value ? "text-green-400" : "text-red-400"}>{value ? "✓" : "✗"}</span>
    </div>
  );
}
