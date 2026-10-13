import { afterEach, describe, expect, it, mock } from 'bun:test';
import { type CacheEntry, remember } from './paid-media-cache';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('remember (prefetch cache entries own their failure)', () => {
  const warn = console.warn;
  afterEach(() => {
    console.warn = warn;
  });

  it('drops the entry and logs the cause when the prefetch rejects, with no unhandled rejection', async () => {
    const logged = mock(() => {});
    console.warn = logged as typeof console.warn;
    const cache = new Map<string, CacheEntry>();
    const failure = new Error('Edge Function returned a non-2xx status code');
    remember(cache, 'brand:acct:campaigns', Promise.reject(failure));
    expect(cache.has('brand:acct:campaigns')).toBe(true);
    await flush();
    expect(cache.has('brand:acct:campaigns')).toBe(false);
    expect(logged).toHaveBeenCalledTimes(1);
    const [, detail] = logged.mock.calls[0] as unknown as [string, { key: string; cause: unknown }];
    expect(detail.key).toBe('brand:acct:campaigns');
    expect(detail.cause).toBe(failure);
  });

  it('keeps a fulfilled entry', async () => {
    const cache = new Map<string, CacheEntry>();
    remember(cache, 'k', Promise.resolve([]));
    await flush();
    expect(cache.has('k')).toBe(true);
  });

  it('never drops a newer entry written under the same key', async () => {
    console.warn = () => {};
    const cache = new Map<string, CacheEntry>();
    let reject: (cause: unknown) => void = () => {};
    remember(cache, 'k', new Promise((_, r) => (reject = r)));
    const fresh = Promise.resolve([]);
    remember(cache, 'k', fresh);
    reject(new Error('late failure of the old prefetch'));
    await flush();
    expect(cache.get('k')?.promise).toBe(fresh);
  });
});
