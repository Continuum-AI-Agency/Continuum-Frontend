import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  type CycleRunReport,
  getOptimizationMetricDefinition,
  type PortfolioListItem,
  PortfolioMetricsSchema,
  type RangeSpec,
  resolveRange,
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

import formularios from '../../__fixtures__/optimizer-status-formularios.json';
import { parseReport } from '../../reportModel';
import { portfolioMetricsFixture } from '../attribution/__fixtures__/portfolioMetricsFixture';
import { portfolioFigureFromReads } from '../portfolioFigure';
import { buildPortfolioHeadline } from './headlineModel';
import { buildHeroView, crossPlatformRead, heroMetricsWindow } from './heroModel';
import { PortfolioHero } from './PortfolioHero';
import { buildRecap } from './recapModel';

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

  it('draws the pause’s own cost against the reference, never "no results to divide by"', () => {
    const { container } = mount();
    const lead = container.querySelector('[data-testid="portfolio-news-lead"]');
    const text = lead?.textContent ?? '';
    expect(text).toContain('Ad set A');
    expect(text).not.toContain('no results to divide by');
    expect(text).not.toContain('buying nothing');
    const band = lead?.querySelector('[data-testid="news-band"]');
    expect(band?.getAttribute('data-visual')).toBe('cost_vs_reference');
    expect(band?.textContent).toContain('$75.65 USD / lead · this ad set');
    expect(band?.textContent).toContain('$28.86 USD · the reference');
    expect(band?.textContent).toContain('2.5× line · $72.14');
  });

  it('draws the zero-conversion ad set as spend that bought nothing', () => {
    const { container } = mount();
    const dead = [...container.querySelectorAll('[data-testid="portfolio-news-insight"]')].find(
      (card) => card.textContent?.includes('Ad set B'),
    );
    const band = dead?.querySelector('[data-testid="news-band"]');
    expect(band?.getAttribute('data-visual')).toBe('spend_blocks');
    expect(band?.textContent).toContain('$340 USD = 9.7 leads at target');
    expect(band?.textContent).toContain('0 leads');
  });
});

