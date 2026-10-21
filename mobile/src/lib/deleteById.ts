import { supabase } from './supabase';

/**
 * deleted — this call removed the row
 * gone    — nothing to delete: the row no longer exists (or is not visible)
 * denied  — the row is still there: RLS refused the DELETE for this role
 */
export type DeleteOutcome = 'deleted' | 'gone' | 'denied';

function toError(e: { message: string; code?: string; details?: string; hint?: string }): Error {
  // Keep `code`: SyncContext's drain inspects e.code (e.g. PGRST116).
  return Object.assign(new Error(e.message), { code: e.code, details: e.details, hint: e.hint });
}

/**
 * DELETE one row by id and report what actually happened.
 *
 * PostgREST answers an RLS-filtered DELETE with 2xx and ZERO rows, so "no
 * error" does not mean "deleted". We ask for the deleted id back and, when it
 * does not come back, re-read the row to tell "already gone" from "refused".
 * Throws (with the PostgREST code attached) only when a request fails.
 */
export async function deleteById(table: string, id: string): Promise<DeleteOutcome> {
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
  if (error) throw toError(error);
  if (Array.isArray(data) && data.length > 0) return 'deleted';

  const { data: still, error: readErr } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw toError(readErr);
  return still ? 'denied' : 'gone';
}
