// src/pages/Staff.jsx
// Admin/owner view for managing org members — roles and team assignments.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import useUser from "@/context/useUser";
import useTeam from "@/context/useTeam";

// Role options available when inviting or changing an existing member.
// Owners are not assignable — there is exactly one per org.
const ASSIGNABLE_ROLES = [
  { value: "crew",             label: "Crew" },
  { value: "department_head",  label: "Dept Head" },
  { value: "admin",            label: "Admin" },
];

function roleBadgeClass(role) {
  switch (role) {
    case "owner":           return "bg-accent/20 text-accent";
    case "admin":           return "bg-blue-500/20 text-blue-300";
    case "department_head": return "bg-purple-500/20 text-purple-300";
    case "crew":            return "bg-gray-600 text-gray-300";
    default:                return "bg-gray-700 text-gray-400";
  }
}

function roleLabel(role) {
  switch (role) {
    case "owner":           return "Owner";
    case "admin":           return "Admin";
    case "department_head": return "Dept Head";
    case "crew":            return "Crew";
    default:                return role;
  }
}

// ── Member row ────────────────────────────────────────────────────────────────
function MemberRow({ member, teams, onChangeRole, onChangeTeam, onRemove, isSelf }) {
  const [rolebusy, setRoleBusy] = useState(false);
  const [teamBusy, setTeamBusy] = useState(false);
  const isOwner = member.role === "owner";

  const handleRoleChange = async (e) => {
    const newRole = e.target.value;
    if (newRole === member.role) return;
    setRoleBusy(true);
    try { await onChangeRole(member.user_id, newRole); }
    finally { setRoleBusy(false); }
  };

  const handleTeamChange = async (e) => {
    const newTeamId = e.target.value || null;
    if (newTeamId === (member.team_id ?? "")) return;
    setTeamBusy(true);
    try { await onChangeTeam(member.user_id, newTeamId); }
    finally { setTeamBusy(false); }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-700 bg-surface">
      {/* Identity */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-text truncate">
            {member.profile?.full_name || "Unnamed user"}
          </span>
          {isSelf && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400">
              You
            </span>
          )}
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${roleBadgeClass(member.role)}`}>
            {roleLabel(member.role)}
          </span>
        </div>
        <div className="text-xs text-gray-400 mt-0.5 truncate">
          {member.profile?.email || member.user_id}
        </div>
      </div>

      {/* Team selector */}
      {!isOwner && !isSelf && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={member.team_id ?? ""}
            onChange={handleTeamChange}
            disabled={teamBusy}
            className="px-2 py-1.5 rounded bg-white text-black text-sm min-w-[130px]"
          >
            <option value="">No team</option>
            {teams
              .filter((t) => t.status !== "archived")
              .map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
          </select>

          {/* Role selector */}
          <select
            value={member.role}
            onChange={handleRoleChange}
            disabled={rolebusy}
            className="px-2 py-1.5 rounded bg-white text-black text-sm"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          <button
            type="button"
            className="btn-secondary-sm text-danger border-danger/30 hover:bg-danger/10"
            onClick={() => onRemove(member.user_id, member.profile?.full_name)}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

// ── Staff Page ────────────────────────────────────────────────────────────────
export default function Staff() {
  const { orgId, role, authUser } = useUser();
  const { teams, loadingTeams } = useTeam();

  const [members, setMembers]           = useState([]);
  const [invites, setInvites]           = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const [email, setEmail]               = useState("");
  const [inviteRole, setInviteRole]     = useState("crew");
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [inviting, setInviting]         = useState(false);

  const [error, setError]               = useState("");
  const [success, setSuccess]           = useState("");
  const [generatedLink, setGeneratedLink] = useState("");

  const isAdmin = role === "owner" || role === "admin";

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoadingMembers(true);
    setError("");

    // Load members with team_id
    const { data: m, error: membersErr } = await supabase
      .from("organization_members")
      .select("org_id, user_id, role, status, created_at, team_id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });

    if (membersErr) {
      setError(membersErr.message || "Failed to load members");
      setLoadingMembers(false);
      return;
    }

    // Fetch profiles for all member user IDs
    const userIds = (m ?? []).map((r) => r.user_id).filter(Boolean);
    let profileMap = new Map();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);
      profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    }

    setMembers(
      (m ?? []).map((row) => ({ ...row, profile: profileMap.get(row.user_id) ?? null }))
    );

    // Pending invites
    const { data: i, error: invitesErr } = await supabase
      .from("org_invites")
      .select("*")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!invitesErr) setInvites(i ?? []);

    setLoadingMembers(false);
  }, [orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sendInvite = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setGeneratedLink("");

    if (!email.trim()) { setError("Email is required"); return; }

    setInviting(true);
    const { data, error: inviteErr } = await supabase.functions.invoke("invite-staff", {
      body: { email: email.trim(), orgId, role: inviteRole, teamId: inviteTeamId || null },
    });
    setInviting(false);

    if (inviteErr) {
      setError(data?.error || inviteErr.message || "Invite failed");
      return;
    }

    if (data?.alreadyRegistered && data?.generatedLink) {
      setSuccess("User already exists — share this sign-in link so they can join.");
      setGeneratedLink(data.generatedLink);
    } else {
      setSuccess("Invite sent.");
    }

    setEmail("");
    await loadData();
  };

  const handleChangeRole = async (userId, newRole) => {
    setError("");
    setSuccess("");
    const { error: err } = await supabase
      .from("organization_members")
      .update({ role: newRole })
      .eq("org_id", orgId)
      .eq("user_id", userId);

    if (err) { setError(err.message || "Failed to update role"); return; }
    setSuccess("Role updated.");
    await loadData();
  };

  const handleChangeTeam = async (userId, newTeamId) => {
    setError("");
    setSuccess("");
    const { error: err } = await supabase
      .from("organization_members")
      .update({ team_id: newTeamId })
      .eq("org_id", orgId)
      .eq("user_id", userId);

    if (err) { setError(err.message || "Failed to update team"); return; }
    setSuccess("Team updated.");
    await loadData();
  };

  const handleRemove = async (userId, name) => {
    if (userId === authUser?.id) {
      setError("You cannot remove your own account.");
      return;
    }
    if (!confirm(`Remove ${name || "this member"} from the org?`)) return;

    setError("");
    setSuccess("");
    const { data: deleted, error: err } = await supabase
      .from("organization_members")
      .delete()
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .select("user_id");

    if (err || !deleted?.length) {
      setError(err?.message || "Failed to remove member.");
      return;
    }
    setSuccess("Member removed.");
    await loadData();
  };

  // Group members by team for a cleaner view
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const membersByTeam = members.reduce((acc, m) => {
    const key = m.team_id ?? "__none__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  // Build ordered section list: teams with members first, unassigned last
  const teamSections = [
    ...teams
      .filter((t) => t.status !== "archived" && membersByTeam[t.id]?.length > 0)
      .map((t) => ({ id: t.id, label: t.name })),
    ...(membersByTeam["__none__"]?.length > 0
      ? [{ id: "__none__", label: "No team assigned" }]
      : []),
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6 text-text">
      <h1 className="text-2xl font-bold text-accent">Staff</h1>

      {/* ── Invite form ── */}
      {isAdmin && (
        <div className="bg-surface border border-gray-700 rounded-xl p-5">
          <h2 className="text-base font-semibold text-text mb-4">Invite member</h2>
          <form onSubmit={sendInvite} className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                className="flex-1 px-3 py-2 rounded bg-white text-black"
                placeholder="Email address"
                value={email}
                onChange={(e) => { setError(""); setEmail(e.target.value); }}
                required
              />

              <select
                className="px-3 py-2 rounded bg-white text-black"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>

              <select
                className="px-3 py-2 rounded bg-white text-black"
                value={inviteTeamId}
                onChange={(e) => setInviteTeamId(e.target.value)}
                disabled={loadingTeams}
              >
                <option value="">No team</option>
                {teams
                  .filter((t) => t.status !== "archived")
                  .map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={inviting}
                className={inviting ? "btn-disabled" : "btn-accent"}
              >
                {inviting ? "Sending…" : "Send Invite"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Feedback ── */}
      {error   && <div className="text-red-400 text-sm">{error}</div>}
      {success && <div className="text-green-400 text-sm">{success}</div>}
      {generatedLink && (
        <div className="bg-surface border border-gray-700 rounded-xl p-4">
          <p className="text-sm text-gray-300 mb-2">Share this sign-in link with the existing user:</p>
          <a href={generatedLink} target="_blank" rel="noreferrer"
             className="text-accent underline underline-offset-2 break-all text-sm">
            {generatedLink}
          </a>
        </div>
      )}

      {/* ── Members grouped by team ── */}
      <div className="flex flex-col gap-6">
        {loadingMembers ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : teamSections.length === 0 ? (
          <p className="text-gray-500 text-sm">No members yet.</p>
        ) : (
          teamSections.map(({ id, label }) => (
            <div key={id}>
              <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-2">
                {label}
              </h2>
              <div className="flex flex-col gap-2">
                {(membersByTeam[id] ?? []).map((m) => (
                  <MemberRow
                    key={m.user_id}
                    member={m}
                    teams={teams}
                    onChangeRole={handleChangeRole}
                    onChangeTeam={handleChangeTeam}
                    onRemove={handleRemove}
                    isSelf={m.user_id === authUser?.id}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Pending invites ── */}
      {invites.length > 0 && (
        <div>
          <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-2">
            Pending invites
          </h2>
          <div className="flex flex-col gap-2">
            {invites.map((inv) => (
              <div key={inv.id}
                   className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-700 bg-surface">
                <div>
                  <span className="text-sm text-text">{inv.email}</span>
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-semibold ${roleBadgeClass(inv.role)}`}>
                    {roleLabel(inv.role)}
                  </span>
                </div>
                <span className="text-xs text-gray-500">Pending</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
