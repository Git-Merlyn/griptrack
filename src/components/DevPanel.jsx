// src/components/DevPanel.jsx
// Dev-only floating panel for testing permission levels without switching accounts.
// Rendered only when import.meta.env.DEV is true — never ships to production.

import { useState, useContext } from "react";
import useUser from "@/context/useUser";
import useTeam from "@/context/useTeam";
import EquipmentContext from "@/context/EquipmentContext";
import { supabase } from "@/lib/supabaseClient";

const ROLES = [
  { value: null,              label: "Real role" },
  { value: "owner",           label: "Owner" },
  { value: "admin",           label: "Admin" },
  { value: "department_head", label: "Dept Head" },
  { value: "crew",            label: "Crew" },
];

// Realistic grip/electric seed data for dev testing.
// Covers a range of categories, statuses, locations, and quantities.
function buildSeedItems(orgId, teamId) {
  const locations = ["G&E Truck", "Stage A", "Stage B", "Cage", "Unassigned"];
  const now = new Date();
  const rentalStart = "2025-05-01";
  const rentalEnd   = "2025-06-30";

  const items = [
    // ── Grip ─────────────────────────────────────────────────────────────
    { name: "C-Stand 40\"",          category: "Grip",     quantity: 12, status: "Available", location: "G&E Truck",  source: "House" },
    { name: "C-Stand 20\"",          category: "Grip",     quantity: 8,  status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Sandbag 25lb",          category: "Grip",     quantity: 30, status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Sandbag 10lb",          category: "Grip",     quantity: 20, status: "Available", location: "Stage A",    source: "House" },
    { name: "Apple Box Full",        category: "Grip",     quantity: 10, status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Apple Box Half",        category: "Grip",     quantity: 8,  status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Apple Box Quarter",     category: "Grip",     quantity: 6,  status: "Available", location: "Stage B",    source: "House" },
    { name: "Matthews Flag Kit",     category: "Grip",     quantity: 2,  status: "Available", location: "G&E Truck",  source: "Rental", rentalStart, rentalEnd },
    { name: "Scrim Kit 18x24",       category: "Grip",     quantity: 1,  status: "Available", location: "G&E Truck",  source: "Rental", rentalStart, rentalEnd },
    { name: "Mombo Combo Stand",     category: "Grip",     quantity: 4,  status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Turtle Base",          category: "Grip",     quantity: 3,  status: "Available", location: "Cage",       source: "House" },
    { name: "Low Boy Stand",         category: "Grip",     quantity: 4,  status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Grip Head",             category: "Grip",     quantity: 20, status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Cardellini Clamp",      category: "Grip",     quantity: 15, status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Bead Board 4x8",        category: "Grip",     quantity: 6,  status: "Available", location: "Stage A",    source: "House" },
    { name: "Duvetyne 12x12",        category: "Grip",     quantity: 3,  status: "Damaged",   location: "Cage",       source: "House" },
    { name: "Overhead Frame 20x20",  category: "Grip",     quantity: 1,  status: "Out",       location: "Stage B",    source: "Rental", rentalStart, rentalEnd },
    { name: "Silk 20x20",            category: "Grip",     quantity: 1,  status: "Out",       location: "Stage B",    source: "Rental", rentalStart, rentalEnd },

    // ── Electric ──────────────────────────────────────────────────────────
    { name: "ARRI SkyPanel S60-C",   category: "Electric", quantity: 4,  status: "Available", location: "G&E Truck",  source: "Rental", rentalStart, rentalEnd },
    { name: "ARRI SkyPanel S30-C",   category: "Electric", quantity: 6,  status: "Available", location: "G&E Truck",  source: "Rental", rentalStart, rentalEnd },
    { name: "ARRI M18 HMI",          category: "Electric", quantity: 2,  status: "Available", location: "G&E Truck",  source: "Rental", rentalStart, rentalEnd },
    { name: "ARRI M90 HMI",          category: "Electric", quantity: 1,  status: "Out",       location: "Stage A",    source: "Rental", rentalStart, rentalEnd },
    { name: "Kino Flo Diva 401",     category: "Electric", quantity: 4,  status: "Available", location: "G&E Truck",  source: "Rental", rentalStart, rentalEnd },
    { name: "Litepanels Gemini 2x1", category: "Electric", quantity: 3,  status: "Available", location: "Cage",       source: "Rental", rentalStart, rentalEnd },
    { name: "Astera Titan Tube",     category: "Electric", quantity: 8,  status: "Available", location: "G&E Truck",  source: "Rental", rentalStart, rentalEnd },
    { name: "2/0 Banded Cable 100'", category: "Electric", quantity: 10, status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Stingers 25'",          category: "Electric", quantity: 20, status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Stingers 50'",          category: "Electric", quantity: 12, status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Banded Cable 50'",      category: "Electric", quantity: 8,  status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Dimmer Board 12ch",     category: "Electric", quantity: 1,  status: "Available", location: "G&E Truck",  source: "Rental", rentalStart, rentalEnd },
    { name: "Distro Box 200A",       category: "Electric", quantity: 2,  status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Bates to Edison Tail",  category: "Electric", quantity: 10, status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Gel Roll CTO",          category: "Electric", quantity: 3,  status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Gel Roll CTB",          category: "Electric", quantity: 3,  status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Diffusion Roll 250",    category: "Electric", quantity: 2,  status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Diffusion Roll 216",    category: "Electric", quantity: 2,  status: "Available", location: "G&E Truck",  source: "House" },
    { name: "Generator 400A",        category: "Electric", quantity: 1,  status: "Available", location: "Stage A",    source: "Rental", rentalStart, rentalEnd },
  ];

  return items.map((item) => ({
    org_id:      orgId,
    team_id:     teamId,
    name:        item.name,
    category:    item.category,
    quantity:    item.quantity,
    status:      item.status,
    location:    item.location,
    source:      item.source,
    start_date:  item.rentalStart ?? null,
    end_date:    item.rentalEnd   ?? null,
    updated_by:  "dev-seed",
    reserve_min: 0,
  }));
}

export default function DevPanel() {
  const [open, setOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");

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

  const handleSeed = async () => {
    if (!orgId || !activeTeamId) {
      setSeedMsg("⚠ Select a team first");
      return;
    }
    if (!confirm(`Seed ~38 grip/electric items into "${activeTeam?.name}"?`)) return;

    setSeeding(true);
    setSeedMsg("");
    try {
      const rows = buildSeedItems(orgId, activeTeamId);
      const { error } = await supabase.from("equipment_items").insert(rows);
      if (error) throw error;
      setSeedMsg(`✓ ${rows.length} items seeded`);
      window.toast?.success?.(`Seeded ${rows.length} items into ${activeTeam?.name}`);
    } catch (err) {
      console.error("Seed failed", err);
      setSeedMsg(`✗ ${err.message}`);
    } finally {
      setSeeding(false);
    }
  };

  const handleClear = async () => {
    if (!orgId || !activeTeamId) {
      setSeedMsg("⚠ Select a team first");
      return;
    }
    if (!confirm(`Delete ALL items in "${activeTeam?.name}"? This cannot be undone.`)) return;

    setSeeding(true);
    setSeedMsg("");
    try {
      const { error } = await supabase
        .from("equipment_items")
        .delete()
        .eq("org_id", orgId)
        .eq("team_id", activeTeamId);
      if (error) throw error;
      setSeedMsg("✓ Cleared");
      window.toast?.success?.(`Cleared all items from ${activeTeam?.name}`);
    } catch (err) {
      console.error("Clear failed", err);
      setSeedMsg(`✗ ${err.message}`);
    } finally {
      setSeeding(false);
    }
  };

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
            <Row label="Real role"     value={role ?? "—"} />
            <Row label="Override"      value={devRoleOverride ?? "none"} highlight={!!devRoleOverride} />
            <Row label="Org ID"        value={orgId ? orgId.slice(0, 8) + "…" : "—"} />
            <Row label="Assigned team" value={teamId ? teamId.slice(0, 8) + "…" : "none"} />
            <Row label="Active team"   value={activeTeam?.name ?? (activeTeamId ? activeTeamId.slice(0, 8) + "…" : "none")} />
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

          {/* Team list */}
          {teams.length > 0 && (
            <div className="border-t border-gray-700 pt-3">
              <p className="text-gray-400 mb-1">Teams ({teams.length})</p>
              <div className="flex flex-col gap-0.5 max-h-24 overflow-y-auto">
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

          {/* Seed controls */}
          <div className="border-t border-gray-700 pt-3 flex flex-col gap-2">
            <p className="text-gray-400">
              Seed data
              {activeTeam ? <span className="text-yellow-400"> → {activeTeam.name}</span> : <span className="text-gray-600"> (no team)</span>}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSeed}
                disabled={seeding || !activeTeamId}
                className="flex-1 px-2 py-1 rounded border border-green-500/50 text-green-400 hover:bg-green-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {seeding ? "…" : "＋ Seed items"}
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={seeding || !activeTeamId}
                className="flex-1 px-2 py-1 rounded border border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {seeding ? "…" : "✕ Clear all"}
              </button>
            </div>
            {seedMsg && (
              <p className={`text-xs ${seedMsg.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>
                {seedMsg}
              </p>
            )}
          </div>
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
