import { FunctionsHttpError } from '@supabase/supabase-js';

// supabase-js rejects any non-2xx edge response with FunctionsHttpError, whose
// `.message` is the constant string "Edge Function returned a non-2xx status
// code". The message the function actually wrote is in the response body, which
// is reachable only through `error.context`. Reading `.message` is how a precise
// server-side explanation turns into a useless generic one in the UI.
//
// campaign-performance-loader.ts does this for its own typed error envelope;
// this is the untyped version for edge functions that just return { error }.
export async function readEdgeErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (!(error instanceof FunctionsHttpError)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  const context = error.context as unknown;
  if (!context || typeof context !== 'object') return error.message || fallback;

  const json = Reflect.get(context, 'json');
  if (typeof json !== 'function') return error.message || fallback;

  try {
    const body = await json.call(context);
    if (body && typeof body === 'object') {
      const message = Reflect.get(body, 'error');
      if (typeof message === 'string' && message.trim()) return message;
    }
  } catch {
    // Body already consumed or not JSON: fall through to the generic message.
  }

  return error.message || fallback;
}
