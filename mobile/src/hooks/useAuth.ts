/**
 * useAuth — session + org identity for the mobile app.
 *
 * Identity (profile + org feature flags) comes from the bootstrap_session RPC,
 * the same call the web app makes. It accepts pending invites, creates the
 * org for a brand-new user and honours ghost mode (L59). The last good
 * identity is cached in SQLite (lib/authCache.ts), so a launch without network
 * opens the cached inventory instead of the sign-in screen (H7).
 *
 * Rules:
 * - `loading` is true only until the first identity decision after launch or
 *   sign-in. Later auth events (TOKEN_REFRESHED, USER_UPDATED, the SIGNED_IN
 *   from the password re-auth) never set it again, so the navigator is never
 *   torn down mid-session (M16).
 * - A user is bootstrapped once (bootstrappedUserIdRef, like the web
 *   UserProvider). Repeat events for that user only update the session.
 *   The identity is refreshed on foreground when older than
 *   FOREGROUND_REFRESH_MS, on reconnect, and on retryBootstrap().
 * - A failed bootstrap keeps the identity on screen, else falls back to the
 *   cache for the same user, else sets bootError.
 * - `offline` means the stored session could not be refreshed (no network).
 *   `session` is then the stored session and its access token may be expired.
 *   Nothing in the app reads session.access_token directly. The supabase
 *   client refreshes the token itself before each request.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../lib/types';
import {
  BootstrapPayload,
  Identity,
  OrgFeatures,
  clearAuthCache,
  identityFromBootstrap,
  readCachedIdentity,
  readStoredSession,
  removeStoredSession,
  writeCachedIdentity,
} from '../lib/authCache';

// Must be in Supabase Auth > URL Configuration > Redirect URLs.
export const PASSWORD_RESET_URL = 'https://griptrack.app/reset-password';

export interface UseAuthReturn {
  /** Live session, or the stored (maybe expired) one while `offline`. */
  session: Session | null;
  profile: UserProfile | null;
  /** Org feature flags. null exactly when profile is null. */
  features: OrgFeatures | null;
  /** True only until the first identity decision after launch / sign-in. */
  loading: boolean;
  /** The session could not be refreshed (no network); showing cached data. */
  offline: boolean;
  /** Why a signed-in user has no profile (shown by OrgUnavailableScreen). */
  bootError: string | null;
  /** Re-check the session and re-run bootstrap_session now. */
  retryBootstrap: () => Promise<void>;
  /** Replace the org feature flags locally and in the cache (OrgContext). */
  setFeatures: (next: OrgFeatures) => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
}

/** Open from the cache if auth + bootstrap have not answered by then. */
export const STARTUP_CACHE_DEADLINE_MS = 4000;
/** Re-run bootstrap on foreground at most this often (role/team/flag changes). */
export const FOREGROUND_REFRESH_MS = 15 * 60 * 1000;
export const OFFLINE_NO_CACHE_MESSAGE =
  "You're offline. Connect to the internet to finish signing in.";
export const NO_ORG_MESSAGE = 'No organization was found for this account.';

function isRetryableAuthError(e: unknown): boolean {
  return (e as { name?: unknown } | null)?.name === 'AuthRetryableFetchError';
}

