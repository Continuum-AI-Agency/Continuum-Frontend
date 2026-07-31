import { afterEach, describe, expect, it } from 'bun:test';

import {
  fetchOrganicAnalytics,
  ORGANIC_ANALYTICS_TIMEOUT_MS,
  type OrganicAnalyticsRequest,
} from './organicAnalytics.client';

const request: OrganicAnalyticsRequest = {
  brandId: 'brand-1',
  integrationAccountId: 'acct-1',
  platform: 'instagram',
  range: { preset: 'last_7d' },
  scope: 'posts',
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function respondWith(body: unknown, init?: { status?: number }) {
  const calls: Array<{ url: string; signal: AbortSignal | null | undefined }> = [];
  globalThis.fetch = ((input: RequestInfo | URL, requestInit?: RequestInit) => {
    calls.push({
      url: String(input),
      signal: requestInit?.signal,
    });
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as typeof globalThis.fetch;
  return calls;
}

describe('fetchOrganicAnalytics abort wiring', () => {
  it('always attaches a signal so the request can be cut off', async () => {
    const calls = respondWith({ error: 'nope' }, { status: 500 });
    await expect(fetchOrganicAnalytics(request)).rejects.toThrow('nope');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects immediately when the caller aborts before the request starts', async () => {
    respondWith({ error: 'unused' }, { status: 500 });
    const controller = new AbortController();
    controller.abort();

    await expect(fetchOrganicAnalytics(request, { signal: controller.signal })).rejects.toThrow(
      /cancel/i,
    );
  });

  it('surfaces a timeout as a readable error rather than hanging forever', async () => {
    globalThis.fetch = ((_input: RequestInfo | URL, requestInit?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        requestInit?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    }) as typeof globalThis.fetch;

    await expect(fetchOrganicAnalytics(request, { timeoutMs: 5 })).rejects.toThrow(/timed out/i);
  });

  it('cancels the in-flight request when the caller aborts mid-flight', async () => {
    globalThis.fetch = ((_input: RequestInfo | URL, requestInit?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        requestInit?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    }) as typeof globalThis.fetch;

    const controller = new AbortController();
    const pending = fetchOrganicAnalytics(request, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toThrow(/cancel/i);
  });

  it('exposes a finite default timeout — the offset windows are the heaviest call', () => {
    expect(Number.isFinite(ORGANIC_ANALYTICS_TIMEOUT_MS)).toBe(true);
    expect(ORGANIC_ANALYTICS_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
