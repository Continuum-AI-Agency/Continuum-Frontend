import { afterEach, describe, expect, it, mock } from 'bun:test';
import { type CycleRunReport, getOptimizationMetricDefinition } from '@continuum/contracts';
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

import formularios from '../../__fixtures__/optimizer-status-formularios.json';
import { parseReport } from '../../reportModel';
import { buildHeroView } from './heroModel';
import { PortfolioHero } from './PortfolioHero';

afterEach(cleanup);

// The real FORMULARIOS // TODOS body (anonymised), rendered end to end: report → hero view →
// news → the card. Production drew "no results to divide by" under a pause of an ad set that
// bought 8 leads at 75.65 each, because the brief candidate's `results_per_day: null` was
// read as zero.
describe('the FORMULARIOS lead card, rendered from the real body', () => {
  const mount = () => {
    const report = parseReport(formularios as unknown as CycleRunReport);
    const view = buildHeroView({
      report,
      recap: {
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
        previous: null,
        series: [
          { date: '2026-09-24', spend: 280, results: 6 },
          { date: '2026-09-25', spend: 289, results: 7 },
        ],
        delta: { spend: null, results: null, costPerResult: null },
        vsTarget: null,
      } as never,
      flightPacing: null,
      metric: getOptimizationMetricDefinition('lead'),
      currency: 'USD',
      portfolio: (formularios as { portfolio: unknown }).portfolio as never,
      target: 35,
      window: 'd14',
      firstCycle: false,
    });
    return render(
      <PortfolioHero
        currency="USD"
        dailyTotal={324}
        explainHref="#"
        items={report?.latest_items ?? []}
        nextCycleAt={null}
        onCta={() => undefined}
        portfolioId="p1"
        view={view}
      />,
    );
  };

  it('draws the measured interval, never "no results to divide by"', () => {
    const { container } = mount();
    const lead = container.querySelector('[data-testid="portfolio-news-lead"]');
    const text = lead?.textContent ?? '';
    expect(text).toContain('Ad set A');
    expect(text).not.toContain('no results to divide by');
    expect(text).not.toContain('buying nothing');
    const readout = lead?.querySelector('[data-testid="interval-readout"]')?.textContent;
    expect(readout).toContain('75.65');
    expect(readout).toContain('between');
    expect(text).toContain('the whole interval sits above the target');
  });

  it('still says "buying nothing" of the ad set that measured zero conversions', () => {
    const { container } = mount();
    const dead = [...container.querySelectorAll('[data-testid="portfolio-news-insight"]')].find(
      (card) => card.textContent?.includes('Ad set B'),
    );
    expect(dead?.textContent).toContain('a day buying nothing');
  });
});
