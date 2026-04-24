/**
 * Move logic — mirrors the web app's moveEquipment + equipmentMoveUtils.
 *
 * Audit log entries now store user_id (UUID) rather than a name string,
 * so department heads can see exactly who moved what and when.
 *
 * Rules:
 * - Moving ALL qty + matching row at destination → merge + delete source
 * - Moving ALL qty + no matching row → update location in place
 * - Moving PARTIAL qty → decrement source, merge or insert at destination
 */

import { supabase } from './supabase';
import { EquipmentItem } from './types';

const AUDIT_TABLE = process.env.EXPO_PUBLIC_EQUIPMENT_AUDIT_TABLE ?? 'equipment_audit';

// Two rows are mergeable if they represent the same physical item type
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

async function writeAuditLog(params: {
  orgId: string;
  equipmentId: string;
  userId: string;      // UUID — not a display name
  fromLocation: string;
  toLocation: string;
  deltaQty: number;
  action: 'move' | 'merge';
  mergedFromId?: string;
}) {
  try {
    await supabase.from(AUDIT_TABLE).insert({
      org_id: params.orgId,
      equipment_id: params.equipmentId,
      action: params.action,
      user_id: params.userId,
      from_location: params.fromLocation,
      to_location: params.toLocation,
      delta_qty: params.deltaQty,
      meta: params.mergedFromId ? { merged_from_id: params.mergedFromId } : null,
    });
  } catch (e) {
    // Audit must never block a move
    console.warn('Failed to write audit event', e);
  }
}

interface MoveParams {
  sourceItem: EquipmentItem;
  moveQty: number;
  toLocation: string;
  allItems: EquipmentItem[];
  userId: string;      // UUID of the acting user
  updatedBy: string;   // display name kept on equipment_items.updated_by
}

interface MoveResult {
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
    if (movingAll) {
      if (dest) {
        // Merge: add to destination, delete source
        const { error: updateErr } = await supabase
          .from('equipment_items')
          .update({ quantity: (Number(dest.quantity) || 0) + qty, updated_by: updatedBy })
          .eq('id', dest.id);
        if (updateErr) throw updateErr;

        const { error: deleteErr } = await supabase
          .from('equipment_items')
          .delete()
          .eq('id', sourceItem.id);
        if (deleteErr) throw deleteErr;

        await writeAuditLog({
          orgId: sourceItem.org_id,
          equipmentId: dest.id,
          userId,
          fromLocation: sourceItem.location,
          toLocation,
          deltaQty: qty,
          action: 'merge',
          mergedFromId: sourceItem.id,
        });
      } else {
        // Just update location
        const { error } = await supabase
          .from('equipment_items')
          .update({ location: toLocation, updated_by: updatedBy })
          .eq('id', sourceItem.id);
        if (error) throw error;

        await writeAuditLog({
          orgId: sourceItem.org_id,
          equipmentId: sourceItem.id,
          userId,
          fromLocation: sourceItem.location,
          toLocation,
          deltaQty: qty,
          action: 'move',
        });
      }
    } else {
      // Partial move — decrement source
      const { error: srcErr } = await supabase
        .from('equipment_items')
        .update({ quantity: currentQty - qty, updated_by: updatedBy })
        .eq('id', sourceItem.id);
      if (srcErr) throw srcErr;

      if (dest) {
        // Merge partial into existing destination row
        const { error: destErr } = await supabase
          .from('equipment_items')
          .update({ quantity: (Number(dest.quantity) || 0) + qty, updated_by: updatedBy })
          .eq('id', dest.id);
        if (destErr) throw destErr;

        await writeAuditLog({
          orgId: sourceItem.org_id,
          equipmentId: dest.id,
          userId,
          fromLocation: sourceItem.location,
          toLocation,
          deltaQty: qty,
          action: 'merge',
          mergedFromId: sourceItem.id,
        });
      } else {
        // Insert new row at destination
        const { error: insertErr } = await supabase
          .from('equipment_items')
          .insert({
            org_id: sourceItem.org_id,
            team_id: sourceItem.team_id,
            item_id: sourceItem.item_id,
            name: sourceItem.name,
            category: sourceItem.category,
            source: sourceItem.source,
            quantity: qty,
            reserve_min: sourceItem.reserve_min,
            location: toLocation,
            status: sourceItem.status,
            start_date: sourceItem.start_date,
            end_date: sourceItem.end_date,
            updated_by: updatedBy,
          });
        if (insertErr) throw insertErr;

        await writeAuditLog({
          orgId: sourceItem.org_id,
          equipmentId: sourceItem.id,
          userId,
          fromLocation: sourceItem.location,
          toLocation,
          deltaQty: qty,
          action: 'move',
        });
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('moveEquipment failed', err);
    return { success: false, error: err?.message ?? 'Move failed' };
  }
}
