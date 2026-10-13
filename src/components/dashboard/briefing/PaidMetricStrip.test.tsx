import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, waitFor } from '@testing-library/react';

import { completeDaysEndingYesterday } from '@/lib/paid-media/reportingWindow';

// PP-L3-last-7d-asks-eight-days-including-today: the Home strip said "last 7 days" and asked
// the edge with the preset, which the edge resolves as eight days including today. The strip
// asks for the seven complete days ending yesterday, as an explicit range.
const fetchPaidAccountOverview = mock(async () => ({
  metrics: { spend: 28780.16, roas: 1, ctr: 1.83 },
  currency: null as string | null,
}));
mock.module('@/lib/paid-media/paid-overview.client', () => ({ fetchPaidAccountOverview }));

const { PaidMetricStrip } = await import('./PaidMetricStrip');

afterEach(() => {
  cleanup();
  fetchPaidAccountOverview.mockClear();
});

describe('PaidMetricStrip', () => {
  it('asks for the seven complete days ending yesterday, never the last_7d preset', async () => {
    render(<PaidMetricStrip adAccountId="act_1" brandId="brand-1" />);
    await waitFor(() => expect(fetchPaidAccountOverview).toHaveBeenCalledTimes(1));

    const [call] = fetchPaidAccountOverview.mock.calls as unknown as [
      { range: { preset: string; since?: string; until?: string } },
    ][];
    expect(call[0].range).toEqual({ preset: 'custom', ...completeDaysEndingYesterday(7) });
  });

  // PP-L3-home-paid-prints-dollar-signs-no-currency / PP-L3-dashboard-and-home-have-no-data-
  // figure-nodes: the spend prints the account's code (the payload carried none here, so the
  // account record's MXN) and stamps raw, currency and window on the node that shows it.
  it('prints spend in the account currency and stamps the figure it shows', async () => {
    const { findByText, container } = render(
      <PaidMetricStrip accountCurrency="MXN" adAccountId="act_1" brandId="brand-1" />,
    );
    await findByText('$28,780 MXN');
    expect(container.textContent).not.toContain('USD');
    const node = container.querySelector('[data-figure="home.strip.spend"]');
    expect(node?.textContent).toBe('$28,780 MXN');
    expect(node?.getAttribute('data-figure-raw')).toBe('28780.16');
    expect(node?.getAttribute('data-figure-currency')).toBe('MXN');
    expect(node?.getAttribute('data-figure-window')).toBe('d7');
    expect(node?.getAttribute('data-figure-unit')).toBe('currency');
  });

  it('prefers the currency the payload itself declares', async () => {
    fetchPaidAccountOverview.mockResolvedValueOnce({
      metrics: { spend: 120, roas: 1, ctr: 1 },
      currency: 'USD',
    });
    const { findByText } = render(
      <PaidMetricStrip accountCurrency="MXN" adAccountId="act_1" brandId="brand-1" />,
    );
    await findByText('$120 USD');
  });
});
