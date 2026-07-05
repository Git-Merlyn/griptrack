/**
 * SyncContext — manages connectivity detection, offline queue drain, and
 * full data pull from Supabase.
 *
 * Architecture:
 *   - SQLite is always the read source (even when online, after first sync).
 *   - Mutations write to SQLite immediately for instant UI feedback.
 *   - When online: mutations also write directly to Supabase.
 *   - When offline: mutations add entries to the sync_queue table.
 *   - On reconnect (or app foreground): drain queue → full pull from Supabase.
 *   - Server always wins on conflict (full replace after queue drain).
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

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

import { supabase } from '../lib/supabase';
import {
  initDB,
  getSyncQueue,
  removeSyncEntry,
  incrementSyncRetries,
  getSyncQueueCount,
  replaceEquipmentForTeam,
  replaceEquipmentForOrg,
  replaceLocationsForOrg,
  replaceRequestsForOrg,
  setSyncMeta,
  upsertEquipmentItem,
  deleteEquipmentItemLocal,
} from '../lib/db';
import { EquipmentItem, Location, canManageInventory } from '../lib/types';
import type { EquipmentRequest } from '../hooks/useRequests';
import { useAuthContext } from './AuthContext';
import { useTeamContext } from './TeamContext';
import { useOrgContext } from './OrgContext';

const AUDIT_TABLE = process.env.EXPO_PUBLIC_EQUIPMENT_AUDIT_TABLE ?? 'equipment_audit';

// ─── Context shape ────────────────────────────────────────────────────────────

interface SyncContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncError: string | null;
  /**
   * Transient, user-facing notice after a drain in which offline changes were
   * discarded (server won a conflict) or permanently failed. Auto-clears.
   */
  syncNotice: string | null;
  /** Number of mutations waiting in the offline queue */
  pendingOps: number;
  /**
   * Incremented whenever local SQLite data changes (mutation or sync).
   * Hooks subscribe to this to know when to re-read from SQLite.
   */
  localVersion: number;
  bumpLocalVersion: () => void;
  /** Resolves true when a sync actually started, false when skipped. */
  triggerSync: () => Promise<boolean>;
}

const SyncContext = createContext<SyncContextValue>({
  isOnline: true,
  isSyncing: false,
  lastSyncedAt: null,
  syncError: null,
  syncNotice: null,
  pendingOps: 0,
  localVersion: 0,
  bumpLocalVersion: () => {},
  triggerSync: async () => false,
});

export function useSyncContext() {
  return useContext(SyncContext);
}

// ─── Pull helpers (pure, outside component) ───────────────────────────────────

/** Outcome of a queue drain — used to tell the user what didn't make it. */
export interface DrainStats {
  applied: number;
  /** Ops skipped because the server row changed while we were offline (server wins) */
  discarded: number;
  /** Ops permanently dropped after exhausting retries */
  failed: number;
}

async function drainQueue(auditTable: string): Promise<DrainStats> {
  const entries = getSyncQueue();
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
            removeSyncEntry(entry.id);
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
          const { error } = await supabase.rpc('increment_equipment_quantity', {
            item_id: payload.id,
            delta: payload.qty_delta,
            updated_by_val: payload.patch.updated_by,
            updated_at_val: payload.patch.updated_at,
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

      } else if (entry.operation === 'delete') {
        const { error } = await supabase.from(tableName).delete().eq('id', payload.id);
        if (error) throw error;
      }

      removeSyncEntry(entry.id);
      stats.applied++;
    } catch (e: any) {
      incrementSyncRetries(entry.id);

      // If the row was already deleted server-side, discard the entry rather
      // than blocking the rest of the queue.
      const isGone =
        e?.code === 'PGRST116' ||
        e?.message?.includes('not found') ||
        e?.message?.includes('does not exist');

      // entry.retries is the pre-increment value read from the queue, so add
      // 1 to compare against the intended max of 3 attempts.
      if (isGone || entry.retries + 1 >= 3) {
        removeSyncEntry(entry.id);
        stats.failed++;
      }

      console.warn(`[Sync] queue entry ${entry.id} failed (retry ${entry.retries + 1})`, e?.message);
      // Continue — don't let one bad entry block everything else
    }
  }

  return stats;
}

