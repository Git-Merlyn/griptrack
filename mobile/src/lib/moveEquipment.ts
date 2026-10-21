/**
 * Move logic. The server is authoritative: every move is ONE call to the
 * move_equipment Postgres RPC, which checks permissions, finds the merge
 * destination, and does relocate / merge / split / split+merge plus the merge
 * audit row in a single transaction (see migration 20261021050000).
 *
 * Online:  call the RPC first; only on success write the returned rows to
 *          SQLite. A failed move leaves local data untouched.
 * Offline: apply an optimistic local version of the move to SQLite, then
 *          queue ONE 'rpc' entry (table_name = 'move_equipment'). The entry
 *          carries p_op_id, so a replay after a lost response is a no-op on
 *          the server. The full pull after the drain replaces the optimistic
 *          rows with the server's.
 *
 * Rules (mirrored server-side):
 * - Moving ALL qty + identical row at destination → merge + delete source
 * - Moving ALL qty + no identical row → update location in place
 * - Moving PARTIAL qty → decrement source, merge or insert at destination
 */

import { supabase } from './supabase';
import { EquipmentItem } from './types';
import {
  upsertEquipmentItem,
  deleteEquipmentItemLocal,
  enqueueOp,
  generateId,
} from './db';

export const MOVE_RPC = 'move_equipment';

/** Shown when move_equipment refuses a destination that is not an existing,
 *  active location (D22 option C: crew cannot create destinations). The
 *  mobile picker only lists active locations, so this means the list on this
 *  device is stale (location renamed or deactivated meanwhile). */
export const UNKNOWN_DESTINATION_MESSAGE =
  "That location is no longer in your organization's location list. Pick another location — only owners, admins and department heads can add locations.";

export function isUnknownDestinationError(e: any): boolean {
  return e?.code === '22023' && /existing location/.test(String(e?.message ?? ''));
}

// ─── Merge detection (offline optimistic path only) ──────────────────────────

export function isMergeable(a: EquipmentItem, b: EquipmentItem): boolean {
  return (
    String(a.item_id ?? '') === String(b.item_id ?? '') &&
    String(a.name ?? '') === String(b.name ?? '') &&
    String(a.category ?? '') === String(b.category ?? '') &&
    String(a.source ?? '') === String(b.source ?? '') &&
    String(a.status ?? '') === String(b.status ?? '') &&
    String(a.start_date ?? '') === String(b.start_date ?? '') &&
    String(a.end_date ?? '') === String(b.end_date ?? '')
  );
}

