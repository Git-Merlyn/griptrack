// src/lib/deleteRows.js
import { supabase } from "@/lib/supabaseClient";

// Ids per request: 100 UUIDs keep the `?id=in.(...)` URL near 3.7 KB, well
// under proxy URL limits.
const CHUNK_SIZE = 100;

/**
 * Delete rows by id and report what actually happened to each id.
 *
 * PostgREST answers an RLS-filtered DELETE with 2xx and ZERO rows — "no error"
 * does not mean "deleted". So we ask for the deleted ids back (.select("id"))
 * and re-read any id that did not come back:
 *   deleted — removed by this call
 *   gone    — not removed by us and no longer visible (already deleted elsewhere)
 *   denied  — still there: RLS refused the delete for the caller's role
 *   failed  — its request errored; `error` holds the first such error
 *
 * Never throws for request errors — check `error` / `failed`.
 */
export async function deleteByIds(table, ids) {
  const wanted = [
    ...new Set((ids ?? []).filter((id) => id != null && id !== "").map(String)),
  ];
  const out = { deleted: [], gone: [], denied: [], failed: [], error: null };

  for (let i = 0; i < wanted.length; i += CHUNK_SIZE) {
    const chunk = wanted.slice(i, i + CHUNK_SIZE);
    const deletedHere = new Set();
    try {
      const { data, error } = await supabase
        .from(table)
        .delete()
        .in("id", chunk)
        .select("id");
      if (error) throw error;

      for (const row of data ?? []) deletedHere.add(String(row.id));
      out.deleted.push(...chunk.filter((id) => deletedHere.has(id)));

      const missing = chunk.filter((id) => !deletedHere.has(id));
      if (missing.length === 0) continue;

      const { data: still, error: readErr } = await supabase
        .from(table)
        .select("id")
        .in("id", missing);
      if (readErr) throw readErr;

      const stillThere = new Set((still ?? []).map((row) => String(row.id)));
      for (const id of missing) {
        (stillThere.has(id) ? out.denied : out.gone).push(id);
      }
    } catch (e) {
      if (!out.error) out.error = e;
      out.failed.push(...chunk.filter((id) => !deletedHere.has(id)));
    }
  }

  return out;
}
