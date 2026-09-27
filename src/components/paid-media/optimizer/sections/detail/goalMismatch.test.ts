import { describe, expect, it } from 'bun:test';
import type { CycleRunReport } from '@continuum/contracts';
import mensajes from '../../../../../../packages/contracts/src/optimization/fixtures/optimizer-status-mensajes.json';
import formularios from '../../__fixtures__/optimizer-status-formularios.json';
import tours from '../../__fixtures__/optimizer-status-tours.json';
import { parseReport } from '../../reportModel';
import { goalMismatchOf, readMismatchMessage } from './goalMismatch';

// Tours is the real case: a `conversations` portfolio whose 12 of 12 ad sets optimise for
// pixel PURCHASE with a WhatsApp destination. Every cycle holds all twelve and moves
// nothing. The prod body carries no kpi_mismatch actionable yet (the engine that writes one
// is not deployed), so the items' freezeReason is the fallback that has to work today.

type Mutable = {
  latest_run: { confidence: { actionables: unknown[] } };
  latest_items: Array<{ current_budget: number; diagnostics: { freezeReason?: string } }>;
};

const clone = (body: unknown): Mutable => structuredClone(body) as Mutable;
const read = (body: unknown) => {
  const report = parseReport(body as CycleRunReport);
  if (!report) throw new Error('fixture did not parse');
  return goalMismatchOf({ report, measures: 'conversations' });
};

const ENGINE_MESSAGE =
  '12 of 12 ad sets (100% of spend) bid for purchases, not the conversations this portfolio prices, so the optimizer holds their budgets and moves nothing. Set the portfolio’s objective to what they buy, or move them to a portfolio that prices it.';

function withActionable(body: Mutable, message: string, adsetIds: string[], spendShare: number) {
  body.latest_run.confidence.actionables = [
    { code: 'kpi_mismatch', adsetIds, spendShare, projectedScore: null, message },
    ...body.latest_run.confidence.actionables,
  ];
  return body;
}

describe('goalMismatchOf — all mismatched', () => {
  it('Tours as prod serves it today: the items say kpi_mismatch, the result is unknown', () => {
    const mismatch = read(tours);
    expect(mismatch).toMatchObject({
      scope: 'all',
      mismatched: 12,
      total: 12,
      bought: null,
      measures: 'conversations',
      share: null,
    });
    expect(mismatch?.text).toBe(
      'All 12 ad sets bid for a different result than the conversations this portfolio measures — the optimizer holds them and moves nothing.',
    );
  });

  it('Tours with the engine actionable: names what they bid for', () => {
    const ids = tours.latest_items.map((item) => item.adset_id);
    const mismatch = read(withActionable(clone(tours), ENGINE_MESSAGE, ids, 1));
    expect(mismatch).toMatchObject({
      scope: 'all',
      mismatched: 12,
      total: 12,
      bought: 'purchases',
    });
    expect(mismatch?.text).toBe(
      'All 12 ad sets bid for purchases, not the conversations this portfolio measures — the optimizer holds them and moves nothing.',
    );
  });

  it('a single ad set is "the one", never "all 1"', () => {
    const body = clone(tours);
    body.latest_items = body.latest_items.slice(0, 1);
    expect(read(body)?.text).toBe(
      'The one ad set bids for a different result than the conversations this portfolio measures — the optimizer holds it and moves nothing.',
    );
  });
});

describe('goalMismatchOf — some mismatched', () => {
  it('without the actionable: N of M and their share of the budget', () => {
    const body = clone(tours);
    for (const item of body.latest_items.slice(3)) delete item.diagnostics.freezeReason;
    body.latest_items[0].current_budget = 250;
    const mismatch = read(body);
    // 250 + 62.5 + 62.5 of 250 + 11 × 62.5 = 375 of 937.5.
    expect(mismatch).toMatchObject({
      scope: 'some',
      mismatched: 3,
      total: 12,
      share: { pct: 40, of: 'budget' },
    });
    expect(mismatch?.text).toBe(
      '3 of 12 ad sets (40% of budget) bid for a different result than the conversations this portfolio measures — the optimizer holds them and moves only the rest.',
    );
  });

  it('with the actionable: its count, its spend share and what they bid for', () => {
    const body = clone(tours);
    for (const item of body.latest_items.slice(2)) delete item.diagnostics.freezeReason;
    const ids = body.latest_items.slice(0, 2).map((_, i) => `a${i}`);
    withActionable(
      body,
      '2 of 12 ad sets (31% of spend) bid for leads / purchases, not the conversations this portfolio prices, so the optimizer holds their budgets and moves none of theirs.',
      ids,
      0.3125,
    );
    const mismatch = read(body);
    expect(mismatch).toMatchObject({
      scope: 'some',
      mismatched: 2,
      total: 12,
      bought: 'leads / purchases',
      share: { pct: 31, of: 'spend' },
    });
    expect(mismatch?.text).toBe(
      '2 of 12 ad sets (31% of spend) bid for leads / purchases, not the conversations this portfolio measures — the optimizer holds them and moves only the rest.',
    );
  });
});

describe('goalMismatchOf — none mismatched', () => {
  it('FORMULARIOS and MENSAJES have nothing to say', () => {
    expect(read(formularios)).toBeNull();
    expect(read(mensajes)).toBeNull();
  });

  it('no report, no banner', () => {
    expect(goalMismatchOf({ report: null, measures: 'conversations' })).toBeNull();
  });

  it('an actionable naming no ad sets is not a mismatch', () => {
    const body = withActionable(clone(mensajes), ENGINE_MESSAGE, [], 0);
    expect(read(body)).toBeNull();
  });
});

describe('readMismatchMessage', () => {
  it('reads the engine sentence and refuses a shape it does not know', () => {
    expect(readMismatchMessage(ENGINE_MESSAGE)).toEqual({
      mismatched: 12,
      total: 12,
      bought: 'purchases',
      priced: 'conversations',
    });
    expect(
      readMismatchMessage(
        '1 of 3 ad sets (10% of spend) bid for another result, not the leads this portfolio prices',
      )?.bought,
    ).toBeNull();
    expect(readMismatchMessage('Something else entirely.')).toBeNull();
  });
});
