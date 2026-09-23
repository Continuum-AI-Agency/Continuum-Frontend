/**
 * A reopened dashboard reads like the live report: the scope frame first, then the figures.
 *
 * `JainaReportV2` renders `report.blocks` in the Backend's reading order, which opens with
 * the `data_scope` frame. A row saved before the save kept that frame in front could carry
 * it anywhere — or nowhere — so the panel orders on read as well, and prints the persisted
 * `window_label` next to the name so the period is stated before the row is even opened.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

mock.module('@/lib/jaina/brandScope', () => ({
  useJainaBrandScope: () => ({ brandId: 'b1', adAccountId: 'act_1' }),
  JainaBrandScopeProvider: ({ children }: { children: unknown }) => children,
}));

mock.module('../blocks/BlockRenderer', () => ({
  BlockRenderer: ({ block }: { block: { block_id: string; category: string } }) => (
    <article data-block-id={block.block_id} data-testid="reopened-module">
      {block.category}
    </article>
  ),
}));

const THE_WINDOW = '2026-08-20 → 2026-09-18';

const scopeFrame = {
  block_id: 'scope',
  category: 'data_scope',
  scope: 'current_account',
  title: 'Scope',
  priority: 'secondary',
  provenance: null,
  dates: THE_WINDOW,
  timezone: null,
  source: 'api',
  notes: [],
};

const prose = {
  block_id: 'prose',
  category: 'narrative',
  scope: 'current_account',
  title: 'What moved',
  priority: 'primary',
  provenance: null,
  body: 'Reels took share.',
  highlights: [],
  citations: [],
};

const dashboard = {
  id: '11111111-1111-1111-1111-111111111111',
  brand_id: '00000000-0000-0000-0000-000000000001',
  ad_account_id: 'act_1',
  name: 'Key Metrics',
  source_title: null,
  source_prompt: null,
  scope: 'current_account',
  window_label: THE_WINDOW,
  // Stored with the frame LAST, the way a hidden-then-saved row or a pre-fix row could be.
  blocks: [prose, scopeFrame],
  created_by: null,
  created_at: '2026-09-18T00:00:00Z',
  updated_at: '2026-09-18T00:00:00Z',
};

const realClient = await import('@/lib/jaina/dashboards.client');
mock.module('@/lib/jaina/dashboards.client', () => ({
  ...realClient,
  listDashboards: async () => [dashboard],
  deleteDashboard: async () => {},
}));

const { SavedDashboardsPanel } = await import('./SavedDashboardsPanel');

afterEach(cleanup);

async function openTheDashboard() {
  render(<SavedDashboardsPanel />);
  fireEvent.click(await screen.findByRole('button', { name: /saved dashboards/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Key Metrics' }));
}

describe('reopening a saved dashboard', () => {
  it('renders the scope frame before the figures, whatever order the row stored', async () => {
    await openTheDashboard();
    await waitFor(() => expect(screen.getAllByTestId('reopened-module')).toHaveLength(2));
    const order = screen
      .getAllByTestId('reopened-module')
      .map((node) => node.getAttribute('data-block-id'));
    expect(order).toEqual(['scope', 'prose']);
  });

  it('states the persisted window next to the name', async () => {
    await openTheDashboard();
    expect(screen.getByText(new RegExp(`covers ${THE_WINDOW}`))).toBeTruthy();
  });
});
