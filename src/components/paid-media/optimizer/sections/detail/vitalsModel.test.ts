import { describe, expect, it } from 'bun:test';
import {
  type CycleRunReport,
  getOptimizationMetricDefinition,
  readPortfolioBrief,
} from '@continuum/contracts';
import mensajes from '../../../../../../packages/contracts/src/optimization/fixtures/optimizer-status-mensajes.json';
import formularios from '../../__fixtures__/optimizer-status-formularios.json';
import prueba from '../../__fixtures__/optimizer-status-prueba.json';
import tours from '../../__fixtures__/optimizer-status-tours.json';
import { parseReport } from '../../reportModel';
import { buildHeroHeader, buildVitals, type VitalRow, type VitalsPortfolio } from './vitalsModel';

// The four real optimizer-status bodies of Sep 25 (anonymised; Prueba rebuilt from its own
// figures on the FORMULARIOS shape), read the way the portfolio page reads them.

const MEXICO = 'America/Mexico_City';

type Body = typeof formularios;

function read(body: unknown, currency: string | null = 'MXN') {
  const report = parseReport(body as CycleRunReport);
  if (!report) throw new Error('fixture did not parse');
  const brief = readPortfolioBrief(report.hero_brief);
  if (!brief) throw new Error('fixture has no brief');
  const portfolio = (body as Body).portfolio as unknown as VitalsPortfolio;
  const metric = getOptimizationMetricDefinition(portfolio.objective);
  const rows = buildVitals({
    report,
    growth: brief.growth,
    portfolio,
    metric,
    currency,
    timeZone: MEXICO,
  });
  const header = buildHeroHeader({
    report,
    portfolio,
    lastCycleAt: report.latest_run?.cycle_ts ?? null,
    growth: brief.growth,
    metric,
    currency,
    timeZone: MEXICO,
  });
  return { rows, header };
}

const row = (rows: VitalRow[], key: VitalRow['key']): VitalRow => {
  const found = rows.find((r) => r.key === key);
  if (!found) throw new Error(`no ${key} row`);
  return found;
};

describe('buildVitals — the rows and their order', () => {
  it('always reads cost, results, spend, confidence, last cycle, waiting — in that order', () => {
    for (const body of [formularios, mensajes, prueba, tours]) {
      expect(read(body).rows.map((r) => r.key)).toEqual([
        'cost',
        'results',
        'spend',
        'confidence',
        'cycle',
        'pending',
      ]);
    }
  });
});

describe('FORMULARIOS — over target, low confidence, a cycle that half landed', () => {
  const { rows, header } = read(formularios);

  it('cost is bad: 45.69 against 35 is +31%', () => {
    const cost = row(rows, 'cost');
    expect(cost.label).toBe('Cost per lead · 14d');
    expect(cost.value).toBe('45.69 MXN');
    expect(cost.tone).toBe('bad');
    expect(cost.reading).toBe('+31% vs the 35.00 MXN target');
    expect(cost.bar).toMatchObject({ kind: 'bullet', value: 45.69, ref: 35, max: 70 });
  });

  it('results are short of what the spend buys at target', () => {
    const results = row(rows, 'results');
    expect(results.label).toBe('Leads · 14d');
    expect(results.value).toBe('80');
    expect(results.tone).toBe('bad');
    expect(results.reading).toBe('104 at target for the same spend');
  });

  it('spend per day divides the window by 14 and reads against the matched budget', () => {
    const spend = row(rows, 'spend');
    expect(spend.value).toBe('261 MXN');
    expect(spend.tone).toBe('good');
    expect(spend.reading).toBe('81% of the 324 MXN budget · matches spend');
  });

  it('confidence names the ad sets under the event floor', () => {
    const confidence = row(rows, 'confidence');
    expect(confidence.value).toBe('Low');
    expect(confidence.tone).toBe('warn');
    expect(confidence.reading).toBe('80 leads · 9 of 9 ad sets under the 20-event floor');
    expect(confidence.bar).toMatchObject({ kind: 'bullet', value: 80, ref: 180 });
  });

  it('the last cycle moved 4 of 9 and says the rest failed or were held', () => {
    const cycle = row(rows, 'cycle');
    expect(cycle.value).toBe('4/9');
    expect(cycle.unit).toBe('moved');
    expect(cycle.tone).toBe('bad');
    expect(cycle.reading).toBe('4 of 9 moved · 4 failed, 1 held');
    expect(cycle.bar).toEqual({ kind: 'outcome', total: 9, applied: 4, failed: 4, held: 1 });
  });

  it('three recommendations wait', () => {
    const pending = row(rows, 'pending');
    expect(pending.value).toBe('3');
    expect(pending.tone).toBe('warn');
    expect(pending.reading).toBe('3 recommendations');
  });

  it('the header names the mode, the freshness and every setting chip', () => {
    expect(header.name).toBe('Lead forms portfolio');
    expect(header.mode).toEqual({ label: 'Autopilot', tone: 'good' });
    expect(header.freshness).toEqual({ text: 'Updated Sep 25, 1:03 PM', stale: false });
    expect(header.chips.map((c) => [c.setting, c.label, c.value])).toEqual([
      ['strategy', 'Strategy', 'Balanced'],
      ['objective', 'Objective', 'Lead'],
      ['target', 'Target', '35.00 MXN / lead'],
      ['budget', 'Budget', '324 MXN/day · matches spend'],
      ['window', 'Window', '14 days'],
    ]);
    expect(header.secondary).toEqual({ kind: 'stop', label: 'Stop autopilot' });
  });
});

