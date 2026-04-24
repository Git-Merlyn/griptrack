/**
 * Move logic — mirrors the web app's moveEquipment + equipmentMoveUtils.
 *
 * Rules:
 * - If moving ALL qty and a matching row exists at the destination → merge + delete source
 * - If moving ALL qty and no matching row → update location in place
 * - If moving PARTIAL qty → decrement source, then merge or insert at destination
 *
 * "Matching" means same name, category, source, status, item_id, start_date, end_date.
 */

import { supabase } from './supabase';
import { EquipmentItem } from './types';

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
  // Don't merge within the same location
  if (source.location === toLocation) return undefined;

  return allItems.find(
    (x) =>
      x.id !== source.id &&
      x.location === toLocation &&
      isMergeable(x, source)
  );
}

interface MoveParams {
  sourceItem: EquipmentItem;
  moveQty: number;
  toLocation: string;
  allItems: EquipmentItem[]; // current equipment list (for merge detection)
  updatedBy: string;
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
        // Merge: add qty to destination, delete source
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
      } else {
        // Just update location
        const { error } = await supabase
          .from('equipment_items')
          .update({ location: toLocation, updated_by: updatedBy })
          .eq('id', sourceItem.id);
        if (error) throw error;
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
      } else {
        // Insert new row at destination
        const { error: insertErr } = await supabase
          .from('equipment_items')
          .insert({
            org_id: sourceItem.org_id,
            production_id: sourceItem.production_id,
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
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('moveEquipment failed', err);
    return { success: false, error: err?.message ?? 'Move failed' };
  }
}
