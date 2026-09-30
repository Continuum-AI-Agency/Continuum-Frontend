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
import { buildHeroHeader, type HeroPortfolio } from './heroHeaderModel';

// The four real optimizer-status bodies of Sep 25 (anonymised; Prueba rebuilt from its own
// figures on the FORMULARIOS shape), read the way the portfolio page reads them.

const MEXICO = 'America/Mexico_City';

type Body = typeof formularios;

function read(body: unknown, currency: string | null = 'MXN') {
  const report = parseReport(body as CycleRunReport);
  if (!report) throw new Error('fixture did not parse');
  const brief = readPortfolioBrief(report.hero_brief);
  if (!brief) throw new Error('fixture has no brief');
  const portfolio = (body as Body).portfolio as unknown as HeroPortfolio;
  const metric = getOptimizationMetricDefinition(portfolio.objective);
  return buildHeroHeader({
    report,
    portfolio,
    lastCycleAt: report.latest_run?.cycle_ts ?? null,
    growth: brief.growth,
    metric,
    currency,
    timeZone: MEXICO,
  });
}

describe('FORMULARIOS — the header names the mode, the freshness and every fact', () => {
  const header = read(formularios);

  it('reads the name, the mode, the roster size and when the cycle ran', () => {
    expect(header.name).toBe('Lead forms portfolio');
    expect(header.mode).toEqual({ label: 'Autopilot', tone: 'good' });
    expect(header.freshness?.stale).toBe(false);
    expect(header.freshness?.text).toBe('Updated Sep 25, 1:03 PM');
    expect(header.adsets).toBe('9 ad sets');
  });

  it('lists the fixed facts as chips, objective first, each opening its Manage field', () => {
    expect(header.chips.map((c) => [c.setting, c.label, c.value])).toEqual([
      ['objective', 'Objective', 'leads'],
      ['budget', 'Budget', '324 MXN/day · follows spend'],
      ['target', 'Target', '35.00 MXN / lead'],
      ['window', 'Window', '14 days'],
      ['strategy', 'Strategy', 'Balanced'],
    ]);
  });

  it('offers the stop while autopilot runs', () => {
    expect(header.secondary).toEqual({ kind: 'stop', label: 'Stop autopilot' });
  });
});

describe('Prueba — Recommend mode offers the review instead of the stop', () => {
  const header = read(prueba);
  it('names the mode and the review', () => {
    expect(header.mode).toEqual({ label: 'Recommend', tone: 'line' });
    expect(header.secondary).toEqual({ kind: 'review', label: 'Review moves' });
  });
});

describe('the goal mismatch in the header', () => {
  it('Tours: all 12 bid for a different result — change the objective, or remove them', () => {
    expect(read(tours).mismatch).toEqual({
      scope: 'all',
      mismatched: 12,
      total: 12,
      bought: null,
      measures: 'conversations',
      actions: [
        { setting: 'objective', label: 'Change objective', primary: true },
        { setting: 'roster', label: 'Remove these ad sets', primary: false },
      ],
    });
  });

  it('FORMULARIOS, MENSAJES and Prueba have none', () => {
    for (const body of [formularios, mensajes, prueba]) {
      expect(read(body).mismatch).toBeNull();
    }
  });

  it('no report, no mismatch', () => {
    const portfolio = tours.portfolio as unknown as HeroPortfolio;
    const header = buildHeroHeader({
      portfolio,
      lastCycleAt: null,
      growth: null,
      metric: getOptimizationMetricDefinition(portfolio.objective),
      currency: null,
    });
    expect(header.mismatch).toBeNull();
    expect(header.freshness).toBeNull();
  });
});

describe('the edges the four bodies do not reach', () => {
  it('a stale portfolio says how long ago its last cycle was', () => {
    const body = structuredClone(formularios) as unknown as { portfolio: Record<string, unknown> };
    body.portfolio.stale_for_days = 49;
    body.portfolio.last_actual_cycle_at = '2026-08-07T19:03:03.393+00:00';
    expect(read(body).freshness).toEqual({ text: 'last cycle 49 days ago', stale: true });
  });

  it('a portfolio that never had a cycle says so', () => {
    const body = structuredClone(formularios) as unknown as { portfolio: Record<string, unknown> };
    body.portfolio.stale_for_days = 3;
    body.portfolio.last_actual_cycle_at = null;
    expect(read(body).freshness).toEqual({ text: 'no cycle in 3 days', stale: true });
  });

  it('an unknown currency prints bare figures, never a dollar sign', () => {
    const header = read(formularios, null);
    expect(header.chips.find((c) => c.setting === 'target')?.value).toBe('35.00 / lead');
    expect(JSON.stringify(header)).not.toContain('$');
  });

  it('a stopped autopilot offers the resume', () => {
    const body = structuredClone(formularios) as unknown as { portfolio: Record<string, unknown> };
    body.portfolio.autopilot_paused = true;
    const header = read(body);
    expect(header.mode).toEqual({ label: 'Stopped', tone: 'warn' });
    expect(header.secondary).toEqual({ kind: 'resume', label: 'Resume autopilot' });
  });

  it('a fixed budget says so, and a missing one says it is unset', () => {
    const fixed = structuredClone(formularios) as unknown as { portfolio: Record<string, unknown> };
    fixed.portfolio.budget_source = 'fixed';
    expect(read(fixed).chips.find((c) => c.setting === 'budget')?.value).toBe(
      '324 MXN/day · fixed',
    );
    const none = structuredClone(formularios) as unknown as { portfolio: Record<string, unknown> };
    none.portfolio.daily_total = null;
    none.portfolio.cpa_target = null;
    const chips = read(none).chips;
    expect(chips.find((c) => c.setting === 'budget')?.value).toBe('not set');
    expect(chips.find((c) => c.setting === 'target')?.value).toBe('not set');
  });
});