export function findMergeDestination(
  allItems: EquipmentItem[],
  source: EquipmentItem,
  toLocation: string
): EquipmentItem | undefined {
  if (source.location === toLocation) return undefined;
  return allItems.find(
    (x) =>
      x.id !== source.id &&
      x.location === toLocation &&
      (x.team_id ?? null) === (source.team_id ?? null) &&
      isMergeable(x, source)
  );
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface MoveParams {
  sourceItem: EquipmentItem;
  /** Units to move. `null` = the whole row (bulk "set location"). */
  moveQty: number | null;
  toLocation: string;
  allItems: EquipmentItem[];
  userId?: string;      // kept for call-site compatibility; the server derives the actor
  updatedBy: string;    // display name / email — stamped on equipment_items.updated_by
  isOnline: boolean;
}

export interface MoveResult {
  success: boolean;
  error?: string;
  /** Units actually moved (online: from the server; offline: optimistic). */
  movedQty?: number;
  /** True when the move was queued for later sync. */
  queued?: boolean;
  /** Rows written to SQLite by this call (bulk moves fold these into their working list). */
  upserted?: EquipmentItem[];
  /** Row ids removed from SQLite by this call. */
  deletedIds?: string[];
}

/** Shape returned by the move_equipment RPC. */
export interface MoveRpcResult {
  status: 'applied' | 'already_applied';
  kind: 'relocate' | 'merge' | 'split' | 'split_merge' | 'noop';
  reason?: 'same_location';
  requested_qty: number | null;
  moved_qty: number;
  source_id: string;
  dest_id: string | null;
  source?: EquipmentItem | null;
  dest?: EquipmentItem | null;
}

export async function moveEquipment({
  sourceItem,
  moveQty,
  toLocation,
  allItems,
  updatedBy,
  isOnline,
}: MoveParams): Promise<MoveResult> {
  const currentQty = Number(sourceItem.quantity) || 0;
  const wholeRow = moveQty === null;

  if (!wholeRow && (!Number.isFinite(moveQty) || (moveQty as number) <= 0 || currentQty <= 0)) {
    return { success: false, error: 'Invalid quantity' };
  }
  if (!toLocation) return { success: false, error: 'No destination selected' };
  if (toLocation === sourceItem.location) {
    return { success: false, error: 'Item is already at that location' };
  }

  const qty = wholeRow ? currentQty : Math.min(moveQty as number, currentQty);
  const now = new Date().toISOString();

  try {
    if (isOnline) {
      const { data, error } = await supabase.rpc(MOVE_RPC, {
        p_source: sourceItem.id,
        p_qty: wholeRow ? null : qty,
        p_to_location: toLocation,
        p_updated_by: updatedBy,
        p_at: now,
      });
      if (error) throw error;

      const res = data as MoveRpcResult;
      const upserted: EquipmentItem[] = [];
      const deletedIds: string[] = [];

      if (res.source) {
        upsertEquipmentItem(res.source);
        upserted.push(res.source);
      } else if (res.kind === 'merge') {
        deleteEquipmentItemLocal(sourceItem.id);
        deletedIds.push(sourceItem.id);
      }
      if (res.dest && res.dest.id !== res.source?.id) {
        upsertEquipmentItem(res.dest);
        upserted.push(res.dest);
      }

      if (res.kind === 'noop') {
        return { success: false, error: 'Item is already at that location', upserted, deletedIds };
      }
      return { success: true, movedQty: res.moved_qty, upserted, deletedIds };
    }

    // ── Offline: optimistic local write + one queued RPC ────────────────────
    const dest = findMergeDestination(allItems, sourceItem, toLocation);
    const movingAll = qty >= currentQty;
    const newId = generateId();
    const upserted: EquipmentItem[] = [];
    const deletedIds: string[] = [];
    const stamp = { updated_by: updatedBy, updated_at: now };

    if (movingAll && dest) {
      const d = { ...dest, quantity: (Number(dest.quantity) || 0) + qty, ...stamp };
      upsertEquipmentItem(d);
      deleteEquipmentItemLocal(sourceItem.id);
      upserted.push(d);
      deletedIds.push(sourceItem.id);
    } else if (movingAll) {
      const s = { ...sourceItem, location: toLocation, ...stamp };
      upsertEquipmentItem(s);
      upserted.push(s);
    } else {
      const s = { ...sourceItem, quantity: currentQty - qty, ...stamp };
      const d: EquipmentItem = dest
        ? { ...dest, quantity: (Number(dest.quantity) || 0) + qty, ...stamp }
        : { ...sourceItem, id: newId, location: toLocation, quantity: qty, ...stamp, created_at: now };
      upsertEquipmentItem(s);
      upsertEquipmentItem(d);
      upserted.push(s, d);
    }

    enqueueOp({
      table_name: MOVE_RPC,
      operation: 'rpc',
      payload: JSON.stringify({
        p_source: sourceItem.id,
        p_qty: wholeRow ? null : qty,
        p_to_location: toLocation,
        p_op_id: generateId(),
        p_updated_by: updatedBy,
        p_at: now,
        p_new_id: newId,
      }),
    });

    return { success: true, movedQty: qty, queued: true, upserted, deletedIds };
  } catch (err: any) {
    console.error('moveEquipment failed', err);
    if (isUnknownDestinationError(err)) {
      return { success: false, error: UNKNOWN_DESTINATION_MESSAGE };
    }
    return { success: false, error: err?.message ?? 'Move failed' };
  }
}

// ─── Bulk move (L42) ──────────────────────────────────────────────────────────

export interface BulkMoveResult {
  moved: number;
  skipped: number;
  failed: { id: string; name: string; error: string }[];
}

/**
 * Moves each selected row (whole row) to `toLocation`, one at a time, through
 * moveEquipment — so merges happen exactly as for a single move. Later moves
 * see the effect of earlier ones via a running working list.
 */
export async function moveEquipmentBulk(params: {
  ids: string[];
  toLocation: string;
  allItems: EquipmentItem[];
  updatedBy: string;
  isOnline: boolean;
}): Promise<BulkMoveResult> {
  const { ids, toLocation, updatedBy, isOnline } = params;
  let working = [...params.allItems];
  const result: BulkMoveResult = { moved: 0, skipped: 0, failed: [] };

  for (const id of ids) {
    const item = working.find((x) => x.id === id);
    if (!item) {
      // Already merged away by an earlier move in this batch, or gone.
      result.skipped++;
      continue;
    }
    if (item.location === toLocation) {
      result.skipped++;
      continue;
    }

    const r = await moveEquipment({
      sourceItem: item,
      moveQty: null,
      toLocation,
      allItems: working,
      updatedBy,
      isOnline,
    });

    if (r.success) {
      result.moved++;
    } else {
      result.failed.push({ id, name: item.name, error: r.error ?? 'Move failed' });
    }

    const removed = new Set(r.deletedIds ?? []);
    const byId = new Map((r.upserted ?? []).map((u) => [u.id, u]));
    working = working
      .filter((x) => !removed.has(x.id))
      .map((x) => byId.get(x.id) ?? x);
    for (const u of r.upserted ?? []) {
      if (!working.some((x) => x.id === u.id)) working.push(u);
    }
  }

  return result;
}
