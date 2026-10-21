// sync.ts → deleteById.ts imports the real client module, which needs env
// vars; every test here passes its own fake client instead.
jest.mock('./supabase', () => ({ supabase: {} }));

import type { SupabaseClient } from '@supabase/supabase-js';
import { drainQueue, pullFromSupabase, type SyncDb } from './sync';
import type { SyncQueueEntry } from './db';

// ─── Fakes ────────────────────────────────────────────────────────────────────

type Result = { data?: unknown; error?: unknown; status?: number };

/** One recorded supabase call: from(table).<op>(...) or rpc(fn, args). */
interface Call {
  kind: 'from' | 'rpc';
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete' | 'rpc';
  payload?: unknown;
  filters: Array<[string, unknown]>;
  single: boolean;
}

/**
 * Minimal chainable stand-in for the supabase-js client. `respond` decides the
 * result of each awaited call; every call is recorded in `calls`.
 */
function fakeSupabase(
  respond: (call: Call) => Result = () => ({ data: null, error: null, status: 200 }),
  opts: { session?: boolean } = {}
) {
  const calls: Call[] = [];
  const settle = (call: Call) => {
    calls.push(call);
    const r = respond(call);
    return {
      data: r.data ?? null,
      error: r.error ?? null,
      status: r.status ?? (r.error ? 400 : 200),
    };
  };
  const builder = (table: string) => {
    const call: Call = { kind: 'from', table, op: 'select', filters: [], single: false };
    const b: any = {
      select: () => b,
      insert: (p: unknown) => ((call.op = 'insert'), (call.payload = p), b),
      update: (p: unknown) => ((call.op = 'update'), (call.payload = p), b),
      delete: () => ((call.op = 'delete'), b),
      eq: (col: string, val: unknown) => (call.filters.push([col, val]), b),
      single: () => ((call.single = true), b),
      maybeSingle: () => ((call.single = true), b),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve().then(() => settle(call)).then(resolve, reject),
    };
    return b;
  };
  const client = {
    from: jest.fn((table: string) => builder(table)),
    rpc: jest.fn(async (fn: string, args: unknown) =>
      settle({ kind: 'rpc', table: fn, op: 'rpc', payload: args, filters: [], single: false })
    ),
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: opts.session === false ? null : { user: { id: 'user-1' } } },
        error: null,
      })),
    },
  };
  return { client: client as unknown as SupabaseClient, calls, raw: client };
}

function fakeDb(entries: SyncQueueEntry[] = []) {
  const queue = [...entries];
  const db = {
    getSyncQueue: jest.fn(() => [...queue]),
    removeSyncEntry: jest.fn((id: string) => {
      const i = queue.findIndex((e) => e.id === id);
      if (i >= 0) queue.splice(i, 1);
    }),
    incrementSyncRetries: jest.fn((id: string) => {
      const e = queue.find((q) => q.id === id);
      if (e) e.retries += 1;
    }),
    replaceEquipmentForTeam: jest.fn(),
    replaceEquipmentForOrg: jest.fn(),
    replaceLocationsForOrg: jest.fn(),
    replaceRequestsForOrg: jest.fn(),
  };
  return { db: db as jest.Mocked<SyncDb>, queue };
}

