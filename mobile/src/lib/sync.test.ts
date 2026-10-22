// sync.ts → deleteById.ts imports the real client module, which needs env
// vars; every test here passes its own fake client instead.
jest.mock('./supabase', () => ({ supabase: {} }));

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  drainNoticeText,
  drainQueue,
  isPlanLimitRejection,
  isTransientSyncError,
  pendingRowIds,
  pullFromSupabase,
  type SyncDb,
} from './sync';
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

  it('department heads pull only their own requests — they do not review (M12)', async () => {
    const dh = sbWithRows();
    await pullFromSupabase({ supabase: dh.client, db: fakeDb().db }, {
      orgId: 'org', teamId: null, teamsEnabled: false, userId: 'user-1', role: 'department_head',
    });
    expect(dh.calls.find((c) => c.table === 'equipment_requests')!.filters).toEqual([
      ['org_id', 'org'], ['requested_by', 'user-1'],
    ]);
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

  it('throws when a query fails, after still refreshing the other tables (WP11)', async () => {
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
    expect(db.replaceLocationsForOrg).toHaveBeenCalledTimes(1);
    expect(db.replaceRequestsForOrg).toHaveBeenCalledTimes(1);
  });
});

// ─── WP10 fixes ───────────────────────────────────────────────────────────────

describe('drainQueue — transient errors (H6)', () => {
  const networkError = { code: '', message: 'TypeError: Network request failed', details: '', hint: '' };

  it('a network failure charges no retry, stops the drain and leaves the queue intact', async () => {
    const a = entry('insert', 'equipment_items', { id: 'a' }, 2); // on its last attempt
    const b = entry('insert', 'equipment_items', { id: 'b' }, 0);
    const { db, queue } = fakeDb([a, b]);
    const sb = fakeSupabase(() => ({ error: networkError, status: 0 }));
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats).toEqual({ applied: 0, discarded: 0, failed: 0, interrupted: true });
    expect(db.incrementSyncRetries).not.toHaveBeenCalled();
    expect(db.removeSyncEntry).not.toHaveBeenCalled();
    expect(queue.map((q) => [q.id, q.retries])).toEqual([[a.id, 2], [b.id, 0]]);
    expect(sb.calls).toHaveLength(1); // b was never attempted
  });

  it('three flaky reconnects in a row no longer drop the op', async () => {
    const a = entry('update', 'locations', { id: 'l1', patch: { name: 'X' } }, 0);
    const { db, queue } = fakeDb([a]);
    const sb = fakeSupabase(() => ({ error: networkError, status: 0 }));
    for (let i = 0; i < 5; i++) await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(queue).toHaveLength(1);
    expect(queue[0].retries).toBe(0);
  });

  it('applies the entries before the failure and keeps the rest', async () => {
    const a = entry('insert', 'equipment_items', { id: 'a' });
    const b = entry('insert', 'equipment_items', { id: 'b' });
    const c = entry('insert', 'equipment_items', { id: 'c' });
    const { db, queue } = fakeDb([a, b, c]);
    const sb = fakeSupabase((call) =>
      (call.payload as { id: string }).id === 'b' ? { error: networkError, status: 0 } : {}
    );
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats).toMatchObject({ applied: 1, interrupted: true });
    expect(queue.map((q) => q.id)).toEqual([b.id, c.id]);
  });

  it('a network failure during the staleness check is not treated as "no conflict"', async () => {
    const a = entry('update', 'equipment_items', {
      id: 'i1', snapshot_updated_at: '2026-10-01T00:00:00.000Z', patch: { name: 'X' },
    });
    const { db, queue } = fakeDb([a]);
    const sb = fakeSupabase((c) => (c.op === 'select' ? { error: networkError, status: 0 } : {}));
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats.interrupted).toBe(true);
    expect(sb.calls.some((c) => c.op === 'update')).toBe(false);
    expect(queue).toHaveLength(1);
  });

  it('a 401 (expired token / anon-key fallback) is transient', async () => {
    const a = entry('insert', 'equipment_items', { id: 'a' }, 2);
    const { db, queue } = fakeDb([a]);
    const sb = fakeSupabase(() => ({
      error: { code: '42501', message: 'permission denied for function is_platform_admin' },
      status: 401,
    }));
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats.interrupted).toBe(true);
    expect(queue[0].retries).toBe(2);
  });

  it('does not touch the queue when there is no session', async () => {
    const a = entry('insert', 'equipment_items', { id: 'a' }, 2);
    const { db, queue } = fakeDb([a]);
    const sb = fakeSupabase(undefined, { session: false });
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats.interrupted).toBe(true);
    expect(sb.raw.from).not.toHaveBeenCalled();
    expect(queue[0].retries).toBe(2);
  });

  it('an empty queue does not call the server at all', async () => {
    const { db } = fakeDb([]);
    const sb = fakeSupabase();
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats).toEqual({ applied: 0, discarded: 0, failed: 0, interrupted: false });
    expect(sb.raw.auth.getSession).not.toHaveBeenCalled();
  });
});

