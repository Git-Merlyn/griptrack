/**
 * Local SQLite database — the offline source of truth for all reads.
 *
 * Tables mirror the Supabase schema for equipment_items, locations, and
 * equipment_requests. A sync_queue table holds pending mutations that will be
 * replayed to Supabase when connectivity is restored.
 */

import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { EquipmentItem, Location } from './types';
import type { EquipmentRequest } from '../hooks/useRequests';

export const db = SQLite.openDatabaseSync('griptrack.db');

// ─── Schema ──────────────────────────────────────────────────────────────────
//
// Versioned with PRAGMA user_version. Every install from before versioning
// existed (store builds up to and including 5) reports user_version = 0, the
// same as a brand-new install, so migration 1 is written to bring ANY of those
// databases to a known shape.
//
// Each migration runs in its own transaction together with its user_version
// bump: if it throws, SQLite rolls both back, the DB stays at the previous
// version and the next launch retries.
//
// Rules for adding a migration:
//   - append { version: <last + 1>, ... }; never edit one that has shipped
//   - the body runs inside a transaction: no BEGIN/COMMIT, no journal_mode
//   - testers can install an OLDER build over a newer DB (TestFlight / Play
//     internal testing), so only add nullable columns or relax constraints;
//     never drop or rename a column an older build reads or writes

const EQUIPMENT_ITEMS_COLUMNS = [
  'id', 'org_id', 'team_id', 'item_id', 'name', 'category', 'source', 'quantity',
  'reserve_min', 'location', 'status', 'start_date', 'end_date', 'updated_by',
  'updated_at', 'created_at',
] as const;

const EQUIPMENT_REQUESTS_COLUMNS = [
  'id', 'org_id', 'requested_by', 'requester_name', 'item_name', 'quantity',
  'notes', 'status', 'reviewed_by', 'reviewed_at', 'created_at',
] as const;

// team_id nullable since 2026-07-05 (teams-off orgs store null).
const CREATE_EQUIPMENT_ITEMS = `
  CREATE TABLE IF NOT EXISTS equipment_items (
    id          TEXT PRIMARY KEY,
    org_id      TEXT NOT NULL,
    team_id     TEXT,
    item_id     TEXT,
    name        TEXT NOT NULL,
    category    TEXT,
    source      TEXT,
    quantity    INTEGER NOT NULL DEFAULT 0,
    reserve_min INTEGER NOT NULL DEFAULT 0,
    location    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'Available',
    start_date  TEXT,
    end_date    TEXT,
    updated_by  TEXT,
    updated_at  TEXT,
    created_at  TEXT
  )`;

const CREATE_LOCATIONS = `
  CREATE TABLE IF NOT EXISTS locations (
    id        TEXT PRIMARY KEY,
    org_id    TEXT NOT NULL,
    name      TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
  )`;

// Shape shipped in builds <= 5 (requested_by NOT NULL). Migration 2 relaxes it.
const CREATE_EQUIPMENT_REQUESTS_V1 = `
  CREATE TABLE IF NOT EXISTS equipment_requests (
    id             TEXT PRIMARY KEY,
    org_id         TEXT NOT NULL,
    requested_by   TEXT NOT NULL,
    requester_name TEXT,
    item_name      TEXT NOT NULL,
    quantity       INTEGER NOT NULL DEFAULT 1,
    notes          TEXT,
    status         TEXT NOT NULL DEFAULT 'pending',
    reviewed_by    TEXT,
    reviewed_at    TEXT,
    created_at     TEXT
  )`;

// requested_by is nullable on the server (FK to auth.users ON DELETE SET NULL):
// a request outlives a requester who deleted their account.
const CREATE_EQUIPMENT_REQUESTS_V2 = `
  CREATE TABLE IF NOT EXISTS equipment_requests (
    id             TEXT PRIMARY KEY,
    org_id         TEXT NOT NULL,
    requested_by   TEXT,
    requester_name TEXT,
    item_name      TEXT NOT NULL,
    quantity       INTEGER NOT NULL DEFAULT 1,
    notes          TEXT,
    status         TEXT NOT NULL DEFAULT 'pending',
    reviewed_by    TEXT,
    reviewed_at    TEXT,
    created_at     TEXT
  )`;

