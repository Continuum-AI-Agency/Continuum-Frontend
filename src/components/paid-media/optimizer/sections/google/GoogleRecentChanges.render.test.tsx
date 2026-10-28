import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { OptimizerActionFeedRow } from '../../useOptimizerData';
import { HISTORY, NOW } from './__fixtures__/googleTab';
import type { HistoryRead } from './campaignExplorerModel';
import { GoogleRecentChangesView, type WritesRead } from './GoogleRecentChanges';

afterEach(cleanup);

/** Easy Fit's Google budget write, as optimizer_list_actions returns it, still undoable. */
const BUDGET_WRITE = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ts: '2026-10-27T10:00:00Z',
  family: 'money',
  op: 'budget',
  portfolio_id: '5aaf5931-7407-4940-aab6-52e914bced45',
  portfolio_name: 'Test — Google Ads (Easy Fit)',
  entity_id: '20249528111',
  before: { minor: 80000 },
  after: { minor: 88000 },
  reversible: true,
  reverted_by: null,
  receipt: { platform: 'google_ads', requestId: 'req-1' },
} as unknown as OptimizerActionFeedRow;

function mount(writes: WritesRead, history: HistoryRead) {
  const onOpenActivity = mock();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <GoogleRecentChangesView
        brandId="6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64"
        currency="MXN"
        history={history}
        now={NOW}
        onOpenActivity={onOpenActivity}
        writes={writes}
      />
    </QueryClientProvider>,
  );
  return Object.assign(view, { onOpenActivity });
}

describe('GoogleRecentChangesView', () => {
  it("lists Continuum's Google writes with their undo, and the week of Google's own history", () => {
    const view = mount(
      { status: 'ready', rows: [BUDGET_WRITE] },
      { status: 'ready', history: HISTORY },
    );
    expect(view.getByTestId('google-recent-changes-summary').textContent).toBe(
      "Continuum wrote 1 change to Google in 7 days; Google's change history shows 2 changes in the same 7 days, by every channel.",
    );
    const write = view.getByTestId('google-recent-writes');
    expect(write.querySelector('[data-action-id]')?.getAttribute('data-action-id')).toBe(
      BUDGET_WRITE.id,
    );
    // The Oct 2 ad is outside the week.
    expect(
      view.getAllByTestId('google-recent-history-line').map((line) => line.textContent),
    ).toEqual([
      'Oct 26 · Budget changed in Valle Real-Search: budget $100 MXN → $120 MXN · in Google Ads',
      'Oct 23 · Campaign changed in VIVO 47-EKATAR: target CPA $1,300 MXN → $1,200 MXN · through the API',
    ]);
    fireEvent.click(view.getByTestId('google-recent-activity'));
    expect(view.onOpenActivity).toHaveBeenCalledTimes(1);
  });

  it('says which read failed rather than that nothing changed', () => {
    const view = mount({ status: 'error' }, { status: 'error' });
    expect(view.getByTestId('google-recent-changes-summary').textContent).toBe(
      "Continuum's writes could not be read; Google's change history could not be read.",
    );
    expect(view.getByTestId('google-recent-history').textContent).toContain(
      'It could not be read.',
    );
  });

  it('says nothing changed when both reads are empty', () => {
    const view = mount(
      { status: 'ready', rows: [] },
      { status: 'ready', history: { ...HISTORY, changes: [] } },
    );
    expect(view.getByTestId('google-recent-writes').textContent).toContain(
      'Nothing in the last 7 days.',
    );
    expect(view.getByTestId('google-recent-history').textContent).toContain(
      'No change in the last 7 days.',
    );
  });
});
