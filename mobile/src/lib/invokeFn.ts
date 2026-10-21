import type { FunctionInvokeOptions } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Error thrown by invokeFn. `status` is the HTTP status when known. */
export type EdgeFunctionError = Error & { status?: number; cause?: unknown };

type ResponseLike = { status?: number; json?: () => Promise<unknown> };

function pickMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const record = body as Record<string, unknown>;
  for (const key of ['error', 'message', 'msg']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * Call a Supabase Edge Function and return its parsed body.
 *
 * supabase.functions.invoke() resolves a non-2xx response as
 * { data: null, error: FunctionsHttpError }, so `data?.error` is always
 * undefined and callers showed "Edge Function returned a non-2xx status
 * code". The function's own `{ "error": "..." }` body ("Admins only",
 * "Invite limit reached (20 per hour)") is only reachable through the
 * Response — this helper reads it and throws an Error with that message.
 */
export async function invokeFn<T = unknown>(
  name: string,
  options?: FunctionInvokeOptions
): Promise<T> {
  const { data, error, response } = await supabase.functions.invoke<T>(name, options);

  if (!error) {
    // Defensive: a 2xx body that still reports an error.
    const body = data as unknown;
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const bodyError = (body as Record<string, unknown>).error;
      if (typeof bodyError === 'string' && bodyError) {
        throw Object.assign(new Error(bodyError), { status: response?.status }) as EdgeFunctionError;
      }
    }
    return data as T;
  }

  const res: ResponseLike | undefined =
    (response as ResponseLike | undefined) ?? (error as { context?: ResponseLike }).context;
  let message = '';
  if (res && typeof res.json === 'function') {
    try {
      message = pickMessage(await res.json());
    } catch {
      // Body was not JSON (gateway HTML, empty body) — fall back below.
    }
  }

  const fallback = (error as { message?: string }).message || `Request to ${name} failed`;
  throw Object.assign(new Error(message || fallback), {
    status: typeof res?.status === 'number' ? res.status : undefined,
    cause: error,
  }) as EdgeFunctionError;
}
