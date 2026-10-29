import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, within } from '@testing-library/react';
import {
  BEFORE_E1,
  BID_CARD,
  EKATAR,
  EMPTY,
  GOALS,
  GOURMETERIA,
  HISTORY,
  NOW,
  WITH_E1,
} from './__fixtures__/googleTab';
import { BiddingPanel } from './BiddingPanel';
import { biddingViews, campaignViews, type HistoryRead } from './campaignExplorerModel';
import { NOT_IN_THIS_READ } from './googleReads';

afterEach(cleanup);

const READY: HistoryRead = { status: 'ready', history: HISTORY };

const mount = (read: typeof WITH_E1, history: HistoryRead = READY, cards = [BID_CARD]) =>
  render(
    <BiddingPanel
      currency="MXN"
      rows={biddingViews(campaignViews(read, GOALS, 'MXN'), history, cards, NOW)}
    />,
  );

const rowOf = (root: ReturnType<typeof mount>, id: string) =>
  root
    .getAllByTestId('google-bidding-row')
    .find((row) => row.getAttribute('data-campaign-id') === id) as HTMLElement;

describe('BiddingPanel', () => {
  it('counts what bids with a target, what is learning, and what waits on its card', () => {
    expect(mount(WITH_E1).getByTestId('google-bidding-summary').textContent).toBe(
      '1 of 7 campaigns bid with a Google target, 1 still learning, 1 proposal waits on its card.',
    );
  });

  it("puts Google's target against what it paid and the goal, with the ±10% step and the cooldown", () => {
    const view = mount(WITH_E1);
    const ekatar = within(rowOf(view, EKATAR));
    expect(ekatar.getByText(/^\$1,200 MXN/).textContent).toBe(
      '$1,200 MXN±10%: $1,080 MXN–$1,320 MXN',
    );
    expect(ekatar.getByText('$1,422 MXN')).toBeTruthy();
    expect(ekatar.getByTestId('goal-band').textContent).toBe('58% over goal');
    expect(ekatar.getByTestId('google-bidding-next').textContent).toBe(
      'Next change from Nov 6: Smart Bidding relearns for 14 days (10 left).Last: Oct 23: $1,300 MXN → $1,200 MXN',
    );
    // The write is G07's card; the panel only points at it.
    expect(ekatar.getByTestId('google-bidding-proposal').textContent).toBe(
      'Jaina proposes to lower Google\'s target from $1,200 MXN to $1,080 MXN. Approve or reject it on its card under "What Jaina recommends".',
    );
    expect(view.queryAllByRole('button').filter((button) => !button.closest('summary'))).toEqual(
      [],
    );
  });

  it('marks a learning strategy and says why its target reads "—"', () => {
    const gourmeteria = within(rowOf(mount(WITH_E1), GOURMETERIA));
    const status = gourmeteria.getByTestId('google-bidding-status');
    expect(status.getAttribute('data-learning')).toBe('true');
    expect(status.textContent).toBe('Learning: a setting changed');
    expect(gourmeteria.getAllByTestId('missing')[0]?.getAttribute('data-reason')).toContain(
      'No target on the campaign itself',
    );
    expect(gourmeteria.getByTestId('google-bidding-next').textContent).toContain(
      'Can change now, by up to 10%.',
    );
  });

  it('says once that a pre-E1 read holds no bidding, and why each cell is "—"', () => {
    const view = mount(BEFORE_E1, { status: 'error' }, []);
    expect(view.getByTestId('google-bidding-summary').textContent).toBe(`${NOT_IN_THIS_READ}.`);
    expect(view.getByTestId('missing-reasons').textContent).toContain(NOT_IN_THIS_READ);
  });

  it('says no campaign spent on an empty read', () => {
    const view = mount(EMPTY);
    expect(view.getByTestId('google-bidding-summary').textContent).toBe(
      'No campaign spent in the window.',
    );
    expect(view.queryByTestId('google-bidding-table')).toBeNull();
  });
});
