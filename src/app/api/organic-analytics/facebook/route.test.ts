import { beforeEach, describe, expect, it, mock } from 'bun:test';

// PP-L1-organic-analytics-facebook-500-from-home: reached from Performance+, the Home asked for a
// Facebook account that belongs to the brand the person had just left. The edge answered what it
// is — 404 INTEGRATION_NOT_LINKED — and the route re-labelled it a server failure. A request the
// edge refuses by name is the CALLER's: its status and its code go back as they came.
const state: { edgeData: unknown; edgeError: unknown } = { edgeData: null, edgeError: null };

/** The shape supabase-js gives a non-2xx edge answer: a FunctionsHttpError carrying the Response. */
function edgeHttpError(status: number, body: unknown) {
  return Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    name: 'FunctionsHttpError',
    context: new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  });
}

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'test-token' } }, error: null }),
    },
    functions: {
      invoke: async () => ({ data: state.edgeData, error: state.edgeError }),
    },
  }),
}));

const { POST } = await import('./route');

const request = () =>
  new Request('http://localhost/api/organic-analytics/facebook', {
    method: 'POST',
    body: JSON.stringify({
      brandId: '148583e0-5538-462b-8d3a-acd25b80344e',
      integrationAccountId: 'bcf74b3a-379f-44b2-8c32-56c0d429c600',
      range: { preset: 'last_30d' },
    }),
  });

describe('POST /api/organic-analytics/facebook', () => {
  beforeEach(() => {
    state.edgeData = null;
    state.edgeError = null;
  });

  it('answers an account not linked to the brand with the edge 404 and its code, never a 5xx', async () => {
    state.edgeError = edgeHttpError(404, {
      error: 'Integration account is not linked to this brand',
      errorCode: 'INTEGRATION_NOT_LINKED',
      platform: 'meta',
    });
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ errorCode: 'INTEGRATION_NOT_LINKED' });
  });

  it('passes the edge 401 and 400 through as the caller errors they are', async () => {
    state.edgeError = edgeHttpError(401, { error: 'Unauthorized' });
    expect((await POST(request())).status).toBe(401);
    state.edgeError = edgeHttpError(400, { error: 'Invalid platform' });
    expect((await POST(request())).status).toBe(400);
  });

  it('keeps a provider failure the edge names as a 502 with its code', async () => {
    state.edgeError = edgeHttpError(502, {
      error: 'Meta token expired',
      errorCode: 'TOKEN_EXPIRED',
      platform: 'meta',
    });
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ errorCode: 'TOKEN_EXPIRED' });
  });
});
