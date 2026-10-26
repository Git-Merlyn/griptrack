jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signOut: jest.fn(),
      signInWithPassword: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
    rpc: jest.fn(),
  },
}));
jest.mock('../lib/db', () => ({ db: {} }));
jest.mock('../lib/authCache', () => {
  const actual = jest.requireActual('../lib/authCache');
  return {
    ...actual,
    readCachedIdentity: jest.fn(() => null),
    writeCachedIdentity: jest.fn(),
    clearAuthCache: jest.fn(),
    readStoredSession: jest.fn(async () => null),
    removeStoredSession: jest.fn(async () => undefined),
  };
});
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../lib/supabase';
import {
  readCachedIdentity,
  writeCachedIdentity,
  clearAuthCache,
  readStoredSession,
  removeStoredSession,
  Identity,
} from '../lib/authCache';
import {
  useAuth,
  OFFLINE_NO_CACHE_MESSAGE,
  STARTUP_CACHE_DEADLINE_MS,
} from './useAuth';

const auth = supabase.auth as unknown as {
  getSession: jest.Mock;
  onAuthStateChange: jest.Mock;
  signOut: jest.Mock;
};
const rpc = supabase.rpc as unknown as jest.Mock;
const mockReadCache = readCachedIdentity as jest.Mock;
const mockWriteCache = writeCachedIdentity as jest.Mock;
const mockClearCache = clearAuthCache as jest.Mock;
const mockReadStored = readStoredSession as jest.Mock;
const mockRemoveStored = removeStoredSession as jest.Mock;
const mockNetListen = (NetInfo as unknown as { addEventListener: jest.Mock }).addEventListener;

type AuthCb = (event: string, session: unknown) => void;
let authCb: AuthCb;

function makeSession(userId = 'u1', token = 'tok-1') {
  return {
    access_token: token,
    refresh_token: 'r',
    expires_at: 9999999999,
    user: {
      id: userId,
      email: `${userId}@x.test`,
      user_metadata: { full_name: 'Meta Name' },
      updated_at: '2026-10-01T00:00:00Z',
    },
  };
}

function boot(orgId = 'org-1', features = { teams_enabled: true, requests_enabled: false }) {
  return {
    org_id: orgId,
    role: 'admin',
    team_id: 'team-1',
    ghost: false,
    ghost_write: false,
    org: { name: 'Org', trial_ends_at: null, features },
    profile: { id: 'u1', email: 'u1@x.test', full_name: 'Una One', phone: null },
    subscription: null,
  };
}

function cachedIdentity(userId = 'u1'): Identity {
  return {
    userId,
    profile: {
      id: userId,
      email: `${userId}@x.test`,
      full_name: 'Cached Name',
      org_id: 'org-1',
      team_id: 'team-1',
      role: 'crew',
    },
    features: { teamsEnabled: true, requestsEnabled: true },
  };
}

const retryable = { name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 };
const networkPgError = { code: '', message: 'TypeError: Network request failed', details: '', hint: '' };

let alertSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  auth.onAuthStateChange.mockImplementation((cb: AuthCb) => {
    authCb = cb;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  rpc.mockResolvedValue({ data: boot(), error: null });
  mockReadCache.mockReturnValue(null);
  mockReadStored.mockResolvedValue(null);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
  warnSpy.mockRestore();
  jest.useRealTimers();
});

