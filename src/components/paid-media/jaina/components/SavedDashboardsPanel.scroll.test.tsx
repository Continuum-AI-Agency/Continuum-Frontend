import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

// An opened dashboard is a REPORT — five modules of charts and tables — and this panel lands
// inside hosts that bound their own height (the Dashboard tab is a flex column with
// overflow-hidden). With no scroll of its own the list grew past the host, the host clipped
// it, and the only way back to the rest of the page was to close the panel.
mock.module('@/lib/jaina/brandScope', () => ({
  useJainaBrandScope: () => ({ brandId: 'b1', adAccountId: 'act_1' }),
  JainaBrandScopeProvider: ({ children }: { children: unknown }) => children,
}));
const dashboard = (id: string, name: string) => ({
  id,
  brand_id: '00000000-0000-0000-0000-000000000001',
  ad_account_id: 'act_1',
  name,
  source_title: null,
  source_prompt: null,
  scope: 'account',
  window_label: null,
  blocks: [],
  created_by: null,
  created_at: '2026-09-18T00:00:00Z',
  updated_at: '2026-09-18T00:00:00Z',
});

const realClient = await import('@/lib/jaina/dashboards.client');
mock.module('@/lib/jaina/dashboards.client', () => ({
  ...realClient,
  listDashboards: async () => [
    dashboard('11111111-1111-1111-1111-111111111111', 'Creative Verdicts (D30)'),
    dashboard('22222222-2222-2222-2222-222222222222', 'Key Metrics'),
  ],
  deleteDashboard: async () => {},
}));

const { SavedDashboardsPanel } = await import('./SavedDashboardsPanel');

afterEach(cleanup);

describe('the saved dashboards panel', () => {
  it('bounds its own height and scrolls, rather than relying on its host', async () => {
    render(<SavedDashboardsPanel />);
    const toggle = await screen.findByRole('button', { name: /saved dashboards/i });
    toggle.click();

    await waitFor(() => {
      const list = document.querySelector('[data-testid="saved-dashboards"] ul');
      expect(list).toBeTruthy();
      const cls = list?.className ?? '';
      // Both halves matter: a max height with no overflow clips, and an overflow with no
      // max height never engages inside a flex parent.
      expect(cls).toContain('overflow-y-auto');
      expect(cls).toMatch(/max-h-/);
    });
  });

  it('keeps the scroll inside itself, so reaching its end does not scroll the page', async () => {
    render(<SavedDashboardsPanel />);
    (await screen.findByRole('button', { name: /saved dashboards/i })).click();
    await waitFor(() => {
      const list = document.querySelector('[data-testid="saved-dashboards"] ul');
      expect(list?.className ?? '').toContain('overscroll-contain');
    });
  });
});
