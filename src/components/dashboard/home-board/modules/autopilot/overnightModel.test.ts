import { describe, expect, it } from 'bun:test';
import type { OptimizerActionFeedRow } from '@/components/paid-media/optimizer/useOptimizerData';
import {
  EASY_FIT_PORTFOLIOS,
  PINK_ELEPHANT_PORTFOLIOS,
  portfolioWith,
} from '../opps/__fixtures__/portfolios';
import {
  EASY_FIT_ACTIONS,
  EASY_FIT_ACTIONS_IN_WINDOW,
  OVERNIGHT_NOW,
} from './__fixtures__/easyFitActions';
import {
  actionsInWindow,
  hasActingPortfolio,
  needsOlderPage,
  OUTCOME_NOTE,
  outcomeOf,
  overnightRowsOf,
  portfolioRunsOf,
} from './overnightModel';

const row = (id: string): OptimizerActionFeedRow => {
  const found = EASY_FIT_ACTIONS.find((action) => action.id === id);
  if (!found) throw new Error(`fixture lost ${id}`);
  return found;
};
const VERIFIED_META = row('df088128-ecf8-4c37-ab45-d39fdc1cc7e3');
const EMPTY_RECEIPT = row('0d8e1b44-51b7-4f0e-8a77-0c5b8c1f2e02');
const GOOGLE_WRITE = row('7b0c1f52-3d1e-4a52-9a43-2f7c1c3e9a01');
const DECISION = row('a4c2b0e9-6f3d-4b0e-b1d2-5e9f0c7a8b03');
const SETTING = row('b2133f30-81a2-471d-b21c-b6e861dfe3c5');

describe('the 24 h window', () => {
  it('keeps the actions of the last 24 h, newest first', () => {
    const rows = actionsInWindow(EASY_FIT_ACTIONS, OVERNIGHT_NOW);
    expect(rows).toHaveLength(EASY_FIT_ACTIONS_IN_WINDOW);
    expect(rows.map((action) => action.ts)).toEqual(
      [...rows.map((action) => action.ts)].sort().reverse(),
    );
    for (const action of rows) {
      expect(Date.parse(action.ts)).toBeGreaterThanOrEqual(OVERNIGHT_NOW.getTime() - 86_400_000);
    }
  });

  it('keeps an action exactly 24 h old and drops one a millisecond older', () => {
    const at = (ts: string) => ({ ...VERIFIED_META, id: ts, ts });
    const rows = actionsInWindow(
      [at('2026-11-02T20:00:00.000Z'), at('2026-11-02T19:59:59.999Z')],
      OVERNIGHT_NOW,
    );
    expect(rows.map((action) => action.ts)).toEqual(['2026-11-02T20:00:00.000Z']);
  });

  it('asks for an older page only while every loaded row is still inside the window', () => {
    const inside = EASY_FIT_ACTIONS.slice(0, EASY_FIT_ACTIONS_IN_WINDOW);
    expect(needsOlderPage(inside, OVERNIGHT_NOW, true)).toBe(true);
    expect(needsOlderPage(inside, OVERNIGHT_NOW, false)).toBe(false);
    expect(needsOlderPage(EASY_FIT_ACTIONS, OVERNIGHT_NOW, true)).toBe(false);
    expect(needsOlderPage([], OVERNIGHT_NOW, true)).toBe(false);
  });
});

