import { afterEach, describe, expect, it, mock } from 'bun:test';
import { type CycleRunReport, getOptimizationMetricDefinition } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';

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

import mensajes from '../../../../../../packages/contracts/src/optimization/fixtures/optimizer-status-mensajes.json';
import formularios from '../../__fixtures__/optimizer-status-formularios.json';
import prueba from '../../__fixtures__/optimizer-status-prueba.json';
import tours from '../../__fixtures__/optimizer-status-tours.json';
import { parseReport } from '../../reportModel';
import { buildHeroView } from './heroModel';
import { PortfolioHero } from './PortfolioHero';
import type { HeroSetting } from './vitalsModel';
import { buildHeroHeader, buildVitals, type VitalsPortfolio } from './vitalsModel';

afterEach(cleanup);

// The whole hero, rendered from each real optimizer-status body: report → hero view → vital
// signs → the page. The currency is null, as it is on every one of these accounts.

const BODIES = { formularios, mensajes, prueba, tours } as const;

function mount(body: unknown, handlers: { edits?: HeroSetting[]; runs?: number[] } = {}) {
  const report = parseReport(body as CycleRunReport);
  if (!report?.latest_run) throw new Error('fixture has no run');
  const portfolio = (body as { portfolio: unknown }).portfolio as VitalsPortfolio;
  const metric = getOptimizationMetricDefinition(portfolio.objective);
  const view = buildHeroView({
    report,
    recap: {
      source: 'daily',
      windowUsed: null,
      current: {
        spend: 0,
        results: 0,
        impressions: 0,
        clicks: 0,
        costPerResult: null,
        daysCovered: 14,
      },
      previous: null,
      series: [],
      delta: { spend: null, results: null, costPerResult: null },
      vsTarget: null,
    } as never,
    flightPacing: null,
    metric,
    currency: null,
    portfolio: portfolio as never,
    target: portfolio.cpa_target ?? null,
    window: 'd14',
    firstCycle: false,
  });
  const growth = view.brief.growth;
  return render(
    <PortfolioHero
      currency={null}
      dailyTotal={portfolio.daily_total ?? null}
      explainHref="#"
      items={report.latest_items}
      nextCycleAt={portfolio.next_realloc_at}
      onCta={() => undefined}
      portfolioId="p1"
      view={view}
      vitals={{
        header: buildHeroHeader({
          report,
          portfolio,
          lastCycleAt: report.latest_run.cycle_ts,
          growth,
          metric,
          currency: null,
        }),
        rows: buildVitals({ report, growth, portfolio, metric, currency: null }),
        onEditSetting: (setting) => handlers.edits?.push(setting),
        onSecondary: () => undefined,
        onRun: () => handlers.runs?.push(1),
        running: false,
      }}
    />,
  );
}

describe('PortfolioHero — the vital signs from each real body', () => {
  for (const [name, body] of Object.entries(BODIES)) {
    it(`${name}: six rows in the fixed order, above the news`, () => {
      const { container } = mount(body);
      const rows = [...container.querySelectorAll('[data-testid="vital-row"]')].map((row) =>
        row.getAttribute('data-vital'),
      );
      expect(rows).toEqual(['cost', 'results', 'spend', 'confidence', 'cycle', 'pending']);
      const hero = container.querySelector('[data-testid="portfolio-hero"]');
      const vitals = container.querySelector('[data-testid="portfolio-vitals"]');
      expect(hero?.firstElementChild?.contains(vitals ?? null)).toBe(true);
      expect(container.querySelector('[data-testid="portfolio-news-row"]')).toBeTruthy();
    });

    it(`${name}: never prints a dollar sign for an unknown currency`, () => {
      const { container } = mount(body);
      const vitals = container.querySelector('[data-testid="portfolio-vitals"]');
      expect(vitals?.textContent).not.toContain('$');
    });

    it(`${name}: uses no micro type anywhere in the vital signs`, () => {
      const { container } = mount(body);
      const vitals = container.querySelector('[data-testid="portfolio-vitals"]');
      const tiny = [...(vitals?.querySelectorAll('*') ?? [])].filter((node) =>
        /\btext-(2|3)xs\b/.test(node.getAttribute('class') ?? ''),
      );
      expect(tiny).toEqual([]);
    });
  }

  it('FORMULARIOS reads the way the model says, row by row', () => {
    const { container } = mount(formularios);
    const readings = [...container.querySelectorAll('[data-testid="vital-reading"]')].map(
      (node) => node.textContent,
    );
    expect(readings[0]).toBe('+31% vs the 35.00 target');
    expect(readings[4]).toBe('4 of 9 moved · 4 failed, 1 held');
    const cost = container.querySelector('[data-vital="cost"]');
    expect(cost?.getAttribute('data-tone')).toBe('bad');
    expect(cost?.querySelector('[data-testid="vital-fill"]')).toBeTruthy();
    const outcome = container.querySelector('[data-testid="vital-outcome"]');
    expect(outcome?.getAttribute('aria-label')).toBe('4 applied, 4 failed, 1 held of 9');
  });

  it('Tours draws the cost scale with no fill: nothing has been bought', () => {
    const { container } = mount(tours);
    const cost = container.querySelector('[data-vital="cost"]');
    expect(cost?.textContent).toContain('—');
    expect(cost?.querySelector('[data-testid="vital-bullet"]')).toBeTruthy();
    expect(cost?.querySelector('[data-testid="vital-fill"]')).toBeNull();
  });

  it('Tours: a warning says all 12 bid for a different result, and the CTA opens the objective', () => {
    const edits: HeroSetting[] = [];
    const { container, getByText } = mount(tours, { edits });
    const banner = container.querySelector('[data-testid="vitals-mismatch"]');
    expect(banner?.getAttribute('data-scope')).toBe('all');
    expect(banner?.textContent).toContain(
      'All 12 ad sets bid for a different result than the conversations this portfolio measures — the optimizer holds them and moves nothing.',
    );
    const vitals = container.querySelector('[data-testid="portfolio-vitals"]');
    const rows = container.querySelector('[data-testid="vitals-rows"]');
    expect(vitals?.contains(banner ?? null)).toBe(true);
    // Under the name and chips, above the six rows.
    expect(
      banner && rows ? banner.compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING : 0,
    ).toBeTruthy();
    fireEvent.click(getByText('Change objective'));
    fireEvent.click(getByText('Remove these ad sets'));
    expect(edits).toEqual(['objective', 'roster']);
  });

  it('FORMULARIOS and MENSAJES draw no mismatch banner', () => {
    for (const body of [formularios, mensajes]) {
      const { container, unmount } = mount(body);
      expect(container.querySelector('[data-testid="vitals-mismatch"]')).toBeNull();
      unmount();
    }
  });

  it('a chip opens its setting and Run now runs', () => {
    const edits: HeroSetting[] = [];
    const runs: number[] = [];
    const { container, getByText } = mount(prueba, { edits, runs });
    const target = container.querySelector('[data-setting="target"]');
    if (!target) throw new Error('no target chip');
    fireEvent.click(target);
    fireEvent.click(getByText('Run now'));
    expect(edits).toEqual(['target']);
    expect(runs).toEqual([1]);
    expect(getByText('Review moves')).toBeTruthy();
  });
});
