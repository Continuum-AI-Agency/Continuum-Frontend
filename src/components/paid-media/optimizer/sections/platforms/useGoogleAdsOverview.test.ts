import { describe, expect, it, mock } from 'bun:test';
import recorded from './__fixtures__/google-vivo47-paid-media-metrics.json';

// The edge is the boundary under test: what the page sends to paid-media-metrics and what it
// does with the answer. The client is replaced; the parsing and the fold are the real ones.
type Invoke = (
  name: string,
  options: { body: Record<string, unknown> },
) => Promise<{ data: unknown; error: unknown }>;
let invoke: Invoke = async () => ({ data: null, error: null });
const calls: { name: string; body: Record<string, unknown> }[] = [];
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: {
      invoke: (name: string, options: { body: Record<string, unknown> }) => {
        calls.push({ name, body: options.body });
        return invoke(name, options);
      },
    },
  }),
}));

const { fetchGoogleAdsOverview } = await import('./useGoogleAdsOverview');

const WINDOW = { since: '2026-09-30', until: '2026-10-06' };

describe('fetchGoogleAdsOverview', () => {
  it('reads google-ads account_overview and top_campaigns for the granted customer', async () => {
    calls.length = 0;
    invoke = async (_name, { body }) => ({
      data: body.scope === 'account_overview' ? recorded.account_overview : recorded.top_campaigns,
      error: null,
    });
    const overview = await fetchGoogleAdsOverview('brand-1', '3710693645', {
      since: '2026-09-30',
      until: '2026-10-06',
    });
    expect(calls.map((call) => [call.name, call.body.platform, call.body.scope])).toEqual([
      ['paid-media-metrics', 'google-ads', 'account_overview'],
      ['paid-media-metrics', 'google-ads', 'top_campaigns'],
    ]);
    expect(calls[0]?.body).toMatchObject({ brandId: 'brand-1', accountId: '3710693645' });
    expect(calls[1]?.body).toMatchObject({ kpi: 'spend', limit: 50 });
    // The window the producer reads — 7 complete days ending yesterday — not the edge's
    // `last_7d`, which runs to today and covers 8 days.
    for (const call of calls) {
      expect(call.body.range).toEqual({
        preset: 'custom',
        since: '2026-09-30',
        until: '2026-10-06',
      });
    }
    // Major units straight from the handler: 55,205.26 MXN, not 552.05.
    expect(overview.spend).toBe(55205.2636);
    expect(overview.groups.map((group) => group.label)).toEqual(['Search', 'Display']);
  });

  it("surfaces the edge's own error message, not a generic one", async () => {
    invoke = async () => ({
      data: null,
      error: new Error('Google Ads account not configured or access token missing'),
    });
    await expect(fetchGoogleAdsOverview('brand-1', '3710693645', WINDOW)).rejects.toThrow(
      'Google Ads account not configured or access token missing',
    );
  });

  it('refuses a payload it does not know rather than print zeros', async () => {
    invoke = async () => ({ data: { rows: 'nope' }, error: null });
    await expect(fetchGoogleAdsOverview('brand-1', '3710693645', WINDOW)).rejects.toThrow(
      'shape this page does not know',
    );
  });
});
