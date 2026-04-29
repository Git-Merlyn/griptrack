/**
 * Move logic — mirrors the web app's moveEquipment + equipmentMoveUtils.
 *
 * Offline support: all SQLite writes happen immediately. When isOnline is
 * true, Supabase writes happen in the same call. When offline, the equivalent
 * operations are added to the sync_queue for replay on reconnect.
 *
 * Rules:
 * - Moving ALL qty + matching row at destination → merge + delete source
 * - Moving ALL qty + no matching row → update location in place
 * - Moving PARTIAL qty → decrement source, merge or insert at destination
 *
 * Conflict safety (offline):
 * - snapshot_updated_at is included in every queued update so drainQueue can
 *   detect if the server row was touched by someone else while we were offline.
 * - Partial-move quantity changes use qty_delta (relative) instead of absolute
 *   values, so two concurrent partial moves from the same source compose
 *   correctly via the increment_equipment_quantity Postgres RPC.
 */

import { supabase } from './supabase';
import { EquipmentItem } from './types';
import {
  upsertEquipmentItem,
  deleteEquipmentItemLocal,
  enqueueOp,
  generateId,
} from './db';

const EQUIPMENT_TABLE = 'equipment_items';
const AUDIT_TABLE = process.env.EXPO_PUBLIC_EQUIPMENT_AUDIT_TABLE ?? 'equipment_audit';

// ─── Merge detection ──────────────────────────────────────────────────────────

