jest.mock('./supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('./db', () => ({
  upsertEquipmentItem: jest.fn(),
  deleteEquipmentItemLocal: jest.fn(),
  enqueueOp: jest.fn(),
  generateId: jest.fn(() => 'generated-id'),
}));

import {
  isMergeable,
  findMergeDestination,
  moveEquipment,
  moveEquipmentBulk,
  UNKNOWN_DESTINATION_MESSAGE,
} from './moveEquipment';
import { supabase } from './supabase';
import { enqueueOp, upsertEquipmentItem, deleteEquipmentItemLocal } from './db';
import type { EquipmentItem } from './types';

const mockEnqueue = enqueueOp as jest.Mock;
const mockUpsert = upsertEquipmentItem as jest.Mock;
const mockDelete = deleteEquipmentItemLocal as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

const base: EquipmentItem = {
  id: '1',
  org_id: 'org',
  team_id: 'team',
  item_id: null,
  name: 'C-Stand',
  category: 'Grip',
  source: 'House',
  quantity: 5,
  reserve_min: 0,
  location: 'Truck 1',
  status: 'Available',
  start_date: null,
  end_date: null,
  updated_by: 'alice',
  updated_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
};

describe('isMergeable', () => {
  it('returns true for two items that match on all merge fields', () => {
    const b: EquipmentItem = { ...base, id: '2', location: 'Truck 2' };
    expect(isMergeable(base, b)).toBe(true);
  });

  it('returns false when names differ', () => {
    expect(isMergeable(base, { ...base, id: '2', name: 'Apple Box' })).toBe(false);
  });

  it('returns false when categories differ', () => {
    expect(isMergeable(base, { ...base, id: '2', category: 'Electric' })).toBe(false);
  });

  it('returns false when sources differ', () => {
    expect(isMergeable(base, { ...base, id: '2', source: 'Rental' })).toBe(false);
  });

  it('returns false when statuses differ', () => {
    expect(isMergeable(base, { ...base, id: '2', status: 'Damaged' })).toBe(false);
  });

  it('returns false when start_date differs', () => {
    expect(isMergeable(base, { ...base, id: '2', start_date: '2026-02-01' })).toBe(false);
  });

  it('returns false when end_date differs', () => {
    expect(isMergeable(base, { ...base, id: '2', end_date: '2026-03-01' })).toBe(false);
  });

  it('treats null and empty string as equal for nullable fields', () => {
    const a: EquipmentItem = { ...base, item_id: null, category: null, source: null };
    const b: EquipmentItem = { ...base, id: '2', item_id: null, category: null, source: null };
    expect(isMergeable(a, b)).toBe(true);
  });

  it('returns false when item_id differs', () => {
    const a: EquipmentItem = { ...base, item_id: 'sku-1' };
    const b: EquipmentItem = { ...base, id: '2', item_id: 'sku-2' };
    expect(isMergeable(a, b)).toBe(false);
  });
});

describe('findMergeDestination', () => {
  const dest: EquipmentItem = { ...base, id: '2', location: 'Truck 2' };

  it('returns the matching item at the destination location', () => {
    const result = findMergeDestination([base, dest], base, 'Truck 2');
    expect(result).toBe(dest);
  });

  it('returns undefined when no item exists at destination', () => {
    const result = findMergeDestination([base, dest], base, 'Truck 3');
    expect(result).toBeUndefined();
  });

  it('returns undefined when destination equals source location', () => {
    const result = findMergeDestination([base, dest], base, 'Truck 1');
    expect(result).toBeUndefined();
  });

  it('returns undefined when item at destination is not mergeable', () => {
    const different: EquipmentItem = { ...base, id: '2', location: 'Truck 2', name: 'Apple Box' };
    const result = findMergeDestination([base, different], base, 'Truck 2');
    expect(result).toBeUndefined();
  });

  it('does not match the source item itself even if same location somehow', () => {
    const result = findMergeDestination([base], base, 'Truck 1');
    expect(result).toBeUndefined();
  });

  it('returns the first mergeable item when multiple candidates exist', () => {
    const dest2: EquipmentItem = { ...base, id: '3', location: 'Truck 2' };
    const result = findMergeDestination([base, dest, dest2], base, 'Truck 2');
    expect(result).toBe(dest);
  });
});


describe('findMergeDestination — team scoping', () => {
  it('does not merge into an identical row of another team (server rule)', () => {
    const otherTeam: EquipmentItem = { ...base, id: '2', location: 'Truck 2', team_id: 'other' };
    expect(findMergeDestination([base, otherTeam], base, 'Truck 2')).toBeUndefined();
  });
});

// ─── moveEquipment — offline: optimistic SQLite + ONE queued rpc ─────────────

const moveBase = {
  userId: 'user-1',
  updatedBy: 'alice@example.com',
};

