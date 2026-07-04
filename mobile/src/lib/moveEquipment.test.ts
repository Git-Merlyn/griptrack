jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('./db', () => ({
  upsertEquipmentItem: jest.fn(),
  deleteEquipmentItemLocal: jest.fn(),
  enqueueOp: jest.fn(),
  generateId: jest.fn(() => 'generated-id'),
}));

import { isMergeable, findMergeDestination, moveEquipment } from './moveEquipment';
import { enqueueOp, upsertEquipmentItem, deleteEquipmentItemLocal } from './db';
import type { EquipmentItem } from './types';

const mockEnqueue = enqueueOp as jest.Mock;
const mockUpsert = upsertEquipmentItem as jest.Mock;
const mockDelete = deleteEquipmentItemLocal as jest.Mock;

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

// ─── moveEquipment — offline queue payload shape ──────────────────────────────

const moveBase = {
  userId: 'user-1',
  updatedBy: 'alice@example.com',
  isOnline: false,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('moveEquipment (offline)', () => {
  it('returns error for invalid quantity', async () => {
    const result = await moveEquipment({
      sourceItem: { ...base, quantity: 0 },
      moveQty: 1,
      toLocation: 'Truck 2',
      allItems: [base],
      ...moveBase,
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
      ...moveBase,
    });
    expect(result).toEqual({ success: false, error: 'Item is already at that location' });
  });

  it('full move (no merge): queues a single update with snapshot_updated_at and location patch', async () => {
    const result = await moveEquipment({
      sourceItem: base,
      moveQty: 5,
      toLocation: 'Truck 2',
      allItems: [base],
      ...moveBase,
    });

    expect(result.success).toBe(true);
    expect(mockEnqueue).toHaveBeenCalledTimes(2); // equipment update + audit

    const equipmentCall = mockEnqueue.mock.calls.find(
      ([arg]: [{ table_name: string }]) => arg.table_name === 'equipment_items'
    );
    expect(equipmentCall).toBeDefined();

    const payload = JSON.parse(equipmentCall[0].payload);
    expect(payload.id).toBe('1');
    expect(payload.snapshot_updated_at).toBe('2026-01-01T00:00:00Z');
    expect(payload.patch.location).toBe('Truck 2');
    // Full move: no qty_delta — location-only update
    expect(payload.qty_delta).toBeUndefined();
  });

  it('partial move (no merge): queues an update with qty_delta on source + insert for new row', async () => {
    const result = await moveEquipment({
      sourceItem: base, // qty = 5
      moveQty: 2,
      toLocation: 'Truck 2',
      allItems: [base],
      ...moveBase,
    });

    expect(result.success).toBe(true);

    const calls = mockEnqueue.mock.calls.map(([arg]: [{ table_name: string; operation: string; payload: string }]) => ({
      table: arg.table_name,
      op: arg.operation,
      payload: JSON.parse(arg.payload),
    }));

    const sourceUpdate = calls.find((c) => c.table === 'equipment_items' && c.op === 'update');
    const destInsert = calls.find((c) => c.table === 'equipment_items' && c.op === 'insert');

    // Source should use qty_delta, not an absolute quantity
    expect(sourceUpdate).toBeDefined();
    expect(sourceUpdate!.payload.qty_delta).toBe(-2);
    expect(sourceUpdate!.payload.snapshot_updated_at).toBe('2026-01-01T00:00:00Z');
    expect(sourceUpdate!.payload.patch.quantity).toBeUndefined();

    // Destination is a new insert with the moved quantity
    expect(destInsert).toBeDefined();
    expect(destInsert!.payload.quantity).toBe(2);
    expect(destInsert!.payload.location).toBe('Truck 2');
  });

  it('partial move with merge: queues qty_delta on both source and destination', async () => {
    const destItem: EquipmentItem = {
      ...base,
      id: '2',
      location: 'Truck 2',
      quantity: 3,
      updated_at: '2026-01-02T00:00:00Z',
    };

    const result = await moveEquipment({
      sourceItem: base, // qty = 5
      moveQty: 2,
      toLocation: 'Truck 2',
      allItems: [base, destItem],
      ...moveBase,
    });

    expect(result.success).toBe(true);

    const calls = mockEnqueue.mock.calls.map(([arg]: [{ table_name: string; operation: string; payload: string }]) => ({
      table: arg.table_name,
      op: arg.operation,
      payload: JSON.parse(arg.payload),
    }));

    const updates = calls.filter((c) => c.table === 'equipment_items' && c.op === 'update');
    expect(updates).toHaveLength(2);

    const sourceUpdate = updates.find((u) => u.payload.id === '1');
    const destUpdate = updates.find((u) => u.payload.id === '2');

    expect(sourceUpdate!.payload.qty_delta).toBe(-2);
    expect(sourceUpdate!.payload.snapshot_updated_at).toBe('2026-01-01T00:00:00Z');

    expect(destUpdate!.payload.qty_delta).toBe(2);
    expect(destUpdate!.payload.snapshot_updated_at).toBe('2026-01-02T00:00:00Z');
  });

  it('full move with merge: queues absolute quantity on dest + delete on source', async () => {
    const destItem: EquipmentItem = {
      ...base,
      id: '2',
      location: 'Truck 2',
      quantity: 3,
      updated_at: '2026-01-02T00:00:00Z',
    };

    const result = await moveEquipment({
      sourceItem: base, // qty = 5, moving all 5
      moveQty: 5,
      toLocation: 'Truck 2',
      allItems: [base, destItem],
      ...moveBase,
    });

    expect(result.success).toBe(true);

    const calls = mockEnqueue.mock.calls.map(([arg]: [{ table_name: string; operation: string; payload: string }]) => ({
      table: arg.table_name,
      op: arg.operation,
      payload: JSON.parse(arg.payload),
    }));

    const destUpdate = calls.find((c) => c.table === 'equipment_items' && c.op === 'update');
    const sourceDelete = calls.find((c) => c.table === 'equipment_items' && c.op === 'delete');

    // Full merge: absolute quantity (no qty_delta) because source is being deleted
    expect(destUpdate!.payload.patch.quantity).toBe(8); // 3 + 5
    expect(destUpdate!.payload.qty_delta).toBeUndefined();
    expect(destUpdate!.payload.snapshot_updated_at).toBe('2026-01-02T00:00:00Z');

    expect(sourceDelete!.payload.id).toBe('1');
  });
});
