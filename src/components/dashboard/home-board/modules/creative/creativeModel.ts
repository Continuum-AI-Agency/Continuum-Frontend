// What the Creative tile draws, from the one stored creative report per brand
// (paid_media.creative_reports.report, read by usePaidCreativeReport). Pure: every figure is the
// stored one, every sentence names a real condition.
//
// The verdicts, said as they are measured (Backend paid-creative-intel/analysis/verdicts.ts):
//   scale   → Winning           cost ≤ 0.8× its cohort median over 14 days
//   kill    → Underperforming   cost > 1.5× the median on both 7 and 14 days, or no conversions
//   iterate → Needs a new angle strong hook with weak conversion, or the mid band
//   watch   → Too early         below the 50 spend / 3,000 impression floors, or no cohort yet
// The design's "Fading" is not drawn: fatigue (frequency, CTR trend, a fatigue score) is not in
// the report and needs a brand-level read that does not exist yet (Phase B R3). Its "New" is not
// drawn either: the report carries no ad age, and `watch` is about evidence, not age.
//
// Verdicts carry no ad account and the report is brand-wide, so a cost is printed only when every
// Meta account of the brand shares one stored currency. Otherwise each ad keeps only its ratio to
// the cohort median, which has no currency.
import type {
  PaidCreativeReport,
  PaidCreativeVerdict,
  PaidCreativeVerdictKind,
} from '@continuum/contracts';
import type { PaidCreativeReportStatus } from '@/hooks/usePaidCreativeReport';
import { formatMoney } from '@/lib/home/format';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';

export type CreativeStanding = 'winning' | 'losing' | 'iterate' | 'early';

const STANDING_BY_VERDICT: Record<PaidCreativeVerdictKind, CreativeStanding> = {
  scale: 'winning',
  kill: 'losing',
  iterate: 'iterate',
  watch: 'early',
};

export const STANDING_ORDER: readonly CreativeStanding[] = [
  'winning',
  'losing',
  'iterate',
  'early',
];

export const STANDING_LABEL: Record<CreativeStanding, string> = {
  winning: 'Winning',
  losing: 'Underperforming',
  iterate: 'Needs a new angle',
  early: 'Too early',
};

export const CREATIVE_MISSING = {
  noMetaAccount:
    'Creative verdicts read Meta ads, and this brand has no Meta ad account connected.',
  noReport:
    'No creative report yet — it appears after Continuum’s creative read labels this brand’s Meta ads.',
  noLabeledAds:
    'No Meta ad has been labeled yet — verdicts appear after the creative read labels the brand’s ads.',
  assemblyFailed:
    'The last creative read failed before it stored a report; it runs again with the next ad sync.',
  unreadable: 'The stored creative report is in a shape this version of the app cannot read.',
} as const;

/** Where the Home sends someone for what it does not do itself. */
export const CREATIVE_LINKS = {
  insights: '/scale?tab=creative-insights',
  /** The Optimizer: creative generation starts from a recommendation there. */
  optimizer: '/scale?tab=performance',
  /** AI Studio takes no ad, so it opens as itself. */
  studio: '/ai-studio',
  /** The organic winners table and its "Run as ad". */
  organicWinners: '/organic?tab=metrics',
} as const;

export function standingOfVerdict(verdict: PaidCreativeVerdictKind): CreativeStanding {
  return STANDING_BY_VERDICT[verdict];
}

/** The Meta accounts' one shared stored currency, or null (two currencies, or one unknown). */
export function verdictCurrency(accounts: HomeAdAccount[]): string | null {
  const meta = accounts.filter((account) => account.platform === 'meta');
  if (meta.length === 0 || meta.some((account) => !account.currency)) return null;
  const currencies = new Set(meta.map((account) => account.currency));
  return currencies.size === 1 ? (meta[0].currency as string) : null;
}

export type CreativeCard = {
  adId: string;
  adName: string;
  standing: CreativeStanding;
  /** The stored, figure-bearing reason, in the language it was written. */
  reason: string;
  /** Stored http(s) thumbnail only; null draws the neutral placeholder. */
  thumbnailUrl: string | null;
  permalinkUrl: string | null;
  spend: number | null;
  /** The ad's cost per result in the account currency; null when the currency is not one. */
  cost: string | null;
  vsCohort: string | null;
  briefTitle: string | null;
  optimizerRecommendationId: string | null;
};

export type StandingCounts = Record<CreativeStanding, number>;

export type CreativeSpotlight = {
  /** The headline: how many ads the report judged. */
  total: number;
  counts: StandingCounts;
  cards: CreativeCard[];
  themes: string[];
  currency: string | null;
  adAccountName: string | null;
  refreshFailed: boolean;
};

