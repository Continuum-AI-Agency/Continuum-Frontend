import { describe, expect, it } from 'bun:test';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import { isPlainSentence, loadFailureCause, loadFailureMessage } from './loadFailure';
import { RequestTimeoutError } from './timeout';

const HTML_502 = '<!DOCTYPE html><html><body><h1>502 Bad Gateway</h1></body></html>';

describe('loadFailureMessage', () => {
  it('names a timeout as the server not answering in time', () => {
    const error = new RequestTimeoutError(
      'https://x.supabase.co/functions/v1/optimizer-status',
      10_000,
    );
    expect(loadFailureMessage('portfolios', error)).toBe(
      "Couldn't load portfolios — the server didn't answer in time.",
    );
    expect(loadFailureCause(error)).toBe('timeout');
  });

  it('never prints the supabase-js library string for an edge 500', () => {
    const error = new FunctionsHttpError(new Response(HTML_502, { status: 500 }));
    expect(loadFailureMessage('campaigns', error)).toBe(
      "Couldn't load campaigns — the service answered with an error.",
    );
  });

  it('never prints a gateway HTML body carried in a PostgREST message', () => {
    const error = new Error(`Could not load this brand's scaffolds: ${HTML_502}`);
    const message = loadFailureMessage('proposals', error);
    expect(message).toBe("Couldn't load proposals.");
    expect(message).not.toContain('<');
  });

  it('keeps a server-written sentence when it reads as one', () => {
    const error = Object.assign(new Error('Meta is rate limiting this ad account'), {
      status: 429,
    });
    expect(loadFailureMessage('campaigns', error)).toBe(
      "Couldn't load campaigns — Meta is rate limiting this ad account.",
    );
  });

  it('names a dropped connection and an unexpected shape', () => {
    expect(
      loadFailureMessage('campaigns', new FunctionsFetchError(new TypeError('Failed to fetch'))),
    ).toBe("Couldn't load campaigns — no connection to the server.");
    expect(loadFailureMessage('campaigns', new TypeError('Load failed'))).toBe(
      "Couldn't load campaigns — no connection to the server.",
    );
    expect(loadFailureMessage('action logs', new ZodError([]))).toBe(
      "Couldn't load action logs — the data came back in an unexpected shape.",
    );
    expect(loadFailureMessage('action logs', new SyntaxError("Unexpected token '<'"))).toBe(
      "Couldn't load action logs — the data came back in an unexpected shape.",
    );
  });

  it('reads the cause when a client wrapped the library error in its own Error', () => {
    const wrapped = new Error('rule-actions edge function failed', {
      cause: new FunctionsHttpError(new Response(HTML_502, { status: 500 })),
    });
    expect(loadFailureMessage('the approvals queue', wrapped)).toBe(
      "Couldn't load the approvals queue — the service answered with an error.",
    );
    const timedOut = new Error('x', { cause: { context: new RequestTimeoutError('u', 10_000) } });
    expect(loadFailureCause(timedOut)).toBe('timeout');
  });

  it('reads a status off the error or its response context', () => {
    expect(loadFailureCause(Object.assign(new Error('x'), { status: 503 }))).toBe('server_error');
    expect(loadFailureCause(Object.assign(new Error('x'), { status: 403 }))).toBe('refused');
    expect(loadFailureCause({ message: 'x', context: { status: 500 } })).toBe('server_error');
  });
});

describe('isPlainSentence', () => {
  it('accepts a short sentence and refuses markup, JSON, stacks, library constants', () => {
    expect(isPlainSentence('Meta did not answer.')).toBe(true);
    expect(isPlainSentence(HTML_502)).toBe(false);
    expect(isPlainSentence('{"error":"x"}')).toBe(false);
    expect(isPlainSentence('TypeError: x at fn (file.ts:1:1)')).toBe(false);
    expect(isPlainSentence('Edge Function returned a non-2xx status code')).toBe(false);
    expect(isPlainSentence('PGRST301')).toBe(false);
    expect(isPlainSentence('')).toBe(false);
    expect(isPlainSentence('a'.repeat(201))).toBe(false);
    expect(isPlainSentence(42)).toBe(false);
  });
});