describe('isTransientSyncError', () => {
  it.each([
    [{ code: '', message: 'TypeError: Network request failed', status: 0 }, true],
    [{ code: '', message: 'AbortError: Aborted' }, true],
    [{ code: 'PGRST303', message: 'JWT expired', status: 401 }, true],
    [{ message: '<html>Bad gateway</html>', status: 502 }, true],
    [{ code: 'PGRST002', message: 'Could not query the database for the schema cache', status: 503 }, true],
    [{ message: 'FetchError: request to … failed' }, true],
    [{ code: '23505', message: 'duplicate key value', status: 409 }, false],
    [{ code: '42501', message: 'new row violates row-level security policy', status: 403 }, false],
    [{ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', status: 406 }, false],
    [new TypeError("Cannot read properties of undefined (reading 'updated_by')"), false],
    [new SyntaxError('Unexpected token'), false],
    [null, false],
  ])('%p → %p', (err, expected) => {
    expect(isTransientSyncError(err)).toBe(expected);
  });
});

describe('drainQueue — permanent rejections (WP04 + WP16 hand-offs)', () => {
  it.each(['42501', '23514', '23503', '23502', '22007', '22008', '22P02'])('drops a %s rejection on the first attempt', async (code) => {
    const e = entry('insert', 'equipment_requests', { id: 'r1' }, 0);
    const { db, queue } = fakeDb([e]);
    const sb = fakeSupabase(() => ({ error: { code, message: 'rejected' }, status: code === '42501' ? 403 : 400 }));
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats).toMatchObject({ failed: 1, interrupted: false });
    expect(queue).toHaveLength(0);
    expect(db.incrementSyncRetries).not.toHaveBeenCalled();
  });

  it('a replayed insert hitting 23505 still counts as applied (WP05 rule runs before classification)', async () => {
    const e = entry('insert', 'equipment_items', { id: 'i1' }, 0);
    const { db, queue } = fakeDb([e]);
    const sb = fakeSupabase(() => ({
      error: { code: '23505', message: 'duplicate key value violates unique constraint "equipment_items_pkey"' },
      status: 409,
    }));
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats).toMatchObject({ applied: 1, failed: 0 });
    expect(queue).toHaveLength(0);
  });

  it('a network failure inside deleteById is transient too', async () => {
    const e = entry('delete', 'equipment_items', { id: 'i1' }, 2);
    const { db, queue } = fakeDb([e]);
    const sb = fakeSupabase(() => ({ error: { code: '', message: 'TypeError: Network request failed' }, status: 0 }));
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats.interrupted).toBe(true);
    expect(queue[0].retries).toBe(2);
  });
});

