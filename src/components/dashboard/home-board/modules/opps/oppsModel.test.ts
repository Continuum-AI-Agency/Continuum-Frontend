import { describe, expect, it } from 'bun:test';
import {
  EASY_FIT_PORTFOLIOS,
  PINK_ELEPHANT_PORTFOLIOS,
  portfolioWith,
} from './__fixtures__/portfolios';
import {
  OPPS_MISSING,
  OPTIMIZER_LINKS,
  oppsViewOf,
  portfolioDecisionsHref,
  waitingLine,
} from './oppsModel';

const [EASY_FIT_RECOMMEND, EASY_FIT_AUTOPILOT] = EASY_FIT_PORTFOLIOS;
if (!EASY_FIT_RECOMMEND || !EASY_FIT_AUTOPILOT) throw new Error('fixture lost a portfolio');

describe('oppsViewOf', () => {
  it('counts what optimizer_list_portfolios says waits: recommendations plus budget moves', () => {
    const view = oppsViewOf(EASY_FIT_PORTFOLIOS);
    expect(view.state).toBe('ready');
    if (view.state !== 'ready') return;
    expect(view.waiting).toBe(9);
    expect(view.portfolios.map((portfolio) => portfolio.name)).toEqual(['Conversaciones Whatsapp']);
  });

  it('adds budget moves to the count and puts the portfolio with most waiting first', () => {
    const rows = [
      portfolioWith(EASY_FIT_RECOMMEND, { pending_recommendations: 2, pending_budget_moves: 1 }),
      portfolioWith(EASY_FIT_AUTOPILOT, { pending_recommendations: 9, pending_budget_moves: 3 }),
    ];
    const view = oppsViewOf(rows);
    if (view.state !== 'ready') throw new Error('expected ready');
    expect(view.waiting).toBe(15);
    expect(view.portfolios.map((portfolio) => portfolio.count)).toEqual([12, 3]);
  });

  it('leaves observe, paused and archived portfolios out, as the reading does', () => {
    const rows = [
      portfolioWith(EASY_FIT_AUTOPILOT, { apply_mode: 'observe' }),
      portfolioWith(EASY_FIT_RECOMMEND, { status: 'paused', pending_recommendations: 4 }),
      ...PINK_ELEPHANT_PORTFOLIOS,
    ];
    const view = oppsViewOf(rows);
    if (view.state !== 'ready') throw new Error('expected ready');
    expect(view.waiting).toBe(9);
    expect(view.portfolios.map((portfolio) => portfolio.name)).toEqual([
      'Evento Webinar 29 Octubre',
    ]);
  });

  it('is ready with nothing waiting when an active portfolio has no pending work', () => {
    const view = oppsViewOf([EASY_FIT_RECOMMEND]);
    expect(view).toEqual({ state: 'ready', waiting: 0, portfolios: [] });
  });

  it('is missing when no active portfolio groups the campaigns', () => {
    expect(oppsViewOf([])).toEqual({ state: 'missing' });
    expect(oppsViewOf([portfolioWith(EASY_FIT_AUTOPILOT, { status: 'archived' })])).toEqual({
      state: 'missing',
    });
    expect(OPPS_MISSING).toContain('create one in the Optimizer');
  });
});

describe('words and links', () => {
  it('names what waits in each portfolio', () => {
    const view = oppsViewOf([
      portfolioWith(EASY_FIT_AUTOPILOT, { pending_recommendations: 1, pending_budget_moves: 2 }),
    ]);
    if (view.state !== 'ready') throw new Error('expected ready');
    expect(view.portfolios[0] && waitingLine(view.portfolios[0])).toBe(
      '1 recommendation · 2 budget moves',
    );
  });

  it('links a portfolio to its page in the Optimizer, where its decisions are made', () => {
    expect(portfolioDecisionsHref('0fd6f383-6a70-4ce1-baf8-c869bc5d4aec')).toBe(
      '/scale?tab=performance&optimizerView=portfolios&portfolio=0fd6f383-6a70-4ce1-baf8-c869bc5d4aec',
    );
    expect(OPTIMIZER_LINKS.actions).toBe('/scale?tab=performance&optimizerView=actions');
    expect(OPTIMIZER_LINKS.create).toBe('/scale?tab=performance&optimizerView=create');
  });
});
