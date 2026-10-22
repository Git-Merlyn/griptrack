jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../lib/authCache', () => ({
  readCachedTeams: jest.fn(() => null),
  writeCachedTeams: jest.fn(),
}));
const mockAuth: { profile: unknown } = { profile: null };
jest.mock('./AuthContext', () => ({ useAuthContext: () => mockAuth }));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { readCachedTeams, writeCachedTeams } from '../lib/authCache';
import { TeamProvider, useTeamContext } from './TeamContext';

const mockFrom = supabase.from as unknown as jest.Mock;
const mockReadTeams = readCachedTeams as jest.Mock;
const mockWriteTeams = writeCachedTeams as jest.Mock;

const TEAMS = [
  { id: 't-a', org_id: 'org-1', name: 'A Camera', max_seats: null },
  { id: 't-b', org_id: 'org-1', name: 'B Grip', max_seats: null },
];

function teamsQuery(result: { data: unknown; error: unknown }) {
  const q: Record<string, jest.Mock> = {};
  q.select = jest.fn(() => q);
  q.eq = jest.fn(() => q);
  q.order = jest.fn(() => Promise.resolve(result));
  return q;
}

const wrapper = ({ children }: { children: React.ReactNode }) => <TeamProvider>{children}</TeamProvider>;

let warnSpy: jest.SpyInstance;
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockFrom.mockImplementation(() => teamsQuery({ data: TEAMS, error: null }));
});
afterEach(() => warnSpy.mockRestore());

describe('TeamContext (L34)', () => {
  it('restores an owner\'s stored team when the owner has no team of their own', async () => {
    mockAuth.profile = { id: 'u1', org_id: 'org-1', team_id: null, role: 'owner' };
    await AsyncStorage.setItem('gt_active_team_org-1', 't-b');

    const { result } = await renderHook(() => useTeamContext(), { wrapper });
    await waitFor(() => expect(result.current.loadingTeams).toBe(false));

    expect(result.current.activeTeamId).toBe('t-b');
    expect(await AsyncStorage.getItem('gt_active_team_org-1')).toBe('t-b');
  });

  it('auto-selects the first team when nothing is stored, and persists it', async () => {
    mockAuth.profile = { id: 'u1', org_id: 'org-1', team_id: null, role: 'admin' };
    const { result } = await renderHook(() => useTeamContext(), { wrapper });
    await waitFor(() => expect(result.current.activeTeamId).toBe('t-a'));
    await waitFor(async () => expect(await AsyncStorage.getItem('gt_active_team_org-1')).toBe('t-a'));
  });

  it('locks crew to their own team', async () => {
    mockAuth.profile = { id: 'u2', org_id: 'org-1', team_id: 't-a', role: 'crew' };
    await AsyncStorage.setItem('gt_active_team_org-1', 't-b');
    const { result } = await renderHook(() => useTeamContext(), { wrapper });
    await waitFor(() => expect(result.current.loadingTeams).toBe(false));
    expect(result.current.activeTeamId).toBe('t-a');
    expect(result.current.canSwitch).toBe(false);
  });

  it('survives AsyncStorage failures', async () => {
    mockAuth.profile = { id: 'u1', org_id: 'org-1', team_id: 't-a', role: 'owner' };
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('storage broken'));
    const { result } = await renderHook(() => useTeamContext(), { wrapper });
    await waitFor(() => expect(result.current.loadingTeams).toBe(false));
    expect(result.current.activeTeamId).toBe('t-a');
  });
});

describe('TeamContext teams cache (H7)', () => {
  it('writes the fetched list to the cache', async () => {
    mockAuth.profile = { id: 'u1', org_id: 'org-1', team_id: null, role: 'owner' };
    const { result } = await renderHook(() => useTeamContext(), { wrapper });
    await waitFor(() => expect(result.current.teams).toHaveLength(2));
    expect(mockWriteTeams).toHaveBeenCalledWith('org-1', TEAMS);
  });

  it('falls back to the cached list when the fetch fails', async () => {
    mockAuth.profile = { id: 'u2', org_id: 'org-1', team_id: 't-b', role: 'crew' };
    mockFrom.mockImplementation(() =>
      teamsQuery({ data: null, error: { code: '', message: 'TypeError: Network request failed' } })
    );
    mockReadTeams.mockReturnValue(TEAMS);
    const { result } = await renderHook(() => useTeamContext(), { wrapper });
    await waitFor(() => expect(result.current.loadingTeams).toBe(false));
    expect(result.current.teams).toEqual(TEAMS);
    expect(result.current.activeTeam?.name).toBe('B Grip');
  });

  it('shows the cached list while the fetch is still pending', async () => {
    mockAuth.profile = { id: 'u2', org_id: 'org-1', team_id: 't-b', role: 'crew' };
    const pending: Record<string, jest.Mock> = {};
    pending.select = jest.fn(() => pending);
    pending.eq = jest.fn(() => pending);
    pending.order = jest.fn(() => new Promise(() => {})); // offline: auth-js still retrying
    mockFrom.mockImplementation(() => pending);
    mockReadTeams.mockReturnValue(TEAMS);
    const { result } = await renderHook(() => useTeamContext(), { wrapper });
    await waitFor(() => expect(result.current.activeTeam?.name).toBe('B Grip'));
    expect(result.current.loadingTeams).toBe(true);
  });
});
