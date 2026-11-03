// How the Optimizer reads one ad account: how Continuum works it (the mode), the result that
// counts, which modules the board shows, in what order and size, and why each one is there.
// It is the Home's readBrand (home/brandReading.ts) applied to an ad account, and it is pure:
// every sentence it returns names a figure from its inputs, so each one can be checked.
//
// The inputs are what the Frontend already reads (docs/optimizer-redesign/adaptive-15, #sistema):
// the portfolios, the detectors' pending cards (their figures already computed — the reading
// prefers them to computing its own), the producer's spend and results for the window, and the
// platform's campaign read. Every block but the portfolios is optional: a block nobody could read
// is absent, and the module that needed it is hidden with the reason, never drawn from a guess.
//
// The output types (AdAccountReading and what it holds) are the seam every board module in the
// Frontend renders from. Change them additively only.

import { z } from 'zod';
import { formatMoney } from './money';

export const adAccountModeSchema = z.enum(['fix', 'operate', 'approve', 'recommend', 'setup']);
export type AdAccountMode = z.infer<typeof adAccountModeSchema>;

export const adAccountPlatformSchema = z.enum(['meta', 'google_ads']);
export type AdAccountPlatform = z.infer<typeof adAccountPlatformSchema>;

/** The modules a board can hold. The spine (result, decisions, portfolios) is on both
 *  platforms. The Google lenses are mix, auction, terms, quality, pmax and signal. The Meta
 *  views are branches, headroom, events and structure. */
export const boardModuleIdSchema = z.enum([
  'result',
  'decisions',
  'portfolios',
  'mix',
  'auction',
  'terms',
  'quality',
  'pmax',
  'signal',
  'branches',
  'headroom',
  'events',
  'structure',
]);
export type BoardModuleId = z.infer<typeof boardModuleIdSchema>;

/** s: one column. m: two columns. l: two columns and the tallest body. w: the full row. */
export const boardModuleSizeSchema = z.enum(['s', 'm', 'l', 'w']);
export type BoardModuleSize = z.infer<typeof boardModuleSizeSchema>;

export type AdAccountBoardSlot = {
  module: BoardModuleId;
  size: BoardModuleSize;
  /** Impact on the result × urgency × confidence, 0 to 100. The board is sorted by it. */
  score: number;
  /** One sentence in the account's language that names the figure that put the module here. */
  reason: string;
};

export type AdAccountResult = {
  /** What counts as a result on this account, in the account's language ("leads reales"). */
  label: string;
  /** Results counted in the window; null while unknown. */
  count: number | null;
  /** What the platform reports when it differs from what counts (Vivo 47: 3,857 against 572). */
  platformReported: number | null;
  costPerResult: number | null;
  /** The portfolio goal for the cost per result; null when no portfolio sets one. */
  goal: number | null;
  spend: number | null;
  currency: string | null;
  windowDays: number;
  /** Where the count comes from: the inflated-conversion card (V1), the Optimizer's own
   *  producer, the platform's campaign read, or nothing yet. */
  source?: AdAccountResultSource;
  /** The result kind counted ('leads', 'conversations', …); null when none is defined. */
  kind?: string | null;
};

export type AdAccountResultSource = 'inflated_conversion' | 'producer' | 'campaigns' | 'none';

/** A problem under the Fix-first line (Ramiro's decision 2, 2026-11-02): it is said, and the
 *  mode stays. */
export type AdAccountNotice = {
  module: BoardModuleId;
  /** One sentence in the account's language, with the share that kept it under the line. */
  reason: string;
  /** Share of what the account moves a day that the problem touches, 0..1; null when unknown. */
  share: number | null;
};

export type AdAccountReading = {
  platform: AdAccountPlatform;
  mode: AdAccountMode;
  /** Product chrome, in English: "Fix first", "Autopilot", "You approve"… */
  modeLabel: string;
  /** One sentence in the account's language: why the board runs in this mode. */
  modeReason: string;
  result: AdAccountResult;
  /** The modules in board order, the highest score first. The spine is always present. */
  board: AdAccountBoardSlot[];
  /** Modules that were considered and left out, each with the reason. */
  hidden: { module: BoardModuleId; reason: string }[];
  /** Questions for Jaina that follow from this reading, in the account's language. */
  asks: string[];
  /** Problems below the Fix-first line, said without changing the mode. */
  notices?: AdAccountNotice[];
  /** Inputs the reading could not read, each said in the account's language. */
  missing?: string[];
};

export const AD_ACCOUNT_MODE_LABELS: Record<AdAccountMode, string> = {
  fix: 'Fix first',
  operate: 'Autopilot',
  approve: 'You approve',
  recommend: 'Continuum recommends',
  setup: 'Setting up',
};

// ── Inputs ───────────────────────────────────────────────────────────────────

/** One Optimizer portfolio on the account, as much of optimizer_list_portfolios as the reading
 *  needs. */
export const adAccountPortfolioSignalSchema = z.object({
  id: z.string(),
  name: z.string(),
  applyMode: z.enum(['observe', 'recommend', 'autopilot']),
  /** Continuum may write budgets on this platform (platform_writes). False when the client
   *  applies the changes (Pink Elephant). */
  canWrite: z.boolean(),
  autopilotPaused: z.boolean(),
  pendingRecommendations: z.number().int().nonnegative(),
  /** The ad sets or campaigns it manages are no longer in the account. */
  rosterAbsent: z.boolean(),
  /** The daily plan every screen prints (portfolioPlanPerDay): what the last cycle conserved on
   *  an observed budget, the typed total on a fixed one. */
  dailyBudget: z.number().nullable(),
  /** The portfolio's cost-per-result goal; null when it has none. */
  goal: z.number().nullable(),
  /** active, paused or archived; absent reads as active. */
  status: z.string().optional(),
  /** The objective the portfolio buys (lead, conversations, purchase…). */
  objective: z.string().optional(),
  /** The result kind it is measured in: its KPI field (leads, conversations, purchases…). */
  resultKind: z.string().optional(),
  /** Budget moves of the latest cycle still to act on. */
  pendingBudgetMoves: z.number().int().nonnegative().optional(),
  /** Members the platform no longer lists. */
  rosterMissing: z.number().int().nonnegative().nullable().optional(),
  /** False when the latest cycle can no longer be acted on (missed cycles, roster gone). */
  cycleCurrent: z.boolean().nullable().optional(),
  /** The autopilot's per-cycle ceiling, a fraction (0.2 = 20%). */
  maxChangePct: z.number().nullable().optional(),
});
export type AdAccountPortfolioSignal = z.infer<typeof adAccountPortfolioSignalSchema>;

/** A Google campaign type, or `campaign` when the row is one campaign with no type (Meta). */
export type AdAccountCampaignType =
  | 'search'
  | 'pmax'
  | 'video'
  | 'display'
  | 'shopping'
  | 'other'
  | 'campaign';

/** One campaign that spent in the window, as the platform's own read reports it. */
export type AdAccountCampaignSignal = {
  id: string;
  name: string;
  type: AdAccountCampaignType;
  spend: number;
  /** Results of the read's result kind; null when the read did not count them. */
  results: number | null;
  impressions: number | null;
  /** Ad sets with spend (Meta); null when unknown. */
  adSets: number | null;
  /** Share of Search impressions lost to budget and to rank, 0..1 (Google); null when not
   *  reported for this campaign. */
  lostToBudget: number | null;
  lostToRank: number | null;
};

export type AdAccountCampaignsSignal = {
  windowDays: number;
  /** The result the campaigns' `results` count ('leads', 'conversations'…); null when none. */
  resultKind: string | null;
  campaigns: AdAccountCampaignSignal[];
};

/** The Optimizer's producer (optimizer_get_account_platform_metrics) for the account's platform. */
export type AdAccountWindowSignal = {
  days: number;
  since: string;
  until: string;
  spend: number | null;
  kinds: {
    kind: string;
    results: number;
    spend: number;
    costPerResult: number | null;
    priorResults: number | null;
    priorCostPerResult: number | null;
  }[];
};

export type AdAccountSeverity = 'high' | 'medium' | 'low';

/** What the detectors found, with the figures their cards already computed. Google's come from
 *  the platform cards (`evidence.rule`: V1–V5, E1, E3, E4, P3–P5, G03, G10, G12); Meta's from
 *  the account read's candidates. */