describe('useAuth — online bootstrap (L59)', () => {
  it('builds profile and features from bootstrap_session and caches them', async () => {
    auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null });
    const { result } = await renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(rpc).toHaveBeenCalledWith('bootstrap_session');
    expect(result.current.profile).toEqual({
      id: 'u1',
      email: 'u1@x.test',
      full_name: 'Una One',
      org_id: 'org-1',
      team_id: 'team-1',
      role: 'admin',
    });
    expect(result.current.features).toEqual({ teamsEnabled: true, requestsEnabled: false });
    expect(result.current.offline).toBe(false);
    expect(mockWriteCache).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', features: { teamsEnabled: true, requestsEnabled: false } })
    );
  });

  it('no session and no error -> signed out, no bootstrap', async () => {
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('useAuth — repeat auth events (M16)', () => {
  it('TOKEN_REFRESHED / SIGNED_IN / USER_UPDATED / INITIAL_SESSION for the same user never re-bootstrap or set loading', async () => {
    auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null });
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.profile?.org_id).toBe('org-1'));
    const loadingSeen: boolean[] = [];

    for (const event of ['INITIAL_SESSION', 'TOKEN_REFRESHED', 'SIGNED_IN', 'USER_UPDATED']) {
      await act(async () => {
        authCb(event, makeSession('u1', `tok-${event}`));
      });
      loadingSeen.push(result.current.loading);
    }

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(loadingSeen).toEqual([false, false, false, false]);
    expect(result.current.session?.access_token).toBe('tok-USER_UPDATED');
  });

  it('SIGNED_IN for a different user drops the old identity and bootstraps the new one', async () => {
    auth.getSession.mockResolvedValue({ data: { session: makeSession('u1') }, error: null });
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.profile?.id).toBe('u1'));

    rpc.mockResolvedValue({ data: { ...boot('org-2'), profile: { id: 'u2', email: 'u2@x.test', full_name: null } }, error: null });
    await act(async () => {
      authCb('SIGNED_IN', makeSession('u2'));
    });

    await waitFor(() => expect(result.current.profile?.id).toBe('u2'));
    expect(result.current.profile?.org_id).toBe('org-2');
    // full_name falls back to the auth user's metadata
    expect(result.current.profile?.full_name).toBe('Meta Name');
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('SIGNED_OUT clears identity, session and the cache', async () => {
    auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null });
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      authCb('SIGNED_OUT', null);
    });
    expect(result.current.profile).toBeNull();
    expect(result.current.features).toBeNull();
    expect(result.current.session).toBeNull();
    expect(mockClearCache).toHaveBeenCalled();
  });

  it('TOKEN_REFRESHED while signed out is ignored', async () => {
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      authCb('TOKEN_REFRESHED', makeSession());
    });
    expect(result.current.session).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('useAuth — offline (H7)', () => {
  it('retryable getSession error keeps the user signed in from the cache', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: retryable });
    mockReadCache.mockReturnValue(cachedIdentity('u1'));
    mockReadStored.mockResolvedValue(makeSession('u1', 'expired-token'));

    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.offline).toBe(true);
    expect(result.current.session?.user.id).toBe('u1');
    expect(result.current.profile?.full_name).toBe('Cached Name');
    expect(result.current.features).toEqual({ teamsEnabled: true, requestsEnabled: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('retryable error with no cache -> signed in, no profile, offline message', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: retryable });
    mockReadStored.mockResolvedValue(makeSession('u1', 'expired-token'));

    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.offline).toBe(true);
    expect(result.current.profile).toBeNull();
    expect(result.current.bootError).toBe(OFFLINE_NO_CACHE_MESSAGE);
  });

  it('retryable error but nothing stored -> signed out', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: retryable });
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.offline).toBe(false);
    expect(result.current.session).toBeNull();
  });

  it('valid session but bootstrap fails offline -> cached identity for the same user', async () => {
    auth.getSession.mockResolvedValue({ data: { session: makeSession('u1') }, error: null });
    rpc.mockResolvedValue({ data: null, error: networkPgError });
    mockReadCache.mockReturnValue(cachedIdentity('u1'));

    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile?.full_name).toBe('Cached Name');
    expect(result.current.bootError).toBeNull();
    expect(mockWriteCache).not.toHaveBeenCalled();
  });

  it('never uses a cached identity that belongs to another user', async () => {
    auth.getSession.mockResolvedValue({ data: { session: makeSession('u1') }, error: null });
    rpc.mockResolvedValue({ data: null, error: networkPgError });
    mockReadCache.mockReturnValue(cachedIdentity('someone-else'));

    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBeNull();
    expect(result.current.bootError).toBe('TypeError: Network request failed');
  });

  it('opens from the cache when getSession has not answered by the deadline', async () => {
    jest.useFakeTimers();
    auth.getSession.mockReturnValue(new Promise(() => {})); // auth-js still retrying
    mockReadCache.mockReturnValue(cachedIdentity('u1'));
    mockReadStored.mockResolvedValue(makeSession('u1', 'expired-token'));

    const { result } = await renderHook(() => useAuth());
    expect(result.current.loading).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(STARTUP_CACHE_DEADLINE_MS);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.offline).toBe(true);
    expect(result.current.profile?.id).toBe('u1');
  });

  it('a later live session clears offline and bootstraps in the background', async () => {
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: retryable });
    mockReadCache.mockReturnValue(cachedIdentity('u1'));
    mockReadStored.mockResolvedValue(makeSession('u1', 'expired-token'));
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.offline).toBe(true));

    await act(async () => {
      authCb('TOKEN_REFRESHED', makeSession('u1', 'fresh'));
    });
    await waitFor(() => expect(result.current.profile?.full_name).toBe('Una One'));
    expect(result.current.offline).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('reconnect (NetInfo offline -> online) retries the bootstrap', async () => {
    auth.getSession.mockResolvedValue({ data: { session: makeSession('u1') }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: networkPgError });
    mockReadCache.mockReturnValue(cachedIdentity('u1'));
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.profile?.full_name).toBe('Cached Name'));

    const netCb = mockNetListen.mock.calls[mockNetListen.mock.calls.length - 1][0];
    await act(async () => {
      netCb({ isConnected: false, isInternetReachable: false });
    });
    await act(async () => {
      netCb({ isConnected: true, isInternetReachable: true });
    });
    await waitFor(() => expect(result.current.profile?.full_name).toBe('Una One'));
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe('useAuth — no org (L59)', () => {
  it('bootstrap error with no cache -> no profile and bootError; retryBootstrap recovers', async () => {
    auth.getSession.mockResolvedValue({ data: { session: makeSession('u1') }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key' } });
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBeNull();
    expect(result.current.bootError).toBe('duplicate key');

    await act(async () => {
      await result.current.retryBootstrap();
    });
    expect(result.current.profile?.org_id).toBe('org-1');
    expect(result.current.bootError).toBeNull();
  });
});

describe('useAuth — signOut (L31)', () => {
  it('server sign-out ok: no local removal, no alert', async () => {
    auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null });
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await result.current.signOut();
    });
    expect(mockRemoveStored).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(result.current.session).toBeNull();
  });

  it('server sign-out fails: removes the stored session, signs out locally, tells the user', async () => {
    auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null });
    auth.signOut.mockResolvedValue({ error: retryable });
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    await act(async () => {
      await result.current.signOut();
    });
    expect(mockRemoveStored).toHaveBeenCalledTimes(1);
    expect(mockClearCache).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(alertSpy).toHaveBeenCalledWith('Signed out on this device', expect.any(String));
  });

  it('offline: skips the network call and signs out locally', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: retryable });
    mockReadCache.mockReturnValue(cachedIdentity('u1'));
    mockReadStored.mockResolvedValue(makeSession('u1', 'expired-token'));
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.offline).toBe(true));

    await act(async () => {
      await result.current.signOut();
    });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(mockRemoveStored).toHaveBeenCalledTimes(1);
    expect(result.current.offline).toBe(false);
    expect(result.current.session).toBeNull();
  });

  it('a token refresh that lands after a local-only sign-out is deleted again', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: retryable });
    mockReadCache.mockReturnValue(cachedIdentity('u1'));
    mockReadStored.mockResolvedValue(makeSession('u1', 'expired-token'));
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.offline).toBe(true));

    await act(async () => {
      await result.current.signOut();
    });
    await act(async () => {
      authCb('TOKEN_REFRESHED', makeSession('u1', 'late'));
    });
    expect(mockRemoveStored).toHaveBeenCalledTimes(2);
    expect(result.current.session).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('useAuth — setFeatures', () => {
  it('updates features and the cache, keeps the profile', async () => {
    auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null });
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    mockWriteCache.mockClear();

    await act(() => {
      result.current.setFeatures({ teamsEnabled: false, requestsEnabled: true });
    });
    expect(result.current.features).toEqual({ teamsEnabled: false, requestsEnabled: true });
    expect(result.current.profile?.org_id).toBe('org-1');
    expect(mockWriteCache).toHaveBeenCalledWith(
      expect.objectContaining({ features: { teamsEnabled: false, requestsEnabled: true } })
    );
  });
});

describe('useAuth — password reset link', () => {
  it('sends the reset email with the web reset page as redirectTo (not the Site URL / dashboard)', async () => {
    const resetMock = supabase.auth.resetPasswordForEmail as jest.Mock;
    resetMock.mockResolvedValue({ data: {}, error: null });
    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let out: { error: string | null } | undefined;
    await act(async () => {
      out = await result.current.sendPasswordReset('chris@example.test');
    });

    expect(resetMock).toHaveBeenCalledWith('chris@example.test', {
      redirectTo: 'https://griptrack.app/reset-password',
    });
    expect(out).toEqual({ error: null });
  });
});
