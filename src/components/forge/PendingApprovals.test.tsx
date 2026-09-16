/**
 * PendingApprovals against a mocked approvals client: a Forge package's variations under one
 * header with its expiry (a batch with no package keeps its own card), who decided and where,
 * `approved` read as publishing and re-read until the plugin's outcome lands, `expired` and
 * `failed` with their reason, and a refused decision shown in the backend's words.
 */

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import type { RenderApproval, RenderApprovalDecisionResponse } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const BRAND = '22222222-2222-4222-8222-222222222222';
const PACKAGE = '99999999-9999-4999-8999-999999999991';
const EXPIRES = '2099-09-16T12:00:00.000Z';

const row = (id: string, fields: Partial<RenderApproval> = {}): RenderApproval => ({
  id,
  brandId: BRAND,
  picinst: 'Continuum_app',
  environmentKey: 'prod',
  taskUid: `task-${id.slice(-1)}`,
  batchId: `batch-${id.slice(-1)}`,
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
  packageId: null,
  expiresAt: null,
  decidedByDisplayName: null,
  decidedVia: null,
  ...fields,
});

const ID = '11111111-1111-4111-8111-111111111111';
const pending = row(ID);

let approvals: RenderApproval[] = [pending];
// What the list reads after the next one: the plugin's outcome landing between two reads.
let thenApprovals: RenderApproval[] | null = null;
const fetchRenderApprovals = mock(async (_brandId: string) => {
  const current = approvals;
  if (thenApprovals) {
    approvals = thenApprovals;
    thenApprovals = null;
  }
  return current;
});
const decideRenderApproval = mock(
  async (
    approvalId: string,
    decision: 'approve' | 'reject',
  ): Promise<RenderApprovalDecisionResponse> => {
    const decided = {
      ...approvals.find((item) => item.id === approvalId)!,
      status: decision === 'approve' ? ('approved' as const) : ('rejected' as const),
      decidedAt: '2026-09-15T00:01:00.000Z',
      decidedVia: 'forge' as const,
    };
    approvals = approvals.map((item) => (item.id === approvalId ? decided : item));
    return { approval: decided, deliveryStatus: null, deliveryReason: null };
  },
);

mock.module('@/lib/library/renderApprovals', () => ({
  fetchRenderApprovals,
  decideRenderApproval,
  fetchApprovalDestinations: async () => ({ destinations: [] }),
  fetchDestinationApprovers: async () => [],
  addDestinationApprover: async () => {
    throw new Error('not in this test');
  },
  activateDestinationApprover: async () => {
    throw new Error('not in this test');
  },
  revokeDestinationApprover: async () => {
    throw new Error('not in this test');
  },
}));

import { registerToastSink } from '@/components/ui/toast-imperative';
import { APPROVAL_RELAY_POLL_MS, approvalPollInterval, PendingApprovals } from './PendingApprovals';

// A sink per test, not a module mock: `mock.module` outlives this file in a multi-file run.
const toasts: string[] = [];
let unregisterToasts = () => {};
beforeEach(() => {
  approvals = [pending];
  thenApprovals = null;
  toasts.length = 0;
  unregisterToasts = registerToastSink(({ title }) => toasts.push(String(title)));
});
afterEach(() => {
  unregisterToasts();
  cleanup();
  fetchRenderApprovals.mockClear();
  decideRenderApproval.mockClear();
});

const renderApprovals = (
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) =>
  render(
    <QueryClientProvider client={client}>
      <PendingApprovals brandId={BRAND} />
    </QueryClientProvider>,
  );

const card = (text: string) => screen.getByText(text).closest('div.rounded-lg') as HTMLElement;

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
  expect(toasts).toContain('Rejected. Nothing was published.');
});