describe('a write is applied only when its own row proves it', () => {
  it('says applied for a Meta write whose receipt carries a clean read-back', () => {
    expect(outcomeOf(VERIFIED_META)).toEqual({
      kind: 'applied',
      label: 'Applied · confirmed by read-back',
    });
  });

  it('says sent, outcome not readable, for a receipt with no read-back', () => {
    for (const action of [EMPTY_RECEIPT, GOOGLE_WRITE]) {
      const outcome = outcomeOf(action);
      expect(outcome).toEqual({ kind: 'sent', label: 'Sent · outcome not readable yet' });
    }
    const acceptedOnly = { ...VERIFIED_META, receipt: { success: true, fbtraceId: 'x' } };
    expect(outcomeOf(acceptedOnly).kind).toBe('sent');
  });

  it('never says applied when the read-back disagreed', () => {
    for (const state of ['unverified', 'value_mismatch', 'delivery_changed']) {
      const action = {
        ...VERIFIED_META,
        receipt: { success: true, verification: { state, detail: 'x' } },
      };
      const outcome = outcomeOf(action);
      expect(outcome.kind).toBe('unconfirmed');
      expect(outcome.label.toLowerCase()).not.toContain('applied');
    }
  });

  it('says failed when the receipt says the platform refused', () => {
    expect(outcomeOf({ ...VERIFIED_META, receipt: { success: false } }).kind).toBe('failed');
  });

  it('labels settings and decisions by what they recorded, never as a write', () => {
    expect(outcomeOf(SETTING)).toEqual({ kind: 'recorded', label: 'Setting changed' });
    expect(outcomeOf(DECISION)).toEqual({ kind: 'recorded', label: 'Recommendation dismissed' });
  });

  it('says applied for no row of the fixture without proof', () => {
    const applied = EASY_FIT_ACTIONS.filter((action) => outcomeOf(action).kind === 'applied');
    for (const action of applied) {
      expect(action.receipt?.success).toBe(true);
      expect((action.receipt?.verification as { state?: string } | undefined)?.state).toBe(
        'verified',
      );
    }
  });

  it('says once that outcomes arrive with an update', () => {
    expect(OUTCOME_NOTE).toContain('arrive with an update');
  });
});

describe('the rows the Overnight log draws', () => {
  it('names the change, the actor and the outcome in the currency of its portfolio', () => {
    const [first] = overnightRowsOf(
      actionsInWindow(EASY_FIT_ACTIONS, OVERNIGHT_NOW),
      EASY_FIT_PORTFOLIOS,
      [],
    );
    expect(first).toMatchObject({
      id: 'df088128-ecf8-4c37-ab45-d39fdc1cc7e3',
      portfolioName: 'Conversaciones Whatsapp',
      actor: 'Autopilot',
      outcome: { kind: 'applied' },
    });
    expect(first?.change).toBe('Daily budget: $220 MXN → $275 MXN');
  });

  it('prints bare amounts when no currency is recorded, never a guessed one', () => {
    const [only] = overnightRowsOf([GOOGLE_WRITE], [], []);
    expect(only?.change).toBe('Daily budget: 600 → 750');
  });
});

describe('how each portfolio runs', () => {
  it('reads mode, pause and caps from the portfolio list, for active portfolios', () => {
    const runs = portfolioRunsOf(
      [
        ...EASY_FIT_PORTFOLIOS,
        portfolioWith(PINK_ELEPHANT_PORTFOLIOS[0] as never, { status: 'archived' }),
      ],
      [],
    );
    expect(runs).toEqual([
      {
        id: '94ca5d79-77cd-4973-9d9d-4ae55ccd7ec4',
        name: 'Leads // Google Ads only',
        mode: 'Recommend',
        paused: false,
        writesOff: false,
        maxChange: null,
        maxDaily: null,
      },
      {
        id: '0fd6f383-6a70-4ce1-baf8-c869bc5d4aec',
        name: 'Conversaciones Whatsapp',
        mode: 'Autopilot',
        paused: false,
        writesOff: false,
        maxChange: '20%',
        maxDaily: '$3,200 MXN',
      },
    ]);
  });

  it('says when every write is off, and when autopilot is paused', () => {
    const [pink] = portfolioRunsOf(PINK_ELEPHANT_PORTFOLIOS, []);
    expect(pink?.writesOff).toBe(true);
    const [paused] = portfolioRunsOf(
      [portfolioWith(EASY_FIT_PORTFOLIOS[1] as never, { autopilot_paused: true })],
      [],
    );
    expect(paused?.paused).toBe(true);
  });

  it('acts only where a portfolio is active, not observing, and may write', () => {
    expect(hasActingPortfolio(EASY_FIT_PORTFOLIOS)).toBe(true);
    expect(hasActingPortfolio(PINK_ELEPHANT_PORTFOLIOS)).toBe(false);
    expect(
      hasActingPortfolio(
        EASY_FIT_PORTFOLIOS.map((portfolio) => portfolioWith(portfolio, { apply_mode: 'observe' })),
      ),
    ).toBe(false);
  });
});