function queuedCalls() {
  return mockEnqueue.mock.calls.map(([arg]: [{ table_name: string; operation: string; payload: string }]) => ({
    table: arg.table_name,
    op: arg.operation,
    payload: JSON.parse(arg.payload),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('moveEquipment (offline)', () => {
  const offline = { ...moveBase, isOnline: false };

  it('returns error for invalid quantity', async () => {
    const result = await moveEquipment({
      sourceItem: { ...base, quantity: 0 },
      moveQty: 1,
      toLocation: 'Truck 2',
      allItems: [base],
      ...offline,
    });
    expect(result).toEqual({ success: false, error: 'Invalid quantity' });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('returns error when source and destination are the same', async () => {
    const result = await moveEquipment({
      sourceItem: base,
      moveQty: 1,
      toLocation: 'Truck 1',
      allItems: [base],
      ...offline,
    });
    expect(result).toEqual({ success: false, error: 'Item is already at that location' });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('every offline move queues exactly one move_equipment rpc entry with an op id', async () => {
    const result = await moveEquipment({
      sourceItem: base, // qty 5
      moveQty: 2,
      toLocation: 'Truck 2',
      allItems: [base],
      ...offline,
    });

    expect(result).toMatchObject({ success: true, queued: true, movedQty: 2 });
    const calls = queuedCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('move_equipment');
    expect(calls[0].op).toBe('rpc');
    expect(calls[0].payload).toMatchObject({
      p_source: '1',
      p_qty: 2,
      p_to_location: 'Truck 2',
      p_op_id: 'generated-id',
      p_new_id: 'generated-id',
      p_updated_by: 'alice@example.com',
    });
    expect(typeof calls[0].payload.p_at).toBe('string');
    // No legacy halves: no qty_delta updates, inserts, deletes or log_merge_event
    expect(calls.some((c) => c.op !== 'rpc')).toBe(false);
  });

  it('partial move (no merge): optimistic decrement + new local row', async () => {
    await moveEquipment({ sourceItem: base, moveQty: 2, toLocation: 'Truck 2', allItems: [base], ...offline });

    const written = mockUpsert.mock.calls.map(([row]: [EquipmentItem]) => row);
    expect(written.find((r) => r.id === '1')!.quantity).toBe(3);
    const created = written.find((r) => r.id === 'generated-id')!;
    expect(created.quantity).toBe(2);
    expect(created.location).toBe('Truck 2');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('partial move with merge: optimistic decrement + increment', async () => {
    const destItem: EquipmentItem = { ...base, id: '2', location: 'Truck 2', quantity: 3 };
    await moveEquipment({ sourceItem: base, moveQty: 2, toLocation: 'Truck 2', allItems: [base, destItem], ...offline });

    const written = mockUpsert.mock.calls.map(([row]: [EquipmentItem]) => row);
    expect(written.find((r) => r.id === '1')!.quantity).toBe(3);
    expect(written.find((r) => r.id === '2')!.quantity).toBe(5);
    expect(queuedCalls()).toHaveLength(1);
  });

  it('full move with merge: optimistic dest increment + local source delete, still one rpc', async () => {
    const destItem: EquipmentItem = { ...base, id: '2', location: 'Truck 2', quantity: 3 };
    const result = await moveEquipment({
      sourceItem: base, moveQty: 5, toLocation: 'Truck 2', allItems: [base, destItem], ...offline,
    });

    expect(result.deletedIds).toEqual(['1']);
    expect(mockDelete).toHaveBeenCalledWith('1');
    const written = mockUpsert.mock.calls.map(([row]: [EquipmentItem]) => row);
    expect(written.find((r) => r.id === '2')!.quantity).toBe(8);
    const calls = queuedCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].payload.p_qty).toBe(5);
  });

  it('whole-row move (moveQty null) sends p_qty null and relocates locally', async () => {
    const empty: EquipmentItem = { ...base, quantity: 0 };
    const result = await moveEquipment({ sourceItem: empty, moveQty: null, toLocation: 'Truck 2', allItems: [empty], ...offline });

    expect(result.success).toBe(true);
    expect(queuedCalls()[0].payload.p_qty).toBeNull();
    expect(mockUpsert.mock.calls[0][0].location).toBe('Truck 2');
  });
});

// ─── moveEquipment — online: server first, SQLite only on success ───────────

describe('moveEquipment (online)', () => {
  const online = { ...moveBase, isOnline: true };

  it('calls move_equipment once and writes the returned rows to SQLite', async () => {
    const serverSource = { ...base, quantity: 3, updated_at: '2026-10-21T00:00:00Z' };
    const serverDest = { ...base, id: 'srv-new', location: 'Truck 2', quantity: 2 };
    mockRpc.mockResolvedValueOnce({
      data: {
        status: 'applied', kind: 'split', requested_qty: 2, moved_qty: 2,
        source_id: '1', dest_id: 'srv-new', source: serverSource, dest: serverDest,
      },
      error: null,
    });

    const result = await moveEquipment({ sourceItem: base, moveQty: 2, toLocation: 'Truck 2', allItems: [base], ...online });

    expect(result).toMatchObject({ success: true, movedQty: 2 });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls[0][0]).toBe('move_equipment');
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_source: '1', p_qty: 2, p_to_location: 'Truck 2' });
    expect(mockRpc.mock.calls[0][1].p_op_id).toBeUndefined();
    expect(mockUpsert).toHaveBeenCalledWith(serverSource);
    expect(mockUpsert).toHaveBeenCalledWith(serverDest);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('merge result deletes the source locally', async () => {
    const serverDest = { ...base, id: '2', location: 'Truck 2', quantity: 8 };
    mockRpc.mockResolvedValueOnce({
      data: { status: 'applied', kind: 'merge', requested_qty: 5, moved_qty: 5, source_id: '1', dest_id: '2', source: null, dest: serverDest },
      error: null,
    });

    const result = await moveEquipment({ sourceItem: base, moveQty: 5, toLocation: 'Truck 2', allItems: [base], ...online });

    expect(result.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith('1');
    expect(mockUpsert).toHaveBeenCalledWith(serverDest);
  });

  it('server error: returns failure and leaves SQLite untouched', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'not allowed to move this item' } });

    const result = await moveEquipment({ sourceItem: base, moveQty: 2, toLocation: 'Truck 2', allItems: [base], ...online });

    expect(result).toEqual({ success: false, error: 'not allowed to move this item' });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('D22: destination not an existing location (22023) → readable message, SQLite untouched', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: '22023', message: 'destination must be an existing location' },
    });

    const result = await moveEquipment({ sourceItem: base, moveQty: 2, toLocation: 'Old Shed', allItems: [base], ...online });

    expect(result).toEqual({ success: false, error: UNKNOWN_DESTINATION_MESSAGE });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('network rejection: returns failure and leaves SQLite untouched', async () => {
    mockRpc.mockRejectedValueOnce(new TypeError('Network request failed'));

    const result = await moveEquipment({ sourceItem: base, moveQty: 2, toLocation: 'Truck 2', allItems: [base], ...online });

    expect(result.success).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

// ─── moveEquipmentBulk (L42) ─────────────────────────────────────────────────

describe('moveEquipmentBulk', () => {
  it('moves each selected row as a whole-row move and skips rows already there', async () => {
    const a: EquipmentItem = { ...base, id: 'a', name: 'A' };
    const b: EquipmentItem = { ...base, id: 'b', name: 'B', location: 'Truck 2' };

    const result = await moveEquipmentBulk({
      ids: ['a', 'b'], toLocation: 'Truck 2', allItems: [a, b], updatedBy: 'alice', isOnline: false,
    });

    expect(result).toEqual({ moved: 1, skipped: 1, failed: [] });
    const calls = queuedCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toMatchObject({ p_source: 'a', p_qty: null, p_to_location: 'Truck 2' });
  });

  it('later moves see earlier merges (two identical rows end up as one)', async () => {
    const a: EquipmentItem = { ...base, id: 'a', location: 'Truck 1', quantity: 2 };
    const c: EquipmentItem = { ...base, id: 'c', location: 'Truck 3', quantity: 4 };

    await moveEquipmentBulk({ ids: ['a', 'c'], toLocation: 'Truck 2', allItems: [a, c], updatedBy: 'alice', isOnline: false });

    // a relocates to Truck 2; c then merges into a locally (6) and is deleted.
    const written = mockUpsert.mock.calls.map(([row]: [EquipmentItem]) => row);
    const lastA = written.filter((r) => r.id === 'a').pop()!;
    expect(lastA.location).toBe('Truck 2');
    expect(lastA.quantity).toBe(6);
    expect(mockDelete).toHaveBeenCalledWith('c');
  });

  it('reports failures without stopping the batch', async () => {
    const a: EquipmentItem = { ...base, id: 'a', name: 'A' };
    const b: EquipmentItem = { ...base, id: 'b', name: 'B', item_id: 'other' };
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: 'not allowed to move this item' } })
      .mockResolvedValueOnce({
        data: { status: 'applied', kind: 'relocate', requested_qty: null, moved_qty: 5, source_id: 'b', dest_id: 'b',
                source: { ...b, location: 'Truck 2' }, dest: { ...b, location: 'Truck 2' } },
        error: null,
      });

    const result = await moveEquipmentBulk({ ids: ['a', 'b'], toLocation: 'Truck 2', allItems: [a, b], updatedBy: 'alice', isOnline: true });

    expect(result.moved).toBe(1);
    expect(result.failed).toEqual([{ id: 'a', name: 'A', error: 'not allowed to move this item' }]);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });
});
