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

  try {
    if (movingAll && dest) {
      // ── Full move with merge: add to destination, delete source ──────────
      const newDestQty = (Number(dest.quantity) || 0) + qty;

      upsertEquipmentItem({ ...dest, quantity: newDestQty, updated_by: updatedBy });
      deleteEquipmentItemLocal(sourceItem.id);

      if (isOnline) {
        const { error: updateErr } = await supabase
          .from(EQUIPMENT_TABLE)
          .update({ quantity: newDestQty, updated_by: updatedBy })
          .eq('id', dest.id);
        if (updateErr) throw updateErr;

        const { error: deleteErr } = await supabase
          .from(EQUIPMENT_TABLE)
          .delete()
          .eq('id', sourceItem.id);
        if (deleteErr) throw deleteErr;
      } else {
        enqueueOp({ table_name: EQUIPMENT_TABLE, operation: 'update', payload: JSON.stringify({ id: dest.id, patch: { quantity: newDestQty, updated_by: updatedBy } }) });
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
      upsertEquipmentItem({ ...sourceItem, location: toLocation, updated_by: updatedBy });

      if (isOnline) {
        const { error } = await supabase
          .from(EQUIPMENT_TABLE)
          .update({ location: toLocation, updated_by: updatedBy })
          .eq('id', sourceItem.id);
        if (error) throw error;
      } else {
        enqueueOp({ table_name: EQUIPMENT_TABLE, operation: 'update', payload: JSON.stringify({ id: sourceItem.id, patch: { location: toLocation, updated_by: updatedBy } }) });
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

      upsertEquipmentItem({ ...sourceItem, quantity: newSourceQty, updated_by: updatedBy });
      upsertEquipmentItem({ ...dest, quantity: newDestQty, updated_by: updatedBy });

      if (isOnline) {
        const { error: srcErr } = await supabase
          .from(EQUIPMENT_TABLE)
          .update({ quantity: newSourceQty, updated_by: updatedBy })
          .eq('id', sourceItem.id);
        if (srcErr) throw srcErr;

        const { error: destErr } = await supabase
          .from(EQUIPMENT_TABLE)
          .update({ quantity: newDestQty, updated_by: updatedBy })
          .eq('id', dest.id);
        if (destErr) throw destErr;
      } else {
        enqueueOp({ table_name: EQUIPMENT_TABLE, operation: 'update', payload: JSON.stringify({ id: sourceItem.id, patch: { quantity: newSourceQty, updated_by: updatedBy } }) });
        enqueueOp({ table_name: EQUIPMENT_TABLE, operation: 'update', payload: JSON.stringify({ id: dest.id, patch: { quantity: newDestQty, updated_by: updatedBy } }) });
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
        created_at: new Date().toISOString(),
      };

      upsertEquipmentItem({ ...sourceItem, quantity: newSourceQty, updated_by: updatedBy });
      upsertEquipmentItem(newItem);

      if (isOnline) {
        const { error: srcErr } = await supabase
          .from(EQUIPMENT_TABLE)
          .update({ quantity: newSourceQty, updated_by: updatedBy })
          .eq('id', sourceItem.id);
        if (srcErr) throw srcErr;

        const { error: insertErr } = await supabase
          .from(EQUIPMENT_TABLE)
          .insert(newItem);
        if (insertErr) throw insertErr;
      } else {
        enqueueOp({ table_name: EQUIPMENT_TABLE, operation: 'update', payload: JSON.stringify({ id: sourceItem.id, patch: { quantity: newSourceQty, updated_by: updatedBy } }) });
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
