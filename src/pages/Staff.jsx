import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import useUser from "@/context/useUser";

export default function Staff() {
  const { orgId, role } = useUser();

  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = role === "owner" || role === "admin";

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const { data: m, error: membersError } = await supabase
      .from("organization_members")
      .select("org_id,user_id,role,status,created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });

    if (membersError) {
      setError(membersError.message || "Failed to load staff members");
      setMembers([]);
      setInvites([]);
      return;
    }

    const userIds = (m || []).map((row) => row.user_id).filter(Boolean);

    let profileMap = new Map();
    if (userIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id,email,full_name,phone")
        .in("id", userIds);

      if (profilesError) {
        setError(profilesError.message || "Failed to load user profiles");
      } else {
        profileMap = new Map((profilesData || []).map((p) => [p.id, p]));
      }
    }

    const mergedMembers = (m || []).map((row) => ({
      ...row,
      profile: profileMap.get(row.user_id) || null,
    }));

    const { data: i, error: invitesError } = await supabase
      .from("org_invites")
      .select("*")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (invitesError) {
      setError(invitesError.message || "Failed to load pending invites");
      setInvites([]);
    } else {
      setInvites(i || []);
    }

    setMembers(mergedMembers);
  }, [orgId]);

  useEffect(() => {
    setError("");
    loadData();
  }, [loadData]);

  const sendInvite = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email required");
      return;
    }

    setLoading(true);

    const { error } = await supabase.functions.invoke("invite-staff", {
      body: {
        email,
        orgId,
        role: inviteRole,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setEmail("");
    await loadData();
  };

  const removeMember = async (userId) => {
    if (!confirm("Remove this member?")) return;

    await supabase
      .from("organization_members")
      .delete()
      .eq("org_id", orgId)
      .eq("user_id", userId);

    loadData();
  };

  const changeRole = async (userId, newRole) => {
    await supabase
      .from("organization_members")
      .update({ role: newRole })
      .eq("org_id", orgId)
      .eq("user_id", userId);

    loadData();
  };

  return (
    <div className="p-6 text-gray-200">
      <h1 className="text-2xl font-bold mb-6">Staff</h1>

      {isAdmin && (
        <form onSubmit={sendInvite} className="mb-8 flex gap-3 items-center">
          <input
            className="px-3 py-2 rounded text-black"
            placeholder="Email address"
            value={email}
            onChange={(e) => {
              setError("");
              setEmail(e.target.value);
            }}
          />

          <select
            className="px-3 py-2 rounded text-black"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>

          <button className="px-4 py-2 bg-blue-500 rounded" disabled={loading}>
            {loading ? "Sending..." : "Invite"}
          </button>
        </form>
      )}

      {error && <div className="text-red-400 mb-4">{error}</div>}

      <h2 className="text-xl mb-2">Members</h2>

      <div className="space-y-2 mb-8">
        {members.map((m) => (
          <div
            key={m.user_id}
            className="flex items-center justify-between bg-gray-800 p-3 rounded"
          >
            <div>
              <div className="text-sm">
                {m.profile?.full_name || "Unnamed user"}
              </div>
              <div className="text-xs text-gray-400">
                {m.profile?.email || m.user_id}
              </div>
              <div className="text-xs text-gray-500">{m.role}</div>
            </div>

            {isAdmin && (
              <div className="flex gap-2">
                <button
                  className="text-xs bg-gray-600 px-2 py-1 rounded"
                  onClick={() =>
                    changeRole(
                      m.user_id,
                      m.role === "admin" ? "member" : "admin",
                    )
                  }
                >
                  {m.role === "admin" ? "Make Member" : "Make Admin"}
                </button>

                <button
                  className="text-xs bg-red-600 px-2 py-1 rounded"
                  onClick={() => removeMember(m.user_id)}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <h2 className="text-xl mb-2">Pending Invites</h2>

      <div className="space-y-2">
        {invites.map((i) => (
          <div
            key={i.id}
            className="flex justify-between bg-gray-800 p-3 rounded"
          >
            <div>
              <div className="text-sm">{i.email}</div>
              <div className="text-xs text-gray-400">{i.role}</div>
            </div>
          </div>
        ))}

        {invites.length === 0 && (
          <div className="text-sm text-gray-400">No pending invites</div>
        )}
      </div>
    </div>
  );
}