export type AdAccountFindings = {
  /** Every pending card on the account, for the decisions slot. */
  cards: { rule: string; severity: AdAccountSeverity }[];
  /** G12: campaigns that should serve and show no ad, or whose serving Google suspended. */
  delivery: {
    campaign: string;
    accountWide: boolean;
    suspended: boolean;
    darkDays: number;
    darkSince: string | null;
    budgetPerDay: number | null;
    reasons: string[];
  }[];
  /** E1: dark days after the account first served. */
  darkRun: { darkDays: number; ongoing: boolean; latestSince: string | null } | null;
  /** V1: the primary conversion counts attention events. */
  inflated: {
    reported: number;
    attention: number;
    attentionShare: number;
    real: number;
    reportedCostPerResult: number | null;
    realCostPerResult: number | null;
    windowDays: number;
  } | null;
  /** V2: brand terms bought inside campaigns that also look for new demand. */
  brandTerms: { share: number; brandSpend: number; nonBrandSpend: number } | null;
  /** V3 and G03: Search impressions lost to budget. */
  budgetLost: {
    rule: 'V3' | 'G03';
    campaign: string;
    lostToBudget: number;
    budgetPerDay: number | null;
  }[];
  /** V4: a Performance Max costing a multiple of its target. */
  pmaxRescue: {
    campaign: string;
    costPerResult: number | null;
    target: number | null;
    rankLost: number | null;
  }[];
  /** G18: Performance Max campaigns whose assets a card names. */
  pmaxAssets: string[];
  /** V5: keywords with Quality Score 3 or less. */
  lowQuality: { spend: number; services: number; keywordSpendShare: number | null } | null;
  /** E3: the conversion actions and their values. `flatValue` is the one value every action
   *  carries, null when they differ. */
  valueMap: { actions: number; flatValue: number | null } | null;
  /** E4: searches for competitors that spend without converting. */
  competitorTerms: { spend: number; competitors: string[] } | null;
  /** P3: off-intent searches, with their share of the term spend when the detector said it. */
  intentTerms: { spend: number; terms: number; themes: string[]; share: number | null } | null;
  /** P4: spend by course line against the agreed split. */
  courseLines: { name: string; share: number; targetShare: number }[] | null;
  /** P5: leads that do not become sales. */
  leadToSale: {
    leads: number;
    sales: number;
    salesValue: number | null;
    roas: number | null;
  } | null;
  /** G10: the winning ad of an ad group against a dearer sibling. */
  adWinner: {
    campaign: string;
    winner: string;
    winnerCostPerResult: number;
    comparator: string;
    comparatorCostPerResult: number;
  } | null;
  /** Meta delivery_collapse: a portfolio's budget planned and not spent. */
  deliveryCollapse: {
    portfolioId: string | null;
    portfolio: string | null;
    plannedPerDay: number;
    deliveredPerDay: number;
  }[];
  /** Meta measurement_integrity guards: the figures cannot be trusted. */
  measurement: { portfolioIds: string[]; detail: string }[];
  /** Meta auction_pressure: the account's CPM against the week before. */
  cpmDrift: { cpmNow: number; cpmPrior: number; changePct: number } | null;
};

export type AdAccountSignals = {
  platform: AdAccountPlatform;
  portfolios: AdAccountPortfolioSignal[];
  /** Changes on this brand go through an approval chain before they are applied. */
  approvalRequired: boolean;
  currency: string | null;
  /** The ad account read (act_… on Meta, the customer id on Google). */
  accountId?: string | null;
  findings?: AdAccountFindings | null;
  window?: AdAccountWindowSignal | null;
  campaigns?: AdAccountCampaignsSignal | null;
  /** Inputs that could not be read, each with the sentence the hidden modules say. */
  missing?: AdAccountMissingInput[];
};

/** An input block that could not be read, and why, in the account's language. */
export type AdAccountMissingInput = {
  input: 'portfolios' | 'cards' | 'window' | 'campaigns' | 'approval';
  reason: string;
};

export const EMPTY_AD_ACCOUNT_FINDINGS: AdAccountFindings = {
  cards: [],
  delivery: [],
  darkRun: null,
  inflated: null,
  brandTerms: null,
  budgetLost: [],
  pmaxRescue: [],
  pmaxAssets: [],
  lowQuality: null,
  valueMap: null,
  competitorTerms: null,
  intentTerms: null,
  courseLines: null,
  leadToSale: null,
  adWinner: null,
  deliveryCollapse: [],
  measurement: [],
  cpmDrift: null,
};

// ── Thresholds (docs/optimizer-redesign/adaptive-15 #sistema; the detectors' own) ──────────

/** Ramiro's decision 2: Fix first only when a problem touches half of what the account moves. */
export const FIX_MIN_SHARE = 0.5;
/** G05 Mix: two campaign types, or three campaigns with spend. */
export const MIX_MIN_TYPES = 2;
export const MIX_MIN_CAMPAIGNS = 3;
/** G06 Auction: impressions lost to budget or rank on Search. */
export const AUCTION_MIN_LOST = 0.1;
/** G07 Terms: brand share (V2); competitor (E4, 1%) and off-intent (P3, 3%) fire in the
 *  detectors, so their cards are the evidence. */
export const TERMS_MIN_BRAND_SHARE = 0.3;
/** G08 Quality (V5): low-score keywords' share of keyword spend. */
export const QUALITY_MIN_SHARE = 0.1;
/** G09 PMax: its share of spend, or the multiple of its target (V4). */
export const PMAX_MIN_SHARE = 0.3;
export const PMAX_RESCUE_MULTIPLE = 3;
/** G10 Signal (P5): leads that become sales at this rate or less. */
export const SIGNAL_MAX_SALE_RATE = 0.2;
/** Meta branches: campaigns with spend. */
export const BRANCHES_MIN_CAMPAIGNS = 3;
/** Meta headroom: campaigns with a CPM to compare. */
export const HEADROOM_MIN_CAMPAIGNS = 2;

/** The window the board shows when no read names one: the Overview's seven complete days. */
const DEFAULT_WINDOW_DAYS = 7;

// ── Words and figures ─────────────────────────────────────────────────────────

type ResultWords = { one: string; many: string; the: 'los' | 'las' };

const RESULT_WORDS: Record<string, ResultWords> = {
  leads: { one: 'lead', many: 'leads', the: 'los' },
  purchases: { one: 'compra', many: 'compras', the: 'las' },
  conversations: { one: 'conversación', many: 'conversaciones', the: 'las' },
  signups: { one: 'registro', many: 'registros', the: 'los' },
  appInstalls: { one: 'instalación', many: 'instalaciones', the: 'las' },
  landingPageViews: { one: 'visita a la página', many: 'visitas a la página', the: 'las' },
  linkClicks: { one: 'clic al enlace', many: 'clics al enlace', the: 'los' },
  thruplays: { one: 'reproducción', many: 'reproducciones', the: 'las' },
  postEngagement: { one: 'interacción', many: 'interacciones', the: 'las' },
  clicks: { one: 'clic', many: 'clics', the: 'los' },
  impressions: { one: 'impresión', many: 'impresiones', the: 'las' },
};

const RESULTS: ResultWords = { one: 'resultado', many: 'resultados', the: 'los' };

/** What the inflated-conversion card counts instead of Google's conversions. */
const REAL_RESULTS = 'leads y ventas reales';

const OBJECTIVE_EVENTS: Record<string, string> = {
  purchase: 'compras',
  lead: 'leads',
  conversations: 'conversaciones',
  signup: 'registros',
  app_install: 'instalaciones',
  traffic: 'tráfico',
  awareness: 'alcance',
  link_clicks: 'clics al enlace',
  thruplays: 'reproducciones',
  post_engagement: 'interacciones',
  clicks: 'clics',
  custom: 'una conversión propia',
};

