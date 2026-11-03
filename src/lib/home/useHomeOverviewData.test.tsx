import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

import { useCreativeExtremes, useTopCampaigns } from './useHomeOverviewData';

afterEach(() => cleanup());

// PP-DT-E-home-no-meta-account-error (deep test 2026-10-31, lane E): on a brand with no Meta ad
// account — Pink Elephant, Tangassi, any Google-only brand — the Home's Performance + and
// Creative + read "Couldn't load … right now · Retry". Nothing failed: there was nothing to rank.
// Ranking zero accounts is an empty answer, never an error.
describe('Home rankings on a brand with no Meta ad account', () => {
  it('ranks no campaign instead of failing', async () => {
    const { result } = renderHook(() => useTopCampaigns('brand-google-only', [], 'leads', 0));
    await waitFor(() => expect(result.current.status).not.toBe('loading'));
    expect(result.current).toEqual({ status: 'ready', data: [] });
  });

  it('finds no best or worst ad instead of failing', async () => {
    const { result } = renderHook(() => useCreativeExtremes('brand-google-only', [], 'leads', 0));
    await waitFor(() => expect(result.current.status).not.toBe('loading'));
    expect(result.current).toEqual({
      status: 'ready',
      data: { best: null, worst: null, images: {} },
    });
  });
});
