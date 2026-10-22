jest.mock('../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
const mockSetFeatures = jest.fn();
const mockAuth: { profile: unknown; features: unknown; setFeatures: jest.Mock } = {
  profile: null,
  features: null,
  setFeatures: mockSetFeatures,
};
jest.mock('./AuthContext', () => ({ useAuthContext: () => mockAuth }));

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { supabase } from '../lib/supabase';
import { OrgProvider, useOrgContext } from './OrgContext';

const mockFrom = supabase.from as unknown as jest.Mock;
const wrapper = ({ children }: { children: React.ReactNode }) => <OrgProvider>{children}</OrgProvider>;

function updateQuery(result: { data: unknown; error: unknown }) {
  const q: Record<string, jest.Mock> = {};
  q.update = jest.fn(() => q);
  q.eq = jest.fn(() => q);
  q.select = jest.fn(() => Promise.resolve(result));
  return q;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.profile = { id: 'u1', org_id: 'org-1', team_id: null, role: 'owner' };
  mockAuth.features = { teamsEnabled: true, requestsEnabled: false };
});

describe('OrgContext (M26)', () => {
  it('exposes the identity\'s flags with no fetch of its own', () => {
    const { result } = renderHook(() => useOrgContext(), { wrapper });
    expect(result.current.orgId).toBe('org-1');
    expect(result.current.features).toEqual({ teamsEnabled: true, requestsEnabled: false });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('signed out: org null, both flags off', () => {
    mockAuth.profile = null;
    mockAuth.features = null;
    const { result } = renderHook(() => useOrgContext(), { wrapper });
    expect(result.current.orgId).toBeNull();
    expect(result.current.features).toEqual({ teamsEnabled: false, requestsEnabled: false });
  });

  it('updateFeatures writes optimistically and persists to organizations', async () => {
    const q = updateQuery({ data: [{ id: 'org-1' }], error: null });
    mockFrom.mockReturnValue(q);
    const { result } = renderHook(() => useOrgContext(), { wrapper });
    await act(async () => {
      await result.current.updateFeatures({ teamsEnabled: true, requestsEnabled: true });
    });
    expect(mockSetFeatures).toHaveBeenCalledWith({ teamsEnabled: true, requestsEnabled: true });
    expect(mockFrom).toHaveBeenCalledWith('organizations');
    expect(q.update).toHaveBeenCalledWith({ features: { teams_enabled: true, requests_enabled: true } });
    expect(q.eq).toHaveBeenCalledWith('id', 'org-1');
    expect(q.select).toHaveBeenCalledWith('id');
  });

  it('updateFeatures rolls back and throws on error', async () => {
    mockFrom.mockReturnValue(updateQuery({ data: null, error: { message: 'permission denied' } }));
    const { result } = renderHook(() => useOrgContext(), { wrapper });
    await act(async () => {
      await expect(
        result.current.updateFeatures({ teamsEnabled: false, requestsEnabled: false })
      ).rejects.toThrow('permission denied');
    });
    expect(mockSetFeatures.mock.calls).toEqual([
      [{ teamsEnabled: false, requestsEnabled: false }],
      [{ teamsEnabled: true, requestsEnabled: false }],
    ]);
  });

  it('updateFeatures rolls back and throws when RLS updated 0 rows', async () => {
    mockFrom.mockReturnValue(updateQuery({ data: [], error: null }));
    const { result } = renderHook(() => useOrgContext(), { wrapper });
    await act(async () => {
      await expect(
        result.current.updateFeatures({ teamsEnabled: false, requestsEnabled: true })
      ).rejects.toThrow("don't have permission");
    });
    expect(mockSetFeatures.mock.calls).toEqual([
      [{ teamsEnabled: false, requestsEnabled: true }],
      [{ teamsEnabled: true, requestsEnabled: false }],
    ]);
  });
});
