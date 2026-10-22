/**
 * authCache — what the app needs to open offline (audit H7, M26, L31).
 *
 * 1. The last good identity (profile + org feature flags) from
 *    bootstrap_session, and the last team list per org. Both live in the
 *    SQLite sync_meta table next to the rest of the offline cache:
 *      auth_identity   -> Identity (one signed-in user per device)
 *      teams:<orgId>   -> Team[]
 *    clearAuthCache() removes both on sign-out.
 *
 * 2. Direct access to the session auth-js persists in SecureStore. auth-js has
 *    no public API for either case below:
 *      readStoredSession   - the stored (possibly expired) session, used while
 *                            the token cannot be refreshed offline.
 *      removeStoredSession - local sign-out when the server is unreachable.
 *                            auth-js signOut(), even with scope 'local', calls
 *                            /logout first and keeps the session if that fails.
 */
import * as SecureStore from 'expo-secure-store';
import type { Session } from '@supabase/supabase-js';
import { db } from './db';
import { supabase } from './supabase';
import type { Role, Team, UserProfile } from './types';

export interface OrgFeatures {
  teamsEnabled: boolean;
  requestsEnabled: boolean;
}

export interface Identity {
  userId: string;
  profile: UserProfile;
  features: OrgFeatures;
}

/** The part of the bootstrap_session() jsonb that mobile reads. */
export interface BootstrapPayload {
  org_id: string | null;
  role: string | null;
  team_id: string | null;
  ghost?: boolean;
  ghost_write?: boolean;
  org: { name?: string | null; trial_ends_at?: string | null; features?: unknown } | null;
  profile: { id?: string; email?: string | null; full_name?: string | null } | null;
}

type AuthUserLike = {
  id: string;
  email?: string | null;
  user_metadata?: { [key: string]: unknown } | null;
};

/** Flags are opt-in: anything other than literal true is off (same rule as before). */
export function parseFeatures(raw: unknown): OrgFeatures {
  const f = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    teamsEnabled: f.teams_enabled === true,
    requestsEnabled: f.requests_enabled === true,
  };
}

/** Map the bootstrap_session() result to an Identity. null = no org in the result. */
export function identityFromBootstrap(
  boot: BootstrapPayload | null | undefined,
  user: AuthUserLike
): Identity | null {
  if (!boot || !boot.org_id || !boot.role) return null;
  const rawMetaName = user.user_metadata?.full_name;
  const metaName = typeof rawMetaName === 'string' ? rawMetaName.trim() : '';
  const fullName = boot.profile?.full_name?.trim() || metaName || null;
  return {
    userId: user.id,
    profile: {
      id: user.id,
      email: boot.profile?.email ?? user.email ?? '',
      full_name: fullName,
      org_id: boot.org_id,
      team_id: boot.team_id ?? null,
      role: boot.role as Role,
    },
    features: parseFeatures(boot.org?.features),
  };
}

// ─── sync_meta access ────────────────────────────────────────────────────────

const IDENTITY_KEY = 'auth_identity';
const teamsKey = (orgId: string) => `teams:${orgId}`;

let metaTableReady = false;

function ensureMetaTable(): void {
  if (metaTableReady) return;
  // initDB() (SyncProvider) creates this table too, but useAuth can read the
  // cache before SyncProvider's effect has run.
  db.execSync('CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT);');
  metaTableReady = true;
}

function readMeta(key: string): string | null {
  try {
    ensureMetaTable();
    const row = db.getFirstSync('SELECT value FROM sync_meta WHERE key = ?', [key]) as
      | { value: string | null }
      | null;
    return row?.value ?? null;
  } catch (e) {
    console.warn('[authCache] read failed', key, e);
    return null;
  }
}

function writeMeta(key: string, value: string): void {
  try {
    ensureMetaTable();
    db.runSync('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [key, value]);
  } catch (e) {
    console.warn('[authCache] write failed', key, e);
  }
}

export function readCachedIdentity(): Identity | null {
  const raw = readMeta(IDENTITY_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Identity> | null;
    const p = v?.profile;
    if (
      !v ||
      typeof v.userId !== 'string' ||
      !p ||
      p.id !== v.userId ||
      typeof p.org_id !== 'string' ||
      typeof p.role !== 'string' ||
      !v.features
    ) {
      return null;
    }
    return {
      userId: v.userId,
      profile: {
        id: p.id,
        email: typeof p.email === 'string' ? p.email : '',
        full_name: typeof p.full_name === 'string' ? p.full_name : null,
        org_id: p.org_id,
        team_id: typeof p.team_id === 'string' ? p.team_id : null,
        role: p.role,
      },
      features: {
        teamsEnabled: v.features.teamsEnabled === true,
        requestsEnabled: v.features.requestsEnabled === true,
      },
    };
  } catch {
    return null;
  }
}

export function writeCachedIdentity(identity: Identity): void {
  writeMeta(IDENTITY_KEY, JSON.stringify(identity));
}

export function readCachedTeams(orgId: string): Team[] | null {
  const raw = readMeta(teamsKey(orgId));
  if (!raw) return null;
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    return list.filter(
      (t): t is Team => !!t && typeof t.id === 'string' && typeof t.name === 'string'
    );
  } catch {
    return null;
  }
}

export function writeCachedTeams(orgId: string, teams: Team[]): void {
  writeMeta(teamsKey(orgId), JSON.stringify(teams));
}

/** Forget the cached identity and every cached team list (sign-out). */
export function clearAuthCache(): void {
  try {
    ensureMetaTable();
    db.runSync("DELETE FROM sync_meta WHERE key = ? OR key LIKE 'teams:%'", [IDENTITY_KEY]);
  } catch (e) {
    console.warn('[authCache] clear failed', e);
  }
}

// ─── auth-js SecureStore entry ───────────────────────────────────────────────

function storageKey(): string | null {
  // Protected in auth-js typings; supabase-js always sets it
  // (sb-<project-ref>-auth-token).
  const key = (supabase.auth as unknown as { storageKey?: unknown }).storageKey;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

/** The session auth-js has stored, even if its access token has expired. */
export async function readStoredSession(): Promise<Session | null> {
  const key = storageKey();
  if (!key) return null;
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session | null;
    if (
      !s ||
      typeof s.access_token !== 'string' ||
      typeof s.refresh_token !== 'string' ||
      typeof s.user?.id !== 'string'
    ) {
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

/** Delete the stored session so the next launch is signed out. */
export async function removeStoredSession(): Promise<void> {
  const key = storageKey();
  if (!key) return;
  await Promise.all(
    [key, `${key}-user`, `${key}-code-verifier`].map((k) =>
      SecureStore.deleteItemAsync(k).catch(() => undefined)
    )
  );
}
