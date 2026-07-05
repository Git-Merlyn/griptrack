/**
 * Local SQLite database — the offline source of truth for all reads.
 *
 * Tables mirror the Supabase schema for equipment_items, locations, and
 * equipment_requests. A sync_queue table holds pending mutations that will be
 * replayed to Supabase when connectivity is restored.
 */

import * as SQLite from 'expo-sqlite';
import { EquipmentItem, Location } from './types';
import type { EquipmentRequest } from '../hooks/useRequests';

export const db = SQLite.openDatabaseSync('griptrack.db');

// ─── Schema ──────────────────────────────────────────────────────────────────

export function initDB(): void {
  db.execSync(`
    PRAGMA journal_mode = WAL;

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
    );

    CREATE TABLE IF NOT EXISTS locations (
      id        TEXT PRIMARY KEY,
      org_id    TEXT NOT NULL,
      name      TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

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
    );

    -- Pending mutations to replay on reconnect (FIFO by created_at)
    CREATE TABLE IF NOT EXISTS sync_queue (
      id         TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      operation  TEXT NOT NULL,  -- 'insert' | 'update' | 'delete'
      payload    TEXT NOT NULL,  -- JSON
      created_at TEXT NOT NULL,
      retries    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migrate existing installs — add updated_at if the column doesn't exist yet.
  // SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS, so we catch the
  // "duplicate column" error and ignore it.
  try {
    db.execSync(`ALTER TABLE equipment_items ADD COLUMN updated_at TEXT`);
  } catch {
    // Column already exists — safe to ignore
  }

  // Migrate existing installs — team_id used to be NOT NULL (teams were
  // mandatory). Teams-off orgs store team_id = null, so rebuild the table
  // without the constraint. SQLite can't drop NOT NULL in place; recreate and
  // copy. Cached rows are preserved.
  try {
    const cols = db.getAllSync(`PRAGMA table_info(equipment_items)`) as Array<{
      name: string;
      notnull: number;
    }>;
    const teamCol = cols.find((c) => c.name === 'team_id');
    if (teamCol && teamCol.notnull === 1) {
      db.execSync(`
        ALTER TABLE equipment_items RENAME TO equipment_items_legacy;
        CREATE TABLE equipment_items (
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
        );
        INSERT INTO equipment_items
          (id, org_id, team_id, item_id, name, category, source, quantity,
           reserve_min, location, status, start_date, end_date, updated_by,
           updated_at, created_at)
        SELECT id, org_id, team_id, item_id, name, category, source, quantity,
           reserve_min, location, status, start_date, end_date, updated_by,
           updated_at, created_at
        FROM equipment_items_legacy;
        DROP TABLE equipment_items_legacy;
      `);
    }
  } catch (e) {
    console.warn('[db] team_id nullable migration failed', e);
  }
}

// ─── UUID ─────────────────────────────────────────────────────────────────────

export function generateId(): string {
  return crypto.randomUUID();
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

export function getEquipmentByTeam(orgId: string, teamId: string): EquipmentItem[] {
  return db.getAllSync(
    `SELECT * FROM equipment_items
     WHERE org_id = ? AND team_id = ? AND name != '__placeholder__'
     ORDER BY name ASC`,
    [orgId, teamId]
  ) as EquipmentItem[];
}

export function replaceEquipmentForTeam(
  orgId: string,
  teamId: string,
  items: EquipmentItem[]
): void {
  db.runSync('DELETE FROM equipment_items WHERE org_id = ? AND team_id = ?', [orgId, teamId]);
  for (const item of items) {
    upsertEquipmentItem(item);
  }
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

export function replaceEquipmentForOrg(orgId: string, items: EquipmentItem[]): void {
  db.runSync('DELETE FROM equipment_items WHERE org_id = ?', [orgId]);
  for (const item of items) {
    upsertEquipmentItem(item);
  }
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

export function replaceLocationsForOrg(orgId: string, locs: Location[]): void {
  db.runSync('DELETE FROM locations WHERE org_id = ?', [orgId]);
  for (const loc of locs) {
    upsertLocation(loc);
  }
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

export function replaceRequestsForOrg(orgId: string, reqs: EquipmentRequest[]): void {
  db.runSync('DELETE FROM equipment_requests WHERE org_id = ?', [orgId]);
  for (const req of reqs) {
    upsertRequest(req);
  }
}

// ─── Sync queue ───────────────────────────────────────────────────────────────

export interface SyncQueueEntry {
  id: string;
  table_name: string;
  operation: 'insert' | 'update' | 'delete';
  payload: string; // JSON
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