let seq = 0;
function entry(
  operation: SyncQueueEntry['operation'],
  table_name: string,
  payload: unknown,
  retries = 0
): SyncQueueEntry {
  seq += 1;
  return {
    id: `q${seq}`,
    table_name,
    operation,
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
    created_at: `2026-10-21T00:00:${String(seq).padStart(2, '0')}.000Z`,
    retries,
  };
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// ─── drainQueue ───────────────────────────────────────────────────────────────

describe('drainQueue', () => {
  it('applies an insert and removes the entry', async () => {
    const e = entry('insert', 'equipment_items', { id: 'i1', name: 'C-Stand' });
    const { db, queue } = fakeDb([e]);
    const sb = fakeSupabase();
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats).toMatchObject({ applied: 1, discarded: 0, failed: 0 });
    expect(sb.calls[0]).toMatchObject({ table: 'equipment_items', op: 'insert', payload: { id: 'i1', name: 'C-Stand' } });
    expect(queue).toHaveLength(0);
  });

  it('discards a stale update when the server row is newer than the snapshot', async () => {
    const e = entry('update', 'equipment_items', {
      id: 'i1',
      snapshot_updated_at: '2026-10-01T00:00:00.000Z',
      patch: { name: 'New', updated_by: 'a', updated_at: '2026-10-02T00:00:00.000Z' },
    });
    const { db, queue } = fakeDb([e]);
    const sb = fakeSupabase((c) =>
      c.op === 'select' ? { data: { updated_at: '2026-10-05T00:00:00+00:00' } } : {}
    );
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats).toMatchObject({ applied: 0, discarded: 1, failed: 0 });
    expect(sb.calls.some((c) => c.op === 'update')).toBe(false);
    expect(queue).toHaveLength(0);
  });

  it('applies an update when the server row is not newer than the snapshot', async () => {
    const e = entry('update', 'equipment_items', {
      id: 'i1',
      snapshot_updated_at: '2026-10-05T00:00:00.000Z',
      patch: { name: 'New' },
    });
    const { db } = fakeDb([e]);
    const sb = fakeSupabase((c) =>
      c.op === 'select' ? { data: { updated_at: '2026-10-05T00:00:00+00:00' } } : {}
    );
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats.applied).toBe(1);
    const upd = sb.calls.find((c) => c.op === 'update');
    expect(upd).toMatchObject({ table: 'equipment_items', payload: { name: 'New' }, filters: [['id', 'i1']] });
  });

  it('sends qty_delta ops through increment_equipment_quantity and skips the staleness check', async () => {
    const e = entry('update', 'equipment_items', {
      id: 'i1',
      snapshot_updated_at: '2026-10-01T00:00:00.000Z',
      qty_delta: -2,
      patch: { updated_by: 'alice', updated_at: '2026-10-02T00:00:00.000Z' },
    });
    const { db } = fakeDb([e]);
    const sb = fakeSupabase();
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats.applied).toBe(1);
    expect(sb.raw.rpc).toHaveBeenCalledWith('increment_equipment_quantity', {
      item_id: 'i1',
      delta: -2,
      updated_by_val: 'alice',
      updated_at_val: '2026-10-02T00:00:00.000Z',
      p_op_id: e.id, // WP05: idempotent overload keyed by the queue entry id
    });
    expect(sb.raw.from).not.toHaveBeenCalled();
  });

  it('replays queued rpc entries by function name with the payload as args', async () => {
    const args = { p_equipment_id: 'i1', p_notes: null, p_at: '2026-10-02T00:00:00.000Z' };
    const { db } = fakeDb([entry('rpc', 'log_damage_event', args)]);
    const sb = fakeSupabase();
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats.applied).toBe(1);
    expect(sb.raw.rpc).toHaveBeenCalledWith('log_damage_event', args);
  });

  it('applies a delete by id (through deleteById, with the injected client)', async () => {
    const { db, queue } = fakeDb([entry('delete', 'locations', { id: 'l1' })]);
    const sb = fakeSupabase((c) => (c.op === 'delete' ? { data: [{ id: 'l1' }] } : {}));
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(sb.calls[0]).toMatchObject({ table: 'locations', op: 'delete', filters: [['id', 'l1']] });
    expect(stats.applied).toBe(1);
    expect(queue).toHaveLength(0);
  });

  it('keeps a failed entry and charges one retry when attempts remain (server error)', async () => {
    const e = entry('insert', 'equipment_items', { id: 'i1' }, 0);
    const { db, queue } = fakeDb([e]);
    const sb = fakeSupabase(() => ({ error: { code: 'P0001', message: 'raised by a trigger' }, status: 400 }));
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats).toMatchObject({ applied: 0, failed: 0 });
    expect(db.incrementSyncRetries).toHaveBeenCalledWith(e.id);
    expect(queue).toHaveLength(1);
    expect(queue[0].retries).toBe(1);
  });

  it('drops a failed entry on its third attempt and counts it as failed', async () => {
    const e = entry('insert', 'equipment_items', { id: 'i1' }, 2);
    const { db, queue } = fakeDb([e]);
    const sb = fakeSupabase(() => ({ error: { code: 'P0001', message: 'raised by a trigger' }, status: 400 }));
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats.failed).toBe(1);
    expect(queue).toHaveLength(0);
  });

  it('drops an entry immediately when the row is gone (PGRST116)', async () => {
    const e = entry('update', 'locations', { id: 'l1', patch: { name: 'X' } }, 0);
    const { db, queue } = fakeDb([e]);
    const sb = fakeSupabase(() => ({ error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, status: 406 }));
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats.failed).toBe(1);
    expect(queue).toHaveLength(0);
  });

  it('drops a legacy hand-written audit insert rejected with 42501 on the first attempt', async () => {
    const e = entry('insert', 'audit', { equipment_id: 'i1', action: 'edit' }, 0);
    const { db, queue } = fakeDb([e]);
    const sb = fakeSupabase(() => ({ error: { code: '42501', message: 'new row violates row-level security policy' }, status: 403 }));
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(sb.calls[0].table).toBe('equipment_audit');
    expect(stats.failed).toBe(1);
    expect(queue).toHaveLength(0);
  });

  it('keeps going after one entry fails', async () => {
    const bad = entry('insert', 'equipment_items', { id: 'bad' }, 0);
    const good = entry('insert', 'equipment_items', { id: 'good' }, 0);
    const { db, queue } = fakeDb([bad, good]);
    const sb = fakeSupabase((c) =>
      (c.payload as { id: string }).id === 'bad' ? { error: { code: 'P0001', message: 'nope' }, status: 400 } : {}
    );
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats.applied).toBe(1);
    expect(queue.map((q) => q.id)).toEqual([bad.id]);
  });
});

