// Pure math behind the Home overview: puts each ad account's read in the Home's words, sums the
// accounts in scope per currency, and turns an objective into the figure its tile shows (value,
// change, cost per result, series). No fetching here, so every number the Home prints can be
// checked against its inputs.

import {
  HOME_OBJECTIVE_METRICS,
  type HomeObjective,
  type HomeObjectiveMetric,
  type HomeResultTotals,
  type PaidAccountOverview,
  type PaidEntityKpi,
} from '@continuum/contracts';

const COUNTED: HomeObjectiveMetric[] = [
  'spend',
  'purchases',
  'purchase_value',
  'conversations',
  'leads',
  'clicks',
  'impressions',
];

/** One ad account's read in the Home's words — Meta's: purchases and their value, leads,
 *  conversations. `unreported` names the metrics its platform does not report at all (Google
 *  has no conversations): the account takes no part in them, not in their sum and not in their
 *  comparison, so a Google account never drops a Meta account's week-on-week change. */
export type HomeAccountOverview = PaidAccountOverview & {
  unreported?: readonly HomeObjectiveMetric[];
};

export type OverviewTotals = {
  /** Metrics absent from every payload are missing, not zero: an older edge never counted them. */
  current: Partial<Record<HomeObjectiveMetric, number>>;
  previous: Partial<Record<HomeObjectiveMetric, number>>;
  series: Partial<Record<HomeObjectiveMetric, number[]>>;
  /** Metrics no account in the sum reports at all (a Google-only sum has no conversations). */
  unreported: HomeObjectiveMetric[];
  accountCount: number;
};

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const round4 = (value: number): number => Math.round(value * 1e4) / 1e4;

function currentOf(overview: PaidAccountOverview, metric: HomeObjectiveMetric): number | undefined {
  return finite((overview.metrics as Record<string, unknown>)[metric]);
}

function previousOf(
  overview: PaidAccountOverview,
  metric: HomeObjectiveMetric,
): number | undefined {
  const comparison = overview.comparison ?? {};
  if (metric === 'purchase_value') {
    const roas = finite(comparison.roas?.previous);
    const spend = finite(comparison.spend?.previous);
    return roas !== undefined && spend !== undefined ? roas * spend : undefined;
  }
  return finite(comparison[metric]?.previous);
}

function dailyValue(
  point: Record<string, unknown>,
  metric: HomeObjectiveMetric,
): number | undefined {
  if (metric === 'purchase_value') {
    const roas = finite(point.roas);
    const spend = finite(point.spend);
    return roas !== undefined && spend !== undefined ? roas * spend : undefined;
  }
  return finite(point[metric]);
}

export function sumOverviews(overviews: HomeAccountOverview[]): OverviewTotals {
  const totals: OverviewTotals = {
    current: {},
    previous: {},
    series: {},
    unreported: [],
    accountCount: overviews.length,
  };

  for (const metric of COUNTED) {
    const reporting = overviews.filter((overview) => !overview.unreported?.includes(metric));
    if (overviews.length > 0 && reporting.length === 0) totals.unreported.push(metric);
    let current: number | undefined;
    let previous: number | undefined;
    let previousComplete = true;
    const byDate = new Map<string, number>();

    for (const overview of reporting) {
      const value = currentOf(overview, metric);
      if (value !== undefined) current = (current ?? 0) + value;
      const before = previousOf(overview, metric);
      if (before === undefined) previousComplete = false;
      else previous = (previous ?? 0) + before;

      for (const point of overview.trends ?? []) {
        const date = typeof point.date === 'string' ? point.date : null;
        const day = date ? dailyValue(point as Record<string, unknown>, metric) : undefined;
        if (date && day !== undefined) byDate.set(date, (byDate.get(date) ?? 0) + day);
      }
    }

    if (current !== undefined) totals.current[metric] = current;
    if (previous !== undefined && previousComplete) totals.previous[metric] = previous;
    if (byDate.size > 1) {
      totals.series[metric] = [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, value]) => value);
    }
  }
  return totals;
}

/** The Google business results the Home has a tile for, each read apart. Google's third,
 *  signups, has none. */
export const GOOGLE_HOME_RESULTS = ['leads', 'purchases'] as const;
export type GoogleHomeResult = (typeof GOOGLE_HOME_RESULTS)[number];

/** What a Google read counted as `conversions` over its window: undefined when the read counted
 *  another result, or none it can name (an ambiguous basis nulls every count). */
function googleCount(
  read: PaidAccountOverview | null,
  result: GoogleHomeResult,
): number | undefined {
  if (!read || read.result_basis?.bucket !== result) return undefined;
  const days = read.trends ?? [];
  if (days.some((day) => finite(day.conversions) === undefined)) return undefined;
  return round4(days.reduce((sum, day) => sum + (day.conversions as number), 0));
}

/** The same count over the window before, from the read's own cost per result — Google answers
 *  the earlier window's spend and CPA, not its count. A CPA of 0 on spend is no result; with no
 *  spend at all the count cannot be told. */
