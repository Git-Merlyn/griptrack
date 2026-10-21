jest.mock('../lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('../lib/db', () => ({
  upsertEquipmentItem: jest.fn(),
  deleteEquipmentItemLocal: jest.fn(),
  enqueueOp: jest.fn(),
  generateId: jest.fn(() => 'generated-id'),
  getEquipmentById: jest.fn(),
}));
jest.mock('../context/AuthContext', () => ({
  useAuthContext: () => ({
    profile: { id: 'user-1', email: 'alice@example.com', org_id: 'org', role: 'owner' },
    session: { user: { id: 'user-1' } },
  }),
}));
// Teams on but no active team: the old list lookup missed every row here.
jest.mock('../context/TeamContext', () => ({ useTeamContext: () => ({ activeTeamId: null }) }));
jest.mock('../context/OrgContext', () => ({
  useOrgContext: () => ({ features: { teamsEnabled: true } }),
}));
const mockBump = jest.fn();
jest.mock('../context/SyncContext', () => ({
  useSyncContext: () => ({ isOnline: false, bumpLocalVersion: mockBump }),
}));

import { renderHook } from '@testing-library/react-native';
import { useEquipmentMutations } from './useEquipmentMutations';
import { enqueueOp, getEquipmentById, upsertEquipmentItem } from '../lib/db';
import type { EquipmentItem } from '../lib/types';

const mockEnqueue = enqueueOp as jest.Mock;
const mockGetById = getEquipmentById as jest.Mock;
const mockUpsert = upsertEquipmentItem as jest.Mock;

const row: EquipmentItem = {
  id: 'i1',
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
  updated_by: 'bob',
  updated_at: '2026-10-05T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
};

const queued = (n = 0) => JSON.parse(mockEnqueue.mock.calls[n][0].payload);

beforeEach(() => jest.clearAllMocks());

describe('updateItem offline (L37)', () => {
  it('snapshots the local row found by id, even with teams on and no active team', async () => {
    mockGetById.mockReturnValue(row);
    const { result } = renderHook(() => useEquipmentMutations());
    const updated = await result.current.updateItem('i1', { name: 'C-Stand 40"' });

    expect(mockGetById).toHaveBeenCalledWith('i1');
    expect(queued()).toMatchObject({
      id: 'i1',
      snapshot_updated_at: '2026-10-05T00:00:00.000Z',
      patch: { name: 'C-Stand 40"', updated_by: 'alice@example.com' },
    });
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1', name: 'C-Stand 40"', quantity: 5 }));
    expect(updated).toMatchObject({ id: 'i1', name: 'C-Stand 40"', location: 'Truck 1' });
    expect(mockBump).toHaveBeenCalled();
  });

  it('refuses to queue an update for a row that is not cached', async () => {
    mockGetById.mockReturnValue(null);
    const { result } = renderHook(() => useEquipmentMutations());
    await expect(result.current.updateItem('nope', { name: 'X' })).rejects.toThrow('Item not available offline');
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe('reportDamage offline (M18)', () => {
  it('uses the current local row, not the caller\'s stale copy', async () => {
    const stale: EquipmentItem = { ...row, name: 'Old name', updated_at: '2026-10-01T00:00:00.000Z' };
    mockGetById.mockReturnValue(row);
    const { result } = renderHook(() => useEquipmentMutations());
    const updated = await result.current.reportDamage(stale, 'bent');

    expect(queued(0)).toMatchObject({ id: 'i1', snapshot_updated_at: '2026-10-05T00:00:00.000Z' });
    expect(queued(0).patch.status).toBe('Damaged');
    expect(mockEnqueue.mock.calls[1][0]).toMatchObject({ table_name: 'log_damage_event', operation: 'rpc' });
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'C-Stand', status: 'Damaged' }));
    expect(updated.name).toBe('C-Stand');
  });

  it('falls back to the passed item when the row is not cached', async () => {
    mockGetById.mockReturnValue(null);
    const { result } = renderHook(() => useEquipmentMutations());
    await result.current.reportDamage(row, '');
    expect(queued(0).snapshot_updated_at).toBe('2026-10-05T00:00:00.000Z');
  });
});