function isMergeable(a: EquipmentItem, b: EquipmentItem): boolean {
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

function findMergeDestination(
  allItems: EquipmentItem[],
  source: EquipmentItem,
  toLocation: string
): EquipmentItem | undefined {
  if (source.location === toLocation) return undefined;
  return allItems.find(
    (x) => x.id !== source.id && x.location === toLocation && isMergeable(x, source)
  );
}

// ─── Audit log helper ─────────────────────────────────────────────────────────

async function writeAuditLog(params: {
  orgId: string;
  equipmentId: string;
  userId: string;
  actor: string;
  fromLocation: string;
  toLocation: string;
  deltaQty: number;
  action: 'move' | 'merge';
  mergedFromId?: string;
  isOnline: boolean;
}): Promise<void> {
  const payload = {
    org_id: params.orgId,
    equipment_id: params.equipmentId,
    action: params.action,
    user_id: params.userId,
    actor: params.actor,
    from_location: params.fromLocation,
    to_location: params.toLocation,
    delta_qty: params.deltaQty,
    meta: params.mergedFromId ? { merged_from_id: params.mergedFromId } : null,
  };

  if (params.isOnline) {
    try {
      await supabase.from(AUDIT_TABLE).insert(payload);
    } catch (e) {
      // Audit must never block a move
      console.warn('Failed to write audit event', e);
    }
  } else {
    enqueueOp({ table_name: 'audit', operation: 'insert', payload: JSON.stringify(payload) });
  }
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface MoveParams {
  sourceItem: EquipmentItem;
  moveQty: number;
  toLocation: string;
  allItems: EquipmentItem[];
  userId: string;       // UUID of the acting user
  updatedBy: string;    // display name / email — stored on equipment_items + audit log
  isOnline: boolean;
}

export interface MoveResult {
  success: boolean;
  error?: string;
}

export async function moveEquipment({
  sourceItem,
  moveQty,
  toLocation,
  allItems,
  userId,
  updatedBy,
  isOnline,
}: MoveParams): Promise<MoveResult> {
  const currentQty = Number(sourceItem.quantity) || 0;
  const qty = Math.min(moveQty, currentQty);

  if (qty <= 0) return { success: false, error: 'Invalid quantity' };
  if (!toLocation) return { success: false, error: 'No destination selected' };
  if (toLocation === sourceItem.location) {
    return { success: false, error: 'Item is already at that location' };
  }

  const dest = findMergeDestination(allItems, sourceItem, toLocation);
  const movingAll = qty === currentQty;
  const now = new Date().toISOString();

  try {
    if (movingAll && dest) {
      // ── Full move with merge: add to destination, delete source ──────────
      const newDestQty = (Number(dest.quantity) || 0) + qty;

      upsertEquipmentItem({ ...dest, quantity: newDestQty, updated_by: updatedBy, updated_at: now });
      deleteEquipmentItemLocal(sourceItem.id);

      if (isOnline) {
        const { error: updateErr } = await supabase
          .from(EQUIPMENT_TABLE)
          .update({ quantity: newDestQty, updated_by: updatedBy, updated_at: now })
          .eq('id', dest.id);
        if (updateErr) throw updateErr;

        const { error: deleteErr } = await supabase
          .from(EQUIPMENT_TABLE)
          .delete()
          .eq('id', sourceItem.id);
        if (deleteErr) throw deleteErr;
      } else {
        // Full merge: destination qty is absolute — the entire source row is
        // consumed, so no concurrent-partial-move ambiguity.
        enqueueOp({ table_name: EQUIPMENT_TABLE, operation: 'update', payload: JSON.stringify({
          id: dest.id,
          snapshot_updated_at: dest.updated_at,
          patch: { quantity: newDestQty, updated_by: updatedBy, updated_at: now },
        })});
        enqueueOp({ table_name: EQUIPMENT_TABLE, operation: 'delete', payload: JSON.stringify({ id: sourceItem.id }) });
      }

      await writeAuditLog({
        orgId: sourceItem.org_id,
        equipmentId: dest.id,
        userId,
        actor: updatedBy,
        fromLocation: sourceItem.location,
        toLocation,
        deltaQty: qty,
        action: 'merge',
        mergedFromId: sourceItem.id,
        isOnline,
      });

    } else if (movingAll && !dest) {
      // ── Full move, no merge: just update location ─────────────────────────
      upsertEquipmentItem({ ...sourceItem, location: toLocation, updated_by: updatedBy, updated_at: now });

      if (isOnline) {
        const { error } = await supabase
          .from(EQUIPMENT_TABLE)
          .update({ location: toLocation, updated_by: updatedBy, updated_at: now })
          .eq('id', sourceItem.id);
        if (error) throw error;
      } else {
        enqueueOp({ table_name: EQUIPMENT_TABLE, operation: 'update', payload: JSON.stringify({
          id: sourceItem.id,
          snapshot_updated_at: sourceItem.updated_at,
          patch: { location: toLocation, updated_by: updatedBy, updated_at: now },
        })});
      }

      await writeAuditLog({
        orgId: sourceItem.org_id,
        equipmentId: sourceItem.id,
        userId,
        actor: updatedBy,
        fromLocation: sourceItem.location,
        toLocation,
        deltaQty: qty,
        action: 'move',
        isOnline,
      });

    } else if (dest) {
      // ── Partial move with merge ───────────────────────────────────────────
      const newSourceQty = currentQty - qty;
      const newDestQty = (Number(dest.quantity) || 0) + qty;

      upsertEquipmentItem({ ...sourceItem, quantity: newSourceQty, updated_by: updatedBy, updated_at: now });
      upsertEquipmentItem({ ...dest, quantity: newDestQty, updated_by: updatedBy, updated_at: now });

      if (isOnline) {
        const { error: srcErr } = await supabase
          .from(EQUIPMENT_TABLE)
          .update({ quantity: newSourceQty, updated_by: updatedBy, updated_at: now })
          .eq('id', sourceItem.id);
        if (srcErr) throw srcErr;

        const { error: destErr } = await supabase
          .from(EQUIPMENT_TABLE)
          .update({ quantity: newDestQty, updated_by: updatedBy, updated_at: now })
          .eq('id', dest.id);
        if (destErr) throw destErr;
      } else {
        // qty_delta so two concurrent partial moves compose correctly.
        enqueueOp({ table_name: EQUIPMENT_TABLE, operation: 'update', payload: JSON.stringify({
          id: sourceItem.id,
          snapshot_updated_at: sourceItem.updated_at,
          qty_delta: -qty,
          patch: { updated_by: updatedBy, updated_at: now },
        })});
        enqueueOp({ table_name: EQUIPMENT_TABLE, operation: 'update', payload: JSON.stringify({
          id: dest.id,
          snapshot_updated_at: dest.updated_at,
          qty_delta: qty,
          patch: { updated_by: updatedBy, updated_at: now },
        })});
      }

      await writeAuditLog({
        orgId: sourceItem.org_id,
        equipmentId: dest.id,
        userId,
        actor: updatedBy,
        fromLocation: sourceItem.location,
        toLocation,
        deltaQty: qty,
        action: 'merge',
        mergedFromId: sourceItem.id,
        isOnline,
      });

    } else {
      // ── Partial move, no merge: decrement source + insert at destination ──
      const newSourceQty = currentQty - qty;
      const newItem: EquipmentItem = {
        ...sourceItem,
        id: generateId(),
        location: toLocation,
        quantity: qty,
        updated_by: updatedBy,
        updated_at: now,
        created_at: now,
      };

      upsertEquipmentItem({ ...sourceItem, quantity: newSourceQty, updated_by: updatedBy, updated_at: now });
      upsertEquipmentItem(newItem);

      if (isOnline) {
        const { error: srcErr } = await supabase
          .from(EQUIPMENT_TABLE)
          .update({ quantity: newSourceQty, updated_by: updatedBy, updated_at: now })
          .eq('id', sourceItem.id);
        if (srcErr) throw srcErr;

        const { error: insertErr } = await supabase
          .from(EQUIPMENT_TABLE)
          .insert(newItem);
        if (insertErr) throw insertErr;
      } else {
        // qty_delta on the source so concurrent partial moves compose correctly.
        enqueueOp({ table_name: EQUIPMENT_TABLE, operation: 'update', payload: JSON.stringify({
          id: sourceItem.id,
          snapshot_updated_at: sourceItem.updated_at,
          qty_delta: -qty,
          patch: { updated_by: updatedBy, updated_at: now },
        })});
        enqueueOp({ table_name: EQUIPMENT_TABLE, operation: 'insert', payload: JSON.stringify(newItem) });
      }

      await writeAuditLog({
        orgId: sourceItem.org_id,
        equipmentId: sourceItem.id,
        userId,
        actor: updatedBy,
        fromLocation: sourceItem.location,
        toLocation,
        deltaQty: qty,
        action: 'move',
        isOnline,
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('moveEquipment failed', err);
    return { success: false, error: err?.message ?? 'Move failed' };
  }
}
