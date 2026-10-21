jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => require('../test-utils/nodeSqlite').openNodeSqliteDatabase(),
}));

import {
  db,
  initDB,
  upsertEquipmentItem,
  getEquipmentById,
  getEquipmentByTeam,
  getEquipmentByOrg,
  replaceEquipmentForTeam,
  replaceEquipmentForOrg,
  upsertLocation,
  getAllLocationsByOrg,
  replaceLocationsForOrg,
  upsertRequest,
  getRequestsForOrg,
  replaceRequestsForOrg,
  enqueueOp,
  getSyncQueue,
  incrementSyncRetries,
  removeSyncEntry,
  getSyncQueueCount,
} from './db';
import type { EquipmentItem, Location } from './types';
import type { EquipmentRequest } from '../hooks/useRequests';

function item(id: string, over: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id,
    org_id: 'org',
    team_id: 'team',
    item_id: null,
    name: `Item ${id}`,
    category: null,
    source: null,
    quantity: 1,
    reserve_min: 0,
    location: 'Truck',
    status: 'Available',
    start_date: null,
    end_date: null,
    updated_by: 'alice',
    updated_at: '2026-10-01T00:00:00.000Z',
    created_at: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

const loc = (id: string, name = `Loc ${id}`): Location => ({ id, org_id: 'org', name, is_active: true });

function req(id: string, over: Partial<EquipmentRequest> = {}): EquipmentRequest {
  return {
    id,
    org_id: 'org',
    requested_by: 'user-1',
    requester_name: null,
    item_name: `Req ${id}`,
    quantity: 1,
    notes: null,
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    ...over,
  } as EquipmentRequest;
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

beforeAll(() => initDB());
beforeEach(() => {
  db.execSync(
    'DELETE FROM equipment_items; DELETE FROM locations; DELETE FROM equipment_requests; DELETE FROM sync_queue; DELETE FROM sync_meta;'
  );
});

describe('initDB', () => {
  it('is safe to run again on an existing database', () => {
    upsertEquipmentItem(item('a'));
    expect(() => initDB()).not.toThrow();
    expect(getEquipmentById('a')?.name).toBe('Item a');
  });

  it('rebuilds a legacy NOT NULL team_id table and keeps its rows', () => {
    jest.isolateModules(() => {
      const fresh = require('./db') as typeof import('./db');
      fresh.db.execSync(`
        CREATE TABLE equipment_items (
          id TEXT PRIMARY KEY, org_id TEXT NOT NULL, team_id TEXT NOT NULL,
          item_id TEXT, name TEXT NOT NULL, category TEXT, source TEXT,
          quantity INTEGER NOT NULL DEFAULT 0, reserve_min INTEGER NOT NULL DEFAULT 0,
          location TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Available',
          start_date TEXT, end_date TEXT, updated_by TEXT, created_at TEXT
        );
        INSERT INTO equipment_items (id, org_id, team_id, name, location)
          VALUES ('old', 'org', 'team', 'Old row', 'Truck');
      `);
      fresh.initDB();
      const cols = fresh.db.getAllSync('PRAGMA table_info(equipment_items)') as Array<{ name: string; notnull: number }>;
      expect(cols.find((c) => c.name === 'team_id')?.notnull).toBe(0);
      expect(cols.some((c) => c.name === 'updated_at')).toBe(true);
      expect(fresh.getEquipmentById('old')?.name).toBe('Old row');
      fresh.upsertEquipmentItem(item('flat', { team_id: null }));
      expect(fresh.getEquipmentById('flat')?.team_id).toBeNull();
    });
  });
});

describe('getEquipmentById', () => {
  it('returns the cached row regardless of team, or null', () => {
    upsertEquipmentItem(item('a', { team_id: 'other-team' }));
    expect(getEquipmentById('a')?.team_id).toBe('other-team');
    expect(getEquipmentById('missing')).toBeNull();
  });
});

describe('replaceEquipmentForTeam', () => {
  it('replaces only that team, leaving other teams alone', () => {
    upsertEquipmentItem(item('stale'));
    upsertEquipmentItem(item('other', { team_id: 'team-2' }));
    replaceEquipmentForTeam('org', 'team', [item('fresh')]);
    expect(ids(getEquipmentByTeam('org', 'team'))).toEqual(['fresh']);
    expect(ids(getEquipmentByTeam('org', 'team-2'))).toEqual(['other']);
  });

  it('keeps rows with queued ops exactly as they are locally (L32)', () => {
    upsertEquipmentItem(item('queued-insert', { name: 'Offline add' }));
    upsertEquipmentItem(item('queued-update', { name: 'Edited offline' }));
    upsertEquipmentItem(item('gone'));
    replaceEquipmentForTeam(
      'org',
      'team',
      [item('queued-update', { name: 'Server name' }), item('queued-delete'), item('server-only')],
      ['queued-insert', 'queued-update', 'queued-delete']
    );
    expect(ids(getEquipmentByTeam('org', 'team'))).toEqual(['queued-insert', 'queued-update', 'server-only']);
    expect(getEquipmentById('queued-update')?.name).toBe('Edited offline');
    expect(getEquipmentById('queued-delete')).toBeNull(); // deleted offline: not resurrected
  });
});

describe('replaceEquipmentForOrg', () => {
  it('replaces every row of the org except queued ones', () => {
    upsertEquipmentItem(item('a', { team_id: null }));
    upsertEquipmentItem(item('b', { team_id: null }));
    replaceEquipmentForOrg('org', [item('c', { team_id: null })], ['a']);
    expect(ids(getEquipmentByOrg('org'))).toEqual(['a', 'c']);
  });
});

describe('replaceLocationsForOrg / replaceRequestsForOrg', () => {
  it('keep queued rows and replace the rest', () => {
    upsertLocation(loc('l-queued', 'Renamed offline'));
    upsertLocation(loc('l-old'));
    replaceLocationsForOrg('org', [loc('l-queued', 'Server'), loc('l-new')], ['l-queued']);
    expect(ids(getAllLocationsByOrg('org'))).toEqual(['l-new', 'l-queued']);
    expect(getAllLocationsByOrg('org').find((l) => l.id === 'l-queued')?.name).toBe('Renamed offline');

    upsertRequest(req('r-queued'));
    upsertRequest(req('r-old'));
    replaceRequestsForOrg('org', [req('r-new')], ['r-queued']);
    expect(ids(getRequestsForOrg('org'))).toEqual(['r-new', 'r-queued']);
  });

  it('with no keepIds behave exactly as before (full replace)', () => {
    upsertLocation(loc('l-old'));
    replaceLocationsForOrg('org', [loc('l-new')]);
    expect(ids(getAllLocationsByOrg('org'))).toEqual(['l-new']);
  });
});

describe('sync_queue', () => {
  it('enqueues, counts, increments retries and removes', () => {
    enqueueOp({ table_name: 'equipment_items', operation: 'insert', payload: '{"id":"a"}' });
    enqueueOp({ table_name: 'locations', operation: 'delete', payload: '{"id":"l"}' });
    const q = getSyncQueue();
    expect(q.map((e) => e.table_name)).toEqual(['equipment_items', 'locations']);
    expect(q.every((e) => e.retries === 0)).toBe(true);
    expect(getSyncQueueCount()).toBe(2);

    incrementSyncRetries(q[0].id);
    expect(getSyncQueue()[0].retries).toBe(1);

    removeSyncEntry(q[0].id);
    expect(getSyncQueue().map((e) => e.id)).toEqual([q[1].id]);
    expect(getSyncQueueCount()).toBe(1);
  });
});
