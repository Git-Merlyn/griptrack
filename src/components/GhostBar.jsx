// Dev-only "ghost" control bar. Renders nothing unless the signed-in user is a
// platform admin (public.platform_admins). Lets a dev point the whole app at
// any org (read-only by default) and, for deep debugging, arm a time-boxed
// write window. All state lives server-side (platform_admin_state); this bar is
// just the control surface. Any change re-bootstraps via a full reload so the
// entire app re-reads through the ghosted org.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function fmtCountdown(ms) {
  if (ms <= 0) return "expired";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function GhostBar() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [orgs, setOrgs] = useState([]);
  const [status, setStatus] = useState(null); // { active_org_id, write_enabled, write_expires_at }
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const { data: admin } = await supabase.rpc("is_platform_admin");
    if (!admin) {
      setIsAdmin(false);
      return;
    }
    setIsAdmin(true);
    const [{ data: st }, { data: orgList }] = await Promise.all([
      supabase.rpc("ghost_status"),
      supabase.rpc("ghost_list_orgs"),
    ]);
    setStatus(Array.isArray(st) ? st[0] : st);
    setOrgs(orgList || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Tick once a second only while a write window is counting down.
  useEffect(() => {
    if (!status?.write_enabled || !status?.write_expires_at) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status?.write_enabled, status?.write_expires_at]);

  if (!isAdmin) return null;

  const activeOrgId = status?.active_org_id || "";
  const writeMsLeft = status?.write_expires_at
    ? new Date(status.write_expires_at).getTime() - now
    : 0;
  const writeArmed = Boolean(status?.write_enabled) && writeMsLeft > 0;

  // Every mutation re-bootstraps the app so all reads follow the new ghost org.
  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      window.location.reload();
    } catch (e) {
      alert(e?.message || "Ghost action failed");
      setBusy(false);
    }
  };

  const onPickOrg = (e) => {
    const org = e.target.value;
    if (!org) run(() => supabase.rpc("ghost_clear"));
    else run(() => supabase.rpc("ghost_set_org", { p_org: org }));
  };

  return (
    <div
      className={`fixed bottom-0 inset-x-0 z-[9999] px-3 py-1.5 text-xs flex items-center gap-3 border-t ${
        writeArmed
          ? "bg-red-950/95 border-red-500 text-red-100"
          : activeOrgId
            ? "bg-amber-950/95 border-amber-500 text-amber-100"
            : "bg-zinc-900/95 border-zinc-700 text-zinc-300"
      }`}
    >
      <span className="font-bold tracking-wide">
        👻 DEV{activeOrgId ? (writeArmed ? " · WRITE" : " · read-only") : ""}
      </span>

      <select
        className="bg-black/40 border border-white/20 rounded px-2 py-0.5 text-inherit max-w-[240px]"
        value={activeOrgId}
        onChange={onPickOrg}
        disabled={busy}
      >
        <option value="">— your own org —</option>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} ({o.members}m · {o.equipment} items)
          </option>
        ))}
      </select>

      {activeOrgId ? (
        writeArmed ? (
          <>
            <span className="font-mono">write {fmtCountdown(writeMsLeft)}</span>
            <button
              className="underline"
              disabled={busy}
              onClick={() => run(() => supabase.rpc("ghost_disarm_write"))}
            >
              disarm
            </button>
          </>
        ) : (
          <button
            className="underline"
            disabled={busy}
            onClick={() => run(() => supabase.rpc("ghost_arm_write", { p_minutes: 30 }))}
          >
            arm write (30m)
          </button>
        )
      ) : null}

      {activeOrgId ? (
        <button
          className="ml-auto underline opacity-80"
          disabled={busy}
          onClick={() => run(() => supabase.rpc("ghost_clear"))}
        >
          exit ghost
        </button>
      ) : null}
    </div>
  );
}
