/**
 * Sync engine — offline queue drain and full pull from Supabase.
 *
 * Extracted from context/SyncContext.tsx so it can be unit-tested. These are
 * plain async functions: every side effect goes through the injected
 * `supabase` client and `db` (the lib/db.ts functions), so tests pass fakes.
 *
 * Conflict resolution (equipment_items updates):
 *   Each queued update payload stores a `snapshot_updated_at` — the server
 *   timestamp of the row as the offline user saw it. On drain, we fetch the
 *   current server row. If its `updated_at` is newer than `snapshot_updated_at`,
 *   someone else changed the record while we were offline; we discard our queued
 *   op and let the server version win.
 *
 *   Quantity changes from moves use Postgres `increment` (delta, not absolute)
 *   so two concurrent partial moves from the same source don't double-count.
 *
 * Retry budget:
 *   A queued op gets MAX_ATTEMPTS tries against the server. Only real server
 *   rejections count. Connection/auth hiccups (see isTransientSyncError) stop
 *   the drain without charging anything, so a flaky reconnect can never burn
 *   through the budget and drop offline work. Deterministic rejections (RLS,
 *   check, foreign-key and not-null violations, class-22 data exceptions, and
 *   WP09 plan-limit rejections: P0001 whose hint starts with 'plan_limit:' or
 *   whose message starts with 'Plan limit:') are dropped on the first attempt.
 *   Any other P0001 keeps the normal budget.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteById } from './deleteById';
import { canManageInventory } from './types';
import type { EquipmentItem, Location, Role } from './types';
import type { SyncQueueEntry } from './db';
import type { EquipmentRequest } from '../hooks/useRequests';

/** The lib/db.ts functions the sync engine uses (injected so tests can fake them). */
export interface SyncDb {
  getSyncQueue(): SyncQueueEntry[];
  removeSyncEntry(id: string): void;
  incrementSyncRetries(id: string): void;
  replaceEquipmentForTeam(
    orgId: string,
    teamId: string,
    items: EquipmentItem[],
    keepIds?: readonly string[]
  ): void;
  replaceEquipmentForOrg(orgId: string, items: EquipmentItem[], keepIds?: readonly string[]): void;
  replaceLocationsForOrg(orgId: string, locs: Location[], keepIds?: readonly string[]): void;
  replaceRequestsForOrg(orgId: string, reqs: EquipmentRequest[], keepIds?: readonly string[]): void;
}

export interface SyncDeps {
  supabase: SupabaseClient;
  db: SyncDb;
}

/** Server attempts a queued op gets before it is dropped. */
export const MAX_ATTEMPTS = 3;

/**
 * Postgres errors that will never succeed on retry: RLS / privilege (42501),
 * check constraint (23514), foreign key (23503), not-null (23502), and every
 * data exception in class 22 (invalid date/time 22007/22008, malformed uuid or
 * number 22P02, value too long 22001, ...). Includes legacy hand-written audit
 * inserts from older builds, which RLS now rejects (anti-forgery).
 */
const PERMANENT_CODES = ['42501', '23514', '23503', '23502'];

function isPermanentRejection(code: unknown): boolean {
  return typeof code === 'string' && (PERMANENT_CODES.includes(code) || /^22[0-9A-Z]{3}$/.test(code));
}

/**
 * WP09 (Option A) plan limits: the enforce_plan_limits trigger raises P0001
 * with message 'Plan limit: <neutral sentence>' (app-store-safe: no upgrade
 * wording, prices or URLs) and hint 'plan_limit:<items|locations|invites|seats>'.
 * Replaying the op cannot succeed until the org's plan changes, so it is
 * dropped on the first attempt. Detection: P0001 AND (hint starts with
 * 'plan_limit:' OR message starts with 'Plan limit:' — the fallback for a path
 * that loses the hint). Any other P0001 (a RAISE from some other trigger or
 * function) keeps the normal MAX_ATTEMPTS budget. The message is shown as-is.
 */
