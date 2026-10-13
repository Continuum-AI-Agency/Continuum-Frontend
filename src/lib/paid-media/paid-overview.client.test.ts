import { describe, expect, it, mock } from 'bun:test';

// The account_overview daily scope now labels its payload with the account's currency and
// timezone (edge commit dddfaaaa), null when the edge assumed USD/UTC. The client must keep
// both through its parse so the Home's money can prefer the payload's own code.
let edgePayload: unknown = null;

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: { invoke: async () => ({ data: edgePayload, error: null }) },
  }),
}));

const { fetchPaidAccountOverview } = await import('./paid-overview.client');

const metrics = { spend: 28780.16, roas: 0, ctr: 1.2 };
const request = {
  brandId: 'brand-1',
  adAccountId: 'act_1',
  platform: 'meta' as const,
  range: { since: '2026-10-05', until: '2026-10-11' },
};

describe('fetchPaidAccountOverview', () => {
  it("keeps the edge's currency and timezone labels", async () => {
    edgePayload = { currency: 'MXN', timezone: 'America/Mexico_City', metrics };
    const overview = await fetchPaidAccountOverview(request);
    expect(overview.currency).toBe('MXN');
    expect(overview.timezone).toBe('America/Mexico_City');
  });

  it('accepts null labels (the edge assumed USD/UTC) and a payload from before the labels', async () => {
    edgePayload = { currency: null, timezone: null, metrics };
    expect((await fetchPaidAccountOverview(request)).currency).toBeNull();
    edgePayload = { metrics };
    expect((await fetchPaidAccountOverview(request)).currency).toBeUndefined();
  });
});
