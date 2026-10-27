import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  type CycleRunReport,
  type EfficiencySeriesPoint,
  getOptimizationMetricDefinition,
  type PortfolioListItem,
} from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';

mock.module('motion/react', () => {
  const React = require('react');
  const passthrough = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { variants: _v, initial: _i, animate: _a, transition: _t, ...rest } = props;
      return React.createElement(tag, { ...rest, ref });
    });
  return {
    motion: {
      section: passthrough('section'),
      div: passthrough('div'),
      p: passthrough('p'),
      span: passthrough('span'),
    },
    useReducedMotion: () => true,
    useMotionValue: (v: number) => ({ get: () => v, set: () => undefined }),
    useMotionValueEvent: () => undefined,
    animate: () => ({ stop: () => undefined }),
  };
});
mock.module('../ApplyModePill', () => ({ ApplyModePill: () => null }));

import formularios from '../__fixtures__/optimizer-status-formularios.json';
import { parseReport } from '../reportModel';
import { buildPortfolioHeadline } from './detail/headlineModel';
import { buildHeroView } from './detail/heroModel';
import { PortfolioHero } from './detail/PortfolioHero';
import type { RecapModel } from './detail/recapModel';
import { PortfolioRowCard } from './PortfolioRowCard';
import { type PortfolioFigure, portfolioFigureFromReads } from './portfolioFigure';

afterEach(cleanup);

// The list row and the portfolio hero, rendered from the SAME reads through the SAME
// function: whatever the reads say, the row and the hero print one figure. The report is the
// real FORMULARIOS body (anonymised), whose stored brief belongs to its latest run — exactly
// the case where the hero used to print the brief's cycle-time figures as today's.

const report = parseReport(formularios as unknown as CycleRunReport);
const portfolio = {
  ...(formularios as { portfolio: Record<string, unknown> }).portfolio,
  adset_count: 2,
  pending_recommendations: 0,
} as unknown as PortfolioListItem;
const metric = getOptimizationMetricDefinition('lead');
const NOW = Date.parse('2026-10-26T15:00:00Z');

const metrics = (spend: number, leads: number) => ({
  spend,
  leads,
  purchases: 0,
  addToCarts: 0,
  clicks: 0,
  impressions: 0,
});
/** The live account read: two members and one ad set of another portfolio. */
const SNAPSHOTS = [
  { id: 'a', windows: { d3: metrics(0, 0), d7: metrics(612.4, 20), d14: metrics(1100, 37) } },
  { id: 'b', windows: { d3: metrics(0, 0), d7: metrics(377.15, 11), d14: metrics(700, 20) } },
  { id: 'other', windows: { d3: metrics(0, 0), d7: metrics(5000, 3), d14: metrics(9000, 5) } },
];
/** The last cycle, eleven days before NOW. */
const SERIES = [
  {
    cycle_ts: '2026-10-15T06:00:00Z',
    spend_d7: 1060,
    conv_d7: 31,
    spend_d14: 2000,
    conv_d14: 60,
  } as unknown as EfficiencySeriesPoint,
];
/** A recap over the page's range that disagrees with both reads, to prove it is not used. */
const RECAP = {
  source: 'daily',
  windowUsed: null,
  current: { spend: 1, results: 1, impressions: 0, clicks: 0, costPerResult: 1, daysCovered: 7 },
  previous: null,
  series: [],
  delta: { spend: null, results: null, costPerResult: null },
  vsTarget: null,
} as RecapModel;

function figureFrom(live: boolean): PortfolioFigure {
  const figure = portfolioFigureFromReads({
    portfolio,
    snapshots: live ? SNAPSHOTS : null,
    readAt: '2026-10-26T09:00:00Z',
    memberIds: ['a', 'b'],
    series: SERIES,
    now: NOW,
  });
  if (!figure) throw new Error('the reads priced no figure');
  return figure;
}

function mountRow(figure: PortfolioFigure) {
  return render(<PortfolioRowCard currency="USD" portfolio={portfolio} window={figure} />);
}

function mountHero(figure: PortfolioFigure | null) {
  const view = buildHeroView({
    report,
    recap: RECAP,
    flightPacing: null,
    metric,
    currency: 'USD',
    portfolio,
    target: 35,
    window: 'd7',
    firstCycle: false,
    figure,
  });
  const headline = buildPortfolioHeadline({
    view,
    report,
    portfolio,
    metric,
    currency: 'USD',
    mismatch: null,
    now: NOW,
  });
  return render(
    <PortfolioHero
      currency="USD"
      dailyTotal={324}
      explainHref="#"
      headline={headline}
      items={report?.latest_items ?? []}
      nextCycleAt={null}
      onCta={() => undefined}
      portfolioId={portfolio.id}
      view={view}
    />,
  );
}

const raw = (root: ParentNode, key: string) =>
  root.querySelector(`[data-figure="${key}"]`)?.getAttribute('data-figure-raw') ?? null;

/** "8% under" (row) and "−8%" (hero) as one signed whole percent. */
const rowPct = (text: string | null | undefined) => {
  const match = /^(\d+)% (over|under)$/.exec(text ?? '');
  return match ? Number(match[1]) * (match[2] === 'over' ? 1 : -1) : null;
};
const heroPct = (text: string | null | undefined) => {
  const match = /^([+−])(\d+)%$/.exec(text ?? '');
  return match ? Number(match[2]) * (match[1] === '+' ? 1 : -1) : null;
};

function readRow(figure: PortfolioFigure) {
  const { container } = mountRow(figure);
  const out = {
    cost: raw(container, `portfolio-row.${portfolio.id}.cost`),
    spend: raw(container, `portfolio-row.${portfolio.id}.spend`),
    pct: rowPct(container.querySelector('[data-testid="portfolio-state-chip"]')?.textContent),
    asOf: container.querySelector('[data-testid="portfolio-figure-as-of"]')?.textContent ?? null,
  };
  cleanup();
  return out;
}

function readHero(figure: PortfolioFigure | null) {
  const { container } = mountHero(figure);
  const out = {
    cost: raw(container, 'anchor.cost'),
    spend: raw(container, 'tiles.spend'),
    pct: heroPct(container.querySelector('[data-testid="anchor-vs-target"]')?.textContent),
    asOf: container.querySelector('[data-testid="anchor-as-of"]')?.textContent ?? null,
  };
  cleanup();
  return out;
}

describe('the list row and the portfolio hero print one figure', () => {
  it('agree on the live 7 days: spend, cost per result and distance to target', () => {
    const figure = figureFrom(true);
    expect(figure.source).toBe('live');
    const row = readRow(figure);
    const hero = readHero(figure);
    // 989.55 over 31 leads = 31.92 a lead against 35: 9% under.
    expect(row.spend).toBe('989.55');
    expect(row.cost).toBe(String(989.55 / 31));
    expect(row.pct).toBe(-9);
    expect(hero).toEqual(row);
    expect(row.asOf).toBeNull();
  });

  it('agree on the dated snapshot when the live read is missing, and both say how old it is', () => {
    const figure = figureFrom(false);
    expect(figure.source).toBe('snapshot');
    const row = readRow(figure);
    const hero = readHero(figure);
    expect(row.spend).toBe('1060');
    expect(row.asOf).toBe('as of Oct 15 · 11 days old');
    expect(hero).toEqual(row);
  });

  it('the hero no longer prints the stored brief’s cycle-time figures as current', () => {
    const briefOnly = readHero(null);
    const canonical = readHero(figureFrom(true));
    expect(briefOnly.spend).not.toBe(canonical.spend);
    expect(canonical.spend).toBe('989.55');
  });
});