const PLAN_LIMIT_HINT_PREFIX = 'plan_limit:';
const PLAN_LIMIT_MESSAGE_PREFIX = 'Plan limit:';

export function isPlanLimitRejection(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as SyncOpError;
  if (err.code !== 'P0001') return false;
  return (
    (typeof err.hint === 'string' && err.hint.startsWith(PLAN_LIMIT_HINT_PREFIX)) ||
    (typeof err.message === 'string' && err.message.startsWith(PLAN_LIMIT_MESSAGE_PREFIX))
  );
}

/** Outcome of a queue drain — used to tell the user what didn't make it. */
export interface DrainStats {
  applied: number;
  /** Ops skipped because the server row changed while we were offline (server wins) */
  discarded: number;
  /** Ops permanently dropped (rejected by the server, row gone, or corrupt) */
  failed: number;
  /**
   * True when the drain stopped early on a connection/auth problem. The
   * remaining entries stay queued with their retry counts untouched.
   */
  interrupted: boolean;
  /**
   * Server messages (already neutral, shown as-is) of ops dropped for a plan
   * limit (WP09), de-duplicated. Absent when there were none.
   */
  planLimitMessages?: string[];
}

/** A supabase-js error plus the HTTP status of the response that carried it. */
interface SyncOpError {
  code?: string;
  message?: string;
  details?: unknown;
  /** PostgREST `hint`; WP09 puts its machine code 'plan_limit:<name>' here. */
  hint?: string;
  status?: number;
}

/** Throw the response's error (if any), keeping the HTTP status for classification. */
function throwIfError(res: { error: unknown; status?: number }): void {
  if (!res.error) return;
  const err = res.error as { code?: string; message?: string; details?: unknown; hint?: string };
  const out: SyncOpError = {
    code: err.code,
    message: err.message,
    details: err.details,
    hint: err.hint,
    status: res.status,
  };
  throw out;
}

/**
 * True for failures that say nothing about the op itself — the network, the
 * gateway or the auth token — so the op must be retried later without being
 * charged an attempt.
 *
 * - status 0 / code '': postgrest-js turns a fetch rejection or abort into
 *   `{ code: '', message: 'TypeError: Network request failed' }` with status 0.
 * - 401: expired/invalid JWT, or supabase-js fell back to the anon key because
 *   the token refresh failed offline. A later sync with a fresh token succeeds.
 * - 502/503/504/520 and PGRST000-003: gateway down / PostgREST can't reach the DB.
 *
 * Deliberately NOT transient: plain TypeError/SyntaxError thrown by our own
 * code (a malformed payload would otherwise stall the queue forever).
 */
export function isTransientSyncError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as SyncOpError;
  if (err.status === 0 || err.code === '') return true;
  if (err.status === 401) return true;
  if (err.status === 502 || err.status === 503 || err.status === 504 || err.status === 520) return true;
  if (typeof err.code === 'string' && /^PGRST00[0-3]$/.test(err.code)) return true;
  if (err.code === 'PGRST301' || err.code === 'PGRST303') return true;
  const message = typeof err.message === 'string' ? err.message : '';
  return /Network request failed|FetchError|AbortError|Failed to fetch/i.test(message);
}