export type CreativeRead = {
  status: PaidCreativeReportStatus;
  report: PaidCreativeReport | null;
  isLoading: boolean;
  isError: boolean;
};

export type CreativeTileState =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'missing'; sentence: string }
  | { state: 'ready'; spotlight: CreativeSpotlight };

const httpUrl = (value: string | null): string | null =>
  value && /^https?:\/\//i.test(value) ? value : null;

function cardOf(
  verdict: PaidCreativeVerdict,
  currency: string | null,
  briefTitles: Map<string, string>,
): CreativeCard {
  return {
    adId: verdict.adId,
    adName: verdict.adName ?? `Ad ${verdict.adId}`,
    standing: standingOfVerdict(verdict.verdict),
    reason: verdict.reason,
    thumbnailUrl: httpUrl(verdict.thumbnailUrl),
    permalinkUrl: httpUrl(verdict.permalinkUrl),
    spend: verdict.spend,
    cost: currency && verdict.cpa !== null ? formatMoney(verdict.cpa, currency) : null,
    vsCohort:
      verdict.cpaVsCohortMedian === null
        ? null
        : `${verdict.cpaVsCohortMedian.toFixed(2)}× cohort median`,
    briefTitle: briefTitles.get(verdict.adId) ?? null,
    optimizerRecommendationId: verdict.optimizerRecommendationId,
  };
}

const bySpend = (a: CreativeCard, b: CreativeCard) => (b.spend ?? 0) - (a.spend ?? 0);

function spotlightOf(
  report: PaidCreativeReport,
  accounts: HomeAdAccount[],
  refreshFailed: boolean,
): CreativeSpotlight {
  const currency = verdictCurrency(accounts);
  const briefTitles = new Map(report.iterationBriefs.map((brief) => [brief.adId, brief.title]));
  const cards = report.verdicts
    .map((verdict) => cardOf(verdict, currency, briefTitles))
    .sort(
      (a, b) =>
        STANDING_ORDER.indexOf(a.standing) - STANDING_ORDER.indexOf(b.standing) || bySpend(a, b),
    );
  const counts: StandingCounts = { winning: 0, losing: 0, iterate: 0, early: 0 };
  for (const card of cards) counts[card.standing] += 1;
  return {
    total: cards.length,
    counts,
    cards,
    themes: report.synopsis?.themes ?? [],
    currency,
    adAccountName: accounts.find((account) => account.id === report.adAccountId)?.name ?? null,
    refreshFailed,
  };
}

export function creativeTileState(
  read: CreativeRead,
  accounts: HomeAdAccount[],
): CreativeTileState {
  if (!accounts.some((account) => account.platform === 'meta')) {
    return { state: 'missing', sentence: CREATIVE_MISSING.noMetaAccount };
  }
  if (read.report) {
    if (read.report.verdicts.length === 0) {
      return { state: 'missing', sentence: CREATIVE_MISSING.noLabeledAds };
    }
    return {
      state: 'ready',
      spotlight: spotlightOf(read.report, accounts, read.status === 'error'),
    };
  }
  if (read.isLoading) return { state: 'loading' };
  if (read.isError) return { state: 'error' };
  switch (read.status) {
    case 'assembling':
      return { state: 'missing', sentence: CREATIVE_MISSING.noReport };
    case 'empty':
      return { state: 'missing', sentence: CREATIVE_MISSING.noLabeledAds };
    case 'error':
      return { state: 'missing', sentence: CREATIVE_MISSING.assemblyFailed };
    case 'ready':
      return { state: 'missing', sentence: CREATIVE_MISSING.unreadable };
  }
}

/** The ads the report says need a new creative: underperforming and iterate, by spend. */
export function needsNewCreative(spotlight: CreativeSpotlight): CreativeCard[] {
  return spotlight.cards
    .filter((card) => card.standing === 'losing' || card.standing === 'iterate')
    .sort(bySpend);
}

const STANDING_COUNT_WORDS: Record<CreativeStanding, [one: string, many: string]> = {
  winning: ['winning', 'winning'],
  losing: ['underperforming', 'underperforming'],
  iterate: ['needs a new angle', 'need a new angle'],
  early: ['too early', 'too early'],
};

export function standingLine(counts: StandingCounts): string {
  return STANDING_ORDER.filter((standing) => counts[standing] > 0)
    .map((standing) => {
      const [one, many] = STANDING_COUNT_WORDS[standing];
      return `${counts[standing]} ${counts[standing] === 1 ? one : many}`;
    })
    .join(' · ');
}
