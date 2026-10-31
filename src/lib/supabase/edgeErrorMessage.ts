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
  return (await readEdgeError(error, fallback)).message;
}

/**
 * The message AND the typed `errorCode` an edge function wrote (`IntegrationErrorCode`), when it
 * wrote one: a refused Google login answers TOKEN_EXPIRED so the page can offer to reconnect
 * instead of printing a dead end (PP-DT-B-google-error-states-conflated).
 */
export async function readEdgeError(
  error: unknown,
  fallback: string,
): Promise<{ message: string; code: string | null }> {
  if (!(error instanceof FunctionsHttpError)) {
    return {
      message: error instanceof Error && error.message ? error.message : fallback,
      code: null,
    };
  }

  const context = error.context as unknown;
  if (!context || typeof context !== 'object')
    return { message: error.message || fallback, code: null };

  const json = Reflect.get(context, 'json');
  if (typeof json !== 'function') return { message: error.message || fallback, code: null };

  try {
    const body = await json.call(context);
    if (body && typeof body === 'object') {
      const message = Reflect.get(body, 'error');
      const code = Reflect.get(body, 'errorCode');
      if (typeof message === 'string' && message.trim())
        return { message, code: typeof code === 'string' ? code : null };
    }
  } catch {
    // Body already consumed or not JSON: fall through to the generic message.
  }

  return { message: error.message || fallback, code: null };
}