export async function drainQueue(deps: SyncDeps, auditTable: string): Promise<DrainStats> {
  const { supabase, db } = deps;
  const stats: DrainStats = { applied: 0, discarded: 0, failed: 0, interrupted: false };
  const entries = db.getSyncQueue();
  if (entries.length === 0) return stats;

  // Without a session supabase-js silently sends the anon key and every op
  // fails. That is an auth hiccup (token refresh failed offline), not a
  // problem with the ops — leave the queue alone and try again later.
  try {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      stats.interrupted = true;
      return stats;
    }
  } catch {
    stats.interrupted = true;
    return stats;
  }

  for (const entry of entries) {
    // Audit events use a configurable table name stored as 'audit' in the queue
    const tableName = entry.table_name === 'audit' ? auditTable : entry.table_name;

    try {
      // Parsed inside the try: a corrupt payload must fail this entry only,
      // not abort the whole drain (it is dropped below as isCorrupt).
      const payload = JSON.parse(entry.payload);

      if (entry.operation === 'insert') {
        throwIfError(await supabase.from(tableName).insert(payload));

      } else if (entry.operation === 'update') {
        // ── Conflict check (equipment_items only) ──────────────────────────
        // If the queued payload includes a snapshot_updated_at, compare it to
        // the server's current updated_at. If the server is newer, someone else
        // changed this row while we were offline — discard our stale op.
        //
        // qty_delta ops are exempt: they're relative changes applied via the
        // increment RPC precisely so they compose with concurrent edits.
        // Running the staleness check on them would discard the second of two
        // offline moves (the first drain bumps updated_at), losing quantity.
        if (
          tableName === 'equipment_items' &&
          payload.snapshot_updated_at &&
          payload.qty_delta === undefined
        ) {
          const check = await supabase
            .from(tableName)
            .select('updated_at')
            .eq('id', payload.id)
            .single();
          // A connection failure here must not be mistaken for "no conflict".
          if (check.error) {
            const checkErr: SyncOpError = { ...(check.error as object), status: check.status };
            if (isTransientSyncError(checkErr)) throw checkErr;
          }
          const current = check.data as { updated_at?: string } | null;

          if (current?.updated_at && current.updated_at > payload.snapshot_updated_at) {
            console.info(
              `[Sync] skipping stale update for ${payload.id} — server updated at ${current.updated_at}, our snapshot was ${payload.snapshot_updated_at}`
            );
            db.removeSyncEntry(entry.id);
            stats.discarded++;
            continue;
          }
        }

        // ── Quantity delta (partial moves queued by older builds) ─────────
        // `qty_delta` sits at payload level; `patch` only carries updated_by /
        // updated_at, and both go to the increment RPC as arguments. Nothing
        // else in the patch is ever applied.
        if (payload.qty_delta !== undefined && tableName === 'equipment_items') {
          if (__DEV__) {
            const extra = Object.keys(payload.patch ?? {}).filter(
              (k) => k !== 'updated_by' && k !== 'updated_at'
            );
            if (extra.length > 0) {
              console.warn(`[Sync] qty_delta op carries extra patch keys that are NOT applied: ${extra.join(', ')}`);
            }
          }
          // p_op_id = this queue entry's id → the 5-arg overload records it,
          // so a retry after a lost response does not apply the delta twice.
          throwIfError(
            await supabase.rpc('increment_equipment_quantity', {
              item_id: payload.id,
              delta: payload.qty_delta,
              updated_by_val: payload.patch.updated_by,
              updated_at_val: payload.patch.updated_at,
              p_op_id: entry.id,
            })
          );
        } else {
          throwIfError(await supabase.from(tableName).update(payload.patch).eq('id', payload.id));
        }

      } else if (entry.operation === 'rpc') {
        // Queued RPCs (move_equipment, log_damage_event, log_merge_event) —
        // table_name holds the function name, payload the args object.
        const res = await supabase.rpc(entry.table_name, payload);
        throwIfError(res);
        const data = res.data as { moved_qty?: unknown } | null;

        // move_equipment moves at most what the source still holds. If the
        // server moved less than this offline op asked for (someone changed
        // the item meanwhile), tell the user like any other server-wins skip.
        if (
          entry.table_name === 'move_equipment' &&
          payload.p_qty != null &&
          typeof data?.moved_qty === 'number' &&
          data.moved_qty < Number(payload.p_qty)
        ) {
          console.info(`[Sync] move ${payload.p_op_id} moved ${data.moved_qty} of ${payload.p_qty}`);
          db.removeSyncEntry(entry.id);
          stats.discarded++;
          continue;
        }

      } else if (entry.operation === 'delete') {
        // A delete RLS refuses comes back as 2xx with zero rows; it used to be
        // counted as applied. Report it (the "couldn't be applied" notice) and
        // drop the entry — retrying can't succeed. The next pull restores the
        // row locally because the server still has it.
        const outcome = await deleteById(tableName, payload.id, supabase);
        if (outcome === 'denied') {
          console.info(`[Sync] delete of ${payload.id} on ${tableName} not permitted — server row kept`);
          db.removeSyncEntry(entry.id);
          stats.failed++;
          continue;
        }
      }

      db.removeSyncEntry(entry.id);
      stats.applied++;
    } catch (e: any) {
      // A replayed insert whose row already exists (same client-generated
      // primary key) was applied by an earlier attempt whose response was
      // lost — not a failure. Only a primary-key conflict means that: a
      // conflict on another unique key (e.g. locations (org_id, name)) is a
      // real rejection and takes the normal failure path below.
      if (
        entry.operation === 'insert' &&
        e?.code === '23505' &&
        /_pkey"/.test(String(e?.message ?? ''))
      ) {
        db.removeSyncEntry(entry.id);
        stats.applied++;
        continue;
      }

      // move_equipment 22023 = a move that can never succeed (bad args, or —
      // D22 option C — a crew destination that is not an existing, active
      // location, e.g. deactivated while this device was offline). Drop it
      // now instead of retrying 3 times; it shows in the "couldn't be
      // applied" notice and the pull restores the server's rows.
      if (entry.table_name === 'move_equipment' && e?.code === '22023') {
        console.warn(`[Sync] move ${entry.id} rejected:`, e?.message);
        db.removeSyncEntry(entry.id);
        stats.failed++;
        continue;
      }

      // Connection/auth problem: every later entry would fail the same way.
      // Stop here, charge nothing, and let the next sync retry.
      if (isTransientSyncError(e)) {
        console.warn('[Sync] connection problem — drain stopped, ops stay queued', e?.message);
        stats.interrupted = true;
        break;
      }

      // A payload that isn't valid JSON can never succeed.
      const isCorrupt = e instanceof SyntaxError;

      // If the row was already deleted server-side, discard the entry rather
      // than blocking the rest of the queue.
      const isGone =
        e?.code === 'PGRST116' ||
        e?.message?.includes('not found') ||
        e?.message?.includes('does not exist');

      // P0001 + ('plan_limit:' hint or 'Plan limit:' message) only (WP09);
      // other P0001s are retried.
      const isPlanLimit = isPlanLimitRejection(e);
      const isPermanent = isPermanentRejection(e?.code) || isPlanLimit;

      // entry.retries counts earlier failed attempts; this one is attempt
      // retries + 1.
      if (isCorrupt || isGone || isPermanent || entry.retries + 1 >= MAX_ATTEMPTS) {
        db.removeSyncEntry(entry.id);
        stats.failed++;
        if (isPlanLimit) {
          // WP09's message is already neutral: shown as-is, nothing stripped.
          const text =
            (typeof e?.message === 'string' && e.message.trim()) ||
            "This change is over your organization's plan limit.";
          const seen = stats.planLimitMessages ?? [];
          if (!seen.includes(text)) stats.planLimitMessages = [...seen, text];
        }
      } else {
        db.incrementSyncRetries(entry.id);
      }

      console.warn(`[Sync] queue entry ${entry.id} failed (attempt ${entry.retries + 1})`, e?.message);
      // Continue — don't let one bad entry block everything else
    }
  }

  return stats;
}

