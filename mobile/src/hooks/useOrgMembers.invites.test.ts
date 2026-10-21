import { renderHook, act, waitFor } from '@testing-library/react-native';

// ── Supabase mock ─────────────────────────────────────────────────────────────
// Each from(table) call returns a chainable builder. Terminal results are
// queued per table so a test can script what the hook sees.
const mockResults: Record<string, any[]> = {};
const mockCalls: { table: string; method: string; args: any[] }[] = [];
const mockInvoke = jest.fn();

function mockBuilder(table: string) {
  const b: any = {};
  ['select', 'eq', 'in', 'order', 'update', 'delete'].forEach((m) => {
    b[m] = jest.fn((...args: any[]) => {
      mockCalls.push({ table, method: m, args });
      return b;
    });
  });
  b.then = (resolve: any, reject: any) => {
    const next = (mockResults[table] ?? []).shift() ?? { data: [], error: null };
    return Promise.resolve(next).then(resolve, reject);
  };
  return b;
}

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => mockBuilder(table)),
    functions: { invoke: (...args: any[]) => mockInvoke(...args) },
  },
}));

import { useOrgMembers } from './useOrgMembers';

const INVITE = {
  id: 'inv-1',
  email: 'grip@example.com',
  role: 'crew' as const,
  team_id: 'team-1',
  created_at: '2026-10-01T00:00:00Z',
};

function queue(table: string, ...rows: any[]) {
  mockResults[table] = [...(mockResults[table] ?? []), ...rows];
}

beforeEach(() => {
  for (const k of Object.keys(mockResults)) delete mockResults[k];
  mockCalls.length = 0;
  mockInvoke.mockReset();
});

async function mountWithOneInvite() {
  queue('organization_members', { data: [], error: null });
  queue('org_invites', { data: [INVITE], error: null });
  const hook = renderHook(() => useOrgMembers('org-1'));
  await waitFor(() => expect(hook.result.current.invites).toHaveLength(1));
  return hook;
}

describe('useOrgMembers invites', () => {
  it('loads team_id with pending invites', async () => {
    await mountWithOneInvite();
    const sel = mockCalls.find((c) => c.table === 'org_invites' && c.method === 'select');
    expect(sel?.args[0]).toBe('id, email, role, team_id, created_at');
  });

  it('revokeInvite flips status to revoked and drops the row', async () => {
    const { result } = await mountWithOneInvite();
    queue('org_invites', { data: [{ id: 'inv-1' }], error: null });

    await act(async () => { await result.current.revokeInvite('inv-1'); });

    const upd = mockCalls.find((c) => c.table === 'org_invites' && c.method === 'update');
    expect(upd?.args[0]).toEqual({ status: 'revoked' });
    expect(mockCalls).toEqual(
      expect.arrayContaining([
        { table: 'org_invites', method: 'eq', args: ['id', 'inv-1'] },
        { table: 'org_invites', method: 'eq', args: ['status', 'pending'] },
      ])
    );
    expect(result.current.invites).toHaveLength(0);
  });

  it('revokeInvite throws when RLS filtered the update to zero rows', async () => {
    const { result } = await mountWithOneInvite();
    queue('org_invites', { data: [], error: null });           // the update
    queue('organization_members', { data: [], error: null });  // refetch
    queue('org_invites', { data: [], error: null });           // refetch

    await expect(
      act(async () => { await result.current.revokeInvite('inv-1'); })
    ).rejects.toThrow('already accepted or revoked');
  });

  it('revokeInvite surfaces a PostgREST error', async () => {
    const { result } = await mountWithOneInvite();
    queue('org_invites', { data: null, error: { message: 'permission denied for table org_invites' } });

    await expect(
      act(async () => { await result.current.revokeInvite('inv-1'); })
    ).rejects.toThrow('permission denied');
  });

  it('resendInvite re-invokes invite-staff with the invite email, role and team', async () => {
    const { result } = await mountWithOneInvite();
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    queue('organization_members', { data: [], error: null });
    queue('org_invites', { data: [INVITE], error: null });

    await act(async () => { await result.current.resendInvite(INVITE); });

    expect(mockInvoke).toHaveBeenCalledWith('invite-staff', {
      body: { email: 'grip@example.com', orgId: 'org-1', role: 'crew', teamId: 'team-1' },
    });
  });
});
