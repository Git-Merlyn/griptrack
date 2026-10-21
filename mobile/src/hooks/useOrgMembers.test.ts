jest.mock('../lib/supabase', () => ({
  supabase: { from: jest.fn(), functions: { invoke: jest.fn() } },
}));

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { supabase } from '../lib/supabase';
import { useOrgMembers } from './useOrgMembers';

const mockFrom = supabase.from as jest.Mock;
const mockInvoke = supabase.functions.invoke as jest.Mock;

// Thenable PostgREST stub: every select/eq/in/order chain resolves to an
// empty, error-free result, whichever method ends the chain.
function emptyQuery() {
  const result = { data: [], error: null };
  const q: any = {
    select: () => q,
    eq: () => q,
    in: () => q,
    order: () => q,
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

async function renderLoaded() {
  const hook = renderHook(() => useOrgMembers('org-1'));
  // The initial fetch ends with the org_invites query.
  await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('org_invites'));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('useOrgMembers.inviteMember (C1: no sign-in links)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockFrom.mockImplementation(() => emptyQuery());
    mockInvoke.mockReset();
  });

  it('calls invite-staff with the trimmed email and resolves with nothing', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    const { result } = await renderLoaded();

    let returned: unknown = 'not-set';
    await act(async () => {
      returned = await result.current.inviteMember('  new@example.test ', 'crew', null);
    });

    expect(mockInvoke).toHaveBeenCalledWith('invite-staff', {
      body: { email: 'new@example.test', orgId: 'org-1', role: 'crew', teamId: null },
    });
    expect(returned).toBeUndefined();
  });

  it('never passes a sign-in link through, even if an old server still returns one', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        ok: true,
        alreadyRegistered: true,
        generatedLink: 'https://example.supabase.co/auth/v1/verify?token=SECRET&type=magiclink',
      },
      error: null,
    });
    const { result } = await renderLoaded();

    let returned: unknown = 'not-set';
    await act(async () => {
      returned = await result.current.inviteMember('existing@example.test', 'crew', null);
    });

    expect(returned).toBeUndefined();
  });

  it('rejects when the edge function fails', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('Edge Function returned a non-2xx status code') });
    const { result } = await renderLoaded();

    await expect(
      act(async () => {
        await result.current.inviteMember('x@example.test', 'crew', null);
      }),
    ).rejects.toThrow();
  });
});
