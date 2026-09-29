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

import type { CycleItemRow, ResolvedRange } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { resultWords } from '../account/overviewModel';
import { buildBeforeAfter } from './beforeAfterModel';
import { buildPortfolioHeadline } from './headlineModel';
import { buildHeroHeader, type HeroPortfolio, type HeroSetting } from './heroHeaderModel';
import type { HeroView } from './heroModel';
import { type RealBodyName, readBody } from './news/realBodies.fixture';
import { PortfolioHero, type PortfolioHeroProps } from './PortfolioHero';
import type { RecapModel } from './recapModel';

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

describe('PortfolioHero — the cards', () => {
  it('renders the lead, its money, the insight and the CTA', () => {
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
    expect(text).toContain('Stop $120/day going to Dead');
    expect(text).toContain('$120/day');
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
    expect(first.container.textContent).toContain('primera lectura después del primer ciclo');
  });

  it('no longer prints the growth sentence under the row — the headline says it', () => {
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
    expect(container.querySelector('[data-testid="portfolio-news-recap"]')).toBeNull();
    expect(container.textContent).not.toContain('11% over target');
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

// ── The whole hero, from a real body ──────────────────────────────────────────
// report → hero view → header, headline, before/after → the page, in the order the redesign
// fixed: the name line, the Jaina panel, the two sentences and the tiles, the strip, the cards.

const MEXICO = 'America/Mexico_City';

const range: ResolvedRange = {
  spec: { kind: 'preset', preset: 'd7' },
  from: '2026-09-21',
  to: '2026-09-27',
  days: 7,
  label: 'Last 7 days',
  previous: { from: '2026-09-14', to: '2026-09-20' },
  lookback: 'd7',
  window: 'd7',
  flightMissing: false,
};

const recap: RecapModel = {
  source: 'daily',
  windowUsed: null,
  current: {
    spend: 2161,
    results: 56,
    impressions: 0,
    clicks: 0,
    costPerResult: 38.59,
    daysCovered: 7,
  },
  previous: {
    spend: 1763,
    results: 30,
    impressions: 0,
    clicks: 0,
    costPerResult: 58.78,
    daysCovered: 7,
  },
  series: [],
  delta: { spend: 0.23, results: 0.87, costPerResult: -0.34 },
  vsTarget: 0.1,
};

function wholeHero(
  name: RealBodyName,
  handlers: {
    edits?: HeroSetting[];
    runs?: number[];
    asks?: string[];
    over?: Partial<PortfolioHeroProps>;
  } = {},
) {
  const { report, view: v, dailyTotal } = readBody(name);
  const portfolio = report.portfolio as unknown as HeroPortfolio & {
    id: string;
    name: string;
  };
  const metric = getOptimizationMetricDefinition(portfolio.objective);
  const header = buildHeroHeader({
    report,
    portfolio,
    lastCycleAt: report.latest_run?.cycle_ts ?? null,
    growth: v.brief.growth,
    metric,
    currency: null,
    timeZone: MEXICO,
  });
  const headline = buildPortfolioHeadline({
    view: v,
    report,
    portfolio: { name: portfolio.name, daily_total: dailyTotal, apply_mode: portfolio.apply_mode },
    metric,
    currency: null,
    mismatch: header.mismatch,
    now: Date.parse('2026-09-25T21:04:40Z'),
  });
  const beforeAfter = buildBeforeAfter({
    report,
    recap,
    range,
    events: [],
    snapshots: [],
    enrolledIds: report.latest_items.map((item) => item.adset_id),
    metric,
    target: portfolio.cpa_target ?? null,
    timeZone: MEXICO,
  });
  return render(
    <PortfolioHero
      beforeAfter={{
        model: beforeAfter,
        currency: null,
        words: resultWords(metric.kpiField, metric.resultLabel),
        window: 'd7',
        target: portfolio.cpa_target ?? null,
      }}
      currency={null}
      dailyTotal={dailyTotal}
      explainHref="#"
      header={{
        header,
        onEditSetting: (setting) => handlers.edits?.push(setting),
        onSecondary: () => undefined,
        onRun: () => handlers.runs?.push(1),
        running: false,
      }}
      headline={headline}
      items={report.latest_items}
      jaina={{
        portfolio: { id: portfolio.id, name: portfolio.name, objective: portfolio.objective },
        read: headline.read,
        onAsk: (href) => handlers.asks?.push(href),
      }}
      nextCycleAt={null}
      onCta={() => undefined}
      onEditSetting={(setting) => handlers.edits?.push(setting)}
      portfolioId="p1"
      view={v}
      {...handlers.over}
    />,
  );
}

const follows = (a: Element | null | undefined, b: Element | null | undefined) =>
  Boolean(a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('PortfolioHero — the blocks, in the redesign’s order, from each real body', () => {
  for (const name of ['formularios', 'prueba', 'mensajes', 'tours'] as const) {
    it(`${name}: one module — header, anchor, sentences, tiles, last cycle, Jaina — then the cards`, () => {
      const { container } = wholeHero(name);
      const hero = container.querySelector('[data-testid="portfolio-hero"]');
      const ids = [
        'portfolio-header',
        'portfolio-anchor',
        'portfolio-headline',
        'portfolio-tiles',
        'portfolio-before-after',
        'portfolio-jaina',
        'portfolio-news-row',
      ];
      const nodes = ids.map((id) => hero?.querySelector(`[data-testid="${id}"]`) ?? null);
      expect(nodes.map(Boolean)).toEqual(ids.map(() => true));
      for (let i = 1; i < nodes.length; i += 1) expect(follows(nodes[i - 1], nodes[i])).toBe(true);
      // One surface: the module carries the frame, the blocks inside it carry none.
      const module = hero?.querySelector('[data-testid="portfolio-module"]');
      const moduleClass = module?.getAttribute('class') ?? '';
      for (const token of ['rounded-lg', 'border', 'bg-card']) {
        expect(moduleClass.split(/\s+/)).toContain(token);
      }
      for (const id of ids.slice(0, -1)) {
        const node = module?.querySelector(`[data-testid="${id}"]`);
        expect(node).toBeTruthy();
        if (id === 'portfolio-tiles') continue;
        expect((node?.getAttribute('class') ?? '').split(/\s+/)).not.toContain('border');
      }
      // The cards sit below the module, not inside it.
      expect(module?.querySelector('[data-testid="portfolio-news-row"]')).toBeNull();
      // The anchor figure is the one 44px role.
      const anchor = hero?.querySelector('[data-testid="portfolio-anchor"]');
      expect(anchor?.querySelectorAll('[data-figure-role="anchor"]').length).toBe(1);
      // Jaina's bar is the module's last child, with its five questions and no frame of its own.
      expect(module?.lastElementChild?.getAttribute('data-testid')).toBe('portfolio-jaina');
      const band = hero?.querySelector(
        '[data-testid="portfolio-jaina"] [data-testid="jaina-entry-chips"]',
      );
      expect(band?.querySelectorAll('a').length).toBe(5);
      expect(band?.getAttribute('class') ?? '').not.toContain('border');
      // Four frameless tiles, each with a state on its top rule and no chart inside.
      const tiles = [
        ...(hero?.querySelectorAll('[data-testid="portfolio-tiles"] [data-testid^="tile-"]') ?? []),
      ];
      expect(tiles.map((t) => t.getAttribute('data-testid'))).toEqual([
        'tile-spend',
        'tile-results',
        'tile-adsets',
        'tile-decisions',
      ]);
      for (const tile of tiles) {
        expect(['ok', 'warn', 'bad', 'none']).toContain(tile.getAttribute('data-state'));
        expect(tile.querySelector('svg, canvas')).toBeNull();
        const classes = (tile.getAttribute('class') ?? '').split(/\s+/);
        expect(classes).toContain('border-t-2');
        expect(classes).toContain('border-0');
        expect(classes).not.toContain('bg-card');
      }
    });

    it(`${name}: no vital-sign band, no full-width green or red bar, no dollar sign, no micro type`, () => {
      const { container } = wholeHero(name);
      const hero = container.querySelector('[data-testid="portfolio-hero"]');
      expect(hero?.querySelector('[data-testid="portfolio-vitals"]')).toBeNull();
      expect(hero?.querySelector('[data-testid="vital-bullet"]')).toBeNull();
      // Above the cards nothing is a green or red bar; the cards draw their own evidence
      // pictures (./news) and the mode pill is a pill.
      const blocks = [
        'portfolio-header',
        'portfolio-anchor',
        'portfolio-headline',
        'portfolio-tiles',
        'portfolio-before-after',
        'portfolio-jaina',
      ];
      const bars = blocks
        .flatMap((id) => [...(hero?.querySelectorAll(`[data-testid="${id}"] *`) ?? [])])
        .filter((node) => node.getAttribute('data-testid') !== 'header-mode')
        .filter((node) =>
          /\bbg-(success|destructive)(\/\d+)?\b/.test(node.getAttribute('class') ?? ''),
        );
      expect(bars.map((b) => b.getAttribute('class'))).toEqual([]);
      const above = hero?.querySelector('[data-testid="portfolio-jaina"]');
      const untilStrip = [...(hero?.querySelectorAll('*') ?? [])].filter(
        (node) => !follows(above, node) || node === above,
      );
      expect(untilStrip.map((n) => n.textContent ?? '').join(' ')).not.toContain('$');
      const tiny = [...(hero?.querySelectorAll('*') ?? [])].filter((node) =>
        /\btext-(2|3)xs\b/.test(node.getAttribute('class') ?? ''),
      );
      expect(tiny).toEqual([]);
    });
  }

  it('FORMULARIOS: the anchor, the two sentences with their figures, and the last cycle in one line', () => {
    const { container } = wholeHero('formularios');
    const status = container.querySelector('[data-testid="headline-status"]');
    expect(status?.textContent).toBe(
      '80 leads en 14 días a 45.69, 31% sobre el objetivo de 35.00.',
    );
    expect(status?.querySelectorAll('[data-testid="figure"]').length).toBe(4);
    const opportunity = container.querySelector('[data-testid="headline-opportunity"]');
    expect(opportunity?.textContent).toBe(
      'La oportunidad: Ad set A paga 75.65 por lead; pausarlo libera 43.23 al día.',
    );
    expect(container.querySelector('[data-testid="headline-blocker"]')).toBeNull();
    // The anchor: the cost per result over the brief's window, amber over the target, and
    // the picker's range beside the one before it, named by their dates.
    const anchor = container.querySelector('[data-testid="portfolio-anchor"]');
    expect(anchor?.getAttribute('data-state')).toBe('warn');
    const figure = anchor?.querySelector('[data-figure-role="anchor"]');
    expect(figure?.textContent).toBe('45.69');
    expect(figure?.getAttribute('class')).toContain('text-warning');
    expect(anchor?.querySelector('[data-testid="anchor-unit"]')?.textContent).toBe(
      'por lead·meta 35.00·+31%',
    );
    expect(anchor?.querySelector('[data-testid="anchor-prior"]')?.textContent).toBe(
      'semana 21–27 sep: 38.59· semana 14–20 sep: 58.78',
    );
    // The before/after figures keep the keys the parity bench already reads.
    const prior = [
      ...(anchor?.querySelectorAll('[data-testid="anchor-prior"] [data-figure]') ?? []),
    ];
    expect(prior.map((n) => n.getAttribute('data-figure'))).toEqual([
      'before-after.after.cost',
      'before-after.before.cost',
    ]);
    // The four tiles, and the ad sets in target from the cycle's own rows.
    const text = (id: string) =>
      container.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';
    expect(text('tile-spend')).toBe('Gasto · 14 días3,655261/día · plan 324');
    expect(text('tile-adsets')).toBe(
      'Conjuntos en meta3 de 9mejor Ad set E 25.07peor Ad set D 100',
    );
    expect(text('tile-decisions')).toBe('Decisiones390.72/día en juego4 oportunidades abiertas');
    const strip = container.querySelector('[data-testid="portfolio-before-after"]');
    expect(strip?.querySelector('[data-testid="before-after-before"]')).toBeNull();
    expect(strip?.querySelector('[data-testid="before-after-after"]')).toBeNull();
    expect(strip?.querySelector('[data-testid="before-after-cycle"]')?.textContent).toContain(
      'Último ciclo, viernes 13:03: 2 pausas, 1 cambio de creativo y 9 movimientos de presupuesto propuestas; 4 movimientos de presupuesto aplicados.',
    );
    expect(strip?.querySelector('[data-testid="before-after-projection"]')?.textContent).toContain(
      'Si se aplican las 2 pausas, el costo proyectado con los 7 conjuntos restantes es',
    );
  });

  it('FORMULARIOS: Jaina’s read is one attributed line between the status and the opportunity', () => {
    const { container } = wholeHero('formularios');
    const read = container.querySelector('[data-testid="jaina-read"]');
    expect(read?.getAttribute('data-source')).toBe('jaina');
    expect(read?.querySelector('[data-testid="jaina-read-label"]')?.textContent).toBe(
      'Jaina · hace 2 h',
    );
    expect(read?.querySelector('[data-testid="jaina-read-sentence"]')?.textContent).toBe(
      'Pause Ad set A to save 43.23/day',
    );
    const status = container.querySelector('[data-testid="headline-status"]');
    const opportunity = container.querySelector('[data-testid="headline-opportunity"]');
    expect(follows(status, read)).toBe(true);
    expect(follows(read, opportunity)).toBe(true);
    // Not in Jaina's bar any more.
    expect(
      container.querySelector('[data-testid="portfolio-jaina"] [data-testid="jaina-read"]'),
    ).toBeNull();
  });

  it('Tours: a deterministic read only repeats the headline, so it is gone; the blocker offers the objective fix', () => {
    const edits: HeroSetting[] = [];
    const { container, getByText } = wholeHero('tours', { edits });
    expect(container.querySelector('[data-testid="jaina-read"]')).toBeNull();
    expect(container.textContent).not.toContain('Lectura automática');
    // Nothing bought: the anchor says so rather than printing a cost, and stays grey.
    const anchor = container.querySelector('[data-testid="portfolio-anchor"]');
    expect(anchor?.getAttribute('data-state')).toBe('none');
    expect(anchor?.querySelector('[data-figure-role="anchor"]')?.textContent).toBe('—');
    expect(anchor?.querySelector('[data-testid="anchor-empty"]')?.textContent).toBe(
      'sin conversaciones en 2 días',
    );
    const blocker = container.querySelector('[data-testid="headline-blocker"]');
    expect(blocker?.getAttribute('data-blocker')).toBe('kpi_mismatch');
    expect(blocker?.getAttribute('role')).toBe('alert');
    expect(blocker?.textContent).toContain('los 12 conjuntos pujan por otro resultado');
    // Between the sentences and the tiles.
    const status = container.querySelector('[data-testid="headline-status"]');
    const tiles = container.querySelector('[data-testid="portfolio-tiles"]');
    expect(follows(status, blocker)).toBe(true);
    expect(follows(blocker, tiles)).toBe(true);
    fireEvent.click(getByText('Cambiar objetivo'));
    fireEvent.click(getByText('Quitar estos conjuntos'));
    expect(edits).toEqual(['objective', 'roster']);
  });

  it('the typed question deep-links into Jaina with the portfolio as its context', () => {
    const asks: string[] = [];
    const { container } = wholeHero('formularios', { asks });
    const form = container.querySelector('[data-testid="jaina-ask"]') as HTMLFormElement;
    const input = form.querySelector('input[name="question"]') as HTMLInputElement;
    const button = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.submit(form);
    expect(asks).toEqual([]);
    fireEvent.change(input, { target: { value: '¿Y si pauso Ad set A?' } });
    expect(button.disabled).toBe(false);
    fireEvent.submit(form);
    expect(asks.length).toBe(1);
    expect(asks[0]?.startsWith('/scale?tab=jaina&prompt=')).toBe(true);
    const prompt = decodeURIComponent(asks[0]?.slice('/scale?tab=jaina&prompt='.length) ?? '');
    expect(prompt).toBe(
      'Para el portafolio del optimizer "Lead forms portfolio" (objetivo: Lead): ¿Y si pauso Ad set A?',
    );
  });

  it('every setting stays one click from Manage, beside the figure it governs; "Correr ahora" runs', () => {
    const edits: HeroSetting[] = [];
    const runs: number[] = [];
    const { container, getByText } = wholeHero('prueba', { edits, runs });
    const chips = [...container.querySelectorAll('[data-testid="header-chip"]')];
    // Objective, strategy and window in the grey line; the target under the anchor; the
    // budget in the spend tile.
    expect(chips.map((c) => c.getAttribute('data-setting'))).toEqual([
      'objective',
      'strategy',
      'window',
      'target',
      'budget',
    ]);
    expect(chips.map((c) => c.textContent)).toEqual([
      'objetivo leads',
      'Balanced',
      '14 días',
      'meta 25.00',
      'plan 110',
    ]);
    // Plain grey text, not pills.
    for (const chip of chips) expect(chip.getAttribute('class')).not.toContain('rounded-full');
    const header = container.querySelector('[data-testid="portfolio-header"]');
    expect(header?.querySelector('[data-setting="budget"], [data-setting="target"]')).toBeNull();
    for (const chip of chips) fireEvent.click(chip);
    fireEvent.click(getByText('Correr ahora'));
    expect(edits).toEqual(['objective', 'strategy', 'window', 'target', 'budget']);
    expect(runs).toEqual([1]);
    expect(getByText('Revisar movimientos')).toBeTruthy();
    expect(container.querySelector('[data-testid="header-adsets"]')?.textContent).toBe(
      '3 conjuntos',
    );
  });

  it('before the first cycle the name line and the Jaina field still stand, the read does not', () => {
    const { report, view: v } = readBody('formularios');
    const { container } = wholeHero('formularios', {
      over: { view: { ...v, state: 'first_cycle' }, items: report.latest_items },
    });
    const hero = container.querySelector('[data-testid="portfolio-hero"]');
    expect(hero?.querySelector('[data-testid="portfolio-header"]')).toBeTruthy();
    expect(hero?.querySelector('[data-testid="jaina-ask"]')).toBeTruthy();
    // The same one surface, with Jaina's bar at its foot.
    const module = hero?.querySelector('[data-testid="portfolio-module"]');
    expect(module?.getAttribute('class')).toContain('bg-card');
    expect(module?.lastElementChild?.getAttribute('data-testid')).toBe('portfolio-jaina');
    expect(hero?.querySelector('[data-testid="portfolio-anchor"]')).toBeNull();
    expect(hero?.querySelector('[data-testid="jaina-read"]')).toBeNull();
    expect(hero?.querySelector('[data-testid="portfolio-headline"]')).toBeNull();
    expect(hero?.textContent).toContain('primera lectura');
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
