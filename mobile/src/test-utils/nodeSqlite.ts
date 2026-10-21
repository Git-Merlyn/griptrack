/**
 * Test-only stand-in for expo-sqlite's synchronous API, backed by Node's
 * built-in SQLite (node:sqlite, Node >= 22.13). Lets jest run lib/db.ts
 * against a real in-memory database:
 *
 *   jest.mock('expo-sqlite', () => ({
 *     openDatabaseSync: () => require('../test-utils/nodeSqlite').openNodeSqliteDatabase(),
 *   }));
 *
 * Never imported by app code (Metro only bundles what the app imports).
 */

type Params = unknown[] | undefined;

export function openNodeSqliteDatabase() {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (path: string) => {
      exec(sql: string): void;
      prepare(sql: string): {
        run(...params: unknown[]): unknown;
        all(...params: unknown[]): Record<string, unknown>[];
        get(...params: unknown[]): Record<string, unknown> | undefined;
      };
    };
  };
  const raw = new DatabaseSync(':memory:');
  const args = (params: Params) => (params ?? []).map((p) => (p === undefined ? null : p));

  return {
    execSync(sql: string): void {
      raw.exec(sql);
    },
    runSync(sql: string, params?: Params) {
      return raw.prepare(sql).run(...args(params));
    },
    getAllSync(sql: string, params?: Params) {
      return raw.prepare(sql).all(...args(params)).map((r) => ({ ...r }));
    },
    getFirstSync(sql: string, params?: Params) {
      const row = raw.prepare(sql).get(...args(params));
      return row ? { ...row } : null;
    },
    withTransactionSync(fn: () => void): void {
      raw.exec('BEGIN');
      try {
        fn();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
