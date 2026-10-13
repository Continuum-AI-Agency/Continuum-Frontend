import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, waitFor } from '@testing-library/react';

import { completeDaysEndingYesterday } from '@/lib/paid-media/reportingWindow';

// PP-L3-last-7d-asks-eight-days-including-today: the Home strip said "last 7 days" and asked
// the edge with the preset, which the edge resolves as eight days including today. The strip
// asks for the seven complete days ending yesterday, as an explicit range.
const fetchPaidAccountOverview = mock(async () => ({ metrics: { spend: 1, roas: 1, ctr: 1 } }));
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
});
