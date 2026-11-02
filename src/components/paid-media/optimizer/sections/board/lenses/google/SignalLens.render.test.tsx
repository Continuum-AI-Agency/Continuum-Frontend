import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { AccountCandidate } from '@continuum/contracts';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { platformCardOf } from '../../../platformCards/platformCardModel';
import {
  EASYFIT_CARDS,
  PINK_FUNNEL,
  PINK_FUNNEL_ES,
  VIVO_ACCOUNT,
  VIVO_CAMPAIGNS,
  VIVO_CARDS,
  VIVO_CARDS_ES,
  VIVO_PORTFOLIO,
} from './__fixtures__/mixAuctionSignalReads';
import {
  expectFitsAndThemes,
  fakeSupabase,
  googleBoard,
  renderWithQueries,
  type Served,
  slotOf,
} from './mixAuctionSignal.testing';

const served: Served = {
  account: {
    account_id: '3710693645',
    name: 'Vivo 47',
    currency: 'MXN',
    objective: 'lead',
    goal: null,
    portfolioId: VIVO_PORTFOLIO,
  },
  cards: VIVO_CARDS,
  overview: VIVO_ACCOUNT,
  campaigns: VIVO_CAMPAIGNS,
  invoked: [],
};
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => fakeSupabase(served),
}));

const { default: SignalLens, SignalLensView, signalLensState } = await import('./SignalLens');
const { CARDS_UNAVAILABLE, CARDS_UNREAD } = await import('./MixAuctionSignalParts');

afterEach(() => {
  cleanup();
  served.invoked.length = 0;
});

const stateOf = (candidates: AccountCandidate[]) =>
  signalLensState({
    status: 'ready',
    candidates,
    cards: candidates.flatMap((candidate) => platformCardOf(candidate) ?? []),
  });

const texts = (testId: string) => screen.getAllByTestId(testId).map((node) => node.textContent);
const frameState = () =>
  screen.getByTestId('board-module-signal').getAttribute('data-module-state');

describe('SignalLensView — Vivo 47: 85% of what Google counts are attention events', () => {
  const state = stateOf(VIVO_CARDS);

  it('m: the whole bar with both costs, then the conversion actions compact', () => {
    const { container } = render(
      <SignalLensView reason="85% son eventos de atención" size="m" state={state} />,
    );
    expect(frameState()).toBe('ready');
    expect(screen.getByTestId('signal-window').textContent).toBe('Last 30 days');
    expect(
      screen.getAllByTestId(/^signal-part-/).map((node) => node.getAttribute('aria-label')),
    ).toEqual(['Visits and attention events: 3,461 · 85%', 'Leads and sales: 592 · 15%']);
    expect(screen.getByTestId('signal-split-legend').textContent).toBe(
      'Visits and attention eventsLeads and sales',
    );
    const costs = [...container.querySelectorAll('[data-figure^="board.signal."]')];
    expect(costs.map((node) => [node.getAttribute('data-figure'), node.textContent])).toEqual([
      ['board.signal.reported-cost', '$10.09 MXN'],
      ['board.signal.real-cost', '$69.08 MXN'],
    ]);
    expect(costs[1]?.getAttribute('data-figure-raw')).toBe('69.08');
    expect(screen.getByTestId('signal-split-counts').textContent).toBe(
      '4,051 reported · 3,461 visits and attention events · 592 leads and sales',
    );
    expect(screen.getAllByTestId('signal-action')).toHaveLength(3);
    expect(screen.getByText('+2 more conversion actions')).toBeTruthy();
    expect(screen.getByTestId('signal-takeaway').textContent).toBe(
      'Google reporta 4,051 conversiones, pero 3,461 (85%) son eventos de atención: cada resultado real cuesta $69.08 MXN, no $10.09 MXN.',
    );
    expect(screen.getByText("Last 30 days · the Optimizer's last cycle")).toBeTruthy();
    expectFitsAndThemes(container);
  });

  it('l: every conversion action with its role and its value', () => {
    render(<SignalLensView size="l" state={state} />);
    expect(screen.getAllByTestId('signal-action')).toHaveLength(5);
    expect(texts('signal-action-value')).toEqual([
      'value 1',
      'value 1',
      'value 1',
      'value 1',
      'value 1',
    ]);
    expect(screen.getByText('Conversion actions · all valued 1')).toBeTruthy();
    expect(screen.getAllByText('Primary')).toHaveLength(1);
    expect(screen.getByTestId('signal-actions-legend').textContent).toBe(
      'Flagged by the OptimizerOther conversion actions',
    );
  });

  it('s: the attention share as the headline over the thin bar', () => {
    render(<SignalLensView size="s" state={state} />);
    expect(screen.getByTestId('signal-headline').textContent).toBe(
      '85%of the 4,051 conversions Google reports are attention events',
    );
    expect(screen.getByTestId('signal-split-bar')).toBeTruthy();
    expect(screen.queryByTestId('signal-takeaway')).toBeNull();
  });
});

