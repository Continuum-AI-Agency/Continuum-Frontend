// The operator page against a faked watchman_manage: a non-admin sees why, an admin's approve
// sends the decision for that proposal, and the timeline shows each wake's calls and cost.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { ApiError } from '@/lib/api/errors';

const BRAND = '0f3a3d1e-6b7e-4f52-9e0a-2c9a1d5b7f11';
const WATCHMAN = {
  id: 'wm-1',
  name: 'Scout',
  kind: 'organic',
  status: 'active',
  timezone: 'America/Mexico_City',
  autonomy: { publish: 'approve' },
  budget: { month_spend_usd: 0.42, budget_usd: 25, state: 'ok' },
  held_reports: 0,
  active_tasks: 0,
  failures_24h: 0,
  unacked_inbox: {},
};
const PROPOSAL = {
  id: 'p-1',
  kind: 'publish',
  tool: 'content_create',
  input: { action: 'approve', draftId: 'd-1' },
  summary: 'Schedule Friday’s reel',
  status: 'pending',
  note: null,
  decided_at: null,
  executed_at: null,
  outcome: null,
  created_at: '2026-11-16T10:00:00Z',
  expires_at: '2026-11-23T10:00:00Z',
};
const WAKE = {
  id: 'w-1',
  reason: 'heartbeat',
  status: 'completed',
  attempt: 1,
  cost_usd: 0.0044,
  note_to_self: null,
  error: null,
  escalation_reason: null,
  wall_ms: 7400,
  created_at: '2026-11-16T09:00:00Z',
  started_at: '2026-11-16T09:00:01Z',
  completed_at: '2026-11-16T09:00:08Z',
  tool_calls: [
    { tool: 'analytics_query', status: 'ok', duration_ms: 812, error_code: null, at: 'a' },
  ],
};

let admin = true;
const sent: Array<Record<string, unknown>> = [];
const manageWatchman = mock(async (_brand: string, input: Record<string, unknown>) => {
  if (!admin) throw new ApiError('needs_role', 403, 'needs_role');
  sent.push(input);
  const results: Record<string, unknown> = {
    status: { watchmen: [WATCHMAN] },
    proposal_list: { proposals: [PROPOSAL] },
    report_list: { reports: [] },
    task_list: { tasks: [] },
    wake_list: { wakes: [WAKE] },
  };
  return results[String(input.action)] ?? {};
});
const read = (action: string) => (brandId: string, watchmanId?: string) =>
  manageWatchman(brandId, { action, watchman_id: watchmanId });
mock.module('@/lib/watchman/api', () => ({
  manageWatchman,
  watchmanReads: {
    status: read('status'),
    proposals: read('proposal_list'),
    reports: read('report_list'),
    tasks: read('task_list'),
    wakes: read('wake_list'),
  },
  watchmanQueryKeys: {
    all: (b: string) => ['watchman', b],
    part: (b: string, p: string, w?: string) => ['watchman', b, p, w ?? null],
  },
}));

const { WatchmanOperator } = await import('./WatchmanOperator');

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WatchmanOperator brandId={BRAND} />
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  sent.length = 0;
  admin = true;
});

describe('WatchmanOperator', () => {
  it('tells a non-admin the page is for brand admins', async () => {
    admin = false;
    mount();
    await screen.findByText('Brand admins only');
  });

  it("approves a proposal by its id, and shows each wake's calls and cost", async () => {
    mount();
    await screen.findByText('Schedule Friday’s reel');
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(sent).toContainEqual(
        expect.objectContaining({
          action: 'proposal_decide',
          proposal_id: 'p-1',
          decision: 'approve',
          watchman_id: 'wm-1',
        }),
      ),
    );
    const wake = await screen.findByRole('button', { name: /heartbeat/ });
    expect(wake.textContent).toContain('1 call');
    expect(wake.textContent).toContain('$0.0044');
    fireEvent.click(wake);
    await screen.findByText(/analytics_query/);
  });
});
