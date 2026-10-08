/**
 * A reopened dashboard says, per module, whether it can be re-run and for which window.
 *
 * The spec is what item 29's picker will read; here there is no picker, only the honest
 * statement: a module with a spec names the window it was computed for and whether it is
 * derived; a module the save could not describe names the reason; a row saved before the
 * spec existed says so once instead of pretending per module.
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

const scopeFrame = {
  block_id: 'scope',
  category: 'data_scope',
  scope: 'account',
  title: 'Scope',
  priority: 'secondary',
  provenance: null,
  dates: '2026-09-13 → 2026-09-19',
  timezone: null,
  source: 'api',
  notes: [],
};

const grid = {
  block_id: 'composed_72842552d8',
  category: 'metric_grid',
  scope: 'account',
  title: 'Key metrics',
  priority: 'primary',
  provenance: null,
  metrics: [{ label: 'Spend', value: 100 }],
};

const insights = {
  block_id: 'composed_de958e7927',
  category: 'insight_list',
  scope: 'account',
  title: 'Actions',
  priority: 'primary',
  provenance: null,
  items: [
    {
      item_type: 'action',
      title: 'Pause',
      summary: 'CPA 3.2x',
      rationale: 'r',
      impact: 'i',
    },
  ],
};

const base = {
  brand_id: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
  ad_account_id: 'act_1',
  source_title: null,
  source_prompt: null,
  scope: 'account',
  window_label: '2026-09-13 → 2026-09-19',
  blocks: [scopeFrame, grid, insights],
  created_by: null,
  created_at: '2026-09-23T00:00:00Z',
  updated_at: '2026-09-23T00:00:00Z',
};

const withSpec = {
  ...base,
  id: '2a9bf411-b6f4-46d2-914c-b5221218acbd',
  name: 'With spec',
  spec: {
    version: 1,
    blocks: [
      {
        block_id: 'scope',
        category: 'data_scope',
        spec: null,
        reason: 'the scope frame is composed from the other blocks, not fetched',
      },
      {
        block_id: 'composed_72842552d8',
        category: 'metric_grid',
        reason: null,
        spec: {
          tool: 'get_meta_overview_summary',
          entity: { id: 'act_521903353286118', level: 'account', name: 'account-521903353286118' },
          metrics: ['Spend'],
          range: { kind: 'custom', from: '2026-09-13', to: '2026-09-19' },
          derived: null,
        },
      },
      {
        block_id: 'composed_de958e7927',
        category: 'insight_list',
        reason: null,
        spec: {
          tool: 'get_paid_creative_intel',
          entity: { id: 'act_521903353286118', level: 'account', name: 'act_521903353286118' },
          metrics: [],
          range: { kind: 'preset', preset: 'd30' },
          derived: 'severity',
        },
      },
    ],
  },
};

const legacy = { ...base, id: '4bc1599a-e987-4d7a-aa90-acba967c6a09', name: 'Legacy', spec: null };

mock.module('@/lib/jaina/dashboards.client', () => ({
  listDashboards: async () => [withSpec, legacy],
  deleteDashboard: async () => undefined,
}));

const { SavedDashboardsPanel } = await import('./SavedDashboardsPanel');

afterEach(cleanup);

const open = async (name: string) => {
  render(<SavedDashboardsPanel />);
  await waitFor(() => expect(screen.getByText('Saved dashboards')).toBeTruthy());
  fireEvent.click(screen.getByText('Saved dashboards'));
  fireEvent.click(screen.getByText(name));
  await waitFor(() => expect(screen.getAllByTestId('reopened-module').length).toBe(3));
};

describe('SavedDashboardsPanel — re-runnable per module', () => {
  it('states, under each module, whether it is re-runnable and the window it was computed for', async () => {
    await open('With spec');
    const lines = screen.getAllByTestId('block-rerun').map((node) => node.textContent);
    expect(lines).toEqual([
      'Not re-runnable: the scope frame is composed from the other blocks, not fetched',
      'Re-runnable · computed for 2026-09-13 → 2026-09-19',
      'Re-runnable · computed for Last 30 days · its judgements are recomputed, not re-fetched',
    ]);
  });

  it('a row saved before the spec existed says so once and shows no per-module lines', async () => {
    await open('Legacy');
    expect(screen.queryAllByTestId('block-rerun')).toHaveLength(0);
    expect(
      screen.getByText(/Saved without a re-run spec: its figures cannot be re-dated/),
    ).toBeTruthy();
  });
});
