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
  getSyncMeta,
  claimLocalDataFor,
  clearCachedData,
  clearLocalData,
  upsertEquipmentItem,
  deleteEquipmentItemLocal,
} from '../lib/db';
import { drainNoticeText, drainQueue, pullFromSupabase, type SyncDeps } from '../lib/sync';
import { EquipmentItem } from '../lib/types';
import { useAuthContext } from './AuthContext';
import { useTeamContext } from './TeamContext';
import { useOrgContext } from './OrgContext';

const AUDIT_TABLE = 'equipment_audit';

/** Foreground resumes within this window of a successful sync skip the full pull (L36). */
const FOREGROUND_RESYNC_MIN_MS = 60_000;

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
  /**
   * Wipe ALL local data, including unsynced changes. For account deletion —
   * a plain sign-out already drops the cache and keeps the queue.
   */
  discardLocalData: () => void;
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
  discardLocalData: () => {},
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
  // Set when NetInfo reports a reconnect before it has confirmed the internet
  // is reachable; the deferred sync runs once reachability turns true.
  const reconnectSyncPendingRef = useRef(false);
  // Which team we last kicked off a sync for — re-syncs on team switch,
  // not just on first mount.
  const lastSyncedTeamRef = useRef<string | null>(null);

  // Init DB on mount (safe to call multiple times — uses CREATE IF NOT EXISTS)
  useEffect(() => {
    initDB();
    setPendingOps(getSyncQueueCount());
  }, []);

  // Clear the pending notice timer on unmount.
  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const bumpLocalVersion = useCallback(() => {
    setLocalVersion((v) => v + 1);
    setPendingOps(getSyncQueueCount());
  }, []);

  // Local data was wiped: forget sync state derived from it and re-read.
  const resetAfterWipe = useCallback(() => {
    lastSyncedTeamRef.current = null;
    setLastSyncedAt(null);
    setSyncError(null);
    bumpLocalVersion();
  }, [bumpLocalVersion]);

  // ─── Ownership — one user's data per device ─────────────────────────────────
  // The DB belongs to one user (sync_meta owner_user_id). Sign-in by a
  // different user wipes everything, queue included; sign-out drops the cached
  // org data but keeps the queue, so the same user's unsynced changes upload
  // when they sign in here again.
  // Must stay ABOVE the initial-sync effect: effects run in declaration order,
  // so a different user's queue is wiped before anything can drain it.
  const userId = session?.user.id ?? null;
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevUserIdRef.current;
    prevUserIdRef.current = userId;
    try {
      if (userId) {
        if (claimLocalDataFor(userId)) resetAfterWipe();
      } else if (prev) {
        // Real sign-out (explicit, or the refresh token was revoked). The
        // null session during cold-start loading has no prev, so it never
        // gets here.
        clearCachedData();
        resetAfterWipe();
      }
    } catch (e) {
      console.error('[Sync] local data ownership check failed', e);
    }
  }, [userId, resetAfterWipe]);

  const discardLocalData = useCallback(() => {
    try {
      clearLocalData();
    } catch (e) {
      console.error('[Sync] wiping local data failed', e);
    }
    resetAfterWipe();
  }, [resetAfterWipe]);

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
      // Belt and braces for the ownership effect: never replay another user's
      // queued ops under this session's token.
      if (claimLocalDataFor(session.user.id)) {
        lastSyncedTeamRef.current = null;
        bumpLocalVersion(); // screens + pending badge re-read the wiped DB even if the sync below fails
      }

      const stats = await drainQueue(SYNC_DEPS, AUDIT_TABLE);

      // Tell the user when offline changes didn't make it: either someone
      // else edited the same items while we were offline (server wins), or
      // an op failed permanently. Shown before the pull so a failing pull
      // can't hide it. Auto-clears after a few seconds.
      const notice = drainNoticeText(stats);
      if (notice) {
        setSyncNotice(notice);
        if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = setTimeout(() => setSyncNotice(null), 8000);
      }

      if (stats.interrupted) {
        // Connection/auth dropped mid-drain: the rest of the queue is intact
        // and retries on the next reconnect/foreground. Pulling now would
        // fail the same way, so stop here.
        setSyncError('connection lost — offline changes are saved and will retry');
        return true;
      }

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
      bumpLocalVersion();
    } catch (e: any) {
      console.error('[Sync] sync failed', e);
      setSyncError(e?.message ?? 'Sync failed');
    } finally {
      // Entries may have been applied or dropped even when the sync failed.
      setPendingOps(getSyncQueueCount());
      setIsSyncing(false);
      syncInProgressRef.current = false;
    }
    return true;
  }, [profile, activeTeamId, teamsEnabled, session, bumpLocalVersion]);

  // Latest triggerSync for the realtime status callback below, so the channel
  // is not torn down and re-created whenever triggerSync's identity changes.
  const triggerSyncRef = useRef(triggerSync);
  useEffect(() => {
    triggerSyncRef.current = triggerSync;
  }, [triggerSync]);
  const needsResyncRef = useRef(false);

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
        // NO filter on purpose (audit M1): Realtime can only filter DELETE
        // events on a table with REPLICA IDENTITY FULL, so the old org_id
        // filter meant this never fired. Do NOT set REPLICA IDENTITY FULL:
        // Realtime skips RLS for DELETE, so every subscriber would receive
        // whole deleted rows from every org. Unfiltered, we receive only ids.
        { event: 'DELETE', schema: 'public', table: 'equipment_items' },
        (payload) => {
          // DELETE payloads only carry the primary key; deleting a row we
          // don't have locally (e.g. another org's) is a harmless no-op.
          const id = (payload.old as { id?: string } | null)?.id;
          if (!id) return;
          deleteEquipmentItemLocal(String(id));
          bumpLocalVersion();
        }
      )
      .subscribe((status) => {
        // A dropped or timed-out channel may have missed events: pull now,
        // and once more when the client has rejoined.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          needsResyncRef.current = true;
          triggerSyncRef.current();
        } else if (status === 'SUBSCRIBED' && needsResyncRef.current) {
          needsResyncRef.current = false;
          triggerSyncRef.current();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.org_id, activeTeamId, teamsEnabled, isOnline, bumpLocalVersion]);

  // ─── NetInfo — detect connectivity changes ─────────────────────────────────

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      // `online` drives the UI and the mutation path: unknown reachability
      // (null) counts as online, as before.
      const online = state.isConnected === true && state.isInternetReachable !== false;
      const wasOffline = !isOnlineRef.current;
      isOnlineRef.current = online;
      setIsOnline(online);

      // Auto-sync when coming back online — but only once NetInfo has
      // confirmed the internet is reachable. The first event after a
      // reconnect often has isInternetReachable === null while the link is
      // still flapping; draining then just fails.
      if (!online) {
        reconnectSyncPendingRef.current = false;
        return;
      }
      if (wasOffline) reconnectSyncPendingRef.current = true;
      if (reconnectSyncPendingRef.current && state.isInternetReachable === true) {
        reconnectSyncPendingRef.current = false;
        triggerSync();
      }
    });

    return unsubscribe;
  }, [triggerSync]);

  // ─── App foreground — sync when user brings app back up ───────────────────

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && isOnlineRef.current) {
        // Returning from the file picker / camera / a quick app switch: skip
        // the full pull when nothing is queued and the last successful sync
        // is under a minute old. Reconnects and scope changes always sync.
        let recent = false;
        try {
          const last = getSyncMeta('last_synced');
          const age = last === null ? NaN : Date.now() - Date.parse(last);
          recent = age >= 0 && age < FOREGROUND_RESYNC_MIN_MS && getSyncQueueCount() === 0;
        } catch {
          // Local DB unreadable: fall through and sync.
        }
        if (recent) return;
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
        discardLocalData,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}
