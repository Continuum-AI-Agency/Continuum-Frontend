import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import type { RenderApproval } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const BRAND = '22222222-2222-4222-8222-222222222222';
const ID = '11111111-1111-4111-8111-111111111111';
const pending: RenderApproval = {
  id: ID,
  brandId: BRAND,
  picinst: 'Continuum_app',
  environmentKey: 'prod',
  taskUid: 'task-1',
  batchId: 'batch-1',
  groupKey: null,
  action: 'create',
  campaignId: null,
  adsetId: 'adset-1',
  adId: null,
  files: [
    { url: 'https://example.com/render.png', adCopy: null, adStatus: null, landingUrl: null },
  ],
  status: 'pending',
  decidedBy: null,
  decidedByName: null,
  decidedAt: null,
  decisionReason: null,
  deliveryReceipts: [],
  createdAt: '2026-09-15T00:00:00.000Z',
  updatedAt: '2026-09-15T00:00:00.000Z',
};

let approval = pending;
const fetchRenderApprovals = mock(async () => [approval]);
const decideRenderApproval = mock(async () => {
  approval = {
    ...approval,
    status: 'rejected' as const,
    decidedAt: '2026-09-15T00:01:00.000Z',
  };
  return { approval, deliveryStatus: null, deliveryReason: null };
});

mock.module('@/lib/library/renderApprovals', () => ({
  fetchRenderApprovals,
  decideRenderApproval,
}));
mock.module('@/components/ui/toast-imperative', () => ({
  toast: { success: () => undefined, error: () => undefined },
}));

import { PendingApprovals } from './PendingApprovals';

beforeEach(() => {
  approval = pending;
  fetchRenderApprovals.mockClear();
  decideRenderApproval.mockClear();
});
afterEach(cleanup);

const renderApprovals = (client: QueryClient) =>
  render(
    <QueryClientProvider client={client}>
      <PendingApprovals brandId={BRAND} />
    </QueryClientProvider>,
  );

test('reuses a fresh approval list and invalidates it after a decision', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const first = renderApprovals(client);
  await screen.findByText('Waiting on you');
  first.unmount();

  renderApprovals(client);
  await screen.findByText('Waiting on you');
  expect(fetchRenderApprovals).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  await screen.findByText('Rejected');
  await waitFor(() => expect(fetchRenderApprovals).toHaveBeenCalledTimes(2));
});
