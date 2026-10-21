import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * deleted — this call removed the row
 * gone    — nothing to delete: the row no longer exists (or is not visible)
 * denied  — the row is still there: RLS refused the DELETE for this role
 */
export type DeleteOutcome = 'deleted' | 'gone' | 'denied';

function toError(
  e: { message: string; code?: string; details?: string; hint?: string },
  status?: number
): Error {
  // Keep `code` and the HTTP `status`: the sync drain (lib/sync.ts) inspects
  // both (e.g. PGRST116 = gone, status 0/401 = connection/auth hiccup).
  return Object.assign(new Error(e.message), { code: e.code, details: e.details, hint: e.hint, status });
}

/**
 * DELETE one row by id and report what actually happened.
 *
 * PostgREST answers an RLS-filtered DELETE with 2xx and ZERO rows, so "no
 * error" does not mean "deleted". We ask for the deleted id back and, when it
 * does not come back, re-read the row to tell "already gone" from "refused".
 * Throws (with the PostgREST code attached) only when a request fails.
 */
export async function deleteById(
  table: string,
  id: string,
  client: SupabaseClient = supabase
): Promise<DeleteOutcome> {
  const { data, error, status } = await client.from(table).delete().eq('id', id).select('id');
  if (error) throw toError(error, status);
  if (Array.isArray(data) && data.length > 0) return 'deleted';

  const { data: still, error: readErr, status: readStatus } = await client
    .from(table)
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw toError(readErr, readStatus);
  return still ? 'denied' : 'gone';
}
