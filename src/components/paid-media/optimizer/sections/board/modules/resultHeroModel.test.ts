import { describe, expect, it } from 'bun:test';
import {
  type AdAccountResult,
  type EfficiencySeriesPoint,
  type PortfolioListItem,
  PortfolioListItemSchema,
  PortfolioMetricsSchema,
} from '@continuum/contracts';
import { resultKinds } from '../../account/overviewModel';
import recordedGoogle from '../../platforms/__fixtures__/google-vivo47-paid-media-metrics.json';
import {
  buildGoogleOverview,
  GoogleAccountOverviewSchema,
  GoogleTopCampaignsSchema,
} from '../../platforms/googleAdsOverviewModel';
import {
  type PortfolioFigure,
  portfolioFigure,
  portfolioFigureFromReads,
  seriesWindowFigures,
} from '../../portfolioFigure';
import portfolioRows from './portfolioLanes.fixture.json';
import recordedMetrics from './portfolioMetrics.fixture.json';
import {
  countsRealResults,
  portfolioWindowLabel,
  resultFromGoogle,
  resultFromPortfolios,
  resultFromReading,
  resultRing,
  resultWindowLabel,
  trendFromDaily,
  trendFromSeries,
  trendReadWindow,
} from './resultHeroModel';
import recorded from './resultTrend.fixture.json';

// Every figure below is a real read of Nov 2, 2026 (resultTrend.fixture.json and
// portfolioLanes.fixture.json say which).
const CONVERSACIONES = '0fd6f383-6a70-4ce1-baf8-c869bc5d4aec';
const TOURS = 'ec956b3d-c9b1-48ea-b55b-bda303e68f79';
const LEADS_GOOGLE_ONLY = '94ca5d79-77cd-4973-9d9d-4ae55ccd7ec4';

type RecordedSeries = Record<string, { name: string; points: EfficiencySeriesPoint[] }>;
const metaSeries = recorded.easyFitMetaSeries as unknown as RecordedSeries;
const seriesOf = (id: string): EfficiencySeriesPoint[] => {
  const entry = Object.entries(metaSeries).find(([key]) => key === id);
  return entry ? entry[1].points : [];
};
const easyFitMeta: PortfolioListItem[] = portfolioRows.easyFitMeta.map((row) =>
  PortfolioListItemSchema.parse(row),
);

describe('the Meta trend, from the portfolios’ cycle series', () => {
  it('prices each cycle day’s 7-day window: Conversaciones Whatsapp ends at $53.12', () => {
    const trend = trendFromSeries([seriesOf(CONVERSACIONES)]);
    expect(trend).toHaveLength(15);
    expect(trend.at(-1)?.day).toBe('2026-11-02');
    expect(trend.at(-1)?.value).toBeCloseTo(24_543.57 / 462, 4);
    expect(trend.find((point) => point.day === '2026-10-29')?.value).toBeCloseTo(39.6, 1);
  });

  it('leaves a gap on a day one portfolio missed between two cycles, never a partial sum', () => {
    const trend = trendFromSeries([seriesOf(CONVERSACIONES), seriesOf(LEADS_GOOGLE_ONLY)]);
    const conversacionesDays = new Set(
      seriesOf(CONVERSACIONES).map((p) => p.cycle_ts.slice(0, 10)),
    );
    const missed = trend.filter((point) => !conversacionesDays.has(point.day));
    expect(missed.length).toBeGreaterThan(0);
    for (const point of missed) expect(point.value).toBeNull();
  });

  it('keeps a portfolio that stopped cycling out of the days after its last cycle', () => {
    // Tours lost its ad sets on Oct 15: its last cycle is Oct 14.
    const together = trendFromSeries([seriesOf(CONVERSACIONES), seriesOf(TOURS)]);
    const alone = trendFromSeries([seriesOf(CONVERSACIONES)]);
    expect(together.at(-1)).toEqual(alone.at(-1) as (typeof alone)[number]);
  });
});

describe('the Google trend, from the account’s daily rows', () => {
  const easyFit = recorded.google.easyFit5251780631Leads;

  it('reads the 36 days that close 30 seven-day windows', () => {
    expect(trendReadWindow('2026-11-01')).toEqual({ since: '2026-09-27', until: '2026-11-01' });
  });

  it('counts a day with no row as nothing delivered, so the dark week is a gap', () => {
    const trend = trendFromDaily(easyFit.trends, easyFit.range);
    expect(trend).toHaveLength(30);
    expect(trend[0]?.day).toBe('2026-10-03');
    // Easy Fit Google served nothing from Oct 26 (Google: SERVING_STATUS_SUSPENDED).
    expect(trend.at(-1)).toEqual({ day: '2026-11-01', value: null });
    expect(trend.find((point) => point.day === '2026-10-31')?.value).toBeCloseTo(29.09, 2);
  });

  it('makes every window a gap when the day’s count is not defined', () => {
    const rows = easyFit.trends.map((row) => ({ ...row, conversions: null }));
    expect(trendFromDaily(rows, easyFit.range).every((point) => point.value == null)).toBe(true);
  });
});