const TYPE_LABELS: Record<AdAccountCampaignType, string> = {
  search: 'Search',
  pmax: 'Performance Max',
  video: 'YouTube / Demand Gen',
  display: 'Display',
  shopping: 'Shopping',
  other: 'Otras campañas',
  campaign: 'Campañas',
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function wordsOf(kind: string | null | undefined): ResultWords {
  return (kind && RESULT_WORDS[kind]) || RESULTS;
}

function count(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function plural(value: number, one: string, many: string): string {
  return `${count(value)} ${Math.round(value) === 1 ? one : many}`;
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** "26 oct" from an ISO day; the input itself when it is not one. */
function dayLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? match[2]}`;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Impact × urgency × confidence, 0 to 100. */
function scoreOf(impact: number, urgency: number, confidence: number): number {
  return Math.round(100 * clamp01(impact) * clamp01(urgency) * clamp01(confidence));
}

/** A lens's urgency never reaches the mode's lead: only a fix, the decisions an operating
 *  board opens with, and the first portfolio of a new account carry 1. */
const MAX_LENS_URGENCY = 0.9;

// ── The account as the rules see it ───────────────────────────────────────────

type Context = {
  signals: AdAccountSignals;
  money: (value: number) => string;
  findings: AdAccountFindings;
  portfolios: AdAccountPortfolioSignal[];
  /** Portfolios that can act: active and not only observing. */
  acting: AdAccountPortfolioSignal[];
  /** The acting portfolio with the largest plan: the result the board counts is its own. */
  primary: AdAccountPortfolioSignal | null;
  /** What the account spends a day (the producer's window), null when unknown. */
  spendPerDay: number | null;
  /** The portfolios' plans summed. */
  planTotal: number;
  campaigns: AdAccountCampaignSignal[] | null;
};

function isActive(portfolio: AdAccountPortfolioSignal): boolean {
  return (portfolio.status ?? 'active') === 'active';
}

function contextOf(signals: AdAccountSignals): Context {
  const portfolios = signals.portfolios;
  const acting = portfolios.filter(
    (portfolio) => isActive(portfolio) && portfolio.applyMode !== 'observe',
  );
  const byPlan = [...(acting.length > 0 ? acting : portfolios)]
    .filter((portfolio) => !portfolio.rosterAbsent)
    .sort((a, b) => (b.dailyBudget ?? 0) - (a.dailyBudget ?? 0) || a.name.localeCompare(b.name));
  const window = signals.window ?? null;
  const spendPerDay =
    window && window.spend != null && window.days > 0 ? window.spend / window.days : null;
  return {
    signals,
    money: (value: number) => formatMoney(value, signals.currency),
    findings: signals.findings ?? EMPTY_AD_ACCOUNT_FINDINGS,
    portfolios,
    acting,
    primary: byPlan[0] ?? null,
    spendPerDay,
    planTotal: portfolios.reduce((sum, portfolio) => sum + (portfolio.dailyBudget ?? 0), 0),
    campaigns: signals.campaigns?.campaigns.filter((campaign) => campaign.spend > 0) ?? null,
  };
}

// ── Problems: what can put the board in Fix first ─────────────────────────────

type Problem = {
  module: BoardModuleId;
  /** Share of what the account moves a day that the problem touches; null when unknown. */
  share: number | null;
  /** The account itself is not delivering. */
  accountWide: boolean;
  confidence: number;
  /** The sentence the board opens with when the problem puts it in Fix first. */
  reason: string;
  /** The same finding as a clause, with the share that kept it under the line. */
  clause: string;
};

/** Money a problem keeps from being spent, against what the account spends a day plus that
 *  money. Without the producer's spend, against that money plus the other portfolios' plans:
 *  `ownPlan` is the plan of the portfolio the money belongs to, 0 when no portfolio holds it. */
function idleShare(ctx: Context, perDay: number, ownPlan = 0): number | null {
  if (perDay <= 0) return null;
  if (ctx.spendPerDay != null) return clamp01(perDay / (perDay + ctx.spendPerDay));
  const others = Math.max(0, ctx.planTotal - ownPlan);
  return clamp01(perDay / (perDay + others));
}

function planOf(ctx: Context, portfolioId: string | null): number {
  return ctx.portfolios.find((portfolio) => portfolio.id === portfolioId)?.dailyBudget ?? 0;
}

/** "34% de lo que mueve la cuenta al día", or the plan's share when no spend was measured. */
function shareWords(ctx: Context, share: number): string {
  return ctx.spendPerDay != null
    ? `${pct(share)} de lo que mueve la cuenta al día`
    : `${pct(share)} de lo que la cuenta planea mover al día`;
}

function withShare(ctx: Context, perDay: number, share: number | null): string {
  const money = ctx.money(perDay);
  return share == null ? `${money} al día` : `${money} al día, ${shareWords(ctx, share)}`;
}

function deliveryProblems(ctx: Context): Problem[] {
  const { findings } = ctx;
  const problems: Problem[] = [];
  const account = findings.delivery.find((card) => card.accountWide);
  if (account) {
    const why = account.suspended
      ? 'Google suspendió la cuenta'
      : `Google dice ${account.reasons.join(', ')}`;
    const clause = `ninguna campaña muestra anuncios desde hace ${plural(account.darkDays, 'día', 'días')}`;
    problems.push({
      module: 'auction',
      share: 1,
      accountWide: true,
      confidence: 1,
      reason: `${capitalise(clause)}: ${why}.`,
      clause,
    });
  } else {
    const dark = findings.delivery.filter((card) => card.darkDays > 0 || card.suspended);
    const lead = [...dark].sort((a, b) => (b.budgetPerDay ?? 0) - (a.budgetPerDay ?? 0))[0];
    if (lead) {
      const budget = dark.reduce((sum, card) => sum + (card.budgetPerDay ?? 0), 0);
      const share = idleShare(ctx, budget);
      const suspended = dark.some((card) => card.suspended);
      const since = lead.darkSince ? ` desde el ${dayLabel(lead.darkSince)}` : '';
      const who =
        dark.length === 1
          ? lead.campaign
          : `${dark.length} campañas (${dark.map((card) => card.campaign).join(', ')})`;
      const verb = dark.length === 1 ? 'no muestra' : 'no muestran';
      const days = lead.darkDays > 0 ? ` (${plural(lead.darkDays, 'día', 'días')})` : '';
      const timing = `${verb} anuncios${since}${days}`;
      const money = budget > 0 ? `, con ${withShare(ctx, budget, share)}` : '';
      problems.push({
        module: 'auction',
        share,
        accountWide: false,
        confidence: 1,
        reason: suspended
          ? `Google suspendió ${who}: ${timing}${money}.`
          : `${who} ${timing}${money}.`,
        clause: `${who} ${timing}${budget > 0 ? ` (${withShare(ctx, budget, share)})` : ''}`,
      });
    }
  }
  if (findings.darkRun?.ongoing) {
    const since = findings.darkRun.latestSince
      ? ` desde el ${dayLabel(findings.darkRun.latestSince)}`
      : '';
    const clause = `la cuenta no muestra anuncios${since}, con ${plural(findings.darkRun.darkDays, 'día oscuro', 'días oscuros')} en la ventana`;
    problems.push({
      module: 'auction',
      share: 1,
      accountWide: true,
      confidence: 1,
      reason: `${capitalise(clause)}.`,
      clause,
    });
  }
  for (const collapse of findings.deliveryCollapse) {
    const idle = Math.max(0, collapse.plannedPerDay - collapse.deliveredPerDay);
    const share = idleShare(ctx, idle, planOf(ctx, collapse.portfolioId));
    const who = collapse.portfolio ?? 'Un portafolio';
    const head = `${who} entrega ${ctx.money(collapse.deliveredPerDay)} de sus ${ctx.money(collapse.plannedPerDay)} al día planeados`;
    problems.push({
      module: 'portfolios',
      share,
      accountWide: false,
      confidence: 0.9,
      reason: `${head}${share != null ? `: ${shareWords(ctx, share)} no se gasta` : ''}.`,
      clause: `${head}${share != null ? ` (${shareWords(ctx, share)})` : ''}`,
    });
  }
  return problems;
}

function measurementProblems(ctx: Context): Problem[] {
  const problems: Problem[] = [];
  const inflated = ctx.findings.inflated;
  if (inflated) {
    const clause = `el ${pct(inflated.attentionShare)} de las ${count(inflated.reported)} conversiones que reporta Google son visitas o eventos de atención`;
    problems.push({
      module: 'signal',
      share: 1,
      accountWide: false,
      confidence: 1,
      reason: `${capitalise(clause)}; solo ${count(inflated.real)} son leads o ventas.`,
      clause,
    });
  }
  for (const guard of ctx.findings.measurement) {
    const touched = ctx.portfolios.filter((portfolio) => guard.portfolioIds.includes(portfolio.id));
    const share =
      guard.portfolioIds.length === 0
        ? 1
        : ctx.planTotal > 0
          ? clamp01(
              touched.reduce((sum, portfolio) => sum + (portfolio.dailyBudget ?? 0), 0) /
                ctx.planTotal,
            )
          : null;
    const where =
      touched.length > 0 ? touched.map((portfolio) => portfolio.name).join(', ') : 'la cuenta';
    const clause = `la medición de ${where} no es confiable${share != null ? ` (${pct(share)} del plan diario)` : ''}`;
    problems.push({
      module: ctx.signals.platform === 'meta' ? 'events' : 'signal',
      share,
      accountWide: false,
      confidence: 0.9,
      reason: `${capitalise(clause)}: ${stripPeriod(guard.detail)}.`,
      clause,
    });
  }
  return problems;
}

function rosterProblems(ctx: Context): Problem[] {
  return ctx.portfolios
    .filter((portfolio) => portfolio.rosterAbsent && isActive(portfolio))
    .map((portfolio): Problem => {
      const plan = portfolio.dailyBudget ?? 0;
      const share = idleShare(ctx, plan, plan);
      const members = ctx.signals.platform === 'meta' ? 'conjuntos' : 'campañas';
      const lost =
        portfolio.rosterMissing != null && portfolio.rosterMissing > 0
          ? `sus ${count(portfolio.rosterMissing)} ${members}`
          : `sus ${members}`;
      const head = `${portfolio.name} perdió ${lost}`;
      return {
        module: ctx.signals.platform === 'meta' ? 'structure' : 'portfolios',
        share,
        accountWide: false,
        confidence: 0.95,
        reason: `${head}${plan > 0 ? `: sus ${ctx.money(plan)} al día${share != null ? ` (${shareWords(ctx, share)})` : ''} no tienen dónde gastarse` : ''}.`,
        clause: `${head}${plan > 0 ? ` (${withShare(ctx, plan, share)})` : ''}`,
      };
    });
}

function problemsOf(ctx: Context): Problem[] {
  return [...deliveryProblems(ctx), ...measurementProblems(ctx), ...rosterProblems(ctx)];
}

function opensBoard(problem: Problem): boolean {
  return problem.accountWide || (problem.share != null && problem.share >= FIX_MIN_SHARE);
}

// ── The mode ──────────────────────────────────────────────────────────────────

type ModeRead = {
  mode: AdAccountMode;
  reason: string;
  /** The problem the board opens with, in Fix first. */
  fix: Problem | null;
  /** The problems under the line, the largest first. */
  notices: Problem[];
};

function modeOf(ctx: Context, problems: Problem[]): ModeRead {
  const { portfolios, acting } = ctx;
  if (portfolios.length === 0) {
    return {
      mode: 'setup',
      reason:
        'La cuenta está conectada, pero tiene 0 portafolios: todavía no hay una meta contra la cual juzgarla.',
      fix: null,
      notices: [],
    };
  }
  const opening = problems
    .filter(opensBoard)
    .sort(
      (a, b) =>
        Number(b.accountWide) - Number(a.accountWide) ||
        (b.share ?? 0) - (a.share ?? 0) ||
        b.confidence - a.confidence,
    );
  const notices = problems
    .filter((problem) => !opensBoard(problem))
    .sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
  const fix = opening[0];
  if (fix) return { mode: 'fix', reason: fix.reason, fix, notices };

  const first = notices[0];
  const aside = first ? `; ${first.clause}, pero queda como aviso: no llega a la mitad` : '';
  const writable = acting.filter((portfolio) => portfolio.canWrite);
  if (acting.length === 0) {
    const observing = portfolios.every((portfolio) => portfolio.applyMode === 'observe');
    return {
      mode: 'recommend',
      reason: `Ningún portafolio propone cambios: ${plural(portfolios.length, observing ? 'portafolio solo observa' : 'portafolio está en pausa o solo observa', observing ? 'portafolios solo observan' : 'portafolios están en pausa o solo observan')}${aside}.`,
      fix: null,
      notices,
    };
  }
  if (writable.length === 0) {
    return {
      mode: 'recommend',
      reason: `Continuum no escribe en esta cuenta: el cliente aplica los cambios de ${plural(acting.length, 'portafolio', 'portafolios')}${aside}.`,
      fix: null,
      notices,
    };
  }
  const pending = pendingOf(ctx);
  if (ctx.signals.approvalRequired) {
    return {
      mode: 'approve',
      reason: `Cada cambio pasa por la cadena de aprobación de la marca: ${plural(pending, 'decisión espera', 'decisiones esperan')}${aside}.`,
      fix: null,
      notices,
    };
  }
  const autopilot = writable.filter(
    (portfolio) =>
      portfolio.applyMode === 'autopilot' &&
      !portfolio.autopilotPaused &&
      !portfolio.rosterAbsent &&
      portfolio.cycleCurrent !== false,
  );
  if (autopilot.length > 0) {
    const names = autopilot.map((portfolio) => portfolio.name).join(' y ');
    const cap = autopilot[0]?.maxChangePct;
    const caps =
      autopilot.length === 1 && cap != null && cap > 0
        ? ` dentro de su tope de ${pct(cap)} por ciclo`
        : ` dentro de sus topes (${autopilot.length} de ${plural(portfolios.length, 'portafolio', 'portafolios')})`;
    return {
      mode: 'operate',
      reason: `${names} ${autopilot.length === 1 ? 'opera' : 'operan'} en autopilot${caps}${aside}.`,
      fix: null,
      notices,
    };
  }
  const paused = writable.filter(
    (portfolio) => portfolio.applyMode === 'autopilot' && portfolio.autopilotPaused,
  );
  return {
    mode: 'approve',
    reason:
      paused.length > 0
        ? `El autopilot de ${paused.map((portfolio) => portfolio.name).join(' y ')} está en pausa: cada cambio de ${plural(writable.length, 'portafolio', 'portafolios')} espera a una persona${aside}.`
        : `Continuum puede escribir en ${plural(writable.length, 'portafolio', 'portafolios')}, pero cada cambio espera a una persona${aside}.`,
    fix: null,
    notices,
  };
}

function stripPeriod(sentence: string): string {
  return sentence.trim().replace(/\.$/, '');
}

function capitalise(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function pendingOf(ctx: Context): number {
  return ctx.portfolios.reduce(
    (sum, portfolio) =>
      sum + portfolio.pendingRecommendations + (portfolio.pendingBudgetMoves ?? 0),
    0,
  );
}

// ── The result that counts ────────────────────────────────────────────────────

function resultOf(ctx: Context): AdAccountResult {
  const { signals, primary, findings } = ctx;
  const goal = primary?.goal ?? null;
  const base = { currency: signals.currency };
  const inflated = findings.inflated;
  if (inflated) {
    return {
      ...base,
      label: REAL_RESULTS,
      count: inflated.real,
      platformReported: inflated.reported,
      costPerResult: inflated.realCostPerResult,
      goal,
      spend: null,
      windowDays: inflated.windowDays,
      source: 'inflated_conversion',
      kind: primary?.resultKind ?? null,
    };
  }
  const kind = primary?.resultKind ?? null;
  const window = signals.window ?? null;
  const measured = window?.kinds.find((row) => row.kind === kind) ?? null;
  if (window && measured) {
    return {
      ...base,
      label: wordsOf(kind).many,
      count: measured.results,
      platformReported: null,
      costPerResult: measured.costPerResult,
      goal,
      spend: measured.spend,
      windowDays: window.days,
      source: 'producer',
      kind,
    };
  }
  const read = signals.campaigns ?? null;
  const campaigns = ctx.campaigns;
  if (read && campaigns && campaigns.length > 0) {
    const counted = campaigns.every((campaign) => campaign.results != null);
    const spend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
    const results = counted
      ? campaigns.reduce((sum, campaign) => sum + (campaign.results ?? 0), 0)
      : null;
    return {
      ...base,
      label: wordsOf(read.resultKind ?? kind).many,
      count: results,
      platformReported: null,
      costPerResult: results != null && results >= 1 ? spend / results : null,
      goal: read.resultKind === kind ? goal : null,
      spend,
      windowDays: read.windowDays,
      source: 'campaigns',
      kind: read.resultKind,
    };
  }
  return {
    ...base,
    label: wordsOf(kind).many,
    count: null,
    platformReported: null,
    costPerResult: null,
    goal,
    spend: window?.spend ?? null,
    windowDays: window?.days ?? DEFAULT_WINDOW_DAYS,
    source: 'none',
    kind,
  };
}

// ── Slots ─────────────────────────────────────────────────────────────────────

type Fired = {
  fired: true;
  impact: number;
  urgency: number;
  confidence: number;
  reason: string;
  /** The question for Jaina this slot raises, in the account's language. */
  ask: string;
};
type Held = { fired: false; reason: string };
type Lens = Fired | Held;

function fired(
  impact: number,
  urgency: number,
  confidence: number,
  reason: string,
  ask: string,
): Fired {
  return { fired: true, impact, urgency, confidence, reason, ask };
}

function held(reason: string): Held {
  return { fired: false, reason };
}

const NOT_READ: Record<AdAccountMissingInput['input'], string> = {
  portfolios: 'No se leyeron los portafolios de esta cuenta.',
  cards: 'No se leyeron las tarjetas de los detectores de esta cuenta.',
  window: 'No se leyó el gasto ni los resultados de la ventana.',
  campaigns: 'No se leyeron las campañas de esta cuenta.',
  approval: 'No se leyó si la marca tiene cadena de aprobación.',
};

function notRead(ctx: Context, input: AdAccountMissingInput['input']): Held {
  const said = ctx.signals.missing?.find((line) => line.input === input);
  return held(said?.reason ?? NOT_READ[input]);
}

/** The detectors' cards were read for this account (an empty list is a read). */
function cardsRead(ctx: Context): boolean {
  return ctx.signals.findings != null;
}

/** The detectors run inside a portfolio's cycles: an account with none has no card yet. */
function firstCycle(ctx: Context): Held {
  return held(
    `Se lee con el primer ciclo: la cuenta tiene ${plural(ctx.portfolios.length, 'portafolio', 'portafolios')} y los detectores corren dentro de sus ciclos.`,
  );
}

function resultSlot(ctx: Context, result: AdAccountResult, mode: AdAccountMode): Fired {
  const words = wordsOf(result.kind);
  const span = `en ${plural(result.windowDays, 'día', 'días')}`;
  if (result.count == null) {
    const why =
      mode === 'setup'
        ? 'La cuenta tiene 0 portafolios: todavía no hay un resultado que contar contra una meta.'
        : `Todavía no se midieron ${words.many} ${span} para ${plural(ctx.portfolios.length, 'portafolio', 'portafolios')}.`;
    return fired(1, 0.6, 0.5, why, '¿Qué cuenta como resultado en esta cuenta?');
  }
  const cost =
    result.costPerResult != null
      ? ` a ${ctx.money(result.costPerResult)}${result.goal != null ? ` contra una meta de ${ctx.money(result.goal)}` : ''}`
      : '';
  const reported =
    result.platformReported != null ? `; Google reporta ${count(result.platformReported)}` : '';
  const offGoal =
    result.goal != null && result.costPerResult != null && result.costPerResult > result.goal;
  const urgency = mode === 'fix' ? 0.7 : offGoal ? 0.9 : 0.8;
  const confidence = result.costPerResult != null ? 0.95 : 0.8;
  const real = result.label === REAL_RESULTS;
  const label = !real && Math.round(result.count) === 1 ? words.one : result.label;
  const the = real ? 'los' : words.the;
  return fired(
    1,
    urgency,
    confidence,
    `${count(result.count)} ${label} ${span}${cost}${reported}.`,
    `¿Cómo van ${the} ${result.label} contra la meta?`,
  );
}

const DECISIONS_ASK: Record<AdAccountMode, string> = {
  fix: '¿Qué arreglo primero y qué puede esperar?',
  operate: '¿Qué hizo el autopilot en el último ciclo?',
  approve: '¿Qué espera mi aprobación?',
  recommend: '¿Qué le mando al cliente esta semana?',
  setup: '¿Qué cuenta como resultado en esta cuenta?',
};

function decisionsSlot(ctx: Context, mode: AdAccountMode): Fired {
  const pending = pendingOf(ctx);
  const high = ctx.findings.cards.filter((card) => card.severity === 'high').length;
  const ask = DECISIONS_ASK[mode];
  if (mode === 'setup') {
    return fired(0.2, 0.3, 0.95, 'Sin portafolio no hay ciclos: 0 decisiones esperan.', ask);
  }
  if (pending === 0) {
    return fired(
      0.2,
      0.5,
      0.95,
      `Nada espera una decisión: 0 pendientes en ${plural(ctx.portfolios.length, 'portafolio', 'portafolios')}.`,
      ask,
    );
  }
  const urgent = mode === 'operate' || mode === 'approve' || mode === 'recommend';
  const who =
    mode === 'recommend'
      ? `${plural(pending, 'recomendación espera', 'recomendaciones esperan')} al cliente`
      : mode === 'operate'
        ? `${plural(pending, 'decisión espera', 'decisiones esperan')} en los ciclos del autopilot`
        : `${plural(pending, 'decisión espera', 'decisiones esperan')}`;
  const severity = high > 0 ? `, ${count(high)} de prioridad alta` : '';
  return fired(Math.min(1, 0.5 + pending / 10), urgent ? 1 : 0.8, 0.95, `${who}${severity}.`, ask);
}

function portfoliosSlot(ctx: Context, mode: AdAccountMode, notices: Problem[]): Fired {
  if (mode === 'setup') {
    return fired(
      1,
      1,
      0.95,
      'La cuenta tiene 0 portafolios: el primero le da una meta y abre los ciclos.',
      '¿Qué meta le pongo al primer portafolio?',
    );
  }
  const roster = notices.find(
    (problem) => problem.module === 'portfolios' || problem.module === 'structure',
  );
  const noGoal = ctx.portfolios.filter((portfolio) => portfolio.goal == null).length;
  const extra = roster
    ? `; ${roster.clause}`
    : noGoal > 0
      ? `; ${plural(noGoal, 'no tiene', 'no tienen')} meta de costo`
      : '';
  return fired(
    roster ? 0.7 : 0.4,
    roster ? 0.8 : 0.5,
    1,
    `${plural(ctx.portfolios.length, 'portafolio', 'portafolios')} contra su meta${extra}.`,
    noGoal > 0
      ? '¿Qué meta de costo le pongo a cada portafolio?'
      : '¿Qué portafolio va más lejos de su meta?',
  );
}

// ── Google lenses ─────────────────────────────────────────────────────────────

function typesOf(campaigns: AdAccountCampaignSignal[]) {
  const byType = new Map<
    AdAccountCampaignType,
    { spend: number; results: number | null; campaigns: number }
  >();
  for (const campaign of campaigns) {
    const row = byType.get(campaign.type) ?? { spend: 0, results: 0, campaigns: 0 };
    row.spend += campaign.spend;
    row.campaigns += 1;
    row.results =
      row.results == null || campaign.results == null ? null : row.results + campaign.results;
    byType.set(campaign.type, row);
  }
  return [...byType.entries()]
    .map(([type, row]) => ({ type, ...row }))
    .sort((a, b) => b.spend - a.spend);
}

function mixLens(ctx: Context): Lens {
  const lines = ctx.findings.courseLines;
  if (lines && lines.length > 0) {
    const measured = lines.map((line) => Math.round(line.share * 100)).join('/');
    const agreed = lines.map((line) => Math.round(line.targetShare * 100)).join('/');
    const offBy = Math.max(...lines.map((line) => Math.abs(line.share - line.targetShare)));
    return fired(
      0.4 + offBy,
      0.7,
      0.9,
      `Las líneas de curso van ${measured} contra ${agreed} acordado.`,
      '¿Las líneas van en lo acordado?',
    );
  }
  const campaigns = ctx.campaigns;
  if (!campaigns) return notRead(ctx, 'campaigns');
  const types = typesOf(campaigns).filter((row) => row.type !== 'campaign');
  if (types.length < MIX_MIN_TYPES && campaigns.length < MIX_MIN_CAMPAIGNS) {
    return held(
      `${plural(types.length, 'tipo de campaña', 'tipos de campaña')} y ${plural(campaigns.length, 'campaña con gasto', 'campañas con gasto')}: no hay mezcla que comparar.`,
    );
  }
  const spend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
  const totalResults = types.every((row) => row.results != null)
    ? types.reduce((sum, row) => sum + (row.results ?? 0), 0)
    : null;
  const top = types[0];
  if (top && spend > 0 && types.length >= MIX_MIN_TYPES) {
    const spendShare = top.spend / spend;
    const resultShare =
      totalResults != null && totalResults > 0 ? (top.results ?? 0) / totalResults : null;
    const gap = resultShare != null ? Math.abs(spendShare - resultShare) : 0.2;
    const words = wordsOf(ctx.signals.campaigns?.resultKind);
    const results =
      resultShare != null ? ` y ${pct(resultShare)} de ${words.the} ${words.many}` : '';
    return fired(
      0.4 + gap,
      0.7,
      0.9,
      `${TYPE_LABELS[top.type]} lleva ${pct(spendShare)} del gasto${results}, en ${plural(top.campaigns, 'campaña', 'campañas')}.`,
      '¿Conviene mover presupuesto entre tipos de campaña?',
    );
  }
  return fired(
    0.4,
    0.6,
    0.9,
    `${plural(campaigns.length, 'campaña con gasto', 'campañas con gasto')} en ${ctx.signals.campaigns?.windowDays ?? DEFAULT_WINDOW_DAYS} días, una contra otra.`,
    '¿Qué campaña conviene escalar y cuál recortar?',
  );
}

function auctionLens(ctx: Context, problems: Problem[]): Lens {
  const delivery = problems.find((problem) => problem.module === 'auction');
  const lost: { campaign: string; share: number; to: 'presupuesto' | 'ranking'; rule?: string }[] =
    [];
  for (const card of ctx.findings.budgetLost) {
    lost.push({
      campaign: card.campaign,
      share: card.lostToBudget,
      to: 'presupuesto',
      rule: card.rule,
    });
  }
  for (const campaign of ctx.campaigns ?? []) {
    if (campaign.type !== 'search') continue;
    if (campaign.lostToBudget != null)
      lost.push({ campaign: campaign.name, share: campaign.lostToBudget, to: 'presupuesto' });
    if (campaign.lostToRank != null)
      lost.push({ campaign: campaign.name, share: campaign.lostToRank, to: 'ranking' });
  }
  const worst = lost
    .filter((row) => row.share >= AUCTION_MIN_LOST)
    .sort((a, b) => b.share - a.share || (a.rule === 'V3' ? -1 : 1))[0];
  // The calendar of dark days when delivery is the problem; the impressions lost otherwise.
  if (delivery && (opensBoard(delivery) || !worst || (delivery.share ?? 0) >= worst.share)) {
    const since = ctx.findings.delivery[0]?.darkSince ?? ctx.findings.darkRun?.latestSince;
    return fired(
      Math.max(0.6, delivery.share ?? 0),
      MAX_LENS_URGENCY,
      delivery.confidence,
      delivery.reason,
      since
        ? `¿Por qué no hay anuncios desde el ${dayLabel(since)}?`
        : '¿Por qué la cuenta dejó de mostrar anuncios?',
    );
  }
  const run = ctx.findings.darkRun;
  if (!worst && run && run.darkDays > 0) {
    return fired(
      0.5,
      0.7,
      0.9,
      `La cuenta tuvo ${plural(run.darkDays, 'día', 'días')} sin anuncios en la ventana y volvió a entregar.`,
      '¿Qué pasó los días en que la cuenta no mostró anuncios?',
    );
  }
  if (!worst) {
    if (ctx.portfolios.length === 0 && !ctx.campaigns) return firstCycle(ctx);
    if (!ctx.campaigns) {
      if (!cardsRead(ctx)) return notRead(ctx, 'campaigns');
      return held(
        `Ninguna tarjeta de impresiones perdidas por presupuesto disparó. ${notRead(ctx, 'campaigns').reason}`,
      );
    }
    return held(
      `Ninguna campaña de Search pierde ${pct(AUCTION_MIN_LOST)} o más de sus impresiones por presupuesto o por ranking.`,
    );
  }
  const locked = ctx.findings.budgetLost.some(
    (card) => card.rule === 'V3' && card.campaign === worst.campaign,
  );
  return fired(
    worst.share,
    locked ? 0.8 : 0.7,
    0.9,
    `${worst.campaign} pierde ${pct(worst.share)} de sus impresiones por ${worst.to}${locked ? ', y la subida espera a que se corrija la conversión' : ''}.`,
    worst.to === 'ranking'
      ? `¿Cómo recupero las impresiones que ${worst.campaign} pierde por ranking?`
      : locked
        ? `¿Por qué no subimos el presupuesto de ${worst.campaign}?`
        : `¿Cuánto rendiría subir el presupuesto de ${worst.campaign}?`,
  );
}

function termsLens(ctx: Context): Lens {
  const { brandTerms, competitorTerms, intentTerms } = ctx.findings;
  const parts: { impact: number; urgency: number; sentence: string }[] = [];
  if (brandTerms && brandTerms.share >= TERMS_MIN_BRAND_SHARE) {
    parts.push({
      impact: brandTerms.share,
      urgency: 0.6,
      sentence: `la marca se lleva ${pct(brandTerms.share)} del gasto en términos de búsqueda`,
    });
  }
  if (intentTerms) {
    parts.push({
      impact: intentTerms.share != null ? Math.max(0.3, intentTerms.share * 2) : 0.45,
      urgency: 0.7,
      sentence: `${plural(intentTerms.terms, 'búsqueda sin intención de compra gastó', 'búsquedas sin intención de compra gastaron')} ${ctx.money(intentTerms.spend)}${intentTerms.share != null ? ` (${pct(intentTerms.share)} del gasto en términos)` : ''} sin conversión`,
    });
  }
  if (competitorTerms) {
    parts.push({
      impact: 0.35,
      urgency: 0.7,
      sentence: `las búsquedas de la competencia gastaron ${ctx.money(competitorTerms.spend)} sin conversión`,
    });
  }
  const [first, second] = parts;
  if (!first) {
    if (ctx.portfolios.length === 0) return firstCycle(ctx);
    if (!cardsRead(ctx)) return notRead(ctx, 'cards');
    return held(
      `Ningún detector de términos disparó: marca desde ${pct(TERMS_MIN_BRAND_SHARE)} del gasto en términos, competencia desde 1% e intención equivocada desde 3%.`,
    );
  }
  return fired(
    Math.min(1, first.impact + (second ? 0.1 : 0)),
    first.urgency,
    0.9,
    second
      ? `${capitalise(first.sentence)}; ${second.sentence}.`
      : `${capitalise(first.sentence)}.`,
    brandTerms ? '¿Separo la marca en su propia campaña?' : '¿Qué negativos agrego esta semana?',
  );
}

function qualityLens(ctx: Context): Lens {
  const low = ctx.findings.lowQuality;
  if (!low) {
    if (ctx.portfolios.length === 0) return firstCycle(ctx);
    if (!cardsRead(ctx)) return notRead(ctx, 'cards');
    return held(
      `El detector de Quality Score no disparó: pide keywords con QS de 3 o menos en ${pct(QUALITY_MIN_SHARE)} o más del gasto de keywords.`,
    );
  }
  if (low.keywordSpendShare != null && low.keywordSpendShare < QUALITY_MIN_SHARE) {
    return held(
      `Las keywords con Quality Score de 3 o menos se llevan ${pct(low.keywordSpendShare)} del gasto de keywords, bajo el ${pct(QUALITY_MIN_SHARE)}.`,
    );
  }
  const services = plural(low.services, 'servicio', 'servicios');
  return fired(
    low.keywordSpendShare ?? 0.3,
    0.6,
    0.9,
    low.keywordSpendShare != null
      ? `Las keywords con Quality Score de 3 o menos se llevan ${pct(low.keywordSpendShare)} del gasto de keywords: ${ctx.money(low.spend)} en ${services}.`
      : `Las keywords con Quality Score de 3 o menos gastaron ${ctx.money(low.spend)} en ${services}.`,
    '¿Qué páginas subirían el Quality Score?',
  );
}

function pmaxLens(ctx: Context): Lens {
  const rescue = [...ctx.findings.pmaxRescue].sort(
    (a, b) => (b.costPerResult ?? 0) / (b.target ?? 1) - (a.costPerResult ?? 0) / (a.target ?? 1),
  )[0];
  if (rescue && rescue.costPerResult != null && rescue.target != null && rescue.target > 0) {
    const multiple = rescue.costPerResult / rescue.target;
    if (multiple >= PMAX_RESCUE_MULTIPLE) {
      return fired(
        Math.min(1, 0.5 + multiple / 20),
        0.8,
        1,
        `${rescue.campaign} cuesta ${ctx.money(rescue.costPerResult)} por conversión, ${Math.round(multiple)}× su meta de ${ctx.money(rescue.target)}.`,
        `¿Pauso ${rescue.campaign}?`,
      );
    }
  } else if (rescue) {
    const why =
      rescue.rankLost != null
        ? `pierde ${pct(rescue.rankLost)} de sus impresiones por ranking`
        : rescue.target != null
          ? `su meta es ${ctx.money(rescue.target)}`
          : 'sus recursos rinden poco';
    return fired(
      0.6,
      0.8,
      0.9,
      `${rescue.campaign} gasta sin conversiones y ${why}.`,
      `¿Pauso ${rescue.campaign}?`,
    );
  }
  const winner = ctx.findings.adWinner;
  const campaigns = ctx.campaigns;
  if (campaigns && campaigns.length > 0) {
    const spend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
    const pmax = campaigns.filter((campaign) => campaign.type === 'pmax');
    const pmaxSpend = pmax.reduce((sum, campaign) => sum + campaign.spend, 0);
    const share = spend > 0 ? pmaxSpend / spend : 0;
    if (pmax.length > 0 && share >= PMAX_MIN_SHARE) {
      return fired(
        share,
        0.6,
        0.9,
        `Performance Max lleva ${pct(share)} del gasto: ${ctx.money(pmaxSpend)} en ${plural(pmax.length, 'campaña', 'campañas')}.`,
        '¿Performance Max trae resultados reales o solo gasto?',
      );
    }
    if (winner && campaigns.every((campaign) => campaign.type === 'search'))
      return adWinnerLens(ctx, winner);
    if (pmax.length > 0) {
      return held(
        `Performance Max lleva ${pct(share)} del gasto, bajo el ${pct(PMAX_MIN_SHARE)}, y ninguna cuesta ${PMAX_RESCUE_MULTIPLE}× su meta.`,
      );
    }
    return held('La cuenta no tiene Performance Max con gasto ni un anuncio ganador que comparar.');
  }
  if (winner && ctx.findings.pmaxAssets.length === 0) return adWinnerLens(ctx, winner);
  if (ctx.findings.pmaxAssets.length > 0) {
    return held(
      `${plural(ctx.findings.pmaxAssets.length, 'campaña de Performance Max tiene', 'campañas de Performance Max tienen')} recursos por completar, pero no se leyó su parte del gasto.`,
    );
  }
  return notRead(ctx, 'campaigns');
}

function adWinnerLens(ctx: Context, winner: NonNullable<AdAccountFindings['adWinner']>): Fired {
  return fired(
    0.35,
    0.5,
    0.8,
    `En ${winner.campaign}, "${winner.winner}" cuesta ${ctx.money(winner.winnerCostPerResult)} por conversión contra ${ctx.money(winner.comparatorCostPerResult)} de "${winner.comparator}".`,
    '¿Qué tiene el anuncio ganador que no tiene el perdedor?',
  );
}

function signalLens(ctx: Context): Lens {
  const { inflated, leadToSale, valueMap } = ctx.findings;
  if (inflated) {
    return fired(
      1,
      MAX_LENS_URGENCY,
      1,
      `El ${pct(inflated.attentionShare)} de las ${count(inflated.reported)} conversiones que reporta Google son visitas o eventos de atención.`,
      '¿Cuántos leads reales llevo este mes?',
    );
  }
  if (
    leadToSale &&
    leadToSale.leads > 0 &&
    leadToSale.sales / leadToSale.leads <= SIGNAL_MAX_SALE_RATE
  ) {
    const value = leadToSale.salesValue != null ? ` de ${ctx.money(leadToSale.salesValue)}` : '';
    return fired(
      0.8,
      0.8,
      0.95,
      `${plural(leadToSale.leads, 'lead', 'leads')} dieron ${plural(leadToSale.sales, 'venta', 'ventas')}${value}: menos de 1 de cada 5 leads compra.`,
      '¿Por qué tantos leads y tan pocas ventas?',
    );
  }
  if (valueMap && valueMap.flatValue != null) {
    return fired(
      0.5,
      0.6,
      0.9,
      `Las ${valueMap.actions} acciones de conversión valen lo mismo (${valueMap.flatValue}): Google no distingue un contacto de una visita.`,
      '¿Qué valor le doy a cada acción de conversión?',
    );
  }
  if (ctx.portfolios.length === 0) return firstCycle(ctx);
  if (!cardsRead(ctx)) return notRead(ctx, 'cards');
  return held(
    'Ningún detector de señal disparó: ni eventos de atención en 30% o más de lo reportado, ni valores iguales, ni menos de 1 venta cada 5 leads.',
  );
}

// ── Meta views ────────────────────────────────────────────────────────────────

function costPerResult(campaign: AdAccountCampaignSignal): number | null {
  return campaign.results != null && campaign.results >= 1
    ? campaign.spend / campaign.results
    : null;
}

function branchesLens(ctx: Context): Lens {
  const campaigns = ctx.campaigns;
  if (!campaigns) return notRead(ctx, 'campaigns');
  if (campaigns.length < BRANCHES_MIN_CAMPAIGNS) {
    return held(
      `${plural(campaigns.length, 'campaña con gasto', 'campañas con gasto')}: no hay sucursales que comparar.`,
    );
  }
  const words = wordsOf(ctx.signals.campaigns?.resultKind);
  const ask = `¿Qué campaña consigue ${words.the} ${words.many} a menor costo?`;
  const priced = campaigns
    .map((campaign) => ({ campaign, cost: costPerResult(campaign) }))
    .filter((row): row is { campaign: AdAccountCampaignSignal; cost: number } => row.cost != null)
    .sort((a, b) => a.cost - b.cost);
  const cheapest = priced[0];
  const dearest = priced[priced.length - 1];
  if (cheapest && dearest && priced.length >= 2) {
    const spread = dearest.cost > 0 ? (dearest.cost - cheapest.cost) / dearest.cost : 0;
    return fired(
      0.4 + spread / 2,
      0.7,
      0.9,
      `${plural(campaigns.length, 'campaña con gasto', 'campañas con gasto')}: ${cheapest.campaign.name} consigue ${words.many} a ${ctx.money(cheapest.cost)} y ${dearest.campaign.name} a ${ctx.money(dearest.cost)}.`,
      ask,
    );
  }
  return fired(
    0.4,
    0.6,
    0.8,
    `${plural(campaigns.length, 'campaña con gasto', 'campañas con gasto')} en ${ctx.signals.campaigns?.windowDays ?? DEFAULT_WINDOW_DAYS} días, una contra otra.`,
    ask,
  );
}

function headroomLens(ctx: Context): Lens {
  const drift = ctx.findings.cpmDrift;
  const campaigns = ctx.campaigns;
  const cpms = (campaigns ?? [])
    .filter((campaign) => (campaign.impressions ?? 0) > 0)
    .map((campaign) => ({
      name: campaign.name,
      cpm: (campaign.spend / (campaign.impressions ?? 1)) * 1000,
    }))
    .sort((a, b) => a.cpm - b.cpm);
  const low = cpms[0];
  const high = cpms[cpms.length - 1];
  const ask = '¿Dónde está más barato el CPM?';
  if (low && high && cpms.length >= HEADROOM_MIN_CAMPAIGNS) {
    const spread = high.cpm > 0 ? (high.cpm - low.cpm) / high.cpm : 0;
    const moved = drift
      ? `; el CPM de la cuenta se movió ${drift.changePct}% contra la semana anterior`
      : '';
    return fired(
      0.3 + spread,
      0.6,
      0.9,
      `El CPM va de ${ctx.money(low.cpm)} en ${low.name} a ${ctx.money(high.cpm)} en ${high.name}${moved}.`,
      ask,
    );
  }
  if (drift) {
    return fired(
      Math.min(1, 0.3 + Math.abs(drift.changePct) / 100),
      0.6,
      0.8,
      `El CPM de la cuenta pasó de ${ctx.money(drift.cpmPrior)} a ${ctx.money(drift.cpmNow)} (${drift.changePct > 0 ? '+' : ''}${drift.changePct}%) contra la semana anterior.`,
      '¿Por qué subió el CPM esta semana?',
    );
  }
  if (!campaigns) return notRead(ctx, 'campaigns');
  return held(
    `${plural(cpms.length, 'campaña tiene', 'campañas tienen')} un CPM medido: no hay margen de entrega que comparar.`,
  );
}

function eventsLens(ctx: Context, problems: Problem[]): Lens {
  const guard = problems.find((problem) => problem.module === 'events');
  if (guard) {
    return fired(
      Math.max(0.5, guard.share ?? 0),
      0.8,
      guard.confidence,
      guard.reason,
      '¿Qué está midiendo mal la cuenta?',
    );
  }
  const acting = ctx.acting.filter((portfolio) => portfolio.objective);
  if (acting.length === 0) {
    return held('Ningún portafolio activo declara el evento que optimiza.');
  }
  const named = acting
    .slice(0, 3)
    .map((portfolio) => {
      const event = OBJECTIVE_EVENTS[portfolio.objective ?? ''] ?? portfolio.objective;
      const goal = portfolio.goal != null ? ` con meta de ${ctx.money(portfolio.goal)}` : '';
      return `${portfolio.name} optimiza ${event}${goal}`;
    })
    .join('; ');
  const distinct = new Set(acting.map((portfolio) => portfolio.objective)).size;
  return fired(
    distinct > 1 ? 0.5 : 0.3,
    0.5,
    0.9,
    `${plural(acting.length, 'portafolio declara', 'portafolios declaran')} su evento: ${named}.`,
    '¿Qué evento optimiza cada portafolio y cuánto vale?',
  );
}

function structureLens(ctx: Context, problems: Problem[]): Lens {
  const lost = problems.find((problem) => problem.module === 'structure');
  const absent = ctx.portfolios.find((portfolio) => portfolio.rosterAbsent);
  if (lost) {
    return fired(
      Math.max(0.4, lost.share ?? 0),
      0.8,
      lost.confidence,
      lost.reason,
      absent ? `¿Qué pasó con ${absent.name}?` : '¿Qué conjuntos perdió la cuenta?',
    );
  }
  const partial = ctx.portfolios.find(
    (portfolio) => !portfolio.rosterAbsent && (portfolio.rosterMissing ?? 0) > 0,
  );
  if (partial) {
    return fired(
      0.4,
      0.7,
      0.9,
      `${partial.name} perdió ${plural(partial.rosterMissing ?? 0, 'conjunto', 'conjuntos')} de su roster.`,
      `¿Qué conjuntos perdió ${partial.name}?`,
    );
  }
  const campaigns = ctx.campaigns;
  if (!campaigns) return notRead(ctx, 'campaigns');
  const known = campaigns.filter((campaign) => campaign.adSets != null);
  if (known.length >= 2 && known.every((campaign) => campaign.adSets === 1)) {
    return fired(
      0.35,
      0.5,
      0.85,
      `Cada una de las ${known.length} campañas con gasto tiene un solo conjunto.`,
      '¿Conviene juntar conjuntos en menos campañas?',
    );
  }
  return held(
    `${plural(campaigns.length, 'campaña con gasto', 'campañas con gasto')} sin conjuntos perdidos: la estructura no explica el resultado.`,
  );
}

// ── Asks ──────────────────────────────────────────────────────────────────────

const SPINE: ReadonlySet<BoardModuleId> = new Set(['result', 'decisions', 'portfolios']);

const FALLBACK_ASKS = [
  '¿Qué cambió en la cuenta esta semana?',
  '¿Dónde conviene mover presupuesto esta semana?',
];

/** Three questions: the lead's, then the lenses' in board order, then the spine's. */
function asksOf(slots: { module: BoardModuleId; ask: string }[], lead: BoardModuleId | null) {
  const order = [
    ...slots.filter((slot) => slot.module === lead),
    ...slots.filter((slot) => slot.module !== lead && !SPINE.has(slot.module)),
    ...slots.filter((slot) => slot.module !== lead && SPINE.has(slot.module)),
  ];
  const asks: string[] = [];
  for (const question of [...order.map((slot) => slot.ask), ...FALLBACK_ASKS]) {
    if (asks.length === 3) break;
    if (!asks.includes(question)) asks.push(question);
  }
  return asks;
}

// ── The board ─────────────────────────────────────────────────────────────────

/** A fixed order breaks ties, so the same reading always lays out the same board. */
const MODULE_ORDER = boardModuleIdSchema.options;

/** The lead of each mode: what the board opens with. Fix opens with its problem's module. */
function leadOf(mode: AdAccountMode, fix: Problem | null): BoardModuleId | null {
  if (mode === 'fix') return fix?.module ?? null;
  if (mode === 'setup') return 'portfolios';
  return 'decisions';
}

/** Reads one ad account. The spine is always on the board; the lens rules extend it. */
export function readAdAccount(signals: AdAccountSignals): AdAccountReading {
  const ctx = contextOf(signals);
  const problems = problemsOf(ctx);
  const { mode, reason, fix, notices } = modeOf(ctx, problems);
  const result = resultOf(ctx);
  const lead = leadOf(mode, fix);

  const lenses: [BoardModuleId, Lens][] =
    signals.platform === 'google_ads'
      ? [
          ['mix', mixLens(ctx)],
          ['auction', auctionLens(ctx, problems)],
          ['terms', termsLens(ctx)],
          ['quality', qualityLens(ctx)],
          ['pmax', pmaxLens(ctx)],
          ['signal', signalLens(ctx)],
        ]
      : [
          ['branches', branchesLens(ctx)],
          ['headroom', headroomLens(ctx)],
          ['events', eventsLens(ctx, problems)],
          ['structure', structureLens(ctx, problems)],
        ];
  const considered: [BoardModuleId, Lens][] = [
    ['result', resultSlot(ctx, result, mode)],
    ['decisions', decisionsSlot(ctx, mode)],
    ['portfolios', portfoliosSlot(ctx, mode, notices)],
    ...lenses,
  ];

  const shown = considered
    .filter((entry): entry is [BoardModuleId, Fired] => entry[1].fired)
    .map(([module, lens]) => {
      const isLead = module === lead;
      const urgency = isLead ? 1 : Math.min(lens.urgency, MAX_LENS_URGENCY);
      const impact = isLead && mode === 'fix' ? 1 : lens.impact;
      return {
        module,
        score: scoreOf(impact, urgency, lens.confidence),
        reason: lens.reason,
        ask: lens.ask,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.module === lead) - Number(a.module === lead) ||
        MODULE_ORDER.indexOf(a.module) - MODULE_ORDER.indexOf(b.module),
    );

  let rank = 0;
  const board: AdAccountBoardSlot[] = shown.map(({ module, score, reason: slotReason }) => {
    if (module === 'portfolios') return { module, size: 'w', score, reason: slotReason };
    const size: BoardModuleSize = rank === 0 ? 'l' : rank <= 2 ? 'm' : 's';
    rank += 1;
    return { module, size, score, reason: slotReason };
  });
  const hidden = considered
    .filter((entry): entry is [BoardModuleId, Held] => !entry[1].fired)
    .map(([module, lens]) => ({ module, reason: lens.reason }));

  return {
    platform: signals.platform,
    mode,
    modeLabel: AD_ACCOUNT_MODE_LABELS[mode],
    modeReason: reason,
    result,
    board,
    hidden,
    asks: asksOf(shown, lead),
    notices: notices.map((problem) => ({
      module: problem.module,
      reason: `${capitalise(problem.clause)}.`,
      share: problem.share,
    })),
    missing: (signals.missing ?? []).map((line) => line.reason),
  };
}