async function pullFromSupabase(params: {
  orgId: string;
  teamId: string | null;
  teamsEnabled: boolean;
  userId: string;
  role: string;
}): Promise<void> {
  const { orgId, teamId, teamsEnabled, userId, role } = params;
  const isAdmin = canManageInventory(role as any);

  // Equipment items. Teams off → the whole org is one flat pool; teams on →
  // scope to the active team.
  let itemsQuery = supabase.from('equipment_items').select('*').eq('org_id', orgId);
  if (teamsEnabled && teamId) itemsQuery = itemsQuery.eq('team_id', teamId);
  const { data: items, error: itemsErr } = await itemsQuery;
  if (itemsErr) throw itemsErr;
  if (items) {
    if (teamsEnabled && teamId) {
      replaceEquipmentForTeam(orgId, teamId, items as EquipmentItem[]);
    } else {
      replaceEquipmentForOrg(orgId, items as EquipmentItem[]);
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
  if (locs) replaceLocationsForOrg(orgId, locs as Location[]);

  // Requests — admins see all, crew see their own
  let reqQuery = supabase.from('equipment_requests').select('*').eq('org_id', orgId);
  if (!isAdmin) reqQuery = reqQuery.eq('requested_by', userId);
  const { data: reqs, error: reqsErr } = await reqQuery;
  if (reqsErr) throw reqsErr;
  if (reqs) replaceRequestsForOrg(orgId, reqs as EquipmentRequest[]);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { profile, session } = useAuthContext();
  const { activeTeamId } = useTeamContext();
  const { features } = useOrgContext();
  const teamsEnabled = features.teamsEnabled;

  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [pendingOps, setPendingOps] = useState(0);
  const [localVersion, setLocalVersion] = useState(0);

  // Refs so callbacks always see the latest values without re-creating
  const isOnlineRef = useRef(true);
  const syncInProgressRef = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Which team we last kicked off a sync for — re-syncs on team switch,
  // not just on first mount.
  const lastSyncedTeamRef = useRef<string | null>(null);

  // Init DB on mount (safe to call multiple times — uses CREATE IF NOT EXISTS)
  useEffect(() => {
    initDB();
    setPendingOps(getSyncQueueCount());
  }, []);

  const bumpLocalVersion = useCallback(() => {
    setLocalVersion((v) => v + 1);
    setPendingOps(getSyncQueueCount());
  }, []);

  // Returns true when a sync actually started (false when skipped because one
  // is already running or auth/team state isn't ready).
  const triggerSync = useCallback(async (): Promise<boolean> => {
    if (syncInProgressRef.current) return false;
    // Teams on → need an active team. Teams off → org-wide, no team required.
    if (!profile?.org_id || !session?.user.id) return false;
    if (teamsEnabled && !activeTeamId) return false;

    syncInProgressRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
      const stats = await drainQueue(AUDIT_TABLE);
      await pullFromSupabase({
        orgId: profile.org_id,
        teamId: activeTeamId,
        teamsEnabled,
        userId: session.user.id,
        role: profile.role,
      });

      const now = new Date();
      setLastSyncedAt(now);
      setSyncMeta('last_synced', now.toISOString());
      setPendingOps(0);
      bumpLocalVersion();

      // Tell the user when offline changes didn't make it: either someone
      // else edited the same items while we were offline (server wins), or
      // an op failed permanently. Auto-clears after a few seconds.
      const lost = stats.discarded + stats.failed;
      if (lost > 0) {
        setSyncNotice(
          stats.discarded > 0 && stats.failed === 0
            ? `${stats.discarded} offline change${stats.discarded !== 1 ? 's' : ''} skipped — items were updated by someone else`
            : `${lost} offline change${lost !== 1 ? 's' : ''} couldn't be applied`
        );
        if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = setTimeout(() => setSyncNotice(null), 8000);
      }
    } catch (e: any) {
      console.error('[Sync] sync failed', e);
      setSyncError(e?.message ?? 'Sync failed');
    } finally {
      setIsSyncing(false);
      syncInProgressRef.current = false;
    }
    return true;
  }, [profile, activeTeamId, teamsEnabled, session, bumpLocalVersion]);

  // ─── Realtime — live equipment updates while online ────────────────────────
  // Mirrors the web app: another device's insert/update/delete lands in
  // SQLite immediately instead of waiting for the next full sync. The queue
  // drain remains the source of truth for our own offline mutations.

  useEffect(() => {
    if (!profile?.org_id || !isOnline) return;
    if (teamsEnabled && !activeTeamId) return;

    const orgId = profile.org_id;
    // Teams off: accept every org row. Teams on: only the active team's rows.
    const inScope = (row: EquipmentItem) => !teamsEnabled || row.team_id === activeTeamId;

    const channel = supabase
      .channel(`equipment-${orgId}-${activeTeamId ?? 'org'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'equipment_items', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as EquipmentItem;
          if (!inScope(row)) return;
          upsertEquipmentItem(row);
          bumpLocalVersion();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'equipment_items', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as EquipmentItem;
          if (!inScope(row)) return;
          upsertEquipmentItem(row);
          bumpLocalVersion();
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'equipment_items', filter: `org_id=eq.${orgId}` },
        (payload) => {
          // DELETE payloads only carry the primary key; deleting a row we
          // don't have locally is a harmless no-op.
          const id = (payload.old as { id?: string } | null)?.id;
          if (!id) return;
          deleteEquipmentItemLocal(String(id));
          bumpLocalVersion();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.org_id, activeTeamId, teamsEnabled, isOnline, bumpLocalVersion]);

  // ─── NetInfo — detect connectivity changes ─────────────────────────────────

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      const wasOffline = !isOnlineRef.current;
      isOnlineRef.current = online;
      setIsOnline(online);

      // Auto-sync when coming back online
      if (online && wasOffline) {
        triggerSync();
      }
    });

    return unsubscribe;
  }, [triggerSync]);

  // ─── App foreground — sync when user brings app back up ───────────────────

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && isOnlineRef.current) {
        triggerSync();
      }
    });
    return () => sub.remove();
  }, [triggerSync]);

  // ─── Initial sync + team switches — pull whenever the scope changes ────────
  // Teams on: re-sync on team switch. Teams off: sync once for the org (the
  // "team" is a fixed sentinel so the ref logic still fires exactly once).

  useEffect(() => {
    const scopeKey = teamsEnabled ? activeTeamId : '__org__';
    const ready = profile?.org_id && session?.user.id && (teamsEnabled ? !!activeTeamId : true);
    if (ready && lastSyncedTeamRef.current !== scopeKey) {
      triggerSync().then((started) => {
        // Only record the scope once a sync actually kicked off; if one was
        // already in flight, leave the ref unset — isSyncing flipping back to
        // false re-runs this effect and retries.
        if (started) lastSyncedTeamRef.current = scopeKey;
      });
    }
  }, [profile?.org_id, activeTeamId, teamsEnabled, session?.user.id, triggerSync, isSyncing]);

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        isSyncing,
        lastSyncedAt,
        syncError,
        syncNotice,
        pendingOps,
        localVersion,
        bumpLocalVersion,
        triggerSync,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}
