/**
 * db.ts against a real SQLite engine: expo-sqlite's sync API is backed here by
 * Node's built-in node:sqlite (Node >= 22.13), one fresh in-memory DB per test.
 */

let hasNodeSqlite = true;
try {
  require('node:sqlite');
} catch {
  hasNodeSqlite = false;
}

jest.mock('expo-sqlite', () => {
  const { DatabaseSync } = require('node:sqlite');
  // node:sqlite returns null-prototype rows; copy them into plain objects.
  const plain = (row: any) => (row == null ? null : { ...row });
  return {
    openDatabaseSync: () => {
      const d = new DatabaseSync(':memory:');
      const api = {
        execSync: (sql: string) => d.exec(sql),
        runSync: (sql: string, params: unknown[] = []) => d.prepare(sql).run(...params),
        getAllSync: (sql: string, params: unknown[] = []) =>
          d.prepare(sql).all(...params).map(plain),
        getFirstSync: (sql: string, params: unknown[] = []) =>
          plain(d.prepare(sql).get(...params)),
        // Same semantics as expo-sqlite 55 SQLiteDatabase.withTransactionSync.
        withTransactionSync: (task: () => void) => {
          d.exec('BEGIN');
          try {
            task();
            d.exec('COMMIT');
          } catch (e) {
            d.exec('ROLLBACK');
            throw e;
          }
        },
      };
      return api;
    },
  };
});

type DbModule = typeof import('./db');

/** Fresh module = fresh in-memory DB (the mock opens one per openDatabaseSync). */
function loadDb(): DbModule {
  let mod!: DbModule;
  jest.isolateModules(() => {
    mod = require('./db');
  });
  return mod;
}

// Exact initDB() DDL of the first offline build (04d09ae, 2026-04-24):
// team_id NOT NULL, no updated_at, requested_by NOT NULL.
const SCHEMA_BUILD_2026_04 = `
  CREATE TABLE equipment_items (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, team_id TEXT NOT NULL, item_id TEXT,
    name TEXT NOT NULL, category TEXT, source TEXT,
    quantity INTEGER NOT NULL DEFAULT 0, reserve_min INTEGER NOT NULL DEFAULT 0,
    location TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Available',
    start_date TEXT, end_date TEXT, updated_by TEXT, created_at TEXT
  );
  CREATE TABLE locations (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE equipment_requests (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, requested_by TEXT NOT NULL,
    requester_name TEXT, item_name TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
    notes TEXT, status TEXT NOT NULL DEFAULT 'pending', reviewed_by TEXT,
    reviewed_at TEXT, created_at TEXT
  );
  CREATE TABLE sync_queue (
    id TEXT PRIMARY KEY, table_name TEXT NOT NULL, operation TEXT NOT NULL,
    payload TEXT NOT NULL, created_at TEXT NOT NULL, retries INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT);
`;

// Shape of builds 4/5 (HEAD before this change): team_id nullable, updated_at
// present, requested_by still NOT NULL, user_version never set.
const SCHEMA_BUILD_5 = SCHEMA_BUILD_2026_04
  .replace('team_id TEXT NOT NULL', 'team_id TEXT')
  .replace('updated_by TEXT, created_at TEXT', 'updated_by TEXT, updated_at TEXT, created_at TEXT');

const item = (over: Record<string, unknown> = {}) => ({
  id: 'i1', org_id: 'org1', team_id: null, item_id: null, name: 'C-Stand',
  category: 'Grip', source: 'House', quantity: 4, reserve_min: 0,
  location: 'Truck', status: 'Available', start_date: null, end_date: null,
  updated_by: 'a@x.com', updated_at: '2026-10-01T00:00:00Z',
  created_at: '2026-10-01T00:00:00Z', ...over,
});

const request = (over: Record<string, unknown> = {}) => ({
  id: 'r1', org_id: 'org1', requested_by: 'user-a', requester_name: 'A',
  item_name: 'Sandbag', quantity: 2, notes: null, status: 'pending',
  reviewed_by: null, reviewed_at: null, created_at: '2026-10-01T00:00:00Z', ...over,
});

const notNull = (m: DbModule, table: string, col: string) =>
  (m.db.getAllSync(`PRAGMA table_info(${table})`) as Array<{ name: string; notnull: number }>)
    .find((c) => c.name === col)?.notnull;

const d = hasNodeSqlite ? describe : describe.skip;
if (!hasNodeSqlite) {
  console.warn('db.schema.test.ts skipped: node:sqlite needs Node >= 22.13');
}

