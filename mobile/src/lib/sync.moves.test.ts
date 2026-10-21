// drainQueue replay behaviour for moves (WP05: H1 / M13 / L70).
// Moved from context/drainQueue.test.ts by WP10 when drainQueue moved to lib/sync.ts.
jest.mock('./supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
    auth: { getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u' } } }, error: null })) },
  },
}));
jest.mock('./db', () => ({
  getSyncQueue: jest.fn(),
  removeSyncEntry: jest.fn(),
  incrementSyncRetries: jest.fn(),
  replaceEquipmentForTeam: jest.fn(),
  replaceEquipmentForOrg: jest.fn(),
  replaceLocationsForOrg: jest.fn(),
  replaceRequestsForOrg: jest.fn(),
}));

import { drainQueue as drain, type SyncDeps } from './sync';
import { supabase } from './supabase';
import * as db from './db';
import { getSyncQueue, removeSyncEntry, incrementSyncRetries } from './db';

const deps = { supabase, db } as unknown as SyncDeps;
const drainQueue = (auditTable: string) => drain(deps, auditTable);

const mockRpc = supabase.rpc as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockQueue = getSyncQueue as jest.Mock;
const mockRemove = removeSyncEntry as jest.Mock;
const mockRetry = incrementSyncRetries as jest.Mock;

const moveArgs = {
  p_source: 'src-1',
  p_qty: 2,
  p_to_location: 'Truck 2',
  p_op_id: 'op-1',
  p_updated_by: 'alice',
  p_at: '2026-10-21T10:00:00.000Z',
  p_new_id: 'new-1',
};

function entry(over: Partial<{ id: string; table_name: string; operation: string; payload: unknown; retries: number }>) {
  return {
    id: 'q-1',
    table_name: 'move_equipment',
    operation: 'rpc',
    created_at: '2026-10-21T10:00:00.000Z',
    retries: 0,
    ...over,
    payload: JSON.stringify(over.payload ?? moveArgs),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('drainQueue — move_equipment rpc entries', () => {
  it('replays the queued args verbatim (including p_op_id) and removes the entry', async () => {
    mockQueue.mockReturnValue([entry({})]);
    mockRpc.mockResolvedValueOnce({ data: { status: 'applied', kind: 'split', moved_qty: 2 }, error: null });

    const stats = await drainQueue('equipment_audit');

    expect(mockRpc).toHaveBeenCalledWith('move_equipment', moveArgs);
    expect(mockRemove).toHaveBeenCalledWith('q-1');
    expect(stats).toMatchObject({ applied: 1, discarded: 0, failed: 0 });
  });

  it('a retry after a lost response sends the same p_op_id; already_applied counts as applied', async () => {
    mockQueue.mockReturnValue([entry({})]);
    mockRpc.mockRejectedValueOnce(new TypeError('Network request failed'));
    const first = await drainQueue('equipment_audit');
    expect(first.applied).toBe(0);
    expect(mockRemove).not.toHaveBeenCalled(); // entry stays queued for the retry

    mockQueue.mockReturnValue([entry({ retries: 1 })]);
    mockRpc.mockResolvedValueOnce({ data: { status: 'already_applied', kind: 'split', moved_qty: 2 }, error: null });
    const second = await drainQueue('equipment_audit');

    expect(mockRpc.mock.calls[0][1].p_op_id).toBe('op-1');
    expect(mockRpc.mock.calls[1][1].p_op_id).toBe('op-1');
    expect(second).toMatchObject({ applied: 1, discarded: 0, failed: 0 });
    expect(mockRemove).toHaveBeenCalledWith('q-1');
  });

  it('server moved less than requested → counted as discarded (server wins), entry removed', async () => {
    mockQueue.mockReturnValue([entry({})]);
    mockRpc.mockResolvedValueOnce({ data: { status: 'applied', kind: 'relocate', moved_qty: 1 }, error: null });

    const stats = await drainQueue('equipment_audit');

    expect(stats).toMatchObject({ applied: 0, discarded: 1, failed: 0 });
    expect(mockRemove).toHaveBeenCalledWith('q-1');
  });

  it('whole-row move (p_qty null) is never counted as a shortfall', async () => {
    mockQueue.mockReturnValue([entry({ payload: { ...moveArgs, p_qty: null } })]);
    mockRpc.mockResolvedValueOnce({ data: { status: 'applied', kind: 'relocate', moved_qty: 0 }, error: null });

    const stats = await drainQueue('equipment_audit');

    expect(stats).toMatchObject({ applied: 1, discarded: 0, failed: 0 });
  });

  it('D22: destination no longer an existing location (22023) → dropped at once as failed, not retried', async () => {
    mockQueue.mockReturnValue([entry({})]);
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'destination must be an existing location' } });

    const stats = await drainQueue('equipment_audit');

    expect(stats).toMatchObject({ applied: 0, discarded: 0, failed: 1 });
    expect(mockRemove).toHaveBeenCalledWith('q-1');
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('source deleted on the server (P0002 "equipment not found") → dropped as failed', async () => {
    mockQueue.mockReturnValue([entry({})]);
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002', message: 'equipment not found' } });

    const stats = await drainQueue('equipment_audit');

    expect(stats).toMatchObject({ applied: 0, discarded: 0, failed: 1 });
    expect(mockRemove).toHaveBeenCalledWith('q-1');
  });
});

describe('drainQueue — legacy entries queued by older builds', () => {
  it('qty_delta updates call the idempotent overload with p_op_id = queue entry id', async () => {
    mockQueue.mockReturnValue([
      entry({
        id: 'q-legacy',
        table_name: 'equipment_items',
        operation: 'update',
        payload: { id: 'src-1', snapshot_updated_at: 'x', qty_delta: -2, patch: { updated_by: 'alice', updated_at: '2026-10-21T10:00:00.000Z' } },
      }),
    ]);
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const stats = await drainQueue('equipment_audit');

    expect(mockRpc).toHaveBeenCalledWith('increment_equipment_quantity', {
      item_id: 'src-1',
      delta: -2,
      updated_by_val: 'alice',
      updated_at_val: '2026-10-21T10:00:00.000Z',
      p_op_id: 'q-legacy',
    });
    expect(stats.applied).toBe(1);
  });

  it('an insert that hits 23505 on the primary key (row already exists) counts as applied, not failed', async () => {
    const insert = jest.fn().mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint "equipment_items_pkey"' },
    });
    mockFrom.mockReturnValue({ insert });
    mockQueue.mockReturnValue([
      entry({ id: 'q-ins', table_name: 'equipment_items', operation: 'insert', payload: { id: 'row-1', name: 'C-Stand' } }),
    ]);

    const stats = await drainQueue('equipment_audit');

    expect(stats).toMatchObject({ applied: 1, discarded: 0, failed: 0 });
    expect(mockRemove).toHaveBeenCalledWith('q-ins');
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('a 23505 on another unique key (location name taken) is NOT treated as applied', async () => {
    const insert = jest.fn().mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint "locations_org_id_name_key"' },
    });
    mockFrom.mockReturnValue({ insert });
    mockQueue.mockReturnValue([
      entry({ id: 'q-loc', table_name: 'locations', operation: 'insert', payload: { id: 'loc-1', name: 'Stage A' } }),
    ]);

    const stats = await drainQueue('equipment_audit');

    expect(stats).toMatchObject({ applied: 0, discarded: 0, failed: 0 }); // retried, not yet dropped
    expect(mockRetry).toHaveBeenCalledWith('q-loc');
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