describe("drainQueue — plan limits (WP09 Option A: P0001 + 'plan_limit:' hint or 'Plan limit:' message)", () => {
  const ITEMS_MSG = "Plan limit: this organization's plan allows up to 50 equipment items.";

  it('drops a P0001 with a plan_limit: hint on the first attempt and keeps the message as-is', async () => {
    const e = entry('insert', 'equipment_items', { id: 'i51' }, 0);
    // The hint alone must be enough: this message has no 'Plan limit:' prefix,
    // so the drop proves throwIfError carried `hint` through to the classifier.
    const hintOnly = entry('insert', 'equipment_items', { id: 'i52' }, 0);
    const { db, queue } = fakeDb([e, hintOnly]);
    const sb = fakeSupabase((c) => ({
      error:
        (c.payload as { id: string }).id === 'i51'
          ? { code: 'P0001', message: ITEMS_MSG, details: null, hint: 'plan_limit:items' }
          : { code: 'P0001', message: 'item cap reached', details: null, hint: 'plan_limit:items' },
      status: 400,
    }));
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats).toMatchObject({ failed: 2, interrupted: false });
    expect(stats.planLimitMessages).toEqual([ITEMS_MSG, 'item cap reached']);
    expect(queue).toHaveLength(0);
    expect(db.incrementSyncRetries).not.toHaveBeenCalled();
  });

  it('falls back to the Plan limit: message prefix when the hint is missing', async () => {
    const e = entry('insert', 'locations', { id: 'l2' }, 0);
    const { db, queue } = fakeDb([e]);
    const msg = "Plan limit: this organization's plan allows 1 active location.";
    const sb = fakeSupabase(() => ({ error: { code: 'P0001', message: msg }, status: 400 }));
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats).toMatchObject({ failed: 1, interrupted: false });
    expect(stats.planLimitMessages).toEqual([msg]);
    expect(queue).toHaveLength(0);
    expect(db.incrementSyncRetries).not.toHaveBeenCalled();
  });

  it('a plain P0001 without the hint or the message prefix keeps the normal retry budget', async () => {
    const e = entry('insert', 'equipment_items', { id: 'i1' }, 0);
    const { db, queue } = fakeDb([e]);
    const sb = fakeSupabase(() => ({
      error: { code: 'P0001', message: 'raised by a trigger', details: null, hint: null },
      status: 400,
    }));
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats).toMatchObject({ failed: 0 });
    expect(stats.planLimitMessages).toBeUndefined();
    expect(db.incrementSyncRetries).toHaveBeenCalledWith(e.id);
    expect(queue).toHaveLength(1);
  });

  it.each([
    [{ code: 'P0001', hint: 'plan_limit:seats', message: "Plan limit: this organization's plan allows up to 5 staff members." }, true],
    [{ code: 'P0001', hint: 'plan_limit:locations', message: 'any text' }, true],
    [{ code: 'P0001', message: "Plan limit: this organization's plan does not include staff invites." }, true],
    [{ code: 'P0001', message: 'raised by a trigger', hint: 'some other hint' }, false],
    [{ code: '23514', hint: 'plan_limit:items', message: 'Plan limit: text' }, false],
    [{ code: 'P0001', message: 'plan limit: wrong case', hint: 'Plan_limit:items' }, false],
  ])('isPlanLimitRejection(%p) → %p', (err, expected) => {
    expect(isPlanLimitRejection(err)).toBe(expected);
  });
});

describe('drainQueue — corrupt payload (L30)', () => {
  it('drops the corrupt entry on the first attempt and still drains the rest', async () => {
    const bad = entry('insert', 'equipment_items', '{"id": "x", ', 0);
    const good = entry('insert', 'equipment_items', { id: 'good' });
    const { db, queue } = fakeDb([bad, good]);
    const sb = fakeSupabase();
    const stats = await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(stats).toMatchObject({ applied: 1, failed: 1, interrupted: false });
    expect(queue).toHaveLength(0);
    expect(sb.calls).toHaveLength(1);
  });
});

