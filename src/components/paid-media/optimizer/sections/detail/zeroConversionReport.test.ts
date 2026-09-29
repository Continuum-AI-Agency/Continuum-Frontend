import { describe, expect, it } from 'bun:test';
import { type CycleRunReport, getOptimizationMetricDefinition } from '@continuum/contracts';

import formularios from '../../__fixtures__/optimizer-status-formularios.json';
import tours from '../../__fixtures__/optimizer-status-tours.json';
import { parseReport } from '../../reportModel';
import { buildHeroView } from './heroModel';
import { buildPortfolioNews } from './news/newsModel';

// Two real optimizer-status bodies (anonymised) whose portfolios rendered as a "first cycle"
// with "Nothing worth changing today" while production held a ready brief and pending
// recommendations. Each carries at least one zero-conversion ad set, whose engine interval is
// { cpa: 0, lo: 0, hi: null, events: 0 } — and `hi: null` used to fail the whole report.

const recap = {
  source: 'daily',
  windowUsed: null,
  current: {
    spend: 3655,
    results: 80,
    impressions: 0,
    clicks: 0,
    costPerResult: 45.69,
    daysCovered: 14,
  },
  previous: {
    spend: 3400,
    results: 70,
    impressions: 0,
    clicks: 0,
    costPerResult: 48.57,
    daysCovered: 14,
  },
  series: [
    { date: '2026-09-24', spend: 280, results: 6 },
    { date: '2026-09-25', spend: 289, results: 7 },
  ],
  delta: { spend: 0.07, results: 0.14, costPerResult: -0.06 },
  vsTarget: null,
} as never;

function heroFor(body: unknown) {
  const report = parseReport(body as CycleRunReport);
  const raw = body as { portfolio: Record<string, unknown> };
  const view = buildHeroView({
    report,
    recap,
    flightPacing: null,
    metric: getOptimizationMetricDefinition('lead'),
    currency: 'USD',
    portfolio: raw.portfolio as never,
    target: null,
    window: 'd14',
    firstCycle: !report?.latest_run,
  });
  return { report, view };
}

describe('a real report carrying zero-conversion ad sets', () => {
  it('keeps the lead-forms portfolio whole: run, items, recommendations and brief', () => {
    const report = parseReport(formularios as unknown as CycleRunReport);
    expect(report?.latest_run).not.toBeNull();
    expect(report?.latest_items).toHaveLength(9);
    expect(report?.recommendations).toHaveLength(3);
    expect(report?.hero_brief).not.toBeNull();
    expect(report?.latest_items.some((item) => item.diagnostics?.ci?.hi === null)).toBe(true);
  });

  it('renders the lead-forms portfolio from the stored brief, not as a first cycle', () => {
    const { report, view } = heroFor(formularios);
    expect(view.state).toBe('ready');
    expect(view.source).toBe('brief');
    expect(view.brief.hero.headline).not.toContain('Nothing worth changing');
    const news = buildPortfolioNews({ view, items: report?.latest_items ?? [], target: null });
    expect(news.cards.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the tours portfolio on its run too', () => {
    const { report, view } = heroFor(tours);
    expect(report?.latest_run).not.toBeNull();
    expect(report?.latest_items).toHaveLength(12);
    expect(view.state).toBe('ready');
  });
});
