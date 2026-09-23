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

describe('the lead card and its chart have to be about the same thing', () => {
  /** A hero the news model can actually build a headline for: a pause that bought nothing. */
  const withPauseCandidate = (over: Partial<HeroView> = {}): HeroView => {
    const base = view();
    return view({
      brief: {
        ...base.brief,
        candidates: [
          ...base.brief.candidates,
          {
            id: 'rec:1',
            module: 'pause',
            kind: 'pause',
            trigger: null,
            adset_id: 'as-1',
            adset_name: 'Dead',
            impact_per_day: 120,
            impact_unit: 'currency',
            results_per_day: 0,
            impact_basis: 'spend/day on the ad set',
            reason: null,
            cta: { kind: 'queue_row', target_id: 'rec:1' },
          },
        ],
      },
      ...over,
    });
  };

  const mount = (v: HeroView) =>
    render(
      <PortfolioHero
        currency="USD"
        dailyTotal={1000}
        explainHref="/scale?tab=jaina"
        nextCycleAt={null}
        onCta={() => undefined}
        portfolioId="p1"
        view={v}
      />,
    );

  it('shows nothing at all — not even a placeholder — when the chart is about something else', () => {
    // The default `view()` chart is the portfolio's cost per result across the window. The
    // card now leads with "$120 a day buying nothing". Both true, neither about the other.
    const { container } = mount(withPauseCandidate());
    expect(container.textContent).toContain('$120');
    expect(container.querySelector('[data-testid="hero-chart"]')).toBeNull();
    // And no apology for the missing chart: the sentence was always meant to be enough.
    expect(container.textContent).not.toContain('Not enough priced days');
  });

  it('draws the chart when it reaches the figure the card leads with', () => {
    const { container } = mount(
      withPauseCandidate({
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
      }),
    );
    expect(container.querySelector('[data-testid="hero-chart"]')).toBeTruthy();
    expect(container.textContent).toContain('what it spent');
  });

  it('still says so when there was no chart to draw in the first place', () => {
    const { container } = mount(withPauseCandidate({ chart: null, chartReading: null }));
    expect(container.textContent).toContain('Not enough priced days');
  });
});

