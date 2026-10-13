// What a failed read says on screen. The cause goes to the log; the screen gets a sentence.
//
// A 500 from paid-media-reporting printed "Edge Function returned a non-2xx status code" on
// Campaigns, and a 500 on paid_scaffolds printed the raw HTML body on the Campaign Canvas
// (PP-L1-edge-error-string-reaches-screen-campaigns-canvas). supabase-js, PostgREST and a raw
// `fetch` each spell their failures their own way, and none of those spellings is for a person.
// `loadFailureMessage` maps every transport failure to "Couldn't load <thing> — <why>", keeping
// a server-written sentence only when it reads as one.

import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { ZodError } from 'zod';
import { isRequestTimeout } from './timeout';

export type LoadFailureCause =
  | 'timeout'
  | 'offline'
  | 'server_error'
  | 'unexpected_shape'
  | 'refused'
  | 'unknown';

const LIBRARY_STRINGS = [
  /Edge Function returned a non-2xx status code/i,
  /Failed to send a request to the Edge Function/i,
  /Relay Error invoking the Edge Function/i,
  /Failed to fetch/i,
  /Load failed/i,
  /NetworkError/i,
];

/** True when `text` reads as a sentence a server wrote for a person: short, no markup, no JSON,
 *  no stack, no library constant. */
export function isPlainSentence(text: unknown): text is string {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return false;
  if (/[<>{}[\]]/.test(trimmed)) return false;
  if (/\bat \S+ \(|PGRST\d{3}|^\s*\w*Error:/.test(trimmed)) return false;
  if (!/[A-Za-z]{3}/.test(trimmed)) return false;
  return !LIBRARY_STRINGS.some((pattern) => pattern.test(trimmed));
}

const statusOf = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  const direct = Reflect.get(error, 'status');
  if (typeof direct === 'number') return direct;
  const context = Reflect.get(error, 'context');
  const nested = context && typeof context === 'object' ? Reflect.get(context, 'status') : null;
  return typeof nested === 'number' ? nested : null;
};

/** Which kind of failure this is, read from the error's class and status, never its words. */
export function loadFailureCause(error: unknown): LoadFailureCause {
  if (isRequestTimeout(error)) return 'timeout';
  if (error instanceof FunctionsFetchError) return 'offline';
  if (error instanceof ZodError) return 'unexpected_shape';
  if (error instanceof FunctionsRelayError) return 'server_error';
  const status = statusOf(error);
  if (status !== null) {
    if (status >= 500) return 'server_error';
    if (status === 401 || status === 403 || status === 402 || status === 429) return 'refused';
  }
  if (error instanceof FunctionsHttpError) return 'server_error';
  if (error instanceof TypeError) return 'offline';
  if (error instanceof Error && /PGRST|JSON|Unexpected token/i.test(error.message)) {
    return 'unexpected_shape';
  }
  return 'unknown';
}

const WHY: Record<Exclude<LoadFailureCause, 'unknown'>, string> = {
  timeout: "the server didn't answer in time.",
  offline: 'no connection to the server.',
  server_error: 'the service answered with an error.',
  unexpected_shape: 'the data came back in an unexpected shape.',
  refused: 'the request was refused.',
};

const ownMessage = (error: unknown): string | null => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  // PostgREST and supabase-js errors are plain objects with a `message`.
  if (error && typeof error === 'object') {
    const message = Reflect.get(error, 'message');
    return typeof message === 'string' ? message : null;
  }
  return null;
};

/**
 * The "why" alone, as a lowercase clause ending in a period: "the server didn't answer in
 * time." A server-written sentence stands in for the generic clause only when it reads as one
 * (`isPlainSentence`); null when nothing can be said beyond "it failed".
 */
export function loadFailureWhy(error: unknown): string | null {
  const cause = loadFailureCause(error);
  const own = ownMessage(error);
  if (cause !== 'timeout' && cause !== 'offline' && isPlainSentence(own)) {
    const sentence = own.trim().replace(/[.]+$/, '');
    return `${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}.`;
  }
  return cause === 'unknown' ? null : WHY[cause];
}

/**
 * "Couldn't load campaigns — the server didn't answer in time." `noun` is the thing the
 * surface was reading, in the words its heading uses.
 */
export function loadFailureMessage(noun: string, error: unknown): string {
  const why = loadFailureWhy(error);
  return why ? `Couldn't load ${noun} — ${why}` : `Couldn't load ${noun}.`;
}