describe('MENSAJES — every move landed, and the cost is still 35% over target', () => {
  const { rows } = read(mensajes);

  it('cost is bad at +35% with high confidence behind it', () => {
    expect(row(rows, 'cost')).toMatchObject({
      value: '40.53 MXN',
      tone: 'bad',
      reading: '+35% vs the 30.00 MXN target',
    });
    expect(row(rows, 'confidence')).toMatchObject({
      value: 'High',
      tone: 'good',
      reading: '899 conversations · every ad set over the 20-event floor',
    });
  });

  it('the cycle moved all 12 and names the next one', () => {
    expect(row(rows, 'cycle')).toMatchObject({
      value: '12/12',
      tone: 'good',
      reading: '12 of 12 moved · next Sep 26, 12:58 PM',
    });
    expect(row(rows, 'pending')).toMatchObject({
      value: '0',
      tone: 'good',
      reading: 'Nothing waiting',
    });
  });
});

describe('Prueba — Recommend mode, a little over target, work waiting', () => {
  const { rows, header } = read(prueba);

  it('cost warns at +10%', () => {
    expect(row(rows, 'cost')).toMatchObject({
      value: '27.39 MXN',
      tone: 'warn',
      reading: '+10% vs the 25.00 MXN target',
    });
    expect(row(rows, 'confidence')).toMatchObject({
      value: 'Medium',
      tone: 'warn',
      reading: '52 leads · 2 of 3 ad sets under the 20-event floor',
    });
  });

  it('the three held moves wait for approval, beside two recommendations', () => {
    expect(row(rows, 'cycle')).toMatchObject({
      value: '0/3',
      tone: 'warn',
      reading: '3 of 3 held · waiting for your approval',
    });
    expect(row(rows, 'pending')).toMatchObject({
      value: '5',
      tone: 'warn',
      reading: '3 budget moves + 2 recommendations',
    });
  });

  it('the header offers the review instead of the stop', () => {
    expect(header.mode).toEqual({ label: 'Recommend', tone: 'line' });
    expect(header.secondary).toEqual({ kind: 'review', label: 'Review moves' });
  });
});

