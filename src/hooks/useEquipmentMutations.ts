import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { EquipmentItem, ParsedPDFItem } from '../lib/types';
import { useAuthContext } from '../context/AuthContext';
import { useTeamContext } from '../context/TeamContext';
import { useSyncContext } from '../context/SyncContext';
import {
  upsertEquipmentItem,
  deleteEquipmentItemLocal,
  enqueueOp,
  generateId,
  getEquipmentByTeam,
} from '../lib/db';

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

// ─── Audit log helper ─────────────────────────────────────────────────────────

interface AuditParams {
  orgId: string;
  equipmentId: string;
  userId: string;
  actor: string;
  action: string;
  notes?: string;
  isOnline: boolean;
}

async function writeAuditLog(params: AuditParams): Promise<void> {
  const payload = {
    org_id: params.orgId,
    equipment_id: params.equipmentId,
    action: params.action,
    user_id: params.userId,
    actor: params.actor,
    meta: params.notes ? { notes: params.notes } : null,
  };

  if (params.isOnline) {
    try {
      await supabase.from(AUDIT_TABLE).insert(payload);
    } catch (e) {
      console.warn('Failed to write audit event', e);
    }
  } else {
    enqueueOp({ table_name: 'audit', operation: 'insert', payload: JSON.stringify(payload) });
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseMutationsReturn {
  addItem: (fields: ItemFields) => Promise<EquipmentItem>;
  addMultipleItems: (parsedItems: ParsedPDFItem[]) => Promise<void>;
  updateItem: (id: string, fields: Partial<ItemFields>) => Promise<EquipmentItem>;
  deleteItem: (id: string) => Promise<void>;
  reportDamage: (item: EquipmentItem, notes: string) => Promise<EquipmentItem>;
}

export function useEquipmentMutations(): UseMutationsReturn {
  const { profile, session } = useAuthContext();
  const { activeTeamId } = useTeamContext();
  const { isOnline, bumpLocalVersion } = useSyncContext();

  const userId = session?.user.id ?? '';
  const updatedBy = profile?.email ?? 'unknown';

  // ─── addItem ──────────────────────────────────────────────────────────────

  const addItem = useCallback(
    async (fields: ItemFields): Promise<EquipmentItem> => {
      if (!profile?.org_id || !activeTeamId) {
        throw new Error('No org or team selected');
      }

      const now = new Date().toISOString();
      const newId = generateId();

      // Build the full record locally so we can write to SQLite immediately
      const localItem: EquipmentItem = {
        id: newId,
        org_id: profile.org_id,
        team_id: activeTeamId,
        item_id: null,
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
        updated_at: now,
        created_at: now,
      };

      upsertEquipmentItem(localItem);

      if (isOnline) {
        const { data, error } = await supabase
          .from(EQUIPMENT_TABLE)
          .insert(localItem)
          .select('*')
          .single();

        if (error) throw error;

        // Overwrite local record with server's confirmed copy
        upsertEquipmentItem(data as EquipmentItem);
        await writeAuditLog({ orgId: profile.org_id, equipmentId: data.id, userId, actor: updatedBy, action: 'create', isOnline: true });
        bumpLocalVersion();
        return data as EquipmentItem;
      } else {
        enqueueOp({ table_name: EQUIPMENT_TABLE, operation: 'insert', payload: JSON.stringify(localItem) });
        await writeAuditLog({ orgId: profile.org_id, equipmentId: newId, userId, actor: updatedBy, action: 'create', isOnline: false });
        bumpLocalVersion();
        return localItem;
      }
    },
    [profile, activeTeamId, userId, updatedBy, isOnline, bumpLocalVersion]
  );

  // ─── updateItem ───────────────────────────────────────────────────────────

  const updateItem = useCallback(
    async (id: string, fields: Partial<ItemFields>): Promise<EquipmentItem> => {
      if (!profile?.org_id) throw new Error('Not authenticated');

      const now = new Date().toISOString();

      // Build patch — only include provided fields
      const patch: Record<string, unknown> = { updated_by: updatedBy, updated_at: now };
      if (fields.name !== undefined) patch.name = fields.name.trim();
      if (fields.category !== undefined) patch.category = fields.category.trim() || null;
      if (fields.source !== undefined) patch.source = fields.source.trim() || null;
      if (fields.location !== undefined) patch.location = fields.location.trim();
      if (fields.quantity !== undefined) patch.quantity = Number(fields.quantity);
      if (fields.reserve_min !== undefined) patch.reserve_min = Number(fields.reserve_min);
      if (fields.status !== undefined) patch.status = fields.status;
      if (fields.start_date !== undefined) patch.start_date = fields.start_date || null;
      if (fields.end_date !== undefined) patch.end_date = fields.end_date || null;

      if (isOnline) {
        const { data, error } = await supabase
          .from(EQUIPMENT_TABLE)
          .update(patch)
          .eq('id', id)
          .select('*')
          .single();

        if (error) throw error;

        upsertEquipmentItem(data as EquipmentItem);
        await writeAuditLog({ orgId: profile.org_id, equipmentId: id, userId, actor: updatedBy, action: 'edit', isOnline: true });
        bumpLocalVersion();
        return data as EquipmentItem;
      } else {
        // Find the current local record so we can snapshot its updated_at for
        // conflict detection on drain, and apply the patch locally.
        const existing = getEquipmentByTeam(profile.org_id, activeTeamId ?? '').find(
          (i) => i.id === id
        );
        if (existing) {
          upsertEquipmentItem({ ...existing, ...(patch as Partial<EquipmentItem>) });
        }

        enqueueOp({
          table_name: EQUIPMENT_TABLE,
          operation: 'update',
          payload: JSON.stringify({
            id,
            snapshot_updated_at: existing?.updated_at,
            patch,
          }),
        });
        await writeAuditLog({ orgId: profile.org_id, equipmentId: id, userId, actor: updatedBy, action: 'edit', isOnline: false });
        bumpLocalVersion();
        return { ...(existing ?? {}), ...(patch as Partial<EquipmentItem>), id } as EquipmentItem;
      }
    },
    [profile, activeTeamId, userId, updatedBy, isOnline, bumpLocalVersion]
  );

  // ─── deleteItem ───────────────────────────────────────────────────────────

  const deleteItem = useCallback(
    async (id: string): Promise<void> => {
      if (!profile?.org_id) throw new Error('Not authenticated');

      // Audit before delete so the equipment_id still exists server-side
      await writeAuditLog({ orgId: profile.org_id, equipmentId: id, userId, actor: updatedBy, action: 'delete', isOnline });

      deleteEquipmentItemLocal(id);

      if (isOnline) {
        const { error } = await supabase.from(EQUIPMENT_TABLE).delete().eq('id', id);
        if (error) throw error;
      } else {
        enqueueOp({ table_name: EQUIPMENT_TABLE, operation: 'delete', payload: JSON.stringify({ id }) });
      }

      bumpLocalVersion();
    },
    [profile, userId, updatedBy, isOnline, bumpLocalVersion]
  );

  // ─── addMultipleItems ─────────────────────────────────────────────────────

  const addMultipleItems = useCallback(
    async (parsedItems: ParsedPDFItem[]): Promise<void> => {
      if (!profile?.org_id || !activeTeamId) throw new Error('No org or team selected');
      if (!isOnline) throw new Error('PDF import requires a connection');

      const now = new Date().toISOString();

      const records: EquipmentItem[] = parsedItems.map((parsed) => ({
        id: generateId(),
        org_id: profile.org_id,
        team_id: activeTeamId,
        item_id: null,
        name: parsed.name.trim(),
        category: parsed.category.trim() || null,
        source: parsed.source.trim() || null,
        location: parsed.location.trim(),
        quantity: parsed.quantity,
        reserve_min: 0,
        status: 'Available',
        start_date: parsed.start_date || null,
        end_date: parsed.end_date || null,
        updated_by: updatedBy,
        updated_at: now,
        created_at: now,
      }));

      // Online-only: write to Supabase first, then persist server-confirmed copies locally
      const { data, error } = await supabase
        .from(EQUIPMENT_TABLE)
        .insert(records)
        .select('*');

      if (error) throw error;

      for (const item of data as EquipmentItem[]) {
        upsertEquipmentItem(item);
      }

      bumpLocalVersion();
    },
    [profile, activeTeamId, updatedBy, isOnline, bumpLocalVersion]
  );

  // ─── reportDamage ─────────────────────────────────────────────────────────

  const reportDamage = useCallback(
    async (item: EquipmentItem, notes: string): Promise<EquipmentItem> => {
      if (!profile?.org_id) throw new Error('Not authenticated');

      const now = new Date().toISOString();
      const patch = { status: 'Damaged', updated_by: updatedBy, updated_at: now };
      const updated: EquipmentItem = { ...item, ...patch };

      upsertEquipmentItem(updated);

      if (isOnline) {
        const { data, error } = await supabase
          .from(EQUIPMENT_TABLE)
          .update(patch)
          .eq('id', item.id)
          .select('*')
          .single();

        if (error) throw error;

        upsertEquipmentItem(data as EquipmentItem);
        await writeAuditLog({ orgId: profile.org_id, equipmentId: item.id, userId, actor: updatedBy, action: 'damage', notes: notes.trim() || undefined, isOnline: true });
        bumpLocalVersion();
        return data as EquipmentItem;
      } else {
        enqueueOp({
          table_name: EQUIPMENT_TABLE,
          operation: 'update',
          payload: JSON.stringify({
            id: item.id,
            snapshot_updated_at: item.updated_at,
            patch,
          }),
        });
        await writeAuditLog({ orgId: profile.org_id, equipmentId: item.id, userId, actor: updatedBy, action: 'damage', notes: notes.trim() || undefined, isOnline: false });
        bumpLocalVersion();
        return updated;
      }
    },
    [profile, userId, updatedBy, isOnline, bumpLocalVersion]
  );

  return { addItem, addMultipleItems, updateItem, deleteItem, reportDamage };
}