// G8 F16, on screen: Easy Fit's Google portfolio at 14 days printed "0 leads in 14 days, no
// spend. Blocked: zero delivery" beside a By platform read of $4,332 MXN / 176 leads. The hero
// now reads the metrics read at the range's window (Oct 8–21 here, before the Oct 25
// suspension), and where no read covers the range it says so — never a zero.
describe('F16 — the Google portfolio hero, rendered', () => {
  const lead = getOptimizationMetricDefinition('lead');
  const portfolio = {
    id: 'f16-easy-fit-google',
    name: 'Easy Fit — Google',
    objective: 'lead',
    target_metric: null,
    cpa_target: 35,
    platforms: ['google_ads'],
    apply_mode: 'recommend',
    daily_total: 320,
    last_actual_cycle_at: '2026-10-22T06:00:00Z',
  } as unknown as PortfolioListItem;
  const cycle = {
    portfolio: null,
    latest_run: { id: 'run-f16', cycle_ts: '2026-10-22T06:00:00Z' } as never,
    latest_items: [],
    recommendations: [],
    history: [],
  };
  const base = portfolioMetricsFixture({ platforms: ['google_ads'] });
  const google = { spend: 4332, results: 176, conversions: 176, cost_per_result: 4332 / 176 };
  const read14 = PortfolioMetricsSchema.parse({
    ...base,
    window: { since: '2026-10-08', until: '2026-10-21', label: 'd14', ends_yesterday: false },
    totals: { ...base.totals, ...google },
    by_platform: base.by_platform.map((row) => ({ ...row, ...google })),
    conversions_by_source: base.conversions_by_source.map((row) => ({ ...row, conversions: 176 })),
  });

  /** A pending recommendation the engine sized but gave no evidence the card can draw, on a
   *  campaign the cycle rows do not hold: its card falls to the strip. */
  const unevidenced = {
    id: '00000000-0000-4000-8000-0000000000f1',
    adset_id: 'gads-campaign-1',
    adset_name: 'EF // Search — Brand',
    kind: 'refresh_creative',
    trigger: 'C1_fatigue',
    severity: 'medium',
    reason: 'Frequency above 4 on the brand campaign.',
    status: 'pending',
    evidence: {
      metric: 'frequency',
      value: 4.2,
      comparator: '>',
      threshold: 3,
      window: 'd7',
      estImpactPerDay: 12,
      source: 'engine',
    },
    seed: null,
  };

  const mount = (spec: RangeSpec, recommendations: unknown[] = []) => {
    const report = { ...cycle, recommendations } as never;
    const range = resolveRange(spec, portfolio, '2026-10-22');
    const window = heroMetricsWindow(range);
    const metrics = { status: 'ready', metrics: read14 } as const;
    const crossPlatform = crossPlatformRead({ portfolio, window, metrics });
    const figure =
      crossPlatform && window
        ? portfolioFigureFromReads({
            portfolio,
            snapshots: [],
            readAt: null,
            memberIds: [],
            series: [],
            metrics: read14,
            now: Date.parse('2026-10-22T15:00:00Z'),
          })
        : null;
    const view = buildHeroView({
      report,
      recap: buildRecap({ snapshots: [], enrolledIds: [], range, metric: lead, target: 35 }),
      flightPacing: null,
      metric: lead,
      currency: 'MXN',
      portfolio,
      target: 35,
      window: range.window,
      firstCycle: false,
      figure,
      crossPlatform,
    });
    const headline = buildPortfolioHeadline({
      view,
      report,
      portfolio,
      metric: lead,
      currency: 'MXN',
      mismatch: null,
    });
    const { container } = render(
      <PortfolioHero
        currency="MXN"
        dailyTotal={320}
        explainHref="#"
        headline={headline}
        nextCycleAt={null}
        onCta={() => undefined}
        portfolioId={portfolio.id}
        view={view}
      />,
    );
    const hero = container.querySelector('[data-testid="portfolio-hero"]');
    return {
      read: hero?.getAttribute('data-hero-read'),
      status: container.querySelector('[data-testid="headline-status"]')?.textContent ?? null,
      blocker: container.querySelector('[data-testid="headline-blocker"]'),
      spend: container.querySelector('[data-figure="tiles.spend"]'),
      anchor: container.querySelector('[data-testid="portfolio-anchor"]'),
      strip: container.querySelector('[data-testid="band-strip-label"]')?.textContent ?? null,
      text: hero?.textContent ?? '',
    };
  };

  it('14 days: 176 leads and $4,332 MXN spent, from every platform, with no blocker', () => {
    const shown = mount({ kind: 'preset', preset: 'd14' });
    expect(shown.read).toBe('read');
    expect(shown.status).toBe(
      '176 leads in 14 days at $24.61 MXN, 30% under the target of $35.00 MXN.',
    );
    expect(shown.spend?.textContent).toBe('$4,332 MXN');
    expect(shown.spend?.getAttribute('data-figure-raw')).toBe('4332');
    expect(shown.blocker).toBeNull();
    expect(shown.text).not.toMatch(/no spend|zero delivery/i);
  });

  it('3 days, which no read covers: says so — no anchor, no spend tile, no "no spend", no blocker', () => {
    const shown = mount({ kind: 'preset', preset: 'd3' });
    expect(shown.read).toBe('unavailable');
    expect(shown.status).toBe(
      "Spend and leads for this range aren't available for a portfolio on Google Ads. Pick 7 or 14 days.",
    );
    expect(shown.blocker).toBeNull();
    expect(shown.anchor).toBeNull();
    expect(shown.spend).toBeNull();
    // The calm lead card would have read the placeholder as "No spend and no leads in 3 days".
    expect(shown.text).not.toMatch(/no spend|zero delivery|nothing spent/i);
    expect(shown.text).not.toMatch(/\$0|\b0 leads/);
  });

  it('3 days, a card with no evidence of its own: its strip prints no "$0 spent" and no "0 leads"', () => {
    const shown = mount({ kind: 'preset', preset: 'd3' }, [unevidenced]);
    expect(shown.read).toBe('unavailable');
    expect(shown.strip).toBe('spend and leads not read for this range');
    expect(shown.text).not.toMatch(/\$0|\b0 leads|no spend|zero delivery|nothing spent/i);
  });
});