/** User-facing summary of ops that didn't make it, or null when nothing was lost. */
export function drainNoticeText(stats: DrainStats): string | null {
  const lost = stats.discarded + stats.failed;
  if (lost === 0) return null;
  if (stats.discarded > 0 && stats.failed === 0) {
    return `${stats.discarded} offline change${stats.discarded !== 1 ? 's' : ''} skipped — items were updated by someone else`;
  }
  const base = `${lost} offline change${lost !== 1 ? 's' : ''} couldn't be applied`;
  // WP09 plan limit: append the server's neutral message (first one, as-is)
  // so the user knows why. No upgrade wording is added on mobile.
  const planText = stats.planLimitMessages?.[0];
  return planText ? `${base}. ${planText}` : base;
}

export interface PendingRowIds {
  equipment_items: string[];
  locations: string[];
  equipment_requests: string[];
}

/**
 * Ids of rows that still have queued ops. The pull must leave these rows
 * exactly as the optimistic local write left them; the next successful drain
 * reconciles them with the server. A queued move_equipment rpc protects its
 * source row and the new split row (p_source / p_new_id); its merge
 * destination isn't in the args, so that row may show the server quantity
 * until the move drains.
 */
export function pendingRowIds(entries: SyncQueueEntry[]): PendingRowIds {
  const out: PendingRowIds = { equipment_items: [], locations: [], equipment_requests: [] };
  const add = (table: keyof PendingRowIds, id: unknown) => {
    if (typeof id === 'string' && id && !out[table].includes(id)) out[table].push(id);
  };
  for (const e of entries) {
    let payload: Record<string, unknown> | null;
    try {
      payload = JSON.parse(e.payload);
    } catch {
      continue; // corrupt — drainQueue drops it; nothing to protect
    }
    if (!payload || typeof payload !== 'object') continue;
    if (e.operation === 'rpc') {
      if (e.table_name === 'move_equipment') {
        add('equipment_items', payload.p_source);
        add('equipment_items', payload.p_new_id);
      }
      continue;
    }
    if (e.table_name === 'equipment_items' || e.table_name === 'locations' || e.table_name === 'equipment_requests') {
      add(e.table_name, payload.id);
    }
  }
  return out;
}