describe('drainQueue — qty_delta patch (L33)', () => {
  it('never sends a second update for a qty_delta op', async () => {
    const a = entry('update', 'equipment_items', {
      id: 'i1',
      qty_delta: 3,
      patch: { updated_by: 'a', updated_at: '2026-10-02T00:00:00.000Z', location: 'Truck 2' },
    });
    const { db } = fakeDb([a]);
    const sb = fakeSupabase();
    const warn = console.warn as jest.Mock;
    await drainQueue({ supabase: sb.client, db }, 'equipment_audit');
    expect(sb.raw.rpc).toHaveBeenCalledTimes(1);
    expect(sb.raw.from).not.toHaveBeenCalled();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('extra patch keys'))).toBe(true);
  });
});

describe('drainNoticeText', () => {
  it('is null when nothing was lost', () => {
    expect(drainNoticeText({ applied: 3, discarded: 0, failed: 0, interrupted: true })).toBeNull();
  });
  it('explains discarded-only drains as conflicts', () => {
    expect(drainNoticeText({ applied: 0, discarded: 2, failed: 0, interrupted: false })).toBe(
      '2 offline changes skipped — items were updated by someone else'
    );
  });
  it('reports failures as not applied', () => {
    expect(drainNoticeText({ applied: 0, discarded: 1, failed: 1, interrupted: false })).toBe(
      "2 offline changes couldn't be applied"
    );
  });
  it('appends the server message of a plan-limit drop as-is (no upgrade wording added)', () => {
    expect(
      drainNoticeText({
        applied: 0,
        discarded: 0,
        failed: 1,
        interrupted: false,
        planLimitMessages: ["Plan limit: this organization's plan allows up to 50 equipment items."],
      })
    ).toBe(
      "1 offline change couldn't be applied. Plan limit: this organization's plan allows up to 50 equipment items."
    );
  });
});

describe('pendingRowIds / pull keeps rows with queued ops (L32)', () => {
  it('collects ids per table (move_equipment: source + new split row), ignoring other rpc and corrupt entries', () => {
    const ids = pendingRowIds([
      entry('insert', 'equipment_items', { id: 'i-new' }),
      entry('update', 'equipment_items', { id: 'i1', patch: {} }),
      entry('update', 'equipment_items', { id: 'i1', qty_delta: 1, patch: {} }),
      entry('delete', 'locations', { id: 'l1' }),
      entry('insert', 'equipment_requests', { id: 'r1' }),
      entry('rpc', 'log_damage_event', { p_equipment_id: 'i9' }),
      entry('rpc', 'move_equipment', { p_source: 'i-src', p_new_id: 'i-split', p_qty: 1 }),
      entry('insert', 'audit', { id: 'audit-row' }),
      entry('insert', 'equipment_items', '{broken'),
    ]);
    expect(ids).toEqual({
      equipment_items: ['i-new', 'i1', 'i-src', 'i-split'],
      locations: ['l1'],
      equipment_requests: ['r1'],
    });
  });

  it('passes the pending ids to every replace helper', async () => {
    const { db } = fakeDb([
      entry('insert', 'equipment_items', { id: 'i-new' }, 1),
      entry('update', 'locations', { id: 'l1', patch: { name: 'X' } }, 1),
    ]);
    const sb = fakeSupabase(() => ({ data: [] }));
    await pullFromSupabase({ supabase: sb.client, db }, {
      orgId: 'org', teamId: 'team', teamsEnabled: true, userId: 'user-1', role: 'owner',
    });
    expect(db.replaceEquipmentForTeam).toHaveBeenCalledWith('org', 'team', [], ['i-new']);
    expect(db.replaceLocationsForOrg).toHaveBeenCalledWith('org', [], ['l1']);
    expect(db.replaceRequestsForOrg).toHaveBeenCalledWith('org', [], []);
  });
});