d('initDB — schema versioning', () => {
  it('creates the latest schema on a fresh install and sets user_version', () => {
    const m = loadDb();
    expect(m.getSchemaVersion()).toBe(0);
    m.initDB();
    expect(m.getSchemaVersion()).toBe(m.SCHEMA_VERSION);
    expect(m.SCHEMA_VERSION).toBe(2);
    expect(notNull(m, 'equipment_requests', 'requested_by')).toBe(0);
    expect(notNull(m, 'equipment_items', 'team_id')).toBe(0);
    expect(m.getSyncQueueCount()).toBe(0);
  });

  it('is idempotent', () => {
    const m = loadDb();
    m.initDB();
    m.upsertRequest(request({ requested_by: null }) as any);
    m.initDB();
    expect(m.getSchemaVersion()).toBe(2);
    expect(m.getRequestsForOrg('org1')).toHaveLength(1);
  });

  it('upgrades a build-5 database in place, keeping cache, queue and meta', () => {
    const m = loadDb();
    m.db.execSync(SCHEMA_BUILD_5);
    m.upsertEquipmentItem(item() as any);
    m.upsertRequest(request() as any);
    m.enqueueOp({ table_name: 'equipment_items', operation: 'update', payload: '{"id":"i1"}' });
    m.setSyncMeta('last_synced', '2026-10-20T00:00:00Z');

    m.initDB();

    expect(m.getSchemaVersion()).toBe(2);
    expect(notNull(m, 'equipment_requests', 'requested_by')).toBe(0);
    expect(m.getEquipmentByOrg('org1')).toEqual([item()]);
    expect(m.getRequestsForOrg('org1')).toEqual([request()]);
    expect(m.getSyncQueueCount()).toBe(1);
    expect(m.getSyncMeta('last_synced')).toBe('2026-10-20T00:00:00Z');
  });

  it('upgrades the oldest shipped schema (team_id NOT NULL, no updated_at)', () => {
    const m = loadDb();
    m.db.execSync(SCHEMA_BUILD_2026_04);
    m.db.runSync(
      `INSERT INTO equipment_items (id, org_id, team_id, name, location) VALUES ('i1', 'org1', 't1', 'Flag', 'Cart')`
    );

    m.initDB();

    expect(m.getSchemaVersion()).toBe(2);
    expect(notNull(m, 'equipment_items', 'team_id')).toBe(0);
    const rows = m.getEquipmentByTeam('org1', 't1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'i1', updated_at: null });
    // A teams-off row (team_id null) is now accepted.
    m.upsertEquipmentItem(item({ id: 'i2' }) as any);
    expect(m.getEquipmentByOrg('org1')).toHaveLength(2);
  });

  it('drops a leftover equipment_items_legacy from a crashed pre-versioning rebuild', () => {
    const m = loadDb();
    m.db.execSync(SCHEMA_BUILD_2026_04);
    m.db.execSync(`CREATE TABLE equipment_items_legacy (id TEXT)`);

    m.initDB();

    expect(m.getSchemaVersion()).toBe(2);
    expect(m.db.getFirstSync(`SELECT name FROM sqlite_master WHERE name = 'equipment_items_legacy'`)).toBeNull();
    expect(notNull(m, 'equipment_items', 'team_id')).toBe(0);
  });

  it('rolls a failing migration back and stays at the previous version', () => {
    const m = loadDb();
    m.db.execSync(SCHEMA_BUILD_5);
    m.upsertRequest(request() as any);
    m.db.execSync(`PRAGMA user_version = 1`);
    // Sabotage migration 2: make the INSERT ... SELECT copy fail.
    m.db.execSync(`ALTER TABLE equipment_requests DROP COLUMN created_at`);
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});

    m.initDB();

    expect(err).toHaveBeenCalledWith(expect.stringContaining('migration 2'), expect.anything());
    err.mockRestore();
    expect(m.getSchemaVersion()).toBe(1);
    expect(notNull(m, 'equipment_requests', 'requested_by')).toBe(1);
    expect(m.db.getFirstSync(`SELECT name FROM sqlite_master WHERE name = 'equipment_requests_legacy'`)).toBeNull();
    expect(m.db.getAllSync('SELECT id FROM equipment_requests')).toEqual([{ id: 'r1' }]);
  });
});

d('replace* helpers', () => {
  it('replaceRequestsForOrg stores a request whose requester deleted their account (M15)', () => {
    const m = loadDb();
    m.initDB();
    m.replaceRequestsForOrg('org1', [
      request() as any,
      request({ id: 'r2', requested_by: null, created_at: '2026-10-02T00:00:00Z' }) as any,
    ]);
    expect(m.getRequestsForOrg('org1').map((r) => [r.id, r.requested_by])).toEqual([
      ['r2', null],
      ['r1', 'user-a'],
    ]);
    // A NULL requester never matches a crew member's own-requests filter.
    expect(m.getRequestsForUser('org1', 'user-a').map((r) => r.id)).toEqual(['r1']);
  });

  it('rolls back the DELETE when a row fails, keeping the previous cache', () => {
    const m = loadDb();
    m.initDB();
    m.replaceEquipmentForOrg('org1', [item() as any]);
    // name NOT NULL → the second row throws mid-replace.
    expect(() =>
      m.replaceEquipmentForOrg('org1', [item({ id: 'i9' }) as any, item({ id: 'i10', name: null }) as any])
    ).toThrow();
    expect(m.getEquipmentByOrg('org1').map((i) => i.id)).toEqual(['i1']);
  });

  it('replaceEquipmentForTeam only replaces that team', () => {
    const m = loadDb();
    m.initDB();
    m.upsertEquipmentItem(item({ id: 'a', team_id: 't1' }) as any);
    m.upsertEquipmentItem(item({ id: 'b', team_id: 't2' }) as any);
    m.replaceEquipmentForTeam('org1', 't1', [item({ id: 'c', team_id: 't1' }) as any]);
    expect(m.getEquipmentByOrg('org1').map((i) => i.id).sort()).toEqual(['b', 'c']);
  });

  it('replaceLocationsForOrg rolls back on failure', () => {
    const m = loadDb();
    m.initDB();
    m.replaceLocationsForOrg('org1', [{ id: 'l1', org_id: 'org1', name: 'Truck', is_active: true } as any]);
    expect(() =>
      m.replaceLocationsForOrg('org1', [{ id: 'l2', org_id: 'org1', name: null, is_active: true } as any])
    ).toThrow();
    expect(m.getAllLocationsByOrg('org1').map((l) => l.id)).toEqual(['l1']);
  });
});