/** The reading's result as the reading gives it for Easy Fit Meta on Nov 2: the producer's
 *  count, which the hero must not print, and the label, goal and kind it must keep. */
const EASY_FIT_META_READING: AdAccountResult = {
  label: 'conversaciones',
  count: 999,
  platformReported: null,
  costPerResult: 99,
  goal: 45,
  spend: 99,
  currency: 'MXN',
  windowDays: 7,
  source: 'producer',
  kind: 'conversations',
};

const NOW = Date.parse('2026-11-02T20:00:00Z');

function liveFigures(portfolios: PortfolioListItem[]): Map<string, PortfolioFigure> {
  return new Map(
    portfolios.flatMap((portfolio) => {
      const cycle = seriesWindowFigures(seriesOf(portfolio.id));
      const figure = portfolioFigure({ portfolio, live: cycle, snapshot: cycle, now: NOW });
      return figure ? [[portfolio.id, figure] as const] : [];
    }),
  );
}

describe('the result that counts: the portfolios’ own figure', () => {
  it('prints the counted kind’s portfolio figure, with the reading’s label, goal and kind', () => {
    const figures = liveFigures(easyFitMeta);
    const result = resultFromPortfolios({
      kinds: resultKinds(easyFitMeta, figures),
      reading: EASY_FIT_META_READING,
      currency: 'MXN',
    });
    expect(result?.source).toBe('portfolios');
    expect(result?.words.many).toBe('conversaciones');
    // Conversaciones Whatsapp's own figure — never the producer's 999.
    expect(result?.count).toBe(462);
    expect(result?.spend).toBeCloseTo(24_543.57, 2);
    expect(result?.costPerResult).toBeCloseTo(24_543.57 / 462, 4);
    expect(result?.goal).toBe(45);
    expect(result?.others.map((other) => other.words.many)).toEqual(['purchases', 'leads']);
    const ring = result ? resultRing(result) : null;
    expect(ring?.basis).toBe('goal');
    expect(ring?.whole).toBeCloseTo(24_543.57 / 45, 2);
  });

  // Easy Fit on Sep 27, as the proposal quotes it (the Overview's own test rows): two lead
  // portfolios, FORMULARIOS $2,161 for 56 and Prueba $730 for 22.
  it('sums spend and results across the kind’s portfolios, then divides', () => {
    const row = (id: string, name: string) =>
      PortfolioListItemSchema.parse({
        ...portfolioRows.easyFitMeta[0],
        id,
        name,
        objective: 'lead',
        target_metric: null,
        cpa_target: 35,
      });
    const formularios = row('7a7a7a7a-0000-4000-8000-00000000f001', 'FORMULARIOS // TODOS');
    const prueba = row('7a7a7a7a-0000-4000-8000-00000000f002', 'Prueba');
    const week = (spend: number, results: number) => ({
      spend,
      results,
      priorSpend: 0,
      priorResults: 0,
      cycleTs: '2026-09-28T06:00:00Z',
    });
    const figures = new Map([
      [
        formularios.id,
        portfolioFigure({ portfolio: formularios, live: week(2161, 56), snapshot: null }),
      ],
      [prueba.id, portfolioFigure({ portfolio: prueba, live: week(730, 22), snapshot: null })],
    ] as [string, PortfolioFigure][]);
    const result = resultFromPortfolios({
      kinds: resultKinds([formularios, prueba], figures),
      reading: { ...EASY_FIT_META_READING, label: 'leads', kind: 'leads', goal: 35 },
      currency: 'MXN',
    });
    expect(result?.count).toBe(78);
    expect(result?.spend).toBe(2891);
    // $2,891 over 78, not the mean of $38.59 and $33.18.
    expect(result?.costPerResult).toBeCloseTo(2891 / 78, 6);
  });

  // Easy Fit Google, Oct 25–31: "Leads // Google Ads only" $29.09 for 1 lead (the metrics read
  // the lane prints); the Test portfolio never cycled, so it has no figure and adds nothing.
  it('leaves out a portfolio of the kind that never cycled', () => {
    const easyFitGoogle = portfolioRows.easyFitGoogle.map((row) =>
      PortfolioListItemSchema.parse(row),
    );
    const metricsOf = (id: string) =>
      PortfolioMetricsSchema.parse((recordedMetrics as Record<string, unknown>)[id]);
    const figures = new Map(
      easyFitGoogle.flatMap((portfolio) => {
        const figure = portfolioFigureFromReads({
          portfolio,
          snapshots: null,
          readAt: null,
          memberIds: null,
          series: [],
          metrics: metricsOf(portfolio.id),
          now: NOW,
        });
        return figure ? [[portfolio.id, figure] as const] : [];
      }),
    );
    expect([...figures.keys()]).toEqual(['b9cebbcf-2832-440a-b326-3af20c19be37']);
    const result = resultFromPortfolios({
      kinds: resultKinds(easyFitGoogle, figures),
      reading: { ...EASY_FIT_META_READING, label: 'leads', kind: 'leads', goal: 99 },
      currency: 'MXN',
    });
    expect(result?.count).toBe(1);
    expect(result?.costPerResult).toBeCloseTo(29.094547, 6);
    expect(portfolioWindowLabel([...figures.values()])).toBe('Last 7 days · as of Nov 1');
  });

  it('counts nothing when no portfolio of the reading’s kind has a figure', () => {
    const figures = liveFigures(easyFitMeta);
    expect(
      resultFromPortfolios({
        kinds: resultKinds(easyFitMeta, figures),
        reading: { ...EASY_FIT_META_READING, kind: 'app_installs' },
        currency: 'MXN',
      }),
    ).toBeNull();
  });

  it('dates a window when a figure in it is the last cycle’s', () => {
    const tours = easyFitMeta.find((portfolio) => portfolio.id === TOURS) as PortfolioListItem;
    const cycle = seriesWindowFigures(seriesOf(TOURS));
    const stale = portfolioFigure({ portfolio: tours, live: null, snapshot: cycle, now: NOW });
    const live = liveFigures(easyFitMeta).get(CONVERSACIONES) as PortfolioFigure;
    expect(portfolioWindowLabel([live])).toBe('Last 7 days');
    expect(portfolioWindowLabel([live, stale as PortfolioFigure])).toBe(
      'Last 7 days · as of Oct 14 · 19 days old',
    );
  });
});

