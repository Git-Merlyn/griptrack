import { generateId } from './db';

jest.mock('expo-sqlite', () => ({ openDatabaseSync: () => ({}) }));

describe('generateId', () => {
  it('returns RFC 4122 v4 UUIDs without relying on a global crypto', () => {
    const original = (globalThis as { crypto?: unknown }).crypto;
    // Expo SDK 58 has no global crypto on device; prove we do not need it.
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      const a = generateId();
      const b = generateId();
      expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(b).not.toBe(a);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});