// Pending mutations to replay on reconnect (FIFO by created_at).
// operation: 'insert' | 'update' | 'delete' | 'rpc'; payload: JSON.
const CREATE_SYNC_QUEUE = `
  CREATE TABLE IF NOT EXISTS sync_queue (
    id         TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    operation  TEXT NOT NULL,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    retries    INTEGER NOT NULL DEFAULT 0
  )`;

const CREATE_SYNC_META = `
  CREATE TABLE IF NOT EXISTS sync_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  )`;

type ColumnInfo = { name: string; notnull: number };

function tableColumns(table: string): ColumnInfo[] {
  return db.getAllSync(`PRAGMA table_info(${table})`) as ColumnInfo[];
}

/**
 * SQLite can't change a column constraint in place: rename the table away,
 * create the new shape, copy every row, drop the old copy. Must run inside a
 * transaction (initDB's migration runner provides one).
 */
function rebuildTable(table: string, createSql: string, columns: readonly string[]): void {
  const legacy = `${table}_legacy`;
  const cols = columns.join(', ');
  // A rebuild that crashed in an older build (the pre-versioning code ran
  // without a transaction) can leave <table>_legacy behind; it would make the
  // RENAME below fail forever. Its rows are server data the next pull restores.
  db.execSync(`DROP TABLE IF EXISTS ${legacy}`);
  db.execSync(`ALTER TABLE ${table} RENAME TO ${legacy}`);
  db.execSync(createSql);
  db.execSync(`INSERT INTO ${table} (${cols}) SELECT ${cols} FROM ${legacy}`);
  db.execSync(`DROP TABLE ${legacy}`);
}

interface Migration {
  version: number;
  name: string;
  up: () => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'baseline: tables + equipment_items.updated_at + nullable team_id',
    up: () => {
      db.execSync(CREATE_EQUIPMENT_ITEMS);
      db.execSync(CREATE_LOCATIONS);
      db.execSync(CREATE_EQUIPMENT_REQUESTS_V1);
      db.execSync(CREATE_SYNC_QUEUE);
      db.execSync(CREATE_SYNC_META);

      // Builds from before 2026-04-28 created equipment_items without updated_at.
      const itemCols = tableColumns('equipment_items');
      if (!itemCols.some((c) => c.name === 'updated_at')) {
        db.execSync(`ALTER TABLE equipment_items ADD COLUMN updated_at TEXT`);
      }

      // Builds from before 2026-07-05 created team_id NOT NULL.
      const teamCol = itemCols.find((c) => c.name === 'team_id');
      if (teamCol && teamCol.notnull === 1) {
        rebuildTable('equipment_items', CREATE_EQUIPMENT_ITEMS, EQUIPMENT_ITEMS_COLUMNS);
      } else {
        // Leftover from a crashed pre-versioning rebuild (see rebuildTable).
        db.execSync(`DROP TABLE IF EXISTS equipment_items_legacy`);
      }
    },
  },
  {
    version: 2,
    name: 'equipment_requests.requested_by nullable',
    up: () => {
      const col = tableColumns('equipment_requests').find((c) => c.name === 'requested_by');
      if (col && col.notnull === 1) {
        rebuildTable('equipment_requests', CREATE_EQUIPMENT_REQUESTS_V2, EQUIPMENT_REQUESTS_COLUMNS);
      }
    },
  },
];

/** Highest schema version this build knows about. */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export function getSchemaVersion(): number {
  const row = db.getFirstSync('PRAGMA user_version') as { user_version: number } | null;
  return row?.user_version ?? 0;
}

/**
 * Creates / upgrades the local schema. Safe to call more than once: applied
 * migrations are skipped by version. Never throws — a failed migration is
 * rolled back, logged, and retried on the next launch.
 */