describe('the result that counts: the exceptions', () => {
  // Vivo 47's V1 card of Nov 2: 592 real leads and sales against 4,051 Google conversions.
  const V1: AdAccountResult = {
    label: 'leads y ventas reales',
    count: 592,
    platformReported: 4051,
    costPerResult: 69.08,
    goal: null,
    spend: null,
    currency: 'MXN',
    windowDays: 30,
    source: 'inflated_conversion',
    kind: 'leads',
  };

  it('keeps the V1 real-result count as the reading gives it, over its 30 days', () => {
    expect(countsRealResults(V1)).toBe(true);
    expect(countsRealResults({ ...V1, source: 'producer' })).toBe(false);
    expect(countsRealResults({ ...V1, count: null })).toBe(false);
    const result = resultFromReading(V1);
    expect(result?.source).toBe('reading');
    expect(result?.platformReported).toBe(4051);
    expect(resultRing(result as NonNullable<typeof result>)).toEqual({
      part: 592,
      whole: 4051,
      basis: 'reported',
    });
    expect(
      resultWindowLabel(result as NonNullable<typeof result>, { portfolios: [], google: null }),
    ).toBe('Last 30 days · as the conversion card counts them');
    expect(resultFromReading({ ...V1, platformReported: 592 })?.platformReported).toBeNull();
    expect(resultFromReading({ ...V1, count: null })).toBeNull();
  });

  it('falls back to Google’s own read of the whole account, and says so', () => {
    const overview = buildGoogleOverview(
      GoogleAccountOverviewSchema.parse(recordedGoogle.account_overview),
      GoogleTopCampaignsSchema.parse(recordedGoogle.top_campaigns),
    );
    const result = resultFromGoogle({
      overview,
      reading: { ...V1, label: 'leads', count: null, source: 'none' },
      currency: null,
    });
    expect(result.source).toBe('google');
    expect(result.words.many).toBe('leads');
    expect(result.spend).toBeCloseTo(55_205.26, 1);
    expect(result.currency).toBeNull();
    expect(resultRing(result)).toBeNull();
    expect(resultWindowLabel(result, { portfolios: [], google: overview })).toBe(
      "Sep 1 – Sep 30 · Google's read of the whole account",
    );
  });

  // Easy Fit Google, Oct 25–31: $29.09 for 1 lead against the $99 goal.
  it('rings against the goal only when the spend buys one result at it', () => {
    const week = {
      words: { one: 'leads', many: 'leads' },
      count: 1,
      spend: 29.09,
      costPerResult: 29.09,
      goal: 99,
      currency: 'MXN',
      windowDays: 7,
      source: 'portfolios' as const,
      platformReported: null,
      others: [],
    };
    expect(resultRing(week)).toBeNull();
    expect(resultRing({ ...week, spend: 990, count: 12 })).toEqual({
      part: 12,
      whole: 10,
      basis: 'goal',
    });
  });
});