test('a package’s variations sit under one header with its expiry; a batch with no package stands alone', async () => {
  approvals = [
    row('11111111-1111-4111-8111-111111111112', { packageId: PACKAGE, expiresAt: EXPIRES }),
    pending,
    row('11111111-1111-4111-8111-111111111113', {
      packageId: PACKAGE,
      expiresAt: EXPIRES,
      status: 'rejected',
      decidedAt: '2026-09-15T00:05:00.000Z',
      decidedByDisplayName: 'Marta',
      decidedVia: 'whatsapp',
    }),
  ];
  renderApprovals();
  const pack = await screen.findByRole('region', { name: 'Approval package, 2 variations' });
  expect(within(pack).getByText('Package · 2 variations')).toBeTruthy();
  expect(within(pack).getByText('1 waiting')).toBeTruthy();
  expect(within(pack).getByText(/^Expires /)).toBeTruthy();
  expect(within(pack).getAllByText('Waiting on you')).toHaveLength(1);
  expect(within(pack).getAllByText('Rejected')).toHaveLength(1);
  expect(within(pack).getByText(/^Decided by Marta via WhatsApp · /)).toBeTruthy();

  // The package-less batch is still its own card, outside every package.
  expect(screen.getAllByText('Waiting on you')).toHaveLength(2);
  expect(screen.getAllByRole('region')).toHaveLength(1);
  expect(screen.getByText('Pending approvals (2)')).toBeTruthy();
});

test('approved reads as publishing; expired and failed say why; the decider and channel are named', async () => {
  approvals = [
    row('11111111-1111-4111-8111-111111111114', {
      status: 'approved',
      decidedAt: '2026-09-15T00:05:00.000Z',
      decidedByName: 'ana@vivo47.com',
      decidedVia: 'forge',
    }),
    row('11111111-1111-4111-8111-111111111115', {
      status: 'expired',
      decidedAt: '2026-09-16T12:00:00.000Z',
      decidedVia: 'system',
    }),
    row('11111111-1111-4111-8111-111111111116', {
      status: 'failed',
      decidedAt: '2026-09-15T00:06:00.000Z',
      decidedByDisplayName: 'Leo',
      decidedVia: 'slack',
      decisionReason: 'publish_interrupted_check_meta',
    }),
  ];
  renderApprovals();
  await screen.findByText('Publishing…');
  expect(card('Publishing…').textContent).toContain('Decided by ana@vivo47.com via Forge');
  expect(card('Expired').textContent).toContain('Nobody decided before the package expired.');
  expect(card('Publishing failed').textContent).toContain(
    'Publishing was interrupted. Check Ads Manager before sending it again.',
  );
  expect(card('Publishing failed').textContent).toContain('Decided by Leo via Slack');
  expect(screen.queryAllByRole('button', { name: /Approve/ })).toHaveLength(0);
});

test('an approve answers "publishing", and the list keeps re-reading until the outcome lands', async () => {
  const packaged = row('11111111-1111-4111-8111-111111111117', {
    packageId: PACKAGE,
    expiresAt: EXPIRES,
  });
  approvals = [packaged];
  renderApprovals();
  fireEvent.click(await screen.findByRole('button', { name: 'Approve and publish paused' }));
  await screen.findByText('Publishing…');
  expect(decideRenderApproval).toHaveBeenCalledWith(packaged.id, 'approve');
  expect(toasts).toContain('Approved. Publishing now — the outcome appears here in a moment.');

  // The read right after the decision still says approved; the plugin's outcome lands on the next.
  thenApprovals = [
    {
      ...packaged,
      status: 'previewed',
      decidedAt: '2026-09-15T00:01:00.000Z',
      decidedVia: 'forge',
    },
  ];
  await waitFor(
    () => expect(screen.queryAllByText('Approved — Meta writes are off')).toHaveLength(1),
    {
      timeout: APPROVAL_RELAY_POLL_MS * 3,
    },
  );
  expect(screen.queryAllByText('Publishing…')).toHaveLength(0);
  expect(fetchRenderApprovals.mock.calls.length).toBeGreaterThanOrEqual(3);
}, 20_000);

test('a refused decision shows the backend’s reason and leaves the buttons in place', async () => {
  decideRenderApproval.mockImplementationOnce(async () => {
    throw new Error('Only an active approver in one of this package’s rooms can decide it.');
  });
  renderApprovals();
  fireEvent.click(await screen.findByRole('button', { name: 'Approve and publish paused' }));
  await waitFor(() => expect(toasts).toHaveLength(1));
  expect(toasts).toEqual(['Only an active approver in one of this package’s rooms can decide it.']);
  expect(screen.getAllByRole('button', { name: 'Approve and publish paused' })).toHaveLength(1);
});

test('polls fast only while a decision is still being relayed', () => {
  expect(approvalPollInterval(undefined)).toBe(30_000);
  expect(approvalPollInterval([pending, row(ID, { status: 'previewed' })])).toBe(30_000);
  expect(approvalPollInterval([pending, row(ID, { status: 'approved' })])).toBe(
    APPROVAL_RELAY_POLL_MS,
  );
});
