import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { EquipmentItem } from '../lib/types';
import { useAuthContext } from '../context/AuthContext';
import { useTeamContext } from '../context/TeamContext';

const EQUIPMENT_TABLE = 'equipment_items';
const AUDIT_TABLE = process.env.EXPO_PUBLIC_EQUIPMENT_AUDIT_TABLE ?? 'equipment_audit';

// Fields the user can set when adding or editing an item
export interface ItemFields {
  name: string;
  category: string;
  source: string;
  location: string;
  quantity: number;
  reserve_min: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

async function writeAuditLog(params: {
  orgId: string;
  equipmentId: string;
  userId: string;
  actor: string;   // display name / email — shown in the log UI
  action: string;
  notes?: string;
}) {
  try {
    await supabase.from(AUDIT_TABLE).insert({
      org_id: params.orgId,
      equipment_id: params.equipmentId,
      action: params.action,
      user_id: params.userId,
      actor: params.actor,
      meta: params.notes ? { notes: params.notes } : null,
    });
  } catch (e) {
    console.warn('Failed to write audit event', e);
  }
}

interface UseMutationsReturn {
  addItem: (fields: ItemFields) => Promise<EquipmentItem>;
  updateItem: (id: string, fields: Partial<ItemFields>) => Promise<EquipmentItem>;
  deleteItem: (id: string) => Promise<void>;
  reportDamage: (item: EquipmentItem, notes: string) => Promise<EquipmentItem>;
}

export function useEquipmentMutations(): UseMutationsReturn {
  const { profile, session } = useAuthContext();
  const { activeTeamId } = useTeamContext();

  const userId = session?.user.id ?? '';
  const updatedBy = profile?.email ?? 'unknown';

  const addItem = useCallback(
    async (fields: ItemFields): Promise<EquipmentItem> => {
      if (!profile?.org_id || !activeTeamId) {
        throw new Error('No org or team selected');
      }

      const { data, error } = await supabase
        .from(EQUIPMENT_TABLE)
        .insert({
          org_id: profile.org_id,
          team_id: activeTeamId,
          name: fields.name.trim(),
          category: fields.category.trim() || null,
          source: fields.source.trim() || null,
          location: fields.location.trim(),
          quantity: fields.quantity,
          reserve_min: fields.reserve_min,
          status: fields.status,
          start_date: fields.start_date || null,
          end_date: fields.end_date || null,
          updated_by: updatedBy,
        })
        .select('*')
        .single();

      if (error) throw error;

      await writeAuditLog({
        orgId: profile.org_id,
        equipmentId: data.id,
        userId,
        actor: updatedBy,
        action: 'create',
      });

      return data as EquipmentItem;
    },
    [profile, activeTeamId, userId, updatedBy]
  );

  const updateItem = useCallback(
    async (id: string, fields: Partial<ItemFields>): Promise<EquipmentItem> => {
      if (!profile?.org_id) throw new Error('Not authenticated');

      // Build patch — omit keys not present in fields so we don't
      // accidentally wipe columns not shown on the form
      const patch: Record<string, unknown> = { updated_by: updatedBy };

      if (fields.name !== undefined) patch.name = fields.name.trim();
      if (fields.category !== undefined) patch.category = fields.category.trim() || null;
      if (fields.source !== undefined) patch.source = fields.source.trim() || null;
      if (fields.location !== undefined) patch.location = fields.location.trim();
      if (fields.quantity !== undefined) patch.quantity = Number(fields.quantity);
      if (fields.reserve_min !== undefined) patch.reserve_min = Number(fields.reserve_min);
      if (fields.status !== undefined) patch.status = fields.status;
      if (fields.start_date !== undefined) patch.start_date = fields.start_date || null;
      if (fields.end_date !== undefined) patch.end_date = fields.end_date || null;

      const { data, error } = await supabase
        .from(EQUIPMENT_TABLE)
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;

      await writeAuditLog({
        orgId: profile.org_id,
        equipmentId: id,
        userId,
        actor: updatedBy,
        action: 'edit',
      });

      return data as EquipmentItem;
    },
    [profile, userId, updatedBy]
  );

  const deleteItem = useCallback(
    async (id: string): Promise<void> => {
      if (!profile?.org_id) throw new Error('Not authenticated');

      // Write audit before delete so the equipment_id still exists
      await writeAuditLog({
        orgId: profile.org_id,
        equipmentId: id,
        userId,
        actor: updatedBy,
        action: 'delete',
      });

      const { error } = await supabase
        .from(EQUIPMENT_TABLE)
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    [profile, userId]
  );

  const reportDamage = useCallback(
    async (item: EquipmentItem, notes: string): Promise<EquipmentItem> => {
      if (!profile?.org_id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from(EQUIPMENT_TABLE)
        .update({ status: 'Damaged', updated_by: updatedBy })
        .eq('id', item.id)
        .select('*')
        .single();

      if (error) throw error;

      await writeAuditLog({
        orgId: profile.org_id,
        equipmentId: item.id,
        userId,
        actor: updatedBy,
        action: 'damage',
        notes: notes.trim() || undefined,
      });

      return data as EquipmentItem;
    },
    [profile, userId, updatedBy]
  );

  return { addItem, updateItem, deleteItem, reportDamage };
}
