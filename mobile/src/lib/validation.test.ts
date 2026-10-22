import { isIsoDate, sanitizeQtyInput } from './validation';

describe('isIsoDate', () => {
  it('accepts real YYYY-MM-DD dates', () => {
    expect(isIsoDate('2026-10-21')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true); // leap day
  });

  it('rejects other formats', () => {
    expect(isIsoDate('2026-1-5')).toBe(false);
    expect(isIsoDate('05/01/2026')).toBe(false);
    expect(isIsoDate('2026-10-21T00:00:00Z')).toBe(false);
    expect(isIsoDate(' 2026-10-21')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });

  it('rejects impossible calendar dates', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2025-02-29')).toBe(false); // not a leap year
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-00-10')).toBe(false);
  });
});

describe('sanitizeQtyInput', () => {
  it('keeps an empty field empty so it can be cleared', () => {
    expect(sanitizeQtyInput('')).toBe('');
  });

  it('drops leading zeros', () => {
    expect(sanitizeQtyInput('05')).toBe('5');
    expect(sanitizeQtyInput('007')).toBe('7');
    expect(sanitizeQtyInput('0')).toBe('0');
    expect(sanitizeQtyInput('00')).toBe('0');
  });

  it('strips non-digits, including a minus sign', () => {
    expect(sanitizeQtyInput('-3')).toBe('3');
    expect(sanitizeQtyInput('1,200')).toBe('1200');
    expect(sanitizeQtyInput('2.5')).toBe('25');
  });
});
