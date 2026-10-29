import { afterEach, describe, expect, it } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, within } from '@testing-library/react';
import {
  BEFORE_E1,
  BID_CARD,
  BUDGET_CARD,
  EKATAR,
  SEARCH_GOAL,
  VALLE_REAL,
  WITH_E1,
} from '../../google/__fixtures__/googleTab';
import { NOT_AMONG_TOP, portfolioCampaignViews } from '../../google/campaignExplorerModel';
import { NOT_IN_THIS_READ } from '../../google/googleReads';
import { cardActionsOf } from '../../platformCards/platformCardActionModel';
import { autopilotLine, GooglePortfolioCampaignsView } from './GooglePortfolioCampaigns';

afterEach(cleanup);

const MEMBERS = [
  { platform: 'google_ads', entityId: EKATAR, name: 'VIVO 47-EKATAR', channelType: 'SEARCH' },
  {
    platform: 'google_ads',
    entityId: VALLE_REAL,
    name: 'Valle Real-Search',
    channelType: 'SEARCH',
  },
  { platform: 'google_ads', entityId: '999', name: 'Brand (paused)', channelType: 'SEARCH' },
];

function mount(read: typeof WITH_E1, members = MEMBERS, cards = [BID_CARD, BUDGET_CARD]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GooglePortfolioCampaignsView
        actions={cardActionsOf(cards)}
        autopilot="Recommend: every change waits for a person · on Google it may change budgets"
        cards={cards}
        currency="MXN"
        goal={SEARCH_GOAL}
        rows={portfolioCampaignViews({ members, read, goal: SEARCH_GOAL, cards, currency: 'MXN' })}
        window={{ since: '2026-09-01', until: '2026-09-30' }}
      />
    </QueryClientProvider>,
  );
}

const rowOf = (root: ReturnType<typeof mount>, id: string) =>
  within(
    root
      .getAllByTestId('google-portfolio-row')
      .find((row) => row.getAttribute('data-campaign-id') === id) as HTMLElement,
  );

describe('GooglePortfolioCampaignsView', () => {
  it("sums the portfolio's Google campaigns against its goal in one line", () => {
    expect(mount(WITH_E1).getByTestId('google-portfolio-campaigns-summary').textContent).toBe(
      '3 campaigns, $40,313 MXN spent over Sep 1 – Sep 30, $1,414 MXN per conversion against the $900 MXN goal (57% over goal).',
    );
  });

  it("shows budget and Google's target before → after from the G03 and G07 cards, and those cards' controls", () => {
    const view = mount(WITH_E1);
    expect(rowOf(view, VALLE_REAL).getByTestId('google-portfolio-budget').textContent).toBe(
      '$120$150',
    );
    expect(rowOf(view, EKATAR).getByTestId('google-portfolio-target').textContent).toBe(
      '$1,200 MXN$1,080 MXN',
    );
    expect(rowOf(view, EKATAR).getByTestId('goal-band').textContent).toBe('58% over goal');
    const cards = view.getByTestId('google-portfolio-cards');
    expect(cards.querySelector('summary')?.textContent).toBe('2 proposals to approve or reject');
    expect(
      within(cards)
        .getAllByTestId('platform-card')
        .map((card) => card.getAttribute('data-variant')),
    ).toEqual(['google_bid_target', 'google_budget_limited']);
    expect(view.getByTestId('google-portfolio-autopilot').textContent).toContain(
      'every change waits',
    );
  });

  it('says why a member reads "—": not in the read, or a read cached before E1', () => {
    const missing = mount(WITH_E1);
    expect(
      rowOf(missing, '999')
        .getAllByTestId('missing')
        .map((dash) => dash.getAttribute('data-reason')),
    ).toContain(NOT_AMONG_TOP);
    cleanup();
    const cached = mount(BEFORE_E1, MEMBERS.slice(0, 1), []);
    expect(
      rowOf(cached, EKATAR)
        .getAllByTestId('missing')
        .map((dash) => dash.getAttribute('data-reason')),
    ).toEqual([NOT_IN_THIS_READ, NOT_IN_THIS_READ]);
  });

  it('says there is no Google campaign, with no table, when the portfolio holds none', () => {
    const view = mount(WITH_E1, [], []);
    expect(view.getByTestId('google-portfolio-campaigns-summary').textContent).toBe(
      'No Google campaign in this portfolio.',
    );
    expect(view.queryByTestId('google-portfolio-table')).toBeNull();
    expect(view.queryByTestId('google-portfolio-cards')).toBeNull();
  });
});

describe('autopilotLine', () => {
  const ready = (allowed: string[] | null) =>
    ({ status: 'ready', platforms: [{ platform: 'google_ads', allowed, accounts: 1 }] }) as const;

  it('says the mode and what it may write on Google, read-only', () => {
    expect(
      autopilotLine(
        { apply_mode: 'recommend', autopilot_paused: null },
        ready(['set_budget', 'set_bid_target']),
      ),
    ).toBe(
      'Recommend: every change waits for a person · on Google it may change budgets, change bid targets',
    );
    expect(autopilotLine({ apply_mode: 'autopilot', autopilot_paused: true }, ready([]))).toBe(
      'Autopilot, paused: every change waits for a person · it may write nothing on Google',
    );
    expect(
      autopilotLine({ apply_mode: 'autopilot', autopilot_paused: false }, { status: 'error' }),
    ).toBe(
      'Autopilot: changes inside the caps are written without asking · what it may write on Google could not be read',
    );
  });
});
