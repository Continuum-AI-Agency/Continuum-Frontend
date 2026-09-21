import { afterEach, describe, expect, it, mock } from 'bun:test';
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
      // CalmRule — the shared 5s rhythm imported from ../account/candidateHeadline.
      span: passthrough('span'),
    },
    useReducedMotion: () => true,
    useMotionValue: (v: number) => ({ get: () => v, set: () => undefined }),
    useMotionValueEvent: () => undefined,
    animate: () => ({ stop: () => undefined }),
  };
});

import type { HeroView } from './heroModel';
import { PortfolioHero } from './PortfolioHero';

afterEach(cleanup);

const view = (over: Partial<HeroView> = {}): HeroView => ({
  state: 'ready',
  source: 'brief',
  chart: {
    shape: 'rates',
    unit: 'currency',
    points: [
      { t: '2026-09-17', a: 83, b: 70 },
      { t: '2026-09-18', a: 79, b: 70 },
      { t: '2026-09-19', a: 74, b: 70 },
    ],
    a_label: 'Cost per lead',
    b_label: 'Target',
    projected_from: null,
    gap_per_day: 120,
  },
  chartReading: 'cost per result across the window, against the target',
  tiles: [
    {
      key: 'spend',
      label: 'Spend',
      value: 3640,
      format: 'currency',
      delta: 0.21,
      goodWhenDown: false,
      series: [500, 520],
      note: null,
    },
    {
      key: 'results',
      label: 'Leads',
      value: 47,
      format: 'count',
      delta: 0.34,
      goodWhenDown: false,
      series: [6, 7],
      note: null,
    },
    {
      key: 'cost',
      label: 'Cost per lead',
      value: 77.45,
      format: 'currency',
      delta: -0.1,
      goodWhenDown: true,
      series: [83, 74],
      note: '11% over target',
    },
  ],
  pacingLine: 'On pace · day 12 of 30',
  pacingTone: 'success',
  brief: {
    version: 1,
    growth: {
      spend: 3640,
      results: 47,
      cost_per_result: 77.45,
      target: 70,
      deltas: { spend: 0.21, results: 0.34, cost_per_result: -0.1 },
      pacing: { status: 'on_track', ratio: 1.01, note: null },
      scale: null,
      window: 'd7',
      as_of: '2026-09-19T06:10:00Z',
      currency: 'USD',
      result_label: 'leads',
    },
    hero: {
      module: 'pause',
      candidate_id: 'rec:1',
      headline: 'Stop $120/day going to Dead, an ad set with no leads',
      why: 'No leads in 7 days.',
      impact_per_day: 120,
      impact_unit: 'currency',
      impact_basis: 'spend/day on the ad set',
      justification: null,
      confidence_note: null,
      cta: { kind: 'queue_row', target_id: 'rec:1' },
    },
    growth_sentence: 'Leads +34% · cost per result -10% · 11% over target · on track',
    candidates: [
      {
        id: 'rec:2',
        module: 'creative',
        kind: 'variate_creative',
        trigger: null,
        adset_id: 'as-2',
        adset_name: 'Warm',
        impact_per_day: 40,
        impact_unit: 'currency',
        results_per_day: null,
        impact_basis: 'b',
        reason: null,
        cta: { kind: 'queue_row', target_id: 'rec:2' },
      },
    ],
    secondary: ['rec:2'],
    prompt_version: 'v1',
    model: 'gemini-2.5-flash',
    generated_at: '2026-09-19T06:15:00Z',
  },
  cta: { kind: 'queue_row', rowKey: 'rec:1', label: 'Review the pause' },
  observe: false,
  asOf: '2026-09-19T06:10:00Z',
  ...over,
});

