// PP-DT-C-unpaid-brand-polls-402-on-every-page: the in-flight ticker's generations read is mounted
// in the app header, so on a brand without Organic Plus every page asked the organic agent for its
// generations and got 402 (×3–4 per landing with the retry), each a console error and a billing
// toast. The shell already knows which products the brand lacks; the read does not run for them.

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const requestMock = mock(() =>
  Promise.resolve({
    summaries: [],
    window: { windowMinutes: 60, made: 0, completed: 0, failed: 0, running: 0 },
  }),
);
const realHttp = await import('@/lib/api/http');
mock.module('@/lib/api/http', () => ({
  ...realHttp,
  http: { request: requestMock },
  request: requestMock,
}));

const { useGenerationSummaries } = await import('./generationSummaries');
const { LockedProductsProvider } = await import('@/lib/billing/lockedProducts');

function Ticker() {
  useGenerationSummaries('brand-1');
  return null;
}

const wrap = (ui: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {ui}
  </QueryClientProvider>
);

beforeEach(() => requestMock.mockClear());
afterEach(cleanup);

describe('useGenerationSummaries on a brand without the organic product', () => {
  it('does not ask the organic agent at all', async () => {
    render(
      wrap(
        <LockedProductsProvider products={['organic_agent']}>
          <Ticker />
        </LockedProductsProvider>,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('still reads the generations for a brand that has it', async () => {
    render(
      wrap(
        <LockedProductsProvider products={['paid_media']}>
          <Ticker />
        </LockedProductsProvider>,
      ),
    );
    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
  });
});