export function initDB(): void {
  try {
    // journal_mode can't change inside a transaction, so it stays out here.
    db.execSync('PRAGMA journal_mode = WAL');
  } catch (e) {
    console.error('[db] enabling WAL failed', e);
  }

  const current = getSchemaVersion();
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    try {
      db.withTransactionSync(() => {
        m.up();
        // PRAGMA can't take a bound parameter; m.version is a literal from MIGRATIONS.
        db.execSync(`PRAGMA user_version = ${m.version}`);
      });
    } catch (e) {
      // Later migrations assume this one ran — stop here.
      console.error(`[db] migration ${m.version} (${m.name}) failed; still at v${current}`, e);
      return;
    }
  }
}

// ─── UUID ─────────────────────────────────────────────────────────────────────

// Expo SDK 58's runtime has no global `crypto` (SDK 55's did), so
// crypto.randomUUID() threw "Property 'crypto' doesn't exist" on device.
// expo-crypto's randomUUID uses the platform's secure random source.
export function generateId(): string {
  return Crypto.randomUUID();
}

// ─── Equipment items ──────────────────────────────────────────────────────────

export function upsertEquipmentItem(item: EquipmentItem): void {
  db.runSync(
    `INSERT OR REPLACE INTO equipment_items
     (id, org_id, team_id, item_id, name, category, source, quantity, reserve_min,
      location, status, start_date, end_date, updated_by, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id, item.org_id, item.team_id ?? null, item.item_id ?? null,
      item.name, item.category ?? null, item.source ?? null,
      item.quantity, item.reserve_min,
      item.location, item.status,
      item.start_date ?? null, item.end_date ?? null,
      item.updated_by, item.updated_at ?? null, item.created_at,
    ]
  );
}

export function deleteEquipmentItemLocal(id: string): void {
  db.runSync('DELETE FROM equipment_items WHERE id = ?', [id]);
}

/** One cached row by primary key, or null when it isn't in SQLite. */
export function getEquipmentById(id: string): EquipmentItem | null {
  return (db.getFirstSync('SELECT * FROM equipment_items WHERE id = ?', [id]) as EquipmentItem | null) ?? null;
}

export function getEquipmentByTeam(orgId: string, teamId: string): EquipmentItem[] {
  return db.getAllSync(
    `SELECT * FROM equipment_items
     WHERE org_id = ? AND team_id = ? AND name != '__placeholder__'
     ORDER BY name ASC`,
    [orgId, teamId]
  ) as EquipmentItem[];
}

// replace* helpers: `keepIds` are rows that still have ops in sync_queue.
// They are neither deleted nor overwritten by the server copy, so the
// optimistic local state survives until the queue drains (lib/sync.ts).
// json_each keeps it to one bound parameter however many ids there are.

// Each helper runs in one transaction: a row that fails to insert rolls back
// the DELETE too (the previous cache survives), and N inserts cost one commit.
export function replaceEquipmentForTeam(
  orgId: string,
  teamId: string,
  items: EquipmentItem[],
  keepIds: readonly string[] = []
): void {
  db.withTransactionSync(() => {
    db.runSync(
      `DELETE FROM equipment_items WHERE org_id = ? AND team_id = ?
         AND id NOT IN (SELECT value FROM json_each(?))`,
      [orgId, teamId, JSON.stringify(keepIds)]
    );
    const keep = new Set(keepIds);
    for (const item of items) {
      if (!keep.has(item.id)) upsertEquipmentItem(item);
    }
  });
}

// Teams-off: the whole org is one flat pool (team_id null).
export function getEquipmentByOrg(orgId: string): EquipmentItem[] {
  return db.getAllSync(
    `SELECT * FROM equipment_items
     WHERE org_id = ? AND name != '__placeholder__'
     ORDER BY name ASC`,
    [orgId]
  ) as EquipmentItem[];
}

export function replaceEquipmentForOrg(
  orgId: string,
  items: EquipmentItem[],
  keepIds: readonly string[] = []
): void {
  db.withTransactionSync(() => {
    db.runSync(
      `DELETE FROM equipment_items WHERE org_id = ?
         AND id NOT IN (SELECT value FROM json_each(?))`,
      [orgId, JSON.stringify(keepIds)]
    );
    const keep = new Set(keepIds);
    for (const item of items) {
      if (!keep.has(item.id)) upsertEquipmentItem(item);
    }
  });
}

// ─── Locations ────────────────────────────────────────────────────────────────

export function upsertLocation(loc: Location): void {
  db.runSync(
    `INSERT OR REPLACE INTO locations (id, org_id, name, is_active) VALUES (?, ?, ?, ?)`,
    [loc.id, loc.org_id, loc.name, loc.is_active ? 1 : 0]
  );
}

export function getLocationsByOrg(orgId: string): Location[] {
  const rows = db.getAllSync(
    `SELECT * FROM locations WHERE org_id = ? AND is_active = 1 ORDER BY name ASC`,
    [orgId]
  ) as Array<Omit<Location, 'is_active'> & { is_active: number }>;
  return rows.map((r) => ({ ...r, is_active: r.is_active === 1 }));
}

/** Returns ALL locations (active + inactive) — used by the management screen. */
export function getAllLocationsByOrg(orgId: string): Location[] {
  const rows = db.getAllSync(
    `SELECT * FROM locations WHERE org_id = ? ORDER BY name ASC`,
    [orgId]
  ) as Array<Omit<Location, 'is_active'> & { is_active: number }>;
  return rows.map((r) => ({ ...r, is_active: r.is_active === 1 }));
}

export function renameLocationLocal(id: string, name: string): void {
  db.runSync(`UPDATE locations SET name = ? WHERE id = ?`, [name, id]);
}

export function setLocationActiveLocal(id: string, isActive: boolean): void {
  db.runSync(`UPDATE locations SET is_active = ? WHERE id = ?`, [isActive ? 1 : 0, id]);
}

export function deleteLocationLocal(id: string): void {
  db.runSync(`DELETE FROM locations WHERE id = ?`, [id]);
}

export function replaceLocationsForOrg(
  orgId: string,
  locs: Location[],
  keepIds: readonly string[] = []
): void {
  db.withTransactionSync(() => {
    db.runSync(
      `DELETE FROM locations WHERE org_id = ?
         AND id NOT IN (SELECT value FROM json_each(?))`,
      [orgId, JSON.stringify(keepIds)]
    );
    const keep = new Set(keepIds);
    for (const loc of locs) {
      if (!keep.has(loc.id)) upsertLocation(loc);
    }
  });
}

// ─── Requests ─────────────────────────────────────────────────────────────────

export function upsertRequest(req: EquipmentRequest): void {
  db.runSync(
    `INSERT OR REPLACE INTO equipment_requests
     (id, org_id, requested_by, requester_name, item_name, quantity, notes,
      status, reviewed_by, reviewed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.id, req.org_id, req.requested_by, req.requester_name ?? null,
      req.item_name, req.quantity, req.notes ?? null, req.status,
      req.reviewed_by ?? null, req.reviewed_at ?? null, req.created_at,
    ]
  );
}

