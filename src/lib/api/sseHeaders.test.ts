import { beforeEach, describe, expect, it, mock } from 'bun:test';

// The AI Studio generation routes are brand-scoped and now reject an unauthenticated
// call. The canvas + image-stream hooks POST to them by hand (they stream SSE, so they
// cannot go through http.request), and before this helper existed neither attached a
// bearer — which would have 401'd every canvas generation in production, where the
// backend is a different origin and no Next proxy is in the path.
let token: string | null = null;

mock.module('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => token,
}));

const { authedSseHeaders } = await import('./sseHeaders');

beforeEach(() => {
  token = null;
});

describe('authedSseHeaders', () => {
  it('attaches the bearer so the brand-access guard admits the call', async () => {
    token = 'jwt-abc';
    expect(await authedSseHeaders()).toMatchObject({ Authorization: 'Bearer jwt-abc' });
  });

  it('still asks for an SSE stream of JSON', async () => {
    token = 'jwt-abc';
    expect(await authedSseHeaders()).toMatchObject({
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    });
  });

  it('omits Authorization entirely when there is no session, rather than sending "Bearer null"', async () => {
    token = null;
    expect(await authedSseHeaders()).not.toHaveProperty('Authorization');
  });

  it('lets a caller add headers without dropping the bearer', async () => {
    token = 'jwt-abc';
    const headers = await authedSseHeaders({ 'X-Trace': 't1' });
    expect(headers).toMatchObject({ Authorization: 'Bearer jwt-abc', 'X-Trace': 't1' });
  });
});
