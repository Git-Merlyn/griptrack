// src/pages/TeamsPage.jsx
// Teams management page.
// - admin/owner: create, switch, archive, delete teams
// - department_head: see and manage their locked team
// - crew: read-only view of their assigned team

import { useState, useEffect } from "react";
import useTeam from "@/context/useTeam";
import useUser from "@/context/useUser";
import { supabase } from "@/lib/supabaseClient";

// ── Create Team form ──────────────────────────────────────────────────────────
function CreateTeamForm({ onCreated, onCancel }) {
  const { createTeam } = useTeam();

  const [name, setName] = useState("");
  const [maxSeats, setMaxSeats] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    const trimmed = name.trim();
    if (!trimmed) { setErr("Team name is required"); return; }

    setBusy(true);
    try {
      const team = await createTeam({ name: trimmed, maxSeats: Number(maxSeats) || 10 });
      onCreated(team);
    } catch (e2) {
      setErr(e2?.message || "Failed to create team");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 bg-surface border border-text/10 rounded-xl p-5">
      <h3 className="text-base font-semibold text-text">New Team</h3>

      <div>
        <label className="text-sm text-text/70">Team name *</label>
        <input
          className="w-full mt-1 px-3 py-2 rounded bg-background text-text border border-text/20 focus:outline-none focus:ring-2 focus:ring-accent/40"
          value={name}
          onChange={(e) => { setErr(""); setName(e.target.value); }}
          placeholder="e.g. Grip, Electric"
          autoFocus
          required
        />
      </div>

      <div>
        <label className="text-sm text-text/70">Max seats</label>
        <input
          type="number"
          min={1}
          max={500}
          className="w-full mt-1 px-3 py-2 rounded bg-background text-text border border-text/20 focus:outline-none focus:ring-2 focus:ring-accent/40"
          value={maxSeats}
          onChange={(e) => setMaxSeats(e.target.value)}
        />
        <p className="text-xs text-text/50 mt-1">
          Maximum number of crew members the department head can invite.
        </p>
      </div>

      {err && <p className="text-red-400 text-sm">{err}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={busy ? "btn-disabled" : "btn-accent"}>
          {busy ? "Creating…" : "Create Team"}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Team member list for a single team ───────────────────────────────────────
function TeamMemberList({ teamId }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    setLoading(true);

    const load = async () => {
      const { data: rows, error } = await supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("team_id", teamId);

      if (error || !rows?.length) {
        setMembers([]);
        setLoading(false);
        return;
      }

      // Fetch profiles separately — PostgREST can't auto-join through auth.users
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", rows.map((r) => r.user_id));

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      setMembers(rows.map((r) => ({ ...r, profile: profileMap.get(r.user_id) ?? null })));
      setLoading(false);
    };

    load();
  }, [teamId]);

  if (loading) return <p className="text-xs text-text/50 mt-2">Loading members…</p>;
  if (members.length === 0) return <p className="text-xs text-text/50 mt-2">No members assigned yet.</p>;

  return (
    <div className="mt-2 flex flex-col gap-1">
      {members.map((m) => {
        const name = m.profile?.full_name || m.profile?.email || m.user_id;
        const roleBadge =
          m.role === "department_head"
            ? "Dept Head"
            : m.role === "crew"
            ? "Crew"
            : m.role;
        return (
          <div key={m.user_id} className="flex items-center gap-2 text-sm">
            <span className="text-text truncate">{name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-text/10 text-text/70 flex-shrink-0">
              {roleBadge}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Single team card ──────────────────────────────────────────────────────────
function TeamCard({ team, isActive, onSwitch, onArchive, onDelete, canManage, canSwitch, expanded, onToggleExpand }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const isArchived = team.status === "archived";

  const handleArchive = async () => {
    setBusy(true);
    try { await onArchive(team.id); }
    catch { /* errors handled upstream */ }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    setBusy(true);
    try { await onDelete(team.id); }
    catch { /* errors handled upstream */ }
    finally { setBusy(false); setConfirming(false); }
  };

  return (
    <div
      className={`flex flex-col rounded-xl border transition-colors ${
        isActive ? "border-accent bg-accent/10" : "border-text/10 bg-surface"
      }`}
    >
      {/* Card header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Status dot */}
        <span
          className={`flex-shrink-0 w-2 h-2 rounded-full ${
            isArchived ? "bg-gray-500" : "bg-green-400"
          }`}
        />

        {/* Name + badges */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold truncate ${isActive ? "text-accent" : "text-text"}`}>
              {team.name}
            </span>
            {isActive && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold">
                Active
              </span>
            )}
            {isArchived && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-text/10 text-text/60">
                Archived
              </span>
            )}
          </div>
          <p className="text-xs text-text/50 mt-0.5">
            Max {team.max_seats} seat{team.max_seats === 1 ? "" : "s"}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {canSwitch && !isArchived && !isActive && (
            <button type="button" className="btn-secondary-sm" onClick={() => onSwitch(team.id)}>
              Switch to
            </button>
          )}
          {canSwitch && isActive && (
            <button type="button" className="btn-secondary-sm" onClick={() => onSwitch(null)}>
              Deselect
            </button>
          )}

          {canManage && !isArchived && (
            <button
              type="button"
              className="btn-secondary-sm text-warning border-warning/30 hover:bg-warning/10"
              onClick={handleArchive}
              disabled={busy}
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
            >
              {confirming ? "Confirm?" : "Delete"}
            </button>
          )}
        </div>
      </div>

      {/* Expanded: member list */}
      {expanded && (
        <div className="border-t border-text/10 px-4 py-3">
          <p className="text-xs uppercase tracking-widest text-text/40 mb-1">Members</p>
          <TeamMemberList teamId={team.id} />
        </div>
      )}
    </div>
  );
}

// ── TeamsPage ─────────────────────────────────────────────────────────────────
export default function TeamsPage() {
  const {
    teams,
    activeTeamId,
    loadingTeams,
    setActiveTeamId,
    archiveTeam,
    deleteTeam,
    canSwitchTeams,
  } = useTeam();

  const { role, teamId: assignedTeamId, devRoleOverride } = useUser();

  const isCoordinator = role === "admin" || role === "owner";
  const isDeptHead = role === "department_head";

  // In dev mode with a role override, the tester's account has no real
  // assignedTeamId (owners don't have one), so fall back to activeTeamId
  // to simulate a crew member assigned to the currently selected team.
  const effectiveAssignedTeamId =
    import.meta.env.DEV && devRoleOverride && !assignedTeamId
      ? activeTeamId
      : assignedTeamId;

  const [showCreateForm, setShowCreateForm] = useState(false);
  // Auto-expand for crew/dept_head so the member list is immediately visible
  const [expandedTeamId, setExpandedTeamId] = useState(
    !isCoordinator ? effectiveAssignedTeamId : null
  );

  const handleCreated = (team) => {
    setShowCreateForm(false);
    setActiveTeamId(team.id);
    window.toast?.success?.(`Created and switched to "${team.name}"`);
  };

  const handleSwitch = (id) => {
    setActiveTeamId(id);
    const team = teams.find((t) => t.id === id);
    if (id) {
      window.toast?.success?.(`Switched to "${team?.name}"`);
    } else {
      window.toast?.success?.("Deselected — viewing all inventory");
    }
  };

  const handleArchive = async (id) => {
    await archiveTeam(id);
    window.toast?.success?.("Team archived");
  };

  const handleDelete = async (id) => {
    await deleteTeam(id);
    window.toast?.success?.("Team deleted");
  };

  const toggleExpand = (id) => {
    setExpandedTeamId((prev) => (prev === id ? null : id));
  };

  const activeTeams = teams.filter((t) => t.status !== "archived");
  const archivedTeams = teams.filter((t) => t.status === "archived");

  // Crew / dept_head: only show their assigned team
  if (!isCoordinator) {
    const myTeam = teams.find((t) => t.id === effectiveAssignedTeamId);

    return (
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-accent">My Team</h1>
          <p className="text-sm text-text/60 mt-0.5">
            Your assigned department for this production.
          </p>
        </div>

        {loadingTeams ? (
          <p className="text-text/50 text-sm">Loading…</p>
        ) : myTeam ? (
          <TeamCard
            team={myTeam}
            isActive={true}
            onSwitch={() => {}}
            onArchive={() => {}}
            onDelete={() => {}}
            canManage={isDeptHead}
            canSwitch={false}
            expanded={expandedTeamId === myTeam.id}
            onToggleExpand={() => toggleExpand(myTeam.id)}
          />
        ) : (
          <div className="text-center py-12 text-text/50">
            <p className="text-lg mb-1 text-text">No team assigned</p>
            <p className="text-sm">Ask your coordinator to assign you to a team.</p>
          </div>
        )}
      </div>
    );
  }

  // Admin / owner: full management view
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-accent">Teams</h1>
          <p className="text-sm text-text/60 mt-0.5">
            Departments (e.g. Grip, Electric) with their own equipment and crew.
          </p>
        </div>

        {!showCreateForm && (
          <button
            type="button"
            className="btn-accent"
            onClick={() => setShowCreateForm(true)}
          >
            + New Team
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreateForm && (
        <CreateTeamForm
          onCreated={handleCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Team list */}
      {loadingTeams ? (
        <p className="text-text/50 text-sm">Loading…</p>
      ) : (
        <>
          {activeTeams.length > 0 && (
            <div>
              <h2 className="text-xs uppercase tracking-widest text-text/40 mb-2">Active</h2>
              <div className="flex flex-col gap-2">
                {activeTeams.map((t) => (
                  <TeamCard
                    key={t.id}
                    team={t}
                    isActive={activeTeamId === t.id}
                    onSwitch={handleSwitch}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    canManage={true}
                    canSwitch={canSwitchTeams}
                    expanded={expandedTeamId === t.id}
                    onToggleExpand={() => toggleExpand(t.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {archivedTeams.length > 0 && (
            <div>
              <h2 className="text-xs uppercase tracking-widest text-text/40 mb-2">Archived</h2>
              <div className="flex flex-col gap-2">
                {archivedTeams.map((t) => (
                  <TeamCard
                    key={t.id}
                    team={t}
                    isActive={activeTeamId === t.id}
                    onSwitch={handleSwitch}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    canManage={true}
                    canSwitch={canSwitchTeams}
                    expanded={expandedTeamId === t.id}
                    onToggleExpand={() => toggleExpand(t.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {teams.length === 0 && (
            <div className="text-center py-12 text-text/50">
              <p className="text-lg mb-1">No teams yet</p>
              <p className="text-sm">
                Create your first team to start separating equipment by department.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
