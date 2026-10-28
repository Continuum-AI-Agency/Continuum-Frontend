import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, within } from '@testing-library/react';
import {
  BEFORE_E1,
  BID_CARD,
  DISPLAY,
  EKATAR,
  GOALS,
  HISTORY,
  NOW,
  WITH_E1,
} from './__fixtures__/googleTab';
import { biddingViews, campaignViews, type HistoryRead } from './campaignExplorerModel';
import { GoogleCampaignDetailBody } from './GoogleCampaignDetail';
import { NOT_IN_THIS_READ } from './googleReads';

afterEach(cleanup);

const WINDOW = { since: '2026-09-01', until: '2026-09-30' };

function mount(read: typeof WITH_E1, id: string, history: HistoryRead) {
  const views = campaignViews(read, GOALS, 'MXN');
  const campaign = views.find((view) => view.id === id);
  if (!campaign) throw new Error(`no campaign ${id} in the read`);
  const bidding =
    biddingViews(views, history, [BID_CARD], NOW).find((view) => view.id === id) ?? null;
  return render(
    <GoogleCampaignDetailBody
      bidding={bidding}
      campaign={campaign}
      currency="MXN"
      history={history}
      window={WINDOW}
    />,
  );
}

const figures = (root: HTMLElement) =>
  Object.fromEntries(
    [...root.querySelectorAll('dt')].map((dt) => [
      dt.textContent,
      dt.nextElementSibling?.textContent,
    ]),
  );

describe('GoogleCampaignDetailBody', () => {
  it("lays out the campaign's figures against its goal, its bidding and what changed on it", () => {
    const view = mount(WITH_E1, EKATAR, { status: 'ready', history: HISTORY });
    expect(figures(view.getByTestId('google-campaign-figures'))).toEqual({
      'Spend · Sep 1 – Sep 30': '$36,997 MXN',
      Conversions: '26',
      'Cost per conversion': '$1,422 MXN',
      'Portfolio CPA goal': '$900 MXN 58% over goal',
      'Budget per day': '$1,179 MXN',
      'Search impression share': '42%',
      'Lost to budget': '28%',
      'Lost to rank': '30%',
    });
    expect(figures(view.getByTestId('google-campaign-bidding'))).toMatchObject({
      Strategy: 'Target CPA',
      'Google target (bid setting)': '$1,200 MXN',
      Status: 'Learned',
      'Last target change': 'Oct 23: $1,300 MXN → $1,200 MXN',
    });
    expect(view.getByTestId('google-campaign-changes').textContent).toContain(
      'Oct 23 · Campaign changed: target CPA $1,300 MXN → $1,200 MXN · through the API',
    );
    const jaina = view.getByTestId('google-campaign-ask-jaina').getAttribute('href') ?? '';
    expect(jaina).toContain('platform=google_ads');
    expect(decodeURIComponent(jaina)).toContain('"VIVO 47-EKATAR", 2026-09-01 to 2026-09-30');
  });

  it('shows "—" with its reason for each figure a pre-E1 read lacks, and a history that failed', () => {
    const view = mount(BEFORE_E1, EKATAR, { status: 'error' });
    const reasons = within(view.getByTestId('google-campaign-figures'))
      .getAllByTestId('missing')
      .map((dash) => dash.getAttribute('data-reason'));
    expect(reasons).toEqual([
      NOT_IN_THIS_READ,
      NOT_IN_THIS_READ,
      NOT_IN_THIS_READ,
      NOT_IN_THIS_READ,
    ]);
    expect(view.getByTestId('google-campaign-changes').textContent).toContain(
      "Google's change history could not be read.",
    );
  });

  it('reads "no target" for a campaign no portfolio holds, and says when nothing changed on it', () => {
    const quiet = { ...HISTORY, changes: [] };
    const view = mount(WITH_E1, DISPLAY, { status: 'ready', history: quiet });
    expect(figures(view.getByTestId('google-campaign-figures'))['Portfolio CPA goal']).toBe(
      'no targetNo portfolio holds it',
    );
    expect(view.getByTestId('google-campaign-changes').textContent).toBe(
      "What changed on itNo change in Google's change history since Sep 29.",
    );
  });
});