describe('Tours — two days old, nothing bought yet, every ad set held', () => {
  const { rows, header } = read(tours);

  it('has no cost to compare, so the cost row says so without a fill', () => {
    const cost = row(rows, 'cost');
    expect(cost.label).toBe('Cost per conversation · so far');
    expect(cost.value).toBe('—');
    expect(cost.tone).toBe('idle');
    expect(cost.reading).toBe('No conversations yet · target 120 MXN');
    expect(cost.bar).toMatchObject({ kind: 'bullet', value: null, ref: 120 });
  });

  it('divides the spend by the two days it has existed, not the 14-day window', () => {
    expect(row(rows, 'results')).toMatchObject({
      label: 'Conversations · so far',
      value: '0',
      tone: 'bad',
      reading: '155 MXN spent, none yet',
    });
    expect(row(rows, 'spend')).toMatchObject({
      value: '77.38 MXN',
      tone: 'warn',
      reading: '10% of the 750 MXN budget · fixed',
    });
  });

  it('holds all 12 because they bid for a different result', () => {
    expect(row(rows, 'confidence')).toMatchObject({
      value: 'Low',
      tone: 'idle',
      reading: 'No conversations yet',
    });
    expect(row(rows, 'cycle')).toMatchObject({
      value: '0/12',
      tone: 'bad',
      reading: '12 of 12 held · they bid for a different result',
    });
    expect(row(rows, 'cycle').bar).toEqual({
      kind: 'outcome',
      total: 12,
      applied: 0,
      failed: 0,
      held: 12,
    });
    expect(header.chips.find((c) => c.setting === 'budget')?.value).toBe('750 MXN/day · fixed');
  });

  it('states the engine’s kpi_mismatch actionable on the confidence row when there is one', () => {
    const body = structuredClone(tours) as unknown as {
      latest_run: { confidence: { actionables: unknown[] } };
    };
    body.latest_run.confidence.actionables = [
      {
        code: 'kpi_mismatch',
        adsetIds: tours.latest_items.map((item) => item.adset_id),
        spendShare: 1,
        projectedScore: null,
        message:
          '12 of 12 ad sets (100% of spend) bid for purchases, not the conversations this portfolio prices, so the optimizer holds their budgets and moves nothing. Set the portfolio’s objective to what they buy, or move them to a portfolio that prices it.',
      },
    ];
    expect(row(read(body).rows, 'confidence').reading).toBe(
      '12 of 12 ad sets bid for purchases, not conversations',
    );
  });
});

describe('the goal-mismatch banner in the header', () => {
  it('Tours: all 12 bid for a different result — change the objective, or remove them', () => {
    expect(read(tours).header.mismatch).toEqual({
      scope: 'all',
      mismatched: 12,
      total: 12,
      text: 'All 12 ad sets bid for a different result than the conversations this portfolio measures — the optimizer holds them and moves nothing.',
      actions: [
        { setting: 'objective', label: 'Change objective', primary: true },
        { setting: 'roster', label: 'Remove these ad sets', primary: false },
      ],
    });
  });

  it('FORMULARIOS, MENSAJES and Prueba have none', () => {
    for (const body of [formularios, mensajes, prueba]) {
      expect(read(body).header.mismatch).toBeNull();
    }
  });

  it('no report, no banner', () => {
    const portfolio = tours.portfolio as unknown as VitalsPortfolio;
    const header = buildHeroHeader({
      portfolio,
      lastCycleAt: null,
      growth: null,
      metric: getOptimizationMetricDefinition(portfolio.objective),
      currency: null,
    });
    expect(header.mismatch).toBeNull();
  });
});

describe('the edges the four bodies do not reach', () => {
  it('a stale portfolio says how long ago its last cycle was, in the product’s words', () => {
    const body = structuredClone(formularios) as unknown as { portfolio: Record<string, unknown> };
    body.portfolio.stale_for_days = 49;
    body.portfolio.last_actual_cycle_at = '2026-08-07T19:03:03.393+00:00';
    const { rows, header } = read(body);
    expect(header.freshness).toEqual({ text: 'last cycle 49 days ago', stale: true });
    expect(row(rows, 'cycle')).toMatchObject({
      value: '49',
      unit: 'days ago',
      tone: 'bad',
      reading: 'No cycle since Aug 7, 1:03 PM',
    });
  });

  it('half or more of the moves failing is its own sentence', () => {
    const body = structuredClone(formularios) as unknown as {
      latest_items: Array<{ apply_status: string | null }>;
    };
    const held = body.latest_items.find((item) => item.apply_status === 'held');
    if (held) held.apply_status = 'failed';
    expect(row(read(body).rows, 'cycle')).toMatchObject({
      tone: 'bad',
      reading: '5 of 9 moves failed',
    });
  });

  it('an unknown currency prints bare figures, never a dollar sign', () => {
    const { rows, header } = read(formularios, null);
    expect(row(rows, 'cost').value).toBe('45.69');
    expect(row(rows, 'cost').reading).toBe('+31% vs the 35.00 target');
    const text = JSON.stringify({ rows, header });
    expect(text).not.toContain('$');
  });

  it('a stopped autopilot offers the resume', () => {
    const body = structuredClone(formularios) as unknown as { portfolio: Record<string, unknown> };
    body.portfolio.autopilot_paused = true;
    const { header } = read(body);
    expect(header.mode).toEqual({ label: 'Stopped', tone: 'warn' });
    expect(header.secondary).toEqual({ kind: 'resume', label: 'Resume autopilot' });
  });
});
