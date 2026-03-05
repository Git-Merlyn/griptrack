// src/pages/OrgSetup.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import useUser from "@/context/useUser";

export default function OrgSetup({ onDone }) {
  const navigate = useNavigate();
  const { orgId } = useUser();

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!orgId) return;
      const { data, error } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .single();

      if (!error && data?.name) setName(data.name);
    };
    load();
  }, [orgId]);

  const save = async (e) => {
    e.preventDefault();
    setErr("");

    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Company name is required.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name: trimmed })
        .eq("id", orgId);

      if (error) throw error;

      if (typeof onDone === "function") onDone(trimmed);
      navigate("/", { replace: true });
    } catch (e2) {
      setErr(e2?.message || "Failed to save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="bg-surface rounded-2xl p-6 w-[92%] max-w-md shadow-lg">
        <h1 className="text-2xl font-bold text-accent mb-1">
          Organization setup
        </h1>
        <p className="text-gray-300 mb-6">Set your company name to continue.</p>

        <form onSubmit={save} className="flex flex-col gap-3">
          <div>
            <label className="text-sm text-gray-300">Company name</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Polaris Grip"
              autoFocus
            />
          </div>

          {err ? <div className="text-red-400 text-sm">{err}</div> : null}

          <button
            type="submit"
            disabled={busy || !orgId}
            className={busy || !orgId ? "btn-disabled" : "btn-accent"}
          >
            {busy ? "Saving…" : "Save & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
