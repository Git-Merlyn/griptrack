/**
 * SyncContext — manages connectivity detection and when to sync. The sync
 * engine itself (queue drain + full pull) lives in lib/sync.ts.
 *
 * Architecture:
 *   - SQLite is always the read source (even when online, after first sync).
 *   - Mutations write to SQLite immediately for instant UI feedback.
 *   - When online: mutations also write directly to Supabase.
 *   - When offline: mutations add entries to the sync_queue table.
 *   - On reconnect (or app foreground): drain queue → full pull from Supabase.
 *   - Server always wins on conflict (full replace after queue drain).
 *   - Conflict-resolution details: see lib/sync.ts.
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
import { drainQueue, pullFromSupabase, type SyncDeps } from '../lib/sync';
import { EquipmentItem } from '../lib/types';
import { useAuthContext } from './AuthContext';
import { useTeamContext } from './TeamContext';
import { useOrgContext } from './OrgContext';

const AUDIT_TABLE = 'equipment_audit';

// Real implementations injected into the sync engine (tests pass fakes).
const SYNC_DEPS: SyncDeps = {
  supabase,
  db: {
    getSyncQueue,
    removeSyncEntry,
    incrementSyncRetries,
    replaceEquipmentForTeam,
    replaceEquipmentForOrg,
    replaceLocationsForOrg,
    replaceRequestsForOrg,
  },
};

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
      const stats = await drainQueue(SYNC_DEPS, AUDIT_TABLE);
      await pullFromSupabase(SYNC_DEPS, {
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
