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
  replaceEquipmentForTeam(orgId: string, teamId: string, items: EquipmentItem[]): void;
  replaceEquipmentForOrg(orgId: string, items: EquipmentItem[]): void;
  replaceLocationsForOrg(orgId: string, locs: Location[]): void;
  replaceRequestsForOrg(orgId: string, reqs: EquipmentRequest[]): void;
}

export interface SyncDeps {
  supabase: SupabaseClient;
  db: SyncDb;
}

/** Outcome of a queue drain — used to tell the user what didn't make it. */
export interface DrainStats {
  applied: number;
  /** Ops skipped because the server row changed while we were offline (server wins) */
  discarded: number;
  /** Ops permanently dropped after exhausting retries */
  failed: number;
}

export async function drainQueue(deps: SyncDeps, auditTable: string): Promise<DrainStats> {
  const { supabase, db } = deps;
  const entries = db.getSyncQueue();
  const stats: DrainStats = { applied: 0, discarded: 0, failed: 0 };

  for (const entry of entries) {
    const payload = JSON.parse(entry.payload);
    // Audit events use a configurable table name stored as 'audit' in the queue
    const tableName = entry.table_name === 'audit' ? auditTable : entry.table_name;

    try {
      if (entry.operation === 'insert') {
        const { error } = await supabase.from(tableName).insert(payload);
        if (error) throw error;

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
          const { data: current } = await supabase
            .from(tableName)
            .select('updated_at')
            .eq('id', payload.id)
            .single();

          if (current?.updated_at && current.updated_at > payload.snapshot_updated_at) {
            console.info(
              `[Sync] skipping stale update for ${payload.id} — server updated at ${current.updated_at}, our snapshot was ${payload.snapshot_updated_at}`
            );
            db.removeSyncEntry(entry.id);
            stats.discarded++;
            continue;
          }
        }

        // ── Quantity delta (move operations) ──────────────────────────────
        // Move ops store `qty_delta` instead of an absolute quantity in the
        // patch, so two concurrent partial moves from the same source don't
        // overwrite each other's decrement. We use Postgres's increment RPC
        // for atomic application.
        if (payload.qty_delta !== undefined && tableName === 'equipment_items') {
          // p_op_id = this queue entry's id → the 5-arg overload records it,
          // so a retry after a lost response does not apply the delta twice.
          // (Only entries queued by older builds still take this path; new
          // builds queue moves as one move_equipment rpc entry.)
          const { error } = await supabase.rpc('increment_equipment_quantity', {
            item_id: payload.id,
            delta: payload.qty_delta,
            updated_by_val: payload.patch.updated_by,
            updated_at_val: payload.patch.updated_at,
            p_op_id: entry.id,
          });
          if (error) throw error;

          // Apply any non-quantity fields (e.g. location) as a normal patch
          const { qty_delta: _d, ...restPatch } = payload.patch;
          if (Object.keys(restPatch).length > 2) { // more than just updated_by + updated_at
            const { error: patchErr } = await supabase
              .from(tableName)
              .update(restPatch)
              .eq('id', payload.id);
            if (patchErr) throw patchErr;
          }
        } else {
          const { error } = await supabase
            .from(tableName)
            .update(payload.patch)
            .eq('id', payload.id);
          if (error) throw error;
        }

      } else if (entry.operation === 'rpc') {
        // Queued RPCs (move_equipment, log_damage_event, log_merge_event) —
        // table_name holds the function name, payload the args object.
        const { data, error } = await supabase.rpc(entry.table_name, payload);
        if (error) throw error;

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

      db.incrementSyncRetries(entry.id);

      // If the row was already deleted server-side, discard the entry rather
      // than blocking the rest of the queue.
      const isGone =
        e?.code === 'PGRST116' ||
        e?.message?.includes('not found') ||
        e?.message?.includes('does not exist');

      // Legacy hand-written audit inserts queued by older builds are now
      // permanently rejected by RLS (anti-forgery) — the equipment change
      // itself still syncs and the trigger logs it, so just discard these.
      const isLegacyAuditDenied = entry.table_name === 'audit' && e?.code === '42501';

      // entry.retries is the pre-increment value read from the queue, so add
      // 1 to compare against the intended max of 3 attempts.
      if (isGone || isLegacyAuditDenied || entry.retries + 1 >= 3) {
        db.removeSyncEntry(entry.id);
        stats.failed++;
      }

      console.warn(`[Sync] queue entry ${entry.id} failed (retry ${entry.retries + 1})`, e?.message);
      // Continue — don't let one bad entry block everything else
    }
  }

  return stats;
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

  // Equipment items. Teams off → the whole org is one flat pool; teams on →
  // scope to the active team.
  let itemsQuery = supabase.from('equipment_items').select('*').eq('org_id', orgId);
  if (teamsEnabled && teamId) itemsQuery = itemsQuery.eq('team_id', teamId);
  const { data: items, error: itemsErr } = await itemsQuery;
  if (itemsErr) throw itemsErr;
  if (items) {
    if (teamsEnabled && teamId) {
      db.replaceEquipmentForTeam(orgId, teamId, items as EquipmentItem[]);
    } else {
      db.replaceEquipmentForOrg(orgId, items as EquipmentItem[]);
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
  if (locs) db.replaceLocationsForOrg(orgId, locs as Location[]);

  // Requests — admins see all, crew see their own
  let reqQuery = supabase.from('equipment_requests').select('*').eq('org_id', orgId);
  if (!isAdmin) reqQuery = reqQuery.eq('requested_by', userId);
  const { data: reqs, error: reqsErr } = await reqQuery;
  if (reqsErr) throw reqsErr;
  if (reqs) db.replaceRequestsForOrg(orgId, reqs as EquipmentRequest[]);
}
