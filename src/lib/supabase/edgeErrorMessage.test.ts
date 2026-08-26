import { describe, expect, it } from 'bun:test';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { readEdgeErrorMessage } from './edgeErrorMessage';

const httpError = (body: unknown) =>
  new FunctionsHttpError({
    status: 409,
    json: async () => body,
  } as unknown as Response);

describe('readEdgeErrorMessage', () => {
  it('returns the message the edge function actually wrote', async () => {
    const error = httpError({ error: '3 media item(s) are not registered' });
    expect(await readEdgeErrorMessage(error, 'fallback')).toBe(
      '3 media item(s) are not registered',
    );
  });

  it('falls back when the body carries no error string', async () => {
    expect(await readEdgeErrorMessage(httpError({ ok: false }), 'fallback')).toBe(
      'Edge Function returned a non-2xx status code',
    );
  });

  it('falls back when the body is not JSON', async () => {
    const error = new FunctionsHttpError({
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);
    expect(await readEdgeErrorMessage(error, 'fallback')).toBe(
      'Edge Function returned a non-2xx status code',
    );
  });

  it('passes a plain Error through', async () => {
    expect(await readEdgeErrorMessage(new Error('network down'), 'fallback')).toBe('network down');
  });

  it('uses the fallback for a non-Error', async () => {
    expect(await readEdgeErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});