describe('the day’s news is one row, highest impact on the left', () => {
  const candidate = (
    id: string,
    module: 'pause' | 'budget' | 'creative',
    impact: number,
    name: string,
  ) => ({
    id,
    module,
    kind: module === 'budget' ? 'budget_move' : module,
    trigger: null,
    adset_id: `as-${id}`,
    adset_name: name,
    impact_per_day: impact,
    impact_unit: 'currency' as const,
    results_per_day: null,
    impact_basis: 'spend/day',
    reason: null,
    cta: { kind: 'queue_row' as const, target_id: id },
  });

  /** Easy Fit, FORMULARIOS // TODOS, 2026-09-22: a pause hero, a second pause, a budget move. */
  const threeCards = () =>
    view({
      brief: {
        ...view().brief,
        hero: {
          ...view().brief.hero,
          candidate_id: 'rec:aleira',
          headline: 'Stop 28.68/day going to ALEIRA // AGOSTO - LKL with no leads',
          impact_per_day: 28.68,
        },
        candidates: [
          candidate('rec:aleira', 'pause', 28.68, 'ALEIRA // AGOSTO - LKL'),
          candidate('rec:iteso', 'pause', 28.34, 'ITESO // AGOSTO - BROAD'),
          candidate('budget:portfolio', 'budget', 6.52, 'ITESO // AGOSTO - RTG'),
        ],
        secondary: ['rec:iteso', 'budget:portfolio'],
      },
      cta: { kind: 'queue_row', rowKey: 'rec:aleira', label: 'Review the pause' },
    });

  const mount = (v: HeroView) =>
    render(
      <PortfolioHero
        currency="USD"
        dailyTotal={324}
        explainHref="/scale?tab=jaina"
        nextCycleAt={null}
        onCta={() => undefined}
        portfolioId="p1"
        view={v}
      />,
    );

  const cellsOf = (container: HTMLElement) => [
    ...container.querySelectorAll(
      '[data-testid="portfolio-news-row"] [data-testid="portfolio-news-cell"]',
    ),
  ];

  it('fills the row in the brief’s ranking, three across, every card in the same frame', () => {
    const { container } = mount(threeCards());
    const cells = cellsOf(container);
    expect(
      cells.map((c) =>
        c.textContent?.includes('ALEIRA')
          ? 'aleira'
          : c.textContent?.includes('BROAD')
            ? 'iteso'
            : 'budget',
      ),
    ).toEqual(['aleira', 'iteso', 'budget']);
    const row = container.querySelector('[data-testid="portfolio-news-row"]');
    expect(row?.className).toContain('@[56rem]/news:grid-cols-3');
    expect(row?.className).toContain('@[36rem]/news:grid-cols-2');
    const frames = [...container.querySelectorAll('article')].map((a) => a.className);
    for (const frame of frames) {
      expect(frame).toContain('h-full');
      expect(frame).toContain('w-full');
      expect(frame).not.toContain('max-w-[');
    }
  });

  it('puts the maximum to the left of a lead Jaina chose over it', () => {
    const v = threeCards();
    v.brief = {
      ...v.brief,
      hero: {
        ...v.brief.hero,
        candidate_id: 'rec:iteso',
        headline: 'Stop 28.34/day going to ITESO // AGOSTO - BROAD',
        impact_per_day: 28.34,
        justification: 'ALEIRA is already scheduled to end tomorrow.',
      },
      secondary: ['rec:aleira', 'budget:portfolio'],
    };
    const { container } = mount(v);
    const cells = cellsOf(container);
    expect(cells[0]?.querySelector('[data-testid="portfolio-news-insight"]')).toBeTruthy();
    expect(cells[0]?.textContent).toContain('ALEIRA');
    expect(cells[1]?.querySelector('[data-testid="portfolio-news-lead"]')).toBeTruthy();
    expect(cells[1]?.textContent).toContain('Chosen over the biggest number');
  });

  it('keeps the recap as the row’s footer when the row is full', () => {
    const { container } = mount(threeCards());
    const recap = container.querySelector('[data-testid="portfolio-news-recap"]');
    expect(recap?.getAttribute('data-placement')).toBe('footer');
    expect(recap?.closest('[data-testid="portfolio-news-row"]')).toBeNull();
    // Footer, not caption: the row comes first in the document.
    const row = container.querySelector('[data-testid="portfolio-news-row"]');
    expect(
      row && recap ? row.compareDocumentPosition(recap) & Node.DOCUMENT_POSITION_FOLLOWING : 0,
    ).toBeTruthy();
  });

  it('sits the recap beside a single card, spanning the columns it left empty', () => {
    const { container } = mount(
      view({ brief: { ...view().brief, candidates: [], secondary: [] } }),
    );
    expect(cellsOf(container).length).toBe(1);
    const recap = container.querySelector('[data-testid="portfolio-news-recap"]');
    expect(recap?.getAttribute('data-placement')).toBe('beside');
    expect(recap?.closest('[data-testid="portfolio-news-row"]')).not.toBeNull();
    expect(recap?.className).toContain('@[56rem]/news:col-span-2');
  });

  it('holds a fourth card behind "1 more finding" instead of stranding it on a second row', () => {
    const v = threeCards();
    v.brief = {
      ...v.brief,
      candidates: [...v.brief.candidates, candidate('rec:warm', 'creative', 4, 'Warm')],
      secondary: ['rec:iteso', 'budget:portfolio', 'rec:warm'],
    };
    const { container } = mount(v);
    expect(cellsOf(container).length).toBe(3);
    const more = container.querySelector('[data-testid="portfolio-news-more"]');
    expect(more?.textContent).toContain('1 more finding');
    expect(more?.textContent).toContain('Warm');
  });
});

describe('PortfolioHero — a stale portfolio is promised an attempt, not a cycle', () => {
  const mount = (stale: boolean | undefined) =>
    render(
      <PortfolioHero
        currency="USD"
        dailyTotal={1000}
        explainHref="/scale?tab=jaina"
        nextCycleAt="2026-09-24T06:00:00Z"
        onCta={() => undefined}
        portfolioId="p1"
        stale={stale}
        view={view({ asOf: '2026-08-05T06:10:00Z' })}
      />,
    );

  it('calls next_realloc_at the next cycle on a fresh portfolio, and by default', () => {
    expect(mount(undefined).container.textContent).toMatch(/next cycle Sep 2[34]/);
    cleanup();
    expect(mount(false).container.textContent).toMatch(/next cycle Sep 2[34]/);
  });

  it('calls it the next attempt once a cycle has been missed', () => {
    const text = mount(true).container.textContent ?? '';
    expect(text).toMatch(/As of Aug [45].* · next attempt Sep 2[34]/);
    expect(text).not.toContain('next cycle');
  });
});