export function getRequestsForOrg(orgId: string): EquipmentRequest[] {
  return db.getAllSync(
    `SELECT * FROM equipment_requests WHERE org_id = ? ORDER BY created_at DESC`,
    [orgId]
  ) as EquipmentRequest[];
}

export function getRequestsForUser(orgId: string, userId: string): EquipmentRequest[] {
  return db.getAllSync(
    `SELECT * FROM equipment_requests WHERE org_id = ? AND requested_by = ? ORDER BY created_at DESC`,
    [orgId, userId]
  ) as EquipmentRequest[];
}

export function replaceRequestsForOrg(
  orgId: string,
  reqs: EquipmentRequest[],
  keepIds: readonly string[] = []
): void {
  db.withTransactionSync(() => {
    db.runSync(
      `DELETE FROM equipment_requests WHERE org_id = ?
         AND id NOT IN (SELECT value FROM json_each(?))`,
      [orgId, JSON.stringify(keepIds)]
    );
    const keep = new Set(keepIds);
    for (const req of reqs) {
      if (!keep.has(req.id)) upsertRequest(req);
    }
  });
}

// ─── Sync queue ───────────────────────────────────────────────────────────────

export interface SyncQueueEntry {
  id: string;
  // For 'rpc' ops, table_name holds the Postgres function name instead.
  table_name: string;
  operation: 'insert' | 'update' | 'delete' | 'rpc';
  payload: string; // JSON (RPC ops: the args object)
  created_at: string;
  retries: number;
}

