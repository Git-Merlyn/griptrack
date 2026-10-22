// Small input validators shared by mobile forms. Pure functions — unit-tested
// in validation.test.ts.

/**
 * True for a real calendar date written exactly as YYYY-MM-DD — the only
 * form the Postgres `date` columns accept unambiguously. Rejects "2026-1-5",
 * "05/01/2026" and impossible dates such as "2026-02-30".
 */
export function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Cleans text typed into a whole-number quantity field: keeps digits only
 * and drops leading zeros ("05" -> "5", "0" stays "0", "" stays "").
 */
export function sanitizeQtyInput(value: string): string {
  return value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}
