/**
 * pullFromSupabase: one failing table must not stop the others (WP11, M15).
 */

// sync.ts → deleteById.ts imports the real client module, which needs env
// vars; these tests pass their own fake client instead.
jest.mock('./supabase', () => ({ supabase: {} }));

import type { SupabaseClient } from '@supabase/supabase-js';
import { pullFromSupabase, type SyncDb } from './sync';

type Result = { data: unknown[] | null; error: { code?: string; message: string } | null };

/** Minimal PostgREST builder: from(table).select().eq()... awaited → results[table]. */
function fakeSupabase(results: Record<string, Result>): SupabaseClient {
  const builder = (table: string) => {
    const b: any = {
      select: () => b,
      eq: () => b,
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(results[table]).then(resolve, reject),
    };
    return b;
  };
  return { from: jest.fn((table: string) => builder(table)) } as unknown as SupabaseClient;
}

function fakeDb(): jest.Mocked<SyncDb> {
  return {
    getSyncQueue: jest.fn(() => []),
    removeSyncEntry: jest.fn(),
    incrementSyncRetries: jest.fn(),
    replaceEquipmentForTeam: jest.fn(),
    replaceEquipmentForOrg: jest.fn(),
    replaceLocationsForOrg: jest.fn(),
    replaceRequestsForOrg: jest.fn(),
  } as unknown as jest.Mocked<SyncDb>;
}

const params = {
  orgId: 'org1',
  teamId: null,
  teamsEnabled: false,
  userId: 'u1',
  role: 'owner' as const,
};

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('refreshes items and locations even when the requests pull fails, then rethrows', async () => {
  const db = fakeDb();
  const items = [{ id: 'i1' }];
  const locs = [{ id: 'l1' }];
  const supabase = fakeSupabase({
    equipment_items: { data: items, error: null },
    locations: { data: locs, error: null },
    equipment_requests: { data: null, error: { message: 'boom' } },
  });

  await expect(pullFromSupabase({ supabase, db }, params)).rejects.toEqual({ message: 'boom' });
  expect(db.replaceEquipmentForOrg.mock.calls[0].slice(0, 2)).toEqual(['org1', items]);
  expect(db.replaceLocationsForOrg.mock.calls[0].slice(0, 2)).toEqual(['org1', locs]);
  expect(db.replaceRequestsForOrg).not.toHaveBeenCalled();
});

it('still pulls locations and requests when replacing items throws (e.g. a bad row)', async () => {
  const db = fakeDb();
  db.replaceEquipmentForOrg.mockImplementationOnce(() => {
    throw new Error('NOT NULL constraint failed');
  });
  const supabase = fakeSupabase({
    equipment_items: { data: [{ id: 'i1' }], error: null },
    locations: { data: [], error: null },
    equipment_requests: { data: [{ id: 'r1', requested_by: null }], error: null },
  });

  await expect(pullFromSupabase({ supabase, db }, params)).rejects.toThrow('NOT NULL constraint failed');
  expect(db.replaceLocationsForOrg.mock.calls[0].slice(0, 2)).toEqual(['org1', []]);
  expect(db.replaceRequestsForOrg.mock.calls[0].slice(0, 2)).toEqual(['org1', [{ id: 'r1', requested_by: null }]]);
});

it('resolves when every table succeeds', async () => {
  const db = fakeDb();
  const supabase = fakeSupabase({
    equipment_items: { data: [], error: null },
    locations: { data: [], error: null },
    equipment_requests: { data: [], error: null },
  });
  await expect(pullFromSupabase({ supabase, db }, params)).resolves.toBeUndefined();
  expect(db.replaceRequestsForOrg).toHaveBeenCalledTimes(1);
});
