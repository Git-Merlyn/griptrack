jest.mock('../lib/db', () => ({
  getEquipmentByTeam: jest.fn(() => []),
  getEquipmentByOrg: jest.fn(() => []),
}));
jest.mock('../context/AuthContext', () => ({
  useAuthContext: () => ({ profile: { org_id: 'org', role: 'owner' } }),
}));
jest.mock('../context/TeamContext', () => ({ useTeamContext: () => ({ activeTeamId: null }) }));
jest.mock('../context/OrgContext', () => ({
  useOrgContext: () => ({ features: { teamsEnabled: false } }),
}));
const mockSync = { localVersion: 0, isSyncing: false, triggerSync: jest.fn(async () => true) };
jest.mock('../context/SyncContext', () => ({ useSyncContext: () => mockSync }));

import { renderHook } from '@testing-library/react-native';
import { useInventory } from './useInventory';
import { getEquipmentByOrg } from '../lib/db';

describe('useInventory loading (L39)', () => {
  beforeEach(() => {
    mockSync.localVersion = 0;
    mockSync.isSyncing = false;
    (getEquipmentByOrg as jest.Mock).mockReturnValue([]);
  });

  it('shows the spinner while the first sync runs on an empty cache', async () => {
    const { result, rerender } = await renderHook(() => useInventory());
    expect(result.current.loading).toBe(false);
    mockSync.isSyncing = true;
    await rerender({});
    expect(result.current.loading).toBe(true);
  });

  it('clears the spinner when that sync fails (localVersion never bumps)', async () => {
    const { result, rerender } = await renderHook(() => useInventory());
    mockSync.isSyncing = true;
    await rerender({});
    expect(result.current.loading).toBe(true);
    mockSync.isSyncing = false; // sync failed: isSyncing false, localVersion unchanged
    await rerender({});
    expect(result.current.loading).toBe(false);
  });

  it('no spinner over cached rows, even when a sync is already running at mount', async () => {
    (getEquipmentByOrg as jest.Mock).mockReturnValue([{ id: 'i1', name: 'C-Stand', category: null, location: 'Truck' }]);
    mockSync.isSyncing = true;
    const { result, rerender } = await renderHook(() => useInventory());
    expect(result.current.equipment).toHaveLength(1);
    expect(result.current.loading).toBe(false);
    mockSync.isSyncing = false; // that sync failed: localVersion never bumps
    await rerender({});
    expect(result.current.loading).toBe(false);
  });
});