function googlePreviousCount(
  read: PaidAccountOverview | null,
  result: GoogleHomeResult,
): number | undefined {
  if (!read || read.result_basis?.bucket !== result) return undefined;
  const spend = finite(read.comparison?.spend?.previous);
  const cpa = finite(read.comparison?.cpa?.previous);
  if (spend === undefined || cpa === undefined) return undefined;
  if (cpa > 0) return round4(spend / cpa);
  return spend > 0 ? 0 : undefined;
}

/**
 * A Google Ads account in the Home's words, from two reads of the same window: one counting leads
 * and one counting purchases. Google counts ONE business result per read (its `resultBucket`) as
 * `conversions` and says which in `result_basis`; the Home names each, as Meta does. Purchases'
 * value comes from the purchases read only (its ROAS). A read that is missing, or counted
 * something else, adds no result. Spend, clicks and impressions are the same in both reads.
 */
export function googleOverviewForHome(
  reads: Record<GoogleHomeResult, PaidAccountOverview | null>,
): HomeAccountOverview {
  const base = reads.leads ?? reads.purchases;
  if (!base) throw new Error('A Google account is read for at least one result.');
  const counted = {
    leads: googleCount(reads.leads, 'leads'),
    purchases: googleCount(reads.purchases, 'purchases'),
  };
  const valued = counted.purchases === undefined ? null : reads.purchases;

  const comparison: NonNullable<PaidAccountOverview['comparison']> = {};
  for (const metric of ['spend', 'clicks', 'impressions'] as const) {
    const entry = base.comparison?.[metric];
    if (entry) comparison[metric] = entry;
  }
  if (valued?.comparison?.roas) comparison.roas = valued.comparison.roas;
  for (const result of GOOGLE_HOME_RESULTS) {
    const previous = googlePreviousCount(reads[result], result);
    if (counted[result] !== undefined && previous !== undefined) {
      comparison[result] = { current: counted[result], previous };
    }
  }

  const dayOf = (read: PaidAccountOverview | null, date: string | undefined) =>
    read?.trends?.find((day) => day.date === date);
  const trends = (base.trends ?? []).map((day) => ({
    date: day.date,
    spend: day.spend,
    clicks: day.clicks,
    impressions: day.impressions,
    ...(counted.leads === undefined
      ? {}
      : { leads: finite(dayOf(reads.leads, day.date)?.conversions) }),
    ...(valued === null
      ? {}
      : {
          purchases: finite(dayOf(valued, day.date)?.conversions),
          roas: finite(dayOf(valued, day.date)?.roas),
        }),
  }));

  return {
    currency: base.currency ?? null,
    metrics: {
      spend: base.metrics.spend,
      roas: valued?.metrics.roas ?? base.metrics.roas,
      ctr: base.metrics.ctr,
      clicks: base.metrics.clicks,
      impressions: base.metrics.impressions,
      ...(counted.leads === undefined ? {} : { leads: counted.leads }),
      ...(valued === null || counted.purchases === undefined
        ? {}
        : {
            purchases: counted.purchases,
            purchase_value: round4(valued.metrics.roas * valued.metrics.spend),
          }),
    },
    comparison,
    trends,
    unreported: ['conversations'],
  };
}

/** One currency's accounts summed. `spending` counts the accounts that spent in the window or the
 *  one before: a currency where none did has nothing to show. */
export type CurrencyGroup = { currency: string | null; totals: OverviewTotals; spending: number };

const spentIn = (overview: PaidAccountOverview): boolean =>
  (finite(overview.metrics.spend) ?? 0) > 0 ||
  (finite(overview.comparison?.spend?.previous) ?? 0) > 0;

/**
 * The accounts in scope summed per currency: money is never added across currencies. The Home
 * leads with the currency its spending accounts report in, then the one most accounts do, then the
 * first it read — never with a currency of idle accounts (Easy Fit's six read-only USD accounts
 * beside its live MXN one).
 */
export function totalsByCurrency(
  reads: { currency: string | null; overview: HomeAccountOverview }[],
): CurrencyGroup[] {
  const byCurrency = new Map<string | null, HomeAccountOverview[]>();
  for (const { currency, overview } of reads) {
    byCurrency.set(currency, [...(byCurrency.get(currency) ?? []), overview]);
  }
  return [...byCurrency.entries()]
    .map(([currency, overviews], order) => ({
      order,
      group: {
        currency,
        totals: sumOverviews(overviews),
        spending: overviews.filter(spentIn).length,
      },
    }))
    .sort(
      (a, b) =>
        b.group.spending - a.group.spending ||
        b.group.totals.accountCount - a.group.totals.accountCount ||
        a.order - b.order,
    )
    .map(({ group }) => group);
}

/** What the goal inference reads: every result counted across currencies, and money (spend,
 *  revenue) from the lead currency only. */
