// Turns what the Frontend already loads about one ad account into the signals the Optimizer's
// reading takes (`readAdAccount` in @continuum/contracts). Pure, so the board's hook
// (useAdAccountReading), the e2e bench (optimizer:reading:bench) and the tests build the same
// signals from the same rows.
//
// The detectors' figures are taken as their cards computed them: a card's bars and typed fields
// first, its facts next, and the share a detector printed in its own sentences when the card
// carries it nowhere else (V5's share of keyword spend, P3's share of term spend). Every word
// matched is matched in English and in Spanish (decision 3, see "Card figures"). Nothing is
// recomputed from scratch, and a figure no card carries stays absent.

import {
  type AccountCandidate,
  type AccountPlatformMetrics,
  type AdAccount,
  type AdAccountCampaignSignal,
  type AdAccountCampaignsSignal,
  type AdAccountFindings,
  type AdAccountMissingInput,
  type AdAccountPlatform,
  type AdAccountPortfolioSignal,
  type AdAccountSeverity,
  type AdAccountSignals,
  type AdAccountWindowSignal,
  type AdSetSnapshot,
  EMPTY_AD_ACCOUNT_FINDINGS,
  type GoogleTopCampaigns,
  getOptimizationMetricDefinition,
  type PlatformCard,
  type PortfolioListItem,
  readingWindowNotMeasured,
  readingWindowOtherAccount,
  readingWindowSummed,
} from '@continuum/contracts';
import { platformWritable } from '@/components/paid-media/optimizer/platformWrites';
import { campaignTypeOf } from '@/components/paid-media/optimizer/sections/platforms/googleAdsOverviewModel';
import { accountPlatform } from '@/components/paid-media/optimizer/sections/platforms/platformTabsModel';
import { portfolioPlanPerDay } from '@/components/paid-media/optimizer/sections/portfolioPlan';
import { bareAccountId } from '@/lib/paid-media/accountId';

// ── Portfolios ────────────────────────────────────────────────────────────────

const APPLY_MODES = ['observe', 'recommend', 'autopilot'] as const;

function applyModeOf(value: string): AdAccountPortfolioSignal['applyMode'] {
  return APPLY_MODES.find((mode) => mode === value) ?? 'recommend';
}

/** One optimizer_list_portfolios row as the reading takes it. */
export function portfolioSignalOf(
  portfolio: PortfolioListItem,
  platform: AdAccountPlatform,
): AdAccountPortfolioSignal {
  return {
    id: portfolio.id,
    name: portfolio.name,
    applyMode: applyModeOf(portfolio.apply_mode),
    canWrite: platformWritable(portfolio, platform),
    autopilotPaused: portfolio.autopilot_paused === true,
    pendingRecommendations: portfolio.pending_recommendations,
    pendingBudgetMoves: portfolio.pending_budget_moves,
    rosterAbsent: portfolio.roster_state === 'absent',
    rosterMissing: portfolio.roster_missing_count ?? null,
    dailyBudget: portfolioPlanPerDay(portfolio),
    goal: portfolio.cpa_target ?? null,
    status: portfolio.status,
    objective: portfolio.objective,
    resultKind: getOptimizationMetricDefinition(portfolio.target_metric ?? portfolio.objective)
      .kpiField,
    cycleCurrent: portfolio.last_cycle_current,
    maxChangePct: portfolio.max_change_pct_per_cycle ?? null,
  };
}

/** A Google customer id: digits (with or without dashes), never a Meta act_ id. */
function isGoogleCustomer(accountId: string): boolean {
  return /^[\d-]+$/.test(accountId.trim());
}

/**
 * The portfolios that read this ad account. On Meta, every portfolio on Meta whose own account is
 * this one (a portfolio with no account belongs to every view, as the Overview lists it). On
 * Google, every portfolio with Google members, except one anchored to another Google customer of
 * the same brand: the Google tab lists the platform brand-wide, and a brand with one customer
 * keeps all of them.
 */
