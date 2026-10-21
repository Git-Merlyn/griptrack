const mockInvoke = jest.fn();
jest.mock('./supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

import { invokeFn } from './invokeFn';

function httpFailure(body: unknown, status: number, withResponseField = true) {
  const res = {
    status,
    json: jest.fn(async () => {
      if (body instanceof Error) throw body;
      return body;
    }),
  };
  const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    name: 'FunctionsHttpError',
    context: res,
  });
  return { data: null, error, ...(withResponseField ? { response: res } : {}) };
}

beforeEach(() => mockInvoke.mockReset());

describe('invokeFn', () => {
  it('returns data on success', async () => {
    mockInvoke.mockResolvedValue({ data: [{ name: 'C-Stand' }], error: null });
    await expect(invokeFn('parse-rental-pdf', { body: {} })).resolves.toEqual([{ name: 'C-Stand' }]);
    expect(mockInvoke).toHaveBeenCalledWith('parse-rental-pdf', { body: {} });
  });

  it("surfaces the function's { error } body instead of 'non-2xx'", async () => {
    mockInvoke.mockResolvedValue(httpFailure({ error: 'Admins only' }, 403));
    await expect(invokeFn('invite-staff')).rejects.toMatchObject({ message: 'Admins only', status: 403 });
  });

  it('falls back to error.context when there is no response field', async () => {
    mockInvoke.mockResolvedValue(httpFailure({ error: 'Invite limit reached (20 per hour)' }, 429, false));
    await expect(invokeFn('invite-staff')).rejects.toThrow('Invite limit reached (20 per hour)');
  });

  it('keeps the generic message when the body is not JSON', async () => {
    mockInvoke.mockResolvedValue(httpFailure(new SyntaxError('Unexpected token <'), 502));
    await expect(invokeFn('parse-rental-pdf')).rejects.toThrow('Edge Function returned a non-2xx status code');
  });

  it('reports network failures', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Failed to send a request to the Edge Function'), {
        name: 'FunctionsFetchError',
        context: new TypeError('Network request failed'),
      }),
    });
    await expect(invokeFn('invite-staff')).rejects.toThrow('Failed to send a request to the Edge Function');
  });

  it('treats a 2xx body with an error string as a failure', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'fileBase64 is required' }, error: null });
    await expect(invokeFn('parse-rental-pdf')).rejects.toThrow('fileBase64 is required');
  });
});
