import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const trimmedName = fullName.trim();
        if (!trimmedName) {
          throw new Error("Full name is required");
        }

        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        const userId = data?.user?.id;
        if (userId) {
          const { error: profileError } = await supabase
            .from("profiles")
            .upsert({
              id: userId,
              email: email.trim().toLowerCase(),
              full_name: trimmedName,
            });
          if (profileError) throw profileError;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (e2) {
      setErr(e2?.message || "Auth failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="bg-surface rounded-2xl p-6 w-[92%] max-w-md shadow-lg">
        <h1 className="text-2xl font-bold text-accent mb-1">GripTrack</h1>
        <p className="text-gray-300 mb-6">
          {mode === "signup" ? "Create an account" : "Sign in"}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <div>
              <label className="text-sm text-gray-300">Full name</label>
              <input
                className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                type="text"
                required
              />
            </div>
          )}
          <div>
            <label className="text-sm text-gray-300">Email</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </div>

          <div>
            <label className="text-sm text-gray-300">Password</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded bg-white text-black"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </div>

          {err ? <div className="text-red-400 text-sm">{err}</div> : null}

          <button
            type="submit"
            disabled={busy}
            className={busy ? "btn-disabled" : "btn-accent"}
          >
            {busy ? "Please wait…" : mode === "signup" ? "Sign up" : "Sign in"}
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setErr("");
              setMode(mode === "signup" ? "signin" : "signup");
            }}
          >
            {mode === "signup"
              ? "Have an account? Sign in"
              : "New here? Create an account"}
          </button>
        </form>
      </div>
    </div>
  );
}