export function portfoliosOfAccount(
  portfolios: readonly PortfolioListItem[],
  platform: AdAccountPlatform,
  accountId: string | null,
): PortfolioListItem[] {
  return portfolios.filter((portfolio) => {
    const onPlatform =
      portfolio.platforms.length > 0 ? portfolio.platforms.includes(platform) : platform === 'meta';
    if (!onPlatform) return false;
    if (!accountId || portfolio.ad_account_id == null) return true;
    const same = bareAccountId(portfolio.ad_account_id) === bareAccountId(accountId);
    if (platform === 'meta') return same;
    return same || !isGoogleCustomer(portfolio.ad_account_id);
  });
}

/** The brand's Google Ads customer the Google tab reads: the first granted one, as
 *  useGoogleAdsOverview resolves it. */
export function googleAccountOf(accounts: readonly AdAccount[]): AdAccount | null {
  return accounts.find((account) => accountPlatform(account) === 'google_ads') ?? null;
}

// ── Card figures ──────────────────────────────────────────────────────────────
//
// A P8 card's words follow the account's language since decision 3 (2026-11-02): rows written
// before deploy:optimizer stay English and every cycle after it writes Spanish, so a reading
// meets both for a while. A figure the card carries as a number (its bars, its typed fields) is
// read from the number. A figure it carries only in words is found under its English label or
// sentence and under its Spanish one (packages/optimization-engine/src/multiplatform/
// accountDetectors.ts, the templates of both).

type FindingCard = Extract<PlatformCard, { variant: 'google_account_finding' }>;

