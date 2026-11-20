import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { fetchBrandInsights } from '../../src/lib/api/brandInsights.server.ts';
import { BRAND_TRENDS_SCHEMA } from '../../src/lib/schemas/brandInsights.ts';

function createInsightsResponse() {
  return new Response(
    JSON.stringify({
      status: 'success',
      data: {
        status: 'success',
        brand_id: 'brand-123',
        generation_id: 'gen-1',
        anchor_ts: '2026-02-23T00:00:00.000Z',
        windows_days: [7, 30],
        windows: [
          {
            days: 7,
            window_start: '2026-02-16T00:00:00.000Z',
            window_end: '2026-02-23T00:00:00.000Z',
            counts: {
              trends: 0,
              events: 0,
              questions: 0,
              generations: 1,
            },
            trends: [],
            events: [],
            questions: [],
            generations: [{ generation_id: 'gen-1' }],
          },
        ],
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

test('fetchBrandInsights includes brand_trends schema header', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedMethod = '';
  let capturedBody: Record<string, unknown> | null = null;
  let capturedHeaders = new Headers();

  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedMethod = String(init?.method ?? 'GET');
    capturedBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    capturedHeaders = new Headers(init?.headers as HeadersInit | undefined);
    return createInsightsResponse();
  }) as typeof fetch;

  try {
    const result = await fetchBrandInsights('brand-123');
    assert.ok(result);
    assert.equal(result.status, 'success');
    assert.equal(result.data.generationId, 'gen-1');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(capturedUrl, /\/api\/trends\/read$/);
  assert.equal(capturedMethod, 'POST');
  assert.equal(capturedBody?.brand_id, 'brand-123');
  assert.equal(capturedHeaders.get('x-supabase-schema'), BRAND_TRENDS_SCHEMA);
});

function respondWith(status: number, body: unknown) {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
}

test('fetchBrandInsights resolves null for a brand with no completed generation', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = respondWith(200, {
    status: 'success',
    data: {
      status: 'success',
      brand_id: 'brand-new',
      generation_id: null,
      anchor_ts: '2026-11-13T10:00:00.000Z',
      windows_days: [],
      windows: [],
      generation: null,
      generation_insights: null,
      week: null,
      weeks: [],
    },
  });
  try {
    assert.equal(await fetchBrandInsights('brand-new'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBrandInsights rejects with the Backend reason on a real failure', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = respondWith(409, { status: 'error', message: 'generation_not_servable' });
  try {
    await assert.rejects(fetchBrandInsights('brand-123'), /generation_not_servable/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