// ─── pullFromSupabase ─────────────────────────────────────────────────────────

describe('pullFromSupabase', () => {
  const item = { id: 'i1', org_id: 'org', team_id: 'team', name: 'C-Stand' };
  const loc = { id: 'l1', org_id: 'org', name: 'Truck', is_active: true };
  const req = { id: 'r1', org_id: 'org', requested_by: 'user-1', item_name: 'Sandbag' };

  function sbWithRows() {
    return fakeSupabase((c) => {
      if (c.table === 'equipment_items') return { data: [item] };
      if (c.table === 'locations') return { data: [loc] };
      if (c.table === 'equipment_requests') return { data: [req] };
      return {};
    });
  }

  it('teams on: scopes items to the team and replaces only that team', async () => {
    const { db } = fakeDb();
    const sb = sbWithRows();
    await pullFromSupabase({ supabase: sb.client, db }, {
      orgId: 'org', teamId: 'team', teamsEnabled: true, userId: 'user-1', role: 'owner',
    });
    expect(sb.calls[0].filters).toEqual([['org_id', 'org'], ['team_id', 'team']]);
    expect(db.replaceEquipmentForTeam.mock.calls[0].slice(0, 3)).toEqual(['org', 'team', [item]]);
    expect(db.replaceEquipmentForOrg).not.toHaveBeenCalled();
    expect(db.replaceLocationsForOrg.mock.calls[0].slice(0, 2)).toEqual(['org', [loc]]);
  });

  it('teams off: pulls the whole org and replaces org-wide', async () => {
    const { db } = fakeDb();
    const sb = sbWithRows();
    await pullFromSupabase({ supabase: sb.client, db }, {
      orgId: 'org', teamId: null, teamsEnabled: false, userId: 'user-1', role: 'owner',
    });
    expect(sb.calls[0].filters).toEqual([['org_id', 'org']]);
    expect(db.replaceEquipmentForOrg.mock.calls[0].slice(0, 2)).toEqual(['org', [item]]);
    expect(db.replaceEquipmentForTeam).not.toHaveBeenCalled();
  });

  it('crew only pull their own requests; owners pull all', async () => {
    const crew = sbWithRows();
    await pullFromSupabase({ supabase: crew.client, db: fakeDb().db }, {
      orgId: 'org', teamId: null, teamsEnabled: false, userId: 'user-1', role: 'crew',
    });
    expect(crew.calls.find((c) => c.table === 'equipment_requests')!.filters).toEqual([
      ['org_id', 'org'], ['requested_by', 'user-1'],
    ]);

    const owner = sbWithRows();
    await pullFromSupabase({ supabase: owner.client, db: fakeDb().db }, {
      orgId: 'org', teamId: null, teamsEnabled: false, userId: 'user-1', role: 'owner',
    });
    expect(owner.calls.find((c) => c.table === 'equipment_requests')!.filters).toEqual([['org_id', 'org']]);
  });

  it('throws when a query fails and does not touch the local tables after it', async () => {
    const { db } = fakeDb();
    const sb = fakeSupabase((c) =>
      c.table === 'equipment_items' ? { error: { code: '42501', message: 'denied' }, status: 403 } : { data: [] }
    );
    await expect(
      pullFromSupabase({ supabase: sb.client, db }, {
        orgId: 'org', teamId: null, teamsEnabled: false, userId: 'user-1', role: 'owner',
      })
    ).rejects.toMatchObject({ code: '42501' });
    expect(db.replaceEquipmentForOrg).not.toHaveBeenCalled();
    expect(db.replaceLocationsForOrg).not.toHaveBeenCalled();
  });
});