/** The first figure in a producer-worded value ("$1,179 MXN/day", "3461 (85%)", "QS 3"). */
export function figureIn(text: string | null | undefined): number | null {
  const match = /-?\d[\d,]*(?:\.\d+)?/.exec(text ?? '');
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

/** The fact labels the mappers read, as the engine wrote them in English and writes them in
 *  Spanish. */
export const P8_FACT_LABELS = {
  reported: ['Conversions Google reports', 'Conversiones que Google reporta'],
  reportedCost: ['Reported cost per conversion', 'Costo por conversión reportado'],
  realCost: ['Real cost per result', 'Costo real por resultado'],
  budget: ['Budget', 'Presupuesto'],
  costPerConversion: ['Cost per conversion', 'Costo por conversión'],
  target: ['Target', 'CPA objetivo'],
  lostToRank: ['Lost to rank', 'Perdido por ranking'],
  darkDays: ['Dark days', 'Días sin anuncios'],
  darkRun: ['Dark', 'Sin anuncios'],
  stillDark: ['Still dark since', 'Sigue sin anuncios desde'],
  primaryToday: ['Primary today', 'Principales hoy'],
  competitorSpend: ['Spend on competitor searches', 'Gasto en búsquedas de competidores'],
  leads: ['Leads'],
  sales: ['Sales', 'Ventas'],
  roas: ['ROAS'],
} as const satisfies Record<string, readonly string[]>;

type FactKey = keyof typeof P8_FACT_LABELS;

function isFact(label: string, key: FactKey): boolean {
  return (P8_FACT_LABELS[key] as readonly string[]).includes(label);
}

function factOf(card: FindingCard, key: FactKey): string | null {
  return card.facts.find((fact) => isFact(fact.label, key))?.value ?? null;
}

/** What a card says only in its sentences (its reason, its headline), English then Spanish. */
const PRINTED = {
  keywordShare: [
    /\((\d+(?:\.\d+)?)% of the keyword spend\)/,
    /(\d+(?:\.\d+)?)% del gasto en palabras clave/,
  ],
  termShare: [
    /\((\d+(?:\.\d+)?)% of the term spend\)/,
    /\((\d+(?:\.\d+)?)% del gasto en términos\)/,
  ],
  termCount: [/^(\d+) search terms?\b/, /^(\d+) términos? de búsqueda/],
  termSpend: [
    /\bspent \D*(\d[\d,]*(?:\.\d+)?)/,
    /\bgast(?:ó|aron) \D*(\d[\d,]*(?:\.\d+)?)/,
    /sin intención de compra: \D*(\d[\d,]*(?:\.\d+)?)/,
  ],
  sameValue: [
    /All (\d+) conversion actions carry the same value/,
    /[Ll]as (\d+) acciones de conversión tienen el mismo valor/,
  ],
  actionValue: [/· (?:value|valor) (\S+)$/],
} as const satisfies Record<string, readonly RegExp[]>;

/** The first figure a pattern finds, in the texts in order: the reason (cut at 240 characters
 *  by the card builder), then the headline. */
function printed(
  patterns: readonly RegExp[],
  ...texts: (string | null | undefined)[]
): number | null {
  for (const text of texts) {
    if (!text) continue;
    for (const pattern of patterns) {
      const figure = pattern.exec(text)?.[1];
      const value = figure == null ? Number.NaN : Number(figure.replace(/,/g, ''));
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

/** The bar a card marks as the problem, and the first one it does not. */
function barsOf(card: FindingCard) {
  const bars = card.bars ?? [];
  return {
    bars,
    flagged: bars.find((bar) => bar.flagged) ?? null,
    plain: bars.find((bar) => !bar.flagged) ?? null,
  };
}

const SEVERITIES: readonly AdAccountSeverity[] = ['high', 'medium', 'low'];

function severityOf(candidate: AccountCandidate): AdAccountSeverity {
  const said = candidate.evidence.severity;
  return SEVERITIES.find((severity) => severity === said) ?? 'medium';
}

/** The detector ids of the P8 ideas (docs/jaina-google-goals/detalles.html §6). */
const IDEA_RULES: Record<FindingCard['idea'], string> = {
  inflated_primary_conversion: 'V1',
  brand_vs_nonbrand: 'V2',
  capped_budget_locked: 'V3',
  pmax_rescue_or_pause: 'V4',
  quality_score_by_service: 'V5',
  continuity_calendar: 'E1',
  paused_beat_active: 'E2',
  conversion_value_map: 'E3',
  competitor_terms: 'E4',
  google_recommendations_filtered: 'E5',
  client_executes_checklist: 'P1',
  device_split: 'P2',
  intent_negatives: 'P3',
  course_line_split: 'P4',
  lead_to_sale_funnel: 'P5',
};

/** The rule a card is filed under: the idea's id for a P8 finding, else the platform rule the
 *  card builder carries in `evidence.rule` (G03, G10, G12…). */
export function ruleOfCard(candidate: AccountCandidate): string {
  const card = candidate.platform_card;
  if (card?.variant === 'google_account_finding') return IDEA_RULES[card.idea];
  const rule = candidate.evidence.rule;
  return typeof rule === 'string' && rule.length > 0 ? rule : candidate.detector;
}

function applyFinding(
  findings: AdAccountFindings,
  card: FindingCard,
  reason: string,
  campaign: string | null,
): void {
  const { bars, flagged, plain } = barsOf(card);
  switch (card.idea) {
    case 'inflated_primary_conversion': {
      // Bars: the visits and attention events flagged, the leads and sales not.
      const reported = figureIn(factOf(card, 'reported'));
      if (!flagged || !plain || reported == null || reported <= 0) return;
      findings.inflated = {
        reported,
        attention: Math.round(flagged.value),
        attentionShare: flagged.share ?? flagged.value / reported,
        real: Math.round(plain.value),
        reportedCostPerResult: figureIn(factOf(card, 'reportedCost')),
        realCostPerResult: figureIn(factOf(card, 'realCost')),
        windowDays: card.window_days,
      };
      return;
    }
    case 'brand_vs_nonbrand': {
      // Bars: the brand flagged, non-brand not.
      if (flagged?.share == null) return;
      findings.brandTerms = {
        share: flagged.share,
        brandSpend: flagged.value,
        nonBrandSpend: plain?.value ?? 0,
      };
      return;
    }
    case 'capped_budget_locked': {
      // Bars: lost to budget flagged, shown not.
      if (flagged?.share == null || !campaign) return;
      findings.budgetLost.push({
        rule: 'V3',
        campaign,
        lostToBudget: flagged.share,
        budgetPerDay: figureIn(factOf(card, 'budget')),
      });
      return;
    }
    case 'pmax_rescue_or_pause': {
      if (!campaign) return;
      const rank = figureIn(factOf(card, 'lostToRank'));
      findings.pmaxRescue.push({
        campaign,
        // "no conversion" / "sin conversiones" carry no figure: no price to print.
        costPerResult: figureIn(factOf(card, 'costPerConversion')),
        target: figureIn(factOf(card, 'target')),
        rankLost: rank == null ? null : rank / 100,
      });
      return;
    }
    case 'quality_score_by_service': {
      // Bars: each service's low-score keyword spend.
      findings.lowQuality = {
        spend: bars.reduce((sum, bar) => sum + bar.value, 0),
        services: bars.length,
        keywordSpendShare: shareOf(printed(PRINTED.keywordShare, reason, card.headline)),
      };
      return;
    }
    case 'continuity_calendar': {
      const darkDays = figureIn(factOf(card, 'darkDays'));
      if (darkDays == null) return;
      const ongoing = card.facts.find((fact) => isFact(fact.label, 'stillDark'));
      const runs = card.facts.filter(
        (fact) => isFact(fact.label, 'darkRun') || isFact(fact.label, 'stillDark'),
      );
      const latest = ongoing ?? runs[runs.length - 1];
      findings.darkRun = {
        darkDays,
        ongoing: ongoing != null,
        latestSince: /^\d{4}-\d{2}-\d{2}/.exec(latest?.value ?? '')?.[0] ?? null,
      };
      return;
    }
    case 'conversion_value_map': {
      const values = card.facts
        .filter((fact) => !isFact(fact.label, 'primaryToday'))
        .map((fact) => PRINTED.actionValue[0].exec(fact.value)?.[1] ?? null);
      const known = values.filter((value): value is string => value != null);
      const same = known.length > 0 && known.every((value) => value === known[0]);
      // The detector says how many actions share one value; the reason is cut at 240
      // characters, so the headline is read too.
      const flat = printed(PRINTED.sameValue, reason, card.headline);
      findings.valueMap = {
        actions: flat ?? values.length,
        flatValue: flat != null && same ? figureIn(known[0]) : null,
      };
      return;
    }
    case 'competitor_terms': {
      const spend = figureIn(factOf(card, 'competitorSpend'));
      if (spend == null) return;
      findings.competitorTerms = {
        spend,
        competitors: (card.negatives ?? []).map((group) => group.theme),
      };
      return;
    }
    case 'intent_negatives': {
      const negatives = card.negatives ?? [];
      findings.intentTerms = {
        spend:
          printed(PRINTED.termSpend, reason, card.headline) ??
          card.facts.reduce((sum, fact) => sum + (figureIn(fact.value) ?? 0), 0),
        terms:
          printed(PRINTED.termCount, reason, card.headline) ??
          negatives.reduce((sum, group) => sum + group.terms.length, 0),
        themes: negatives.map((group) => group.theme),
        share: shareOf(printed(PRINTED.termShare, reason)),
      };
      return;
    }
    case 'course_line_split': {
      const lines = bars.flatMap((bar) =>
        bar.share != null && bar.target_share != null
          ? [{ name: bar.label, share: bar.share, targetShare: bar.target_share }]
          : [],
      );
      if (lines.length > 0) findings.courseLines = lines;
      return;
    }
    case 'lead_to_sale_funnel': {
      // Bars: clicks and leads, then the sales flagged; the sales' value is only a fact.
      const leads =
        bars.find((bar) => isFact(bar.label, 'leads'))?.value ?? figureIn(factOf(card, 'leads'));
      const sales = factOf(card, 'sales');
      if (leads == null || (flagged == null && sales == null)) return;
      const [count, value] = (sales ?? '').split('·');
      findings.leadToSale = {
        leads,
        sales: flagged?.value ?? figureIn(count) ?? 0,
        salesValue: figureIn(value),
        roas: figureIn(factOf(card, 'roas')),
      };
      return;
    }
    default:
      return;
  }
}

function shareOf(percent: number | null): number | null {
  return percent == null ? null : percent / 100;
}

/**
 * The Google tab's pending cards (optimizer_get_platform_cards) that belong to this account's
 * portfolios, as the reading's findings.
 */
export function googleFindingsFrom(
  cards: readonly AccountCandidate[],
  portfolioIds: ReadonlySet<string>,
): AdAccountFindings {
  const findings: AdAccountFindings = structuredClone(EMPTY_AD_ACCOUNT_FINDINGS);
  for (const candidate of cards) {
    const owner = candidate.portfolio_ids[0];
    if (owner && !portfolioIds.has(owner)) continue;
    findings.cards.push({ rule: ruleOfCard(candidate), severity: severityOf(candidate) });
    const card = candidate.platform_card;
    if (!card) continue;
    switch (card.variant) {
      case 'google_account_finding':
        applyFinding(findings, card, candidate.impact_basis, card.campaign_name);
        break;
      case 'google_delivery_issue':
        findings.delivery.push({
          campaign: card.campaign_name,
          accountWide: card.account_wide,
          suspended: card.reasons.includes('SERVING_STATUS_SUSPENDED'),
          darkDays: card.dark_days,
          darkSince: card.dark_since ?? null,
          budgetPerDay: card.budget_per_day,
          reasons: card.reasons,
        });
        break;
      case 'google_budget_limited':
        findings.budgetLost.push({
          rule: 'G03',
          campaign: card.campaign_name,
          lostToBudget: card.budget_lost_impression_share,
          budgetPerDay: card.budget_per_day,
        });
        break;
      case 'google_ad_winner':
        findings.adWinner ??= {
          campaign: card.campaign_name,
          winner: card.winner.label,
          winnerCostPerResult: card.winner.cost_per_result,
          comparator: card.comparator.label,
          comparatorCostPerResult: card.comparator.cost_per_result,
        };
        break;
      case 'google_pmax_assets':
      case 'google_pmax_asset_group':
        if (!findings.pmaxAssets.includes(card.campaign_name))
          findings.pmaxAssets.push(card.campaign_name);
        break;
      default:
        break;
    }
  }
  return findings;
}

function evidenceNumber(candidate: AccountCandidate, key: string): number | null {
  const value = candidate.evidence[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The Meta account read (optimizer_get_account_read): its ranked candidates and its guards. */
export function metaFindingsFrom(
  read: { candidates: readonly AccountCandidate[]; guards: readonly AccountCandidate[] } | null,
): AdAccountFindings {
  const findings: AdAccountFindings = structuredClone(EMPTY_AD_ACCOUNT_FINDINGS);
  if (!read) return findings;
  for (const [candidate, guard] of [
    ...read.guards.map((candidate) => [candidate, true] as const),
    ...read.candidates.map((candidate) => [candidate, false] as const),
  ]) {
    findings.cards.push({ rule: candidate.detector, severity: guard ? 'high' : 'medium' });
    if (candidate.detector === 'delivery_collapse') {
      const planned = evidenceNumber(candidate, 'planned_per_day');
      if (planned == null) continue;
      const portfolio = candidate.evidence.portfolio;
      findings.deliveryCollapse.push({
        portfolioId: candidate.portfolio_ids[0] ?? null,
        portfolio: typeof portfolio === 'string' ? portfolio : null,
        plannedPerDay: planned,
        deliveredPerDay: evidenceNumber(candidate, 'delivered_per_day') ?? 0,
      });
    } else if (candidate.detector === 'measurement_integrity') {
      findings.measurement.push({
        portfolioIds: candidate.portfolio_ids,
        detail: candidate.impact_basis,
      });
    } else if (candidate.detector === 'auction_pressure') {
      const now = evidenceNumber(candidate, 'cpm_now');
      const prior = evidenceNumber(candidate, 'cpm_prior');
      const change = evidenceNumber(candidate, 'cpm_change_pct');
      if (now != null && prior != null && change != null)
        findings.cpmDrift = { cpmNow: now, cpmPrior: prior, changePct: change };
    }
  }
  return findings;
}

// ── The producer's window ─────────────────────────────────────────────────────

function daysIn(since: string, until: string): number {
  const ms = Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) + 1 : 0;
}

const PRODUCER_PLATFORM: Record<AdAccountPlatform, string> = {
  meta: 'meta',
  google_ads: 'google_ads',
};

/**
 * The account's spend and results from optimizer_get_account_platform_metrics. The producer sums
 * a platform across the brand, so its row is this account's only when this is the one account it
 * ingested on that platform; otherwise null, and the reason says why.
 */
export function windowSignalFrom(
  metrics: AccountPlatformMetrics | null,
  platform: AdAccountPlatform,
  accountId: string | null,
): { window: AdAccountWindowSignal | null; why: string | null } {
  if (!metrics) return { window: null, why: null };
  const row = metrics.totals_by_platform.find(
    (totals) => totals.platform === PRODUCER_PLATFORM[platform],
  );
  if (!row?.connected || row.spend == null) {
    return { window: null, why: readingWindowNotMeasured() };
  }
  const ingested = row.accounts.filter((account) => account.ingested);
  const mine =
    accountId != null &&
    ingested.length === 1 &&
    bareAccountId(ingested[0]?.account_id ?? '') === bareAccountId(accountId);
  if (!mine) {
    const other = ingested[0]?.account_id;
    return {
      window: null,
      why:
        ingested.length === 0 || other == null
          ? readingWindowNotMeasured()
          : ingested.length === 1
            ? readingWindowOtherAccount(other)
            : readingWindowSummed(ingested.length),
    };
  }
  return {
    window: {
      days: daysIn(metrics.window.since, metrics.window.until),
      since: metrics.window.since,
      until: metrics.window.until,
      spend: row.spend,
      kinds: row.results_by_kind.map((kind) => ({
        kind: kind.kind,
        results: kind.results,
        spend: kind.spend,
        costPerResult: kind.cost_per_result,
        priorResults: kind.prior_results,
        priorCostPerResult: kind.prior_cost_per_result,
      })),
    },
    why: null,
  };
}

// ── The platform's campaign read ──────────────────────────────────────────────

/** Google's top_campaigns (paid-media-metrics), every campaign that spent, with its type, its
 *  results of the tab's result and its Search impression shares. */
export function googleCampaignsFrom(
  read: GoogleTopCampaigns,
  resultKind: string | null,
): AdAccountCampaignsSignal {
  const campaigns: AdAccountCampaignSignal[] = read.rows
    .filter((row) => row.metrics.spend > 0)
    .map((row) => {
      const byResult = row.metrics.byResult;
      const counted =
        row.metrics.conversions ??
        (resultKind && byResult && resultKind in byResult
          ? (byResult[resultKind as keyof typeof byResult] ?? 0)
          : null);
      return {
        id: row.id,
        name: row.name,
        type: campaignTypeOf(row.labels?.channel_type) ?? 'campaign',
        spend: row.metrics.spend,
        results: counted,
        impressions: row.metrics.impressions,
        adSets: null,
        lostToBudget: row.google?.search_budget_lost_impression_share ?? null,
        lostToRank: row.google?.search_rank_lost_impression_share ?? null,
      };
    });
  return {
    windowDays: daysIn(read.range.since, read.range.until),
    resultKind,
    campaigns,
  };
}

type WindowMetricsKey = keyof AdSetSnapshot['windows']['d7'];

/** Meta's ad-set snapshots (paid-media-metrics adset_snapshots) folded into campaigns over the
 *  last seven days: spend, impressions, the portfolio's result and the ad sets that spent. */
export function metaCampaignsFrom(
  snapshots: readonly AdSetSnapshot[],
  resultKind: string | null,
): AdAccountCampaignsSignal {
  const byCampaign = new Map<
    string,
    { name: string; spend: number; impressions: number; results: number | null; adSets: number }
  >();
  for (const snapshot of snapshots) {
    const window = snapshot.windows.d7;
    if (window.spend <= 0) continue;
    const key = snapshot.campaignId ?? snapshot.campaignName ?? snapshot.id;
    const row = byCampaign.get(key) ?? {
      name: snapshot.campaignName ?? snapshot.name ?? key,
      spend: 0,
      impressions: 0,
      results: 0,
      adSets: 0,
    };
    row.spend += window.spend;
    row.impressions += window.impressions;
    row.adSets += 1;
    const counted =
      resultKind && resultKind in window ? window[resultKind as WindowMetricsKey] : undefined;
    row.results = row.results == null || typeof counted !== 'number' ? null : row.results + counted;
    byCampaign.set(key, row);
  }
  return {
    windowDays: 7,
    resultKind,
    campaigns: [...byCampaign.entries()]
      .map(([id, row]) => ({
        id,
        name: row.name,
        type: 'campaign' as const,
        spend: row.spend,
        results: row.results,
        impressions: row.impressions,
        adSets: row.adSets,
        lostToBudget: null,
        lostToRank: null,
      }))
      .sort((a, b) => b.spend - a.spend),
  };
}

// ── The whole account ─────────────────────────────────────────────────────────

export type AdAccountReads = {
  platform: AdAccountPlatform;
  accountId: string | null;
  currency: string | null;
  /** optimizer_list_portfolios rows already scoped to the account (portfoliosOfAccount). */
  portfolios: readonly PortfolioListItem[];
  approvalRequired: boolean;
  /** Google: optimizer_get_platform_cards for google_ads. Null when not read. */
  googleCards?: readonly AccountCandidate[] | null;
  /** Meta: optimizer_get_account_read's candidates and guards. Null when not read or absent. */
  metaRead?: {
    candidates: readonly AccountCandidate[];
    guards: readonly AccountCandidate[];
  } | null;
  metrics?: AccountPlatformMetrics | null;
  /** Google: top_campaigns over the sections' window, with the result it counted. */
  googleCampaigns?: { read: GoogleTopCampaigns; resultKind: string | null } | null;
  /** Meta: the account's ad-set snapshots. */
  metaSnapshots?: readonly AdSetSnapshot[] | null;
  /** Inputs that could not be read, with why. */
  missing?: AdAccountMissingInput[];
};

/** Everything the reading takes, from what the page (or the bench) read. */
export function adAccountSignalsFrom(reads: AdAccountReads): AdAccountSignals {
  const portfolios = reads.portfolios.map((portfolio) =>
    portfolioSignalOf(portfolio, reads.platform),
  );
  const ids = new Set(portfolios.map((portfolio) => portfolio.id));
  const missing = [...(reads.missing ?? [])];
  const findings =
    reads.platform === 'google_ads'
      ? reads.googleCards
        ? googleFindingsFrom(reads.googleCards, ids)
        : null
      : reads.metaRead !== undefined
        ? metaFindingsFrom(reads.metaRead)
        : null;
  const { window, why } = windowSignalFrom(reads.metrics ?? null, reads.platform, reads.accountId);
  if (why && !missing.some((line) => line.input === 'window'))
    missing.push({ input: 'window', reason: why });
  const primaryKind =
    [...portfolios]
      .filter((portfolio) => !portfolio.rosterAbsent)
      .sort((a, b) => (b.dailyBudget ?? 0) - (a.dailyBudget ?? 0))[0]?.resultKind ?? null;
  const campaigns =
    reads.platform === 'google_ads'
      ? reads.googleCampaigns
        ? googleCampaignsFrom(reads.googleCampaigns.read, reads.googleCampaigns.resultKind)
        : null
      : reads.metaSnapshots
        ? metaCampaignsFrom(reads.metaSnapshots, primaryKind)
        : null;
  return {
    platform: reads.platform,
    accountId: reads.accountId,
    currency: reads.currency,
    portfolios,
    approvalRequired: reads.approvalRequired,
    findings,
    window,
    campaigns,
    missing,
  };
}