export function resultTotalsAcross(groups: CurrencyGroup[]): HomeResultTotals {
  const [lead] = groups;
  const totals: HomeResultTotals = {};
  for (const metric of COUNTED) {
    if (HOME_OBJECTIVE_METRICS[metric].unit === 'currency') {
      const value = lead?.totals.current[metric];
      if (value !== undefined) totals[metric] = value;
      continue;
    }
    let sum: number | undefined;
    for (const group of groups) {
      const value = group.totals.current[metric];
      if (value !== undefined) sum = (sum ?? 0) + value;
    }
    if (sum !== undefined) totals[metric] = sum;
  }
  return totals;
}

export type CostReading = {
  label: string;
  value: number;
  previous: number | null;
  kind: 'money' | 'ratio';
};

export type ObjectiveFigure = {
  objective: HomeObjective;
  available: boolean;
  /** No account in the sum reports this metric at all (Google has no conversations). */
  unreported: boolean;
  value: number | null;
  previous: number | null;
  deltaPct: number | null;
  unit: 'count' | 'currency';
  cost: CostReading | null;
  series: number[];
};

function costFor(
  metric: HomeObjectiveMetric,
  value: number | undefined,
  spend: number | undefined,
): number | null {
  if (value === undefined || spend === undefined) return null;
  if (metric === 'purchase_value') return spend > 0 ? value / spend : null;
  if (metric === 'impressions') return value > 0 ? (spend / value) * 1000 : null;
  return value > 0 ? spend / value : null;
}

export function deltaPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function objectiveFigure(objective: HomeObjective, totals: OverviewTotals): ObjectiveFigure {
  const { metric } = objective;
  const meta = HOME_OBJECTIVE_METRICS[metric];
  const value = totals.current[metric];
  const previous = totals.previous[metric];

  let cost: CostReading | null = null;
  if (meta.costLabel) {
    const now = costFor(metric, value, totals.current.spend);
    if (now !== null) {
      cost = {
        label: meta.costLabel,
        value: now,
        previous: costFor(metric, previous, totals.previous.spend),
        kind: metric === 'purchase_value' ? 'ratio' : 'money',
      };
    }
  }

  return {
    objective,
    available: value !== undefined,
    unreported: totals.unreported.includes(metric),
    value: value ?? null,
    previous: previous ?? null,
    deltaPct: deltaPercent(value ?? null, previous ?? null),
    unit: meta.unit,
    cost,
    series: totals.series[metric] ?? [],
  };
}

/** Which ranking KPI orders campaigns and ads for an objective: the count, and its cost. */
export function rankingKpisFor(metric: HomeObjectiveMetric): {
  volume:
    | 'conversions'
    | 'conversations'
    | 'leads'
    | 'conversions_value'
    | 'clicks'
    | 'impressions'
    | 'spend';
  efficiency:
    | 'cost_per_conversion'
    | 'cost_per_conversation'
    | 'cost_per_lead'
    | 'roas'
    | 'cpc'
    | 'cpm'
    | null;
} {
  switch (metric) {
    case 'purchases':
      return { volume: 'conversions', efficiency: 'cost_per_conversion' };
    case 'purchase_value':
      return { volume: 'conversions_value', efficiency: 'roas' };
    case 'conversations':
      return { volume: 'conversations', efficiency: 'cost_per_conversation' };
    case 'leads':
      return { volume: 'leads', efficiency: 'cost_per_lead' };
    case 'clicks':
      return { volume: 'clicks', efficiency: 'cpc' };
    case 'impressions':
      return { volume: 'impressions', efficiency: 'cpm' };
    case 'spend':
      return { volume: 'spend', efficiency: null };
  }
}

/** How Google ranks campaigns by an objective's count: a business result is that result's
 *  conversions (its `resultBucket`); delivery is ranked as it is. Google reports no
 *  conversations, so it has nothing to rank for them. */
export function googleVolumeRanking(
  metric: HomeObjectiveMetric,
): { kpi: PaidEntityKpi; resultBucket?: GoogleHomeResult } | null {
  switch (metric) {
    case 'purchases':
      return { kpi: 'conversions', resultBucket: 'purchases' };
    case 'purchase_value':
      return { kpi: 'conversions_value', resultBucket: 'purchases' };
    case 'leads':
      return { kpi: 'conversions', resultBucket: 'leads' };
    case 'conversations':
      return null;
    case 'clicks':
    case 'impressions':
    case 'spend':
      return { kpi: metric };
  }
}

/** What a paid module (Performance +, Creative +) shows. A brand with no account the module can
 *  rank — none at all, or only Google accounts for Creative +, which ranks image ads — is told
 *  so: never a failed load with a Retry that cannot succeed, never a week in which its campaigns
 *  "brought nothing". */
export type PaidModuleState = 'no-meta-account' | 'loading' | 'error' | 'empty' | 'ready';

export function paidModuleState(
  metaAccounts: number,
  load: { status: 'loading' | 'error' | 'ready' },
  isEmpty: boolean,
): PaidModuleState {
  if (metaAccounts === 0) return 'no-meta-account';
  if (load.status !== 'ready') return load.status;
  return isEmpty ? 'empty' : 'ready';
}