export async function pullFromSupabase(
  deps: SyncDeps,
  params: {
    orgId: string;
    teamId: string | null;
    teamsEnabled: boolean;
    userId: string;
    role: Role;
  }
): Promise<void> {
  const { supabase, db } = deps;
  const { orgId, teamId, teamsEnabled, userId, role } = params;
  const isAdmin = canManageInventory(role);

  // Rows with ops still queued (a drain that partly failed) keep their local,
  // optimistic state instead of being reverted/removed by the server copy.
  const pending = pendingRowIds(db.getSyncQueue());

  // Equipment items. Teams off → the whole org is one flat pool; teams on →
  // scope to the active team.
  let itemsQuery = supabase.from('equipment_items').select('*').eq('org_id', orgId);
  if (teamsEnabled && teamId) itemsQuery = itemsQuery.eq('team_id', teamId);
  const { data: items, error: itemsErr } = await itemsQuery;
  if (itemsErr) throw itemsErr;
  if (items) {
    if (teamsEnabled && teamId) {
      db.replaceEquipmentForTeam(orgId, teamId, items as EquipmentItem[], pending.equipment_items);
    } else {
      db.replaceEquipmentForOrg(orgId, items as EquipmentItem[], pending.equipment_items);
    }
  }

  // Locations — pull ALL (including inactive): the management screen lists
  // deactivated locations, and read paths filter on is_active themselves.
  // Filtering here made every sync erase inactive rows from SQLite.
  const { data: locs, error: locsErr } = await supabase
    .from('locations')
    .select('*')
    .eq('org_id', orgId);
  if (locsErr) throw locsErr;
  if (locs) db.replaceLocationsForOrg(orgId, locs as Location[], pending.locations);

  // Requests — admins see all, crew see their own
  let reqQuery = supabase.from('equipment_requests').select('*').eq('org_id', orgId);
  if (!isAdmin) reqQuery = reqQuery.eq('requested_by', userId);
  const { data: reqs, error: reqsErr } = await reqQuery;
  if (reqsErr) throw reqsErr;
  if (reqs) db.replaceRequestsForOrg(orgId, reqs as EquipmentRequest[], pending.equipment_requests);
}
