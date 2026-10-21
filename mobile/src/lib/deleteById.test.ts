const mockFrom = jest.fn();
jest.mock('./supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { deleteById } from './deleteById';

// PostgREST-like builder: chain methods return the builder; awaiting it (or
// maybeSingle()) resolves to `result`.
function query(result: { data: unknown; error: unknown }) {
  const q: Record<string, jest.Mock> & { then?: unknown } = {};
  for (const m of ['delete', 'select', 'eq']) q[m] = jest.fn(() => q);
  q.maybeSingle = jest.fn(() => Promise.resolve(result));
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

beforeEach(() => mockFrom.mockReset());

describe('deleteById', () => {
  it("returns 'deleted' when DELETE ... RETURNING id gives the row back", async () => {
    const del = query({ data: [{ id: 'x' }], error: null });
    mockFrom.mockReturnValueOnce(del);
    await expect(deleteById('equipment_items', 'x')).resolves.toBe('deleted');
    expect(del.select).toHaveBeenCalledWith('id');
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("returns 'denied' when RLS filtered the delete (0 rows) and the row still exists", async () => {
    mockFrom
      .mockReturnValueOnce(query({ data: [], error: null }))
      .mockReturnValueOnce(query({ data: { id: 'x' }, error: null }));
    await expect(deleteById('locations', 'x')).resolves.toBe('denied');
  });

  it("returns 'gone' when the row was already deleted", async () => {
    mockFrom
      .mockReturnValueOnce(query({ data: [], error: null }))
      .mockReturnValueOnce(query({ data: null, error: null }));
    await expect(deleteById('equipment_items', 'x')).resolves.toBe('gone');
  });

  it('throws an Error that keeps the PostgREST code', async () => {
    mockFrom.mockReturnValueOnce(query({ data: null, error: { message: 'permission denied', code: '42501' } }));
    await expect(deleteById('equipment_items', 'x')).rejects.toMatchObject({
      message: 'permission denied',
      code: '42501',
    });
  });
});
