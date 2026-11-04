import { describe, expect, it } from 'bun:test';
import { homeReadMissing, homeReadReady } from '@continuum/contracts';
import { ApiError, markFetchFailure } from '@/lib/api/errors';
import { RequestTimeoutError } from '@/lib/api/timeout';
import { homeReadLoadOf, homeReadNotHereYet, readyDataOf } from './homeRead';

const BRAND = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';

describe('homeReadLoadOf', () => {
  it('carries a ready answer as it came', () => {
    const load = homeReadLoadOf(homeReadReady(BRAND, { n: 1 }));
    expect(load.status).toBe('ready');
    expect(readyDataOf(load)).toEqual({ n: 1 });
  });

  it('keeps the read’s reason when the source holds nothing', () => {
    const load = homeReadLoadOf(homeReadMissing(BRAND, 'no_data', 'Nothing yet.'));
    expect(load).toEqual({
      status: 'missing',
      missing: { reason: 'no_data', detail: 'Nothing yet.' },
    });
    expect(readyDataOf(load)).toBeNull();
  });

  it('a read whose own migration is not deployed is as absent as a route that is not', () => {
    expect(homeReadLoadOf(homeReadMissing(BRAND, 'not_deployed', 'No RPC.'))).toEqual({
      status: 'unavailable',
    });
  });
});

describe('homeReadNotHereYet', () => {
  it('names the answers that only mean the Backend has not shipped or cannot be reached', () => {
    expect(homeReadNotHereYet(new ApiError('Not Found', 404))).toBe(true);
    expect(homeReadNotHereYet(markFetchFailure(new TypeError('fetch failed')))).toBe(true);
    expect(homeReadNotHereYet(new RequestTimeoutError('GET /x', 8000))).toBe(true);
  });

  it('a Backend that answered and failed is something else', () => {
    expect(homeReadNotHereYet(new ApiError('Bad Gateway', 502))).toBe(false);
    expect(homeReadNotHereYet(new Error('schema'))).toBe(false);
  });
});
