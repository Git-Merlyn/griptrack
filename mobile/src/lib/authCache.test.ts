jest.mock('./db', () => ({
  db: { execSync: jest.fn(), getFirstSync: jest.fn(), runSync: jest.fn() },
}));
jest.mock('./supabase', () => ({ supabase: { auth: { storageKey: 'sb-test-auth-token' } } }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

import * as SecureStore from 'expo-secure-store';
import { db } from './db';
import {
  parseFeatures,
  identityFromBootstrap,
  readCachedIdentity,
  writeCachedIdentity,
  readCachedTeams,
  writeCachedTeams,
  clearAuthCache,
  readStoredSession,
  removeStoredSession,
  Identity,
} from './authCache';

const mockDb = db as unknown as { execSync: jest.Mock; getFirstSync: jest.Mock; runSync: jest.Mock };
const mockGetItem = SecureStore.getItemAsync as jest.Mock;
const mockDelete = SecureStore.deleteItemAsync as jest.Mock;

const user = { id: 'u1', email: 'auth@x.test', user_metadata: { full_name: ' Meta Name ' } };

const identity: Identity = {
  userId: 'u1',
  profile: { id: 'u1', email: 'u1@x.test', full_name: 'Una', org_id: 'org-1', team_id: null, role: 'owner' },
  features: { teamsEnabled: false, requestsEnabled: true },
};

let warnSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

describe('parseFeatures', () => {
  it('only literal true turns a flag on', () => {
    expect(parseFeatures({ teams_enabled: true, requests_enabled: 'true' })).toEqual({
      teamsEnabled: true,
      requestsEnabled: false,
    });
    expect(parseFeatures(null)).toEqual({ teamsEnabled: false, requestsEnabled: false });
    expect(parseFeatures('nope')).toEqual({ teamsEnabled: false, requestsEnabled: false });
  });
});

describe('identityFromBootstrap', () => {
  const boot = {
    org_id: 'org-1',
    role: 'department_head',
    team_id: 'team-9',
    org: { name: 'Org', trial_ends_at: null, features: { teams_enabled: true } },
    profile: { id: 'u1', email: 'p@x.test', full_name: '  Pat  ' },
  };

  it('maps the RPC payload', () => {
    expect(identityFromBootstrap(boot, user)).toEqual({
      userId: 'u1',
      profile: { id: 'u1', email: 'p@x.test', full_name: 'Pat', org_id: 'org-1', team_id: 'team-9', role: 'department_head' },
      features: { teamsEnabled: true, requestsEnabled: false },
    });
  });

  it('falls back to the auth user for email and name', () => {
    const r = identityFromBootstrap({ ...boot, profile: null, team_id: null }, user);
    expect(r?.profile.email).toBe('auth@x.test');
    expect(r?.profile.full_name).toBe('Meta Name');
    expect(r?.profile.team_id).toBeNull();
  });

  it('returns null without an org', () => {
    expect(identityFromBootstrap(null, user)).toBeNull();
    expect(identityFromBootstrap({ ...boot, org_id: null }, user)).toBeNull();
    expect(identityFromBootstrap({ ...boot, role: null }, user)).toBeNull();
  });
});

describe('identity cache', () => {
  it('round-trips through sync_meta', () => {
    writeCachedIdentity(identity);
    const [, args] = mockDb.runSync.mock.calls[0];
    expect(args[0]).toBe('auth_identity');
    mockDb.getFirstSync.mockReturnValue({ value: args[1] });
    expect(readCachedIdentity()).toEqual(identity);
  });

  it('rejects corrupt or mismatched rows', () => {
    mockDb.getFirstSync.mockReturnValue({ value: '{not json' });
    expect(readCachedIdentity()).toBeNull();
    mockDb.getFirstSync.mockReturnValue({
      value: JSON.stringify({ ...identity, profile: { ...identity.profile, id: 'other' } }),
    });
    expect(readCachedIdentity()).toBeNull();
    mockDb.getFirstSync.mockReturnValue(null);
    expect(readCachedIdentity()).toBeNull();
  });

  it('returns null instead of throwing when SQLite fails', () => {
    mockDb.getFirstSync.mockImplementation(() => {
      throw new Error('disk I/O error');
    });
    expect(readCachedIdentity()).toBeNull();
    mockDb.getFirstSync.mockReset();
  });

  it('teams cache keeps only well-formed rows', () => {
    writeCachedTeams('org-1', [{ id: 't1', org_id: 'org-1', name: 'A', max_seats: null } as never]);
    expect(mockDb.runSync.mock.calls[0][1][0]).toBe('teams:org-1');
    mockDb.getFirstSync.mockReturnValue({
      value: JSON.stringify([{ id: 't1', name: 'A' }, { id: 5 }, null]),
    });
    expect(readCachedTeams('org-1')).toEqual([{ id: 't1', name: 'A' }]);
  });

  it('clearAuthCache deletes the identity and all team lists', () => {
    clearAuthCache();
    expect(mockDb.runSync).toHaveBeenCalledWith(
      "DELETE FROM sync_meta WHERE key = ? OR key LIKE 'teams:%'",
      ['auth_identity']
    );
  });
});

describe('stored session', () => {
  it('reads the auth-js session from SecureStore', async () => {
    const s = { access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u1' } };
    mockGetItem.mockResolvedValue(JSON.stringify(s));
    await expect(readStoredSession()).resolves.toEqual(s);
    expect(mockGetItem).toHaveBeenCalledWith('sb-test-auth-token');
  });

  it('returns null for missing or malformed values', async () => {
    mockGetItem.mockResolvedValue(null);
    await expect(readStoredSession()).resolves.toBeNull();
    mockGetItem.mockResolvedValue('{"access_token":"a"}');
    await expect(readStoredSession()).resolves.toBeNull();
  });

  it('removeStoredSession deletes the session, user and code-verifier keys', async () => {
    await removeStoredSession();
    expect(mockDelete.mock.calls.map((c) => c[0]).sort()).toEqual([
      'sb-test-auth-token',
      'sb-test-auth-token-code-verifier',
      'sb-test-auth-token-user',
    ]);
  });
});