export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  // Refs mirror state for the async callbacks below (no stale closures).
  const identityRef = useRef<Identity | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const offlineRef = useRef(false);
  /** User we are signed in as (live or offline). null = signed out. */
  const userIdRef = useRef<string | null>(null);
  /** User whose bootstrap_session last succeeded (M16 guard). */
  const bootstrappedUserIdRef = useRef<string | null>(null);
  const lastBootAtRef = useRef(0);
  const inflightRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  /** Set by a local-only sign-out (L31); cleared by the next sign-in. */
  const forcedSignOutRef = useRef(false);

  const applyIdentity = useCallback((next: Identity | null) => {
    const prev = identityRef.current;
    if (prev === next) return;
    if (prev && next && JSON.stringify(prev) === JSON.stringify(next)) return;
    identityRef.current = next;
    setIdentity(next);
  }, []);

  const applySession = useCallback((next: Session | null) => {
    const cur = sessionRef.current;
    if (
      cur &&
      next &&
      cur.access_token === next.access_token &&
      cur.user.id === next.user.id &&
      cur.user.updated_at === next.user.updated_at
    ) {
      return; // same token and user: skip a re-render of every consumer
    }
    sessionRef.current = next;
    setSession(next);
  }, []);

  const applyOffline = useCallback((value: boolean) => {
    offlineRef.current = value;
    setOffline(value);
  }, []);

  const resetToSignedOut = useCallback(() => {
    userIdRef.current = null;
    bootstrappedUserIdRef.current = null;
    lastBootAtRef.current = 0;
    applyIdentity(null);
    applySession(null);
    applyOffline(false);
    setBootError(null);
    clearAuthCache();
    setLoading(false);
  }, [applyIdentity, applySession, applyOffline]);

  const bootstrap = useCallback(
    (user: User): Promise<void> => {
      const inflight = inflightRef.current;
      if (inflight && inflight.userId === user.id) return inflight.promise;

      const promise = (async () => {
        let next: Identity | null = null;
        let errorMessage: string | null = null;
        try {
          const { data, error } = await supabase.rpc('bootstrap_session');
          if (error) {
            errorMessage = error.message || 'Could not load your organization.';
          } else {
            next = identityFromBootstrap(data as BootstrapPayload | null, user);
            if (!next) errorMessage = NO_ORG_MESSAGE;
          }
        } catch (e) {
          errorMessage = e instanceof Error ? e.message : String(e);
        }

        // Signed out, or a different user signed in, while we waited.
        if (userIdRef.current !== user.id) return;

        if (next) {
          bootstrappedUserIdRef.current = user.id;
          lastBootAtRef.current = Date.now();
          applyIdentity(next);
          writeCachedIdentity(next);
          setBootError(null);
        } else {
          console.warn('[useAuth] bootstrap_session failed:', errorMessage);
          // Keep what is on screen for this user. Otherwise use the cache.
          if (identityRef.current?.userId !== user.id) {
            const cached = readCachedIdentity();
            if (cached && cached.userId === user.id) {
              applyIdentity(cached);
              setBootError(null);
            } else {
              applyIdentity(null);
              setBootError(errorMessage);
            }
          }
        }
        setLoading(false);
      })();

      inflightRef.current = { userId: user.id, promise };
      promise.finally(() => {
        if (inflightRef.current?.promise === promise) inflightRef.current = null;
      });
      return promise;
    },
    [applyIdentity]
  );

  const acceptSession = useCallback(
    (next: Session) => {
      const uid = next.user.id;
      if (identityRef.current && identityRef.current.userId !== uid) {
        // Another account than the one on screen: never show A's data to B.
        applyIdentity(null);
        bootstrappedUserIdRef.current = null;
      }
      userIdRef.current = uid;
      applySession(next);
      applyOffline(false);
      // M16: same user, already bootstrapped. Only the token changed.
      if (bootstrappedUserIdRef.current === uid) return;
      // Nothing to show yet: hold the navigator until this bootstrap answers.
      if (!identityRef.current) setLoading(true);
      void bootstrap(next.user);
    },
    [applyIdentity, applySession, applyOffline, bootstrap]
  );

  /** The stored session cannot be refreshed right now (H7). */
  const enterOffline = useCallback(
    async (cached: Identity | null) => {
      const stored = await readStoredSession();
      // A live session arrived while we read SecureStore: keep it. (Checked
      // first, so a failed SecureStore read can never sign out a live session.)
      if (sessionRef.current && !offlineRef.current) return;
      if (!stored) {
        resetToSignedOut();
        return;
      }
      const uid = stored.user.id;
      userIdRef.current = uid;
      applySession(stored);
      applyOffline(true);
      if (identityRef.current?.userId !== uid) {
        if (cached && cached.userId === uid) {
          applyIdentity(cached);
          setBootError(null);
        } else {
          applyIdentity(null);
          setBootError(OFFLINE_NO_CACHE_MESSAGE);
        }
      }
      setLoading(false);
    },
    [applyIdentity, applySession, applyOffline, resetToSignedOut]
  );

  // ─── Startup + auth events ────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    const cached = readCachedIdentity();

    // Offline with an expired token, auth-js retries the refresh for up to
    // ~30 s before getSession() answers. Open from the cache sooner.
    const deadline = setTimeout(() => {
      if (!active || !cached || identityRef.current) return;
      const uid = userIdRef.current;
      if (uid && uid !== cached.userId) return;
      if (uid) {
        // Live session, slow bootstrap: show the cache, bootstrap continues.
        applyIdentity(cached);
        setLoading(false);
        return;
      }
      void enterOffline(cached);
    }, STARTUP_CACHE_DEADLINE_MS);

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (data.session) {
          acceptSession(data.session);
        } else if (error && isRetryableAuthError(error)) {
          // auth-js keeps the stored session after a retryable failure.
          void enterOffline(cached);
        } else {
          resetToSignedOut();
        }
      })
      .catch(() => {
        if (active) void enterOffline(cached);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      // getSession() above handles startup. INITIAL_SESSION would also hide
      // a retryable refresh error behind a null session.
      if (event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT' || !next) {
        resetToSignedOut();
        return;
      }
      // A refresh that lands after we signed out must not sign us back in.
      // After a local-only sign-out, auth-js has just written the refreshed
      // session back to SecureStore, so delete it again (L31). At startup
      // (forcedSignOutRef false) getSession() delivers the session instead.
      if (event === 'TOKEN_REFRESHED' && userIdRef.current === null) {
        if (forcedSignOutRef.current) void removeStoredSession();
        return;
      }
      forcedSignOutRef.current = false;
      acceptSession(next);
    });

    return () => {
      active = false;
      clearTimeout(deadline);
      listener.subscription.unsubscribe();
    };
  }, [acceptSession, applyIdentity, enterOffline, resetToSignedOut]);

  // ─── Refresh: foreground, reconnect, Retry button ─────────────────────────
  const refresh = useCallback(
    async (force: boolean) => {
      if (!userIdRef.current) return; // signed out
      const { data, error } = await supabase.auth.getSession();
      if (data.session) {
        const uid = data.session.user.id;
        const wasBootstrapped = bootstrappedUserIdRef.current === uid;
        acceptSession(data.session); // bootstraps if this user never did
        const stale = Date.now() - lastBootAtRef.current > FOREGROUND_REFRESH_MS;
        if (wasBootstrapped && (force || stale)) {
          await bootstrap(data.session.user);
        } else if (inflightRef.current) {
          await inflightRef.current.promise;
        }
        return;
      }
      if (error && isRetryableAuthError(error)) return; // still offline
      resetToSignedOut();
    },
    [acceptSession, bootstrap, resetToSignedOut]
  );

  useEffect(() => {
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh(false);
    });
    let wasConnected: boolean | null = null;
    const unsubscribeNet = NetInfo.addEventListener((s) => {
      const connected = s.isConnected === true && s.isInternetReachable !== false;
      if (connected && wasConnected === false) void refresh(false);
      wasConnected = connected;
    });
    return () => {
      appSub.remove();
      unsubscribeNet();
    };
  }, [refresh]);

  const retryBootstrap = useCallback(() => refresh(true), [refresh]);

  const setFeatures = useCallback(
    (next: OrgFeatures) => {
      const cur = identityRef.current;
      if (!cur) return;
      const updated: Identity = { ...cur, features: next };
      applyIdentity(updated);
      writeCachedIdentity(updated);
    },
    [applyIdentity]
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  // L31: auth-js keeps the stored session when /logout cannot be reached
  // (scope 'local' calls /logout too). Remove it ourselves and say so.
  const signOut = useCallback(async () => {
    let failed = offlineRef.current; // known offline: skip the ~30 s refresh retry
    if (!failed) {
      try {
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.warn('[useAuth] signOut failed, clearing the local session:', error.message);
          failed = true;
        }
      } catch (e) {
        console.warn('[useAuth] signOut threw, clearing the local session:', e);
        failed = true;
      }
    }
    if (failed) {
      forcedSignOutRef.current = true;
      await removeStoredSession();
    }
    resetToSignedOut();
    if (failed) {
      Alert.alert(
        'Signed out on this device',
        "GripTrack couldn't reach the server, so your other devices stay signed in until their sessions expire."
      );
    }
  }, [resetToSignedOut]);

  const sendPasswordReset = useCallback(async (email: string) => {
    // Without redirectTo, Supabase links to the Site URL (the web home page):
    // the link signs the user in and lands on the Dashboard with no way to set
    // a new password. Send them to the web reset page, as Auth.jsx does.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RESET_URL,
    });
    return { error: error?.message ?? null };
  }, []);

  return {
    session,
    profile: identity?.profile ?? null,
    features: identity?.features ?? null,
    loading,
    offline,
    bootError,
    retryBootstrap,
    setFeatures,
    signIn,
    signOut,
    sendPasswordReset,
  };
}
