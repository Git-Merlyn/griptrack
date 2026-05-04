import { statusColor, getQty, qtyColor, formatDate, formatDateTime } from './helpers';
import type { EquipmentItem } from './types';

const base: EquipmentItem = {
  id: '1',
  org_id: 'org',
  team_id: 'team',
  item_id: null,
  name: 'C-Stand',
  category: null,
  source: null,
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

describe('statusColor', () => {
  it('returns success green for Available (case-insensitive)', () => {
    expect(statusColor('Available')).toBe('#2ecc71');
    expect(statusColor('available')).toBe('#2ecc71');
    expect(statusColor('AVAILABLE')).toBe('#2ecc71');
  });

  it('returns warning yellow for Out (case-insensitive)', () => {
    expect(statusColor('Out')).toBe('#ffd600');
    expect(statusColor('out')).toBe('#ffd600');
    expect(statusColor('OUT')).toBe('#ffd600');
  });

  it('returns danger red for Damaged (case-insensitive)', () => {
    expect(statusColor('Damaged')).toBe('#ff4d4d');
    expect(statusColor('damaged')).toBe('#ff4d4d');
    expect(statusColor('DAMAGED')).toBe('#ff4d4d');
  });

  it('returns gray for unknown, null, and undefined status', () => {
    expect(statusColor('Unknown')).toBe('#9ca3af');
    expect(statusColor('')).toBe('#9ca3af');
    expect(statusColor(null)).toBe('#9ca3af');
    expect(statusColor(undefined)).toBe('#9ca3af');
  });

  it('trims whitespace before matching', () => {
    expect(statusColor('  available  ')).toBe('#2ecc71');
  });
});

describe('getQty', () => {
  it('returns numeric quantity as-is', () => {
    expect(getQty({ ...base, quantity: 7 })).toBe(7);
    expect(getQty({ ...base, quantity: 0 })).toBe(0);
  });

  it('parses string quantities', () => {
    expect(getQty({ ...base, quantity: '12' as unknown as number })).toBe(12);
    expect(getQty({ ...base, quantity: ' 4 ' as unknown as number })).toBe(4);
  });

  it('returns 0 for NaN, null, and empty string', () => {
    expect(getQty({ ...base, quantity: NaN })).toBe(0);
    expect(getQty({ ...base, quantity: null as unknown as number })).toBe(0);
    expect(getQty({ ...base, quantity: '' as unknown as number })).toBe(0);
  });
});

describe('qtyColor', () => {
  it('returns red when qty is 0 and reserve_min > 0', () => {
    expect(qtyColor({ ...base, quantity: 0, reserve_min: 2 })).toBe('#ff4d4d');
    expect(qtyColor({ ...base, quantity: 0, reserve_min: 1 })).toBe('#ff4d4d');
  });

  it('returns yellow when 0 < qty < reserve_min', () => {
    expect(qtyColor({ ...base, quantity: 1, reserve_min: 3 })).toBe('#ffd600');
    expect(qtyColor({ ...base, quantity: 2, reserve_min: 5 })).toBe('#ffd600');
  });

  it('returns default when qty >= reserve_min', () => {
    expect(qtyColor({ ...base, quantity: 5, reserve_min: 5 })).toBe('#f1f5f9');
    expect(qtyColor({ ...base, quantity: 10, reserve_min: 5 })).toBe('#f1f5f9');
  });

  it('returns default when reserve_min is 0 regardless of qty', () => {
    expect(qtyColor({ ...base, quantity: 0, reserve_min: 0 })).toBe('#f1f5f9');
    expect(qtyColor({ ...base, quantity: 5, reserve_min: 0 })).toBe('#f1f5f9');
  });

  it('parses string reserve_min values', () => {
    expect(qtyColor({ ...base, quantity: 0, reserve_min: '3' as unknown as number })).toBe('#ff4d4d');
    expect(qtyColor({ ...base, quantity: 1, reserve_min: '5' as unknown as number })).toBe('#ffd600');
  });
});

describe('formatDate', () => {
  it('returns em dash for null, undefined, and empty string', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('formats YYYY-MM-DD to a readable date (no timezone shift)', () => {
    // The T00:00:00 trick in formatDate prevents UTC midnight shifting the day.
    expect(formatDate('2026-01-29')).toBe('Jan 29, 2026');
    expect(formatDate('2026-12-01')).toBe('Dec 1, 2026');
  });

  it('returns the original string for an invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(formatDate('2026-13-45')).toBe('2026-13-45');
  });
});

describe('formatDateTime', () => {
  it('returns em dash for null, undefined, and empty string', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime('')).toBe('—');
  });

  it('formats a full ISO timestamp to a date string (time is dropped by toLocaleDateString)', () => {
    // toLocaleDateString never includes time, so we just verify the date parts are right.
    const result = formatDateTime('2026-01-29T10:30:00.000Z');
    expect(result).not.toBe('—');
    expect(result).toContain('2026');
    expect(result).toContain('29');
  });

  it('returns the original string for an invalid timestamp', () => {
    expect(formatDateTime('bad-timestamp')).toBe('bad-timestamp');
  });
});
