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
 * The message, the typed `errorCode` (`IntegrationErrorCode`) and the HTTP status an edge
 * function answered, when it did: a refused Google login answers TOKEN_EXPIRED so the page can
 * offer to reconnect, and a 404 from a Google read is "no access", whose cause the page tells
 * apart (PP-DT-B-google-error-states-conflated).
 */
export async function readEdgeError(
  error: unknown,
  fallback: string,
): Promise<{ message: string; code: string | null; status: number | null }> {
  if (!(error instanceof FunctionsHttpError)) {
    return {
      message: error instanceof Error && error.message ? error.message : fallback,
      code: null,
      status: null,
    };
  }

  const context = error.context as unknown;
  if (!context || typeof context !== 'object')
    return { message: error.message || fallback, code: null, status: null };

  const answered = Reflect.get(context, 'status');
  const status = typeof answered === 'number' ? answered : null;
  const json = Reflect.get(context, 'json');
  if (typeof json !== 'function') return { message: error.message || fallback, code: null, status };

  try {
    const body = await json.call(context);
    if (body && typeof body === 'object') {
      const message = Reflect.get(body, 'error');
      const code = Reflect.get(body, 'errorCode');
      if (typeof message === 'string' && message.trim())
        return { message, code: typeof code === 'string' ? code : null, status };
    }
  } catch {
    // Body already consumed or not JSON: fall through to the generic message.
  }

  return { message: error.message || fallback, code: null, status };
}

/** A failed edge read that keeps what the function answered — its words, its typed code and
 *  its HTTP status — so a page can name the cause (googleReadFailure reads the last two). */
export class EdgeReadError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'EdgeReadError';
  }
}

/** The edge's own answer to a failed `functions.invoke`, as an error to throw. */
export async function edgeReadError(error: unknown, fallback: string): Promise<EdgeReadError> {
  const { message, code, status } = await readEdgeError(error, fallback);
  return new EdgeReadError(message, code, status);
}
