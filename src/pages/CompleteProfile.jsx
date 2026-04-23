import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import useUser from "@/context/useUser";

export default function CompleteProfile({ onSaved }) {
  const navigate = useNavigate();
  const { authUser, profile } = useUser();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setFullName(String(profile?.full_name || ""));
    setPhone(String(profile?.phone || ""));
  }, [profile]);

  const save = async (e) => {
    e.preventDefault();
    setErr("");

    const trimmedName = String(fullName || "").trim();
    const trimmedPhone = String(phone || "").trim();

    if (!trimmedName) {
      setErr("Full name is required.");
      return;
    }

    if (!authUser?.id) {
      setErr("No signed-in user found.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.from("profiles").upsert({
        id: authUser.id,
        email: authUser.email?.trim().toLowerCase() || null,
        full_name: trimmedName,
        phone: trimmedPhone || null,
      });

      if (error) throw error;

      if (typeof onSaved === "function") onSaved();
      navigate("/", { replace: true });
    } catch (e2) {
      if (e2?.name === "AbortError" || e2?.message?.includes("aborted")) {
        setErr("Connection interrupted — please tap Save & Continue again.");
      } else {
        setErr(e2?.message || "Failed to save profile.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="bg-surface rounded-2xl p-6 w-[92%] max-w-md shadow-lg">
        <h1 className="text-2xl font-bold text-accent mb-1">
          Complete your profile
        </h1>
        <p className="text-gray-300 mb-6">
          Add your name now. Phone is optional and can be updated later.
        </p>

        <form onSubmit={save} className="flex flex-col gap-3">
          <div>
            <label className="text-sm text-gray-300">Full name</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              type="text"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="text-sm text-gray-300">Phone (optional)</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              placeholder="(555) 555-5555"
            />
          </div>

          {err ? <div className="text-red-400 text-sm">{err}</div> : null}

          <button
            type="submit"
            disabled={busy}
            className={busy ? "btn-disabled" : "btn-accent"}
          >
            {busy ? "Saving…" : "Save & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