describe('SignalLensView — Pink Elephant: 1,608 clicks → 11 leads → 1 sale', () => {
  it('m: the three steps with their rates, the sale’s value and ROAS, and what is not measured', () => {
    const { container } = render(<SignalLensView size="m" state={stateOf([PINK_FUNNEL])} />);
    const steps = screen.getAllByTestId('signal-funnel-step');
    expect(steps.map((step) => step.getAttribute('data-flagged'))).toEqual([
      'false',
      'false',
      'true',
    ]);
    expect(steps.map((step) => step.querySelector('p')?.textContent)).toEqual(['1,608', '11', '1']);
    expect(texts('signal-step-rate')).toEqual(['0.68% of clicks', '9.1% of leads']);
    expect(screen.getByTestId('signal-sales-value').textContent).toBe('$737 MXN');
    expect(screen.getByTestId('signal-roas').textContent).toBe('0.08');
    expect(screen.getByTestId('signal-keywords').textContent).toBe(
      'Core keywords: “iso 27000” QS 1 · “ISO 42001” QS 3 · “continuidad del negocio” QS 2',
    );
    expect(screen.getByTestId('signal-blocked').textContent).toContain('GoHighLevel → WooCommerce');
    expect(screen.getByTestId('signal-takeaway').textContent).toBe(
      '1,608 clics dieron 11 leads y 1 venta de $737 MXN: ROAS 0.08.',
    );
    expectFitsAndThemes(container);
  });

  it('s: leads → sales as the headline', () => {
    render(<SignalLensView size="s" state={stateOf([PINK_FUNNEL])} />);
    expect(screen.getByTestId('signal-headline').textContent).toBe(
      '11 → 1leads → sales, last 30 days',
    );
  });
});

describe('SignalLensView — Easy Fit: six actions, every one valued 1', () => {
  it('s: the count of actions sharing one value, over the top three', () => {
    render(<SignalLensView size="s" state={stateOf(EASYFIT_CARDS)} />);
    expect(screen.getByTestId('signal-headline').textContent).toBe(
      'All 6conversion actions, every one valued 1',
    );
    expect(screen.getAllByTestId('signal-action')).toHaveLength(3);
  });

  it('m: the takeaway counts them and says all six are primary', () => {
    render(<SignalLensView size="m" state={stateOf(EASYFIT_CARDS)} />);
    expect(screen.getAllByTestId('signal-action')).toHaveLength(6);
    expect(screen.getByTestId('signal-takeaway').textContent).toBe(
      'Las 6 acciones de conversión valen 1, y las 6 son principales.',
    );
  });
});

describe('SignalLensView — the cards in Spanish, after the engine’s rewrite', () => {
  it('reads the same figures and keeps its chrome English', () => {
    render(<SignalLensView size="l" state={stateOf([...VIVO_CARDS_ES, PINK_FUNNEL_ES])} />);
    expect(screen.getByTestId('signal-split-legend').textContent).toBe(
      'Visits and attention eventsLeads and sales',
    );
    expect(
      [...document.querySelectorAll('[data-figure^="board.signal."]')].map(
        (node) => node.textContent,
      ),
    ).toEqual(['$10.09 MXN', '$69.08 MXN']);
    expect(texts('signal-action-value')).toEqual([
      'value 1',
      'value 1',
      'value 1',
      'value 1',
      'value 1',
    ]);
    expect(
      screen
        .getAllByTestId('signal-funnel-step')
        .map((step) => step.querySelectorAll('p')[1]?.textContent),
    ).toEqual(['Clicks', 'Leads', 'Sales']);
    expect(screen.getByTestId('signal-sales-value').textContent).toBe('$737 MXN');
    expect(screen.getByTestId('signal-takeaway').textContent).toBe(
      'Google reporta 4,051 conversiones, pero 3,461 (85%) son eventos de atención: cada resultado real cuesta $69.08 MXN, no $10.09 MXN.',
    );
  });
});

describe('SignalLensView — nothing to draw, and the frame says which', () => {
  it('no finding is missing, said in one line', () => {
    render(<SignalLensView size="m" state={stateOf([])} />);
    expect(frameState()).toBe('missing');
    expect(screen.getByTestId('signal-empty').textContent).toBe(
      "No conversion finding on this account's last cycle.",
    );
  });

  it('cards that failed are an error; an RPC not served yet is missing; loading holds', () => {
    render(<SignalLensView size="m" state={signalLensState({ status: 'error' })} />);
    expect(frameState()).toBe('error');
    expect(screen.getByTestId('signal-empty').textContent).toBe(CARDS_UNREAD);
    cleanup();
    render(<SignalLensView size="m" state={signalLensState({ status: 'unavailable' })} />);
    expect(frameState()).toBe('missing');
    expect(screen.getByTestId('signal-empty').textContent).toBe(CARDS_UNAVAILABLE);
    cleanup();
    render(<SignalLensView size="m" state={signalLensState({ status: 'loading' })} />);
    expect(frameState()).toBe('loading');
    expect(screen.getByTestId('signal-loading')).toBeTruthy();
  });
});

describe('SignalLens — on the board, through the browser client', () => {
  it("reads the Optimizer's cards and nothing from Google itself", async () => {
    renderWithQueries(
      <SignalLens
        ctx={googleBoard('44444444-4444-4444-8444-444444444444', null)}
        slot={slotOf('signal', 'm', '85% son eventos de atención')}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('signal-takeaway')).toBeTruthy());
    expect(screen.getByTestId('signal-takeaway').textContent).toContain('3,461 (85%)');
    expect(served.invoked).toEqual([]);
  });
});