export function enqueueOp(entry: Omit<SyncQueueEntry, 'id' | 'created_at' | 'retries'>): void {
  db.runSync(
    `INSERT INTO sync_queue (id, table_name, operation, payload, created_at, retries)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [generateId(), entry.table_name, entry.operation, entry.payload, new Date().toISOString()]
  );
}

export function getSyncQueue(): SyncQueueEntry[] {
  return db.getAllSync('SELECT * FROM sync_queue ORDER BY created_at ASC') as SyncQueueEntry[];
}

export function removeSyncEntry(id: string): void {
  db.runSync('DELETE FROM sync_queue WHERE id = ?', [id]);
}

export function incrementSyncRetries(id: string): void {
  db.runSync('UPDATE sync_queue SET retries = retries + 1 WHERE id = ?', [id]);
}

export function getSyncQueueCount(): number {
  const row = db.getFirstSync('SELECT COUNT(*) as count FROM sync_queue') as { count: number } | null;
  return row?.count ?? 0;
}

// ─── Sync meta ────────────────────────────────────────────────────────────────

export function getSyncMeta(key: string): string | null {
  const row = db.getFirstSync('SELECT value FROM sync_meta WHERE key = ?', [key]) as { value: string } | null;
  return row?.value ?? null;
}

export function setSyncMeta(key: string, value: string): void {
  db.runSync('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [key, value]);
}

// ─── Local data ownership ─────────────────────────────────────────────────────
//
// The DB belongs to one user at a time (sync_meta 'owner_user_id'). Queued ops
// carry no user id and replay under whatever token is current, so another
// user's queue must never be drained — it is wiped instead.

const OWNER_KEY = 'owner_user_id';
const CACHE_TABLES = ['equipment_items', 'locations', 'equipment_requests'] as const;

function deleteCachedRows(): void {
  for (const table of CACHE_TABLES) db.runSync(`DELETE FROM ${table}`);
  db.runSync(`DELETE FROM sync_meta WHERE key = 'last_synced'`);
}

/**
 * Explicit sign-out: drop the cached org data (items, locations, requests).
 * Keeps sync_queue and the owner id, so this user's unsynced changes upload
 * the next time they sign in here (and are wiped if someone else does).
 */
export function clearCachedData(): void {
  db.withTransactionSync(deleteCachedRows);
}

/** Wipe everything, including queued offline changes and the owner id. */
export function clearLocalData(): void {
  db.withTransactionSync(() => {
    deleteCachedRows();
    db.runSync('DELETE FROM sync_queue');
    db.runSync('DELETE FROM sync_meta');
  });
}

/**
 * Makes `userId` the owner of the local DB. If a DIFFERENT user owned it, all
 * local data — including their unsynced queue — is wiped first. A DB with no
 * owner (created before ownership tracking, or just wiped) is adopted as-is so
 * an upgrading user keeps their queue. Returns true when data was wiped.
 */
export function claimLocalDataFor(userId: string): boolean {
  const owner = getSyncMeta(OWNER_KEY);
  if (owner === userId) return false;
  const wipe = owner !== null;
  db.withTransactionSync(() => {
    if (wipe) {
      deleteCachedRows();
      db.runSync('DELETE FROM sync_queue');
      db.runSync('DELETE FROM sync_meta');
    }
    db.runSync('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [OWNER_KEY, userId]);
  });
  return wipe;
}