describe('PortfolioHero', () => {
  it('renders the chart, the pacing pill, the headline, the money and the CTA', () => {
    const clicks: string[] = [];
    const { container, getByText } = render(
      <PortfolioHero
        currency="USD"
        explainHref="/scale?tab=jaina"
        nextCycleAt={null}
        onCta={(cta) => clicks.push(cta.rowKey ?? cta.kind)}
        dailyTotal={1000}
        portfolioId="p1"
        view={view()}
      />,
    );
    const text = container.textContent ?? '';
    // The three tiles were REPLACED by one chart on purpose — $3,640 was the spend tile.
    // What has to survive is the growth read itself, which the sentence still carries.
    expect(container.querySelector('[data-testid="hero-chart"]')).toBeTruthy();
    expect(text).toContain('cost per result across the window');
    // 47 was the results TILE. The tiles are gone; the growth sentence carries the read as
    // direction against target rather than as three absolute numbers, which was the trade the
    // design made deliberately when it chose one chart over three frozen figures.
    expect(text).toContain('+34%');
    expect(text).toContain('11% over target');
    expect(text).toContain('On pace · day 12 of 30');
    expect(text).toContain('Stop $120/day going to Dead');
    expect(text).toContain('$120/day');
    // "Also worth a look" was a trailing sentence of names. The secondary candidates are
    // now insight cards in the same vocabulary as the lead, so the assertion is on the card.
    const insights = container.querySelectorAll('[data-testid="portfolio-news-insight"]');
    expect(insights.length).toBe(1);
    expect(insights[0]?.textContent).toContain('Creative on Warm');
    fireEvent.click(getByText('Review the pause'));
    expect(clicks).toEqual(['rec:1']);
  });
  it('marks a deterministic brief as a draft read and shows the first-cycle placeholder', () => {
    const draft = view();
    draft.brief = { ...draft.brief, model: 'deterministic' };
    const { container } = render(
      <PortfolioHero
        currency="USD"
        explainHref="#"
        nextCycleAt={null}
        onCta={() => undefined}
        dailyTotal={1000}
        portfolioId="p1"
        view={draft}
      />,
    );
    expect(container.textContent).toContain('draft read');
    cleanup();
    const first = render(
      <PortfolioHero
        currency="USD"
        explainHref="#"
        nextCycleAt={null}
        onCta={() => undefined}
        dailyTotal={1000}
        portfolioId="p1"
        view={view({ state: 'first_cycle' })}
      />,
    );
    expect(first.container.textContent).toContain('first read after the first cycle');
  });
});

describe('PortfolioHero — the chart is the growth read, or nothing', () => {
  it('draws the chart it was given', () => {
    const { container } = render(
      <PortfolioHero
        currency="USD"
        dailyTotal={1000}
        explainHref="#"
        nextCycleAt={null}
        onCta={() => undefined}
        portfolioId="p1"
        view={view()}
      />,
    );
    const host = container.querySelector('[data-testid="hero-chart"]');
    expect(host?.querySelector('svg')).toBeTruthy();
  });

  it('says so plainly when the window cannot be drawn, instead of drawing nothing', () => {
    const { container } = render(
      <PortfolioHero
        currency="USD"
        dailyTotal={1000}
        explainHref="#"
        nextCycleAt={null}
        onCta={() => undefined}
        portfolioId="p1"
        view={view({ chart: null, chartReading: null })}
      />,
    );
    expect(container.textContent).toContain('Not enough priced days');
    expect(container.querySelector('[data-testid="hero-chart"] svg')).toBeNull();
  });

  it('keeps the growth sentence visible either way — that was a deliberate decision', () => {
    const { container } = render(
      <PortfolioHero
        currency="USD"
        dailyTotal={1000}
        explainHref="#"
        nextCycleAt={null}
        onCta={() => undefined}
        portfolioId="p1"
        view={view({ chart: null, chartReading: null })}
      />,
    );
    expect(container.textContent).toContain('cost per result');
  });
});

describe('PortfolioHero — a chart with no dates of its own still says when', () => {
  const interval = view({
    chart: {
      shape: 'interval',
      unit: 'currency',
      estimate: null,
      low: 120,
      high: 240,
      reference: 70,
      reference_label: 'target',
      at_stake_per_day: 120,
      no_results: true,
    },
    chartReading: 'what it spent, against the line it had to beat',
  });

  it('names the cycle that produced the figure, because the interval carries no window', () => {
    const { container } = render(
      <PortfolioHero
        currency="USD"
        dailyTotal={1000}
        explainHref="#"
        nextCycleAt={null}
        onCta={() => undefined}
        portfolioId="p1"
        view={interval}
      />,
    );
    expect(container.textContent).toContain('what it spent, against the line it had to beat');
    expect(container.textContent).toContain('as of ');
  });

  it('leaves the rates chart alone — its own x axis already carries the window', () => {
    const { container } = render(
      <PortfolioHero
        currency="USD"
        dailyTotal={1000}
        explainHref="#"
        nextCycleAt={null}
        onCta={() => undefined}
        portfolioId="p1"
        view={view()}
      />,
    );
    const host = container.querySelector('[data-testid="hero-chart"]');
    expect(host?.textContent).not.toContain('as of ');
    expect(host?.textContent).toContain('Sep 19');
  });
});
