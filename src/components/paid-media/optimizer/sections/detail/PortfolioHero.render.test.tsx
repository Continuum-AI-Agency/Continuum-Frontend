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

import type { CycleItemRow } from '@continuum/contracts';
import type { HeroView } from './heroModel';
import { PortfolioHero } from './PortfolioHero';

afterEach(cleanup);

const view = (over: Partial<HeroView> = {}): HeroView => ({
  state: 'ready',
  source: 'brief',
  series: [
    { date: '2026-09-17', spend: 830, results: 10 },
    { date: '2026-09-18', spend: 790, results: 10 },
    { date: '2026-09-19', spend: 740, results: 10 },
  ],
  recommendations: [],
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
  it('renders the band, the pacing pill, the headline, the money and the CTA', () => {
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
    // Every card draws a band; with no cycle rows and no evidence the lead's is the strip.
    const lead = container.querySelector('[data-testid="portfolio-news-lead"]');
    expect(lead?.querySelector('[data-testid="news-band"]')).toBeTruthy();
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

describe('PortfolioHero — every card draws its own evidence, never the formula', () => {
  const mount = (v: HeroView, items: CycleItemRow[] = []) =>
    render(
      <PortfolioHero
        currency="USD"
        dailyTotal={1000}
        explainHref="#"
        items={items}
        nextCycleAt={null}
        onCta={() => undefined}
        portfolioId="p1"
        view={v}
      />,
    );

  it('gives the lead AND the insight a band', () => {
    const { container } = mount(view());
    const cards = container.querySelectorAll(
      '[data-testid="portfolio-news-lead"], [data-testid="portfolio-news-insight"]',
    );
    expect(cards.length).toBe(2);
    for (const card of cards) {
      expect(
        card.querySelector('[data-testid="news-band"] [data-testid="news-visual"]'),
      ).toBeTruthy();
    }
  });

  it('never prints the engine’s impact basis in place of a picture', () => {
    const { container } = mount(view());
    expect(container.textContent).not.toContain('spend/day on the ad set');
  });

  it('draws the same ad set’s cycle numbers when the recommendation carries no evidence', () => {
    const { container } = mount(view(), [
      {
        adset_id: 'as-2',
        adset_name: 'Warm',
        current_budget: 50,
        final_budget: 50,
        change_abs: 0,
        diagnostics: { ci: { cpa: 60, lo: 45, hi: 90, events: 12 } },
      } as CycleItemRow,
    ]);
    const insight = container.querySelector('[data-testid="portfolio-news-insight"]');
    expect(insight?.querySelector('[data-testid="news-band"]')?.getAttribute('data-visual')).toBe(
      'range',
    );
    expect(insight?.textContent).toContain('est. $60.00');
    expect(insight?.textContent).toContain('target $70.00');
  });

  it('keeps the growth sentence visible under the row', () => {
    const { container } = mount(view());
    expect(container.textContent).toContain('cost per result');
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

describe('PortfolioHero — the Ask Jaina band sits between the vitals and the news', () => {
  it('renders askJaina after the vitals and before the news row', () => {
    const { container } = render(
      <PortfolioHero
        askJaina={<div data-testid="jaina-entry-chips" />}
        currency="USD"
        dailyTotal={1000}
        explainHref="#"
        nextCycleAt={null}
        onCta={() => undefined}
        portfolioId="p1"
        view={view()}
        vitals={{
          header: {
            name: 'Leads MX',
            mode: null,
            freshness: null,
            roster: null,
            chips: [],
            mismatch: null,
            secondary: null,
          },
          rows: null,
          onEditSetting: () => undefined,
          onSecondary: () => undefined,
          onRun: () => undefined,
          running: false,
        }}
      />,
    );
    const hero = container.querySelector('[data-testid="portfolio-hero"]');
    const vitals = hero?.querySelector('[data-testid="portfolio-vitals"]');
    const chips = hero?.querySelector('[data-testid="jaina-entry-chips"]');
    const newsRow = hero?.querySelector('[data-testid="portfolio-news-row"]');
    expect(vitals && chips && newsRow).toBeTruthy();
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(vitals as Element, chips as Element)).toBe(true);
    expect(follows(chips as Element, newsRow as Element)).toBe(true);
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
