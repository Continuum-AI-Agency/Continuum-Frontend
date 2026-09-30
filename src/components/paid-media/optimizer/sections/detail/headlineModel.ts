// The portfolio's news, composed from typed fields and nothing else.
//
// Performance+ redesign, stage 2 (docs/performance-plus-redesign/portafolio.html, ideas 01,
// 02 and 14, and "Lo común a todas"): the first screen says the news in two sentences with a
// figure — how we are doing (cost per result against the target and against the window
// before, with the result count) and where the opportunity is (the single largest candidate
// and its money per day) — plus a third only when something blocks a decision. Under them,
// four tiles carry the same figures with a state on their top border, and above them Jaina's
// latest read on the portfolio is one sentence.
//
// Every number here comes from the growth read the brief already carries (the recap's own
// arithmetic: spend, results, cost per result, target, deltas against the prior window), from
// the brief's ranked candidates (money per day sized by the engine), and from the cycle's
// rows. No free text is composed into a figure; the words around the figures are this file's
// and the tests pin them (headlineModel.test.ts).

import type {
  BriefCandidate,
  BriefGrowth,
  CycleItemRow,
  OptimizationMetricDefinition,
  ParsedCycleRunReport,
  PortfolioBrief,
} from '@continuum/contracts';
import { heroMinImpact, heroThresholdMet, rankCandidates } from '@continuum/contracts';
import type { KpiTileState } from '../../components/KpiTile';
import {
  type FigureUnit,
  type FigureWindow,
  formatCurrency,
  normalizeCurrency,
} from '../../format';
import { spendState, windowState } from '../account/overviewModel';
import type { BeforeAfter } from './beforeAfterModel';
import type { HeroMismatch, HeroSetting } from './heroHeaderModel';
import type { HeroView } from './heroModel';

/** A figure inside a sentence: the text and its provenance (see `figureProps` in ../format). */
export type HeadlineFigure = {
  key: string;
  text: string;
  raw: number | null;
  currency: string | null;
  window: FigureWindow;
  unit: FigureUnit;
};

export type HeadlineSegment = string | HeadlineFigure;
export type HeadlineSentence = HeadlineSegment[];

export type HeadlineBlockerCode = 'kpi_mismatch' | 'zero_delivery' | 'no_signal';

export type HeadlineBlocker = {
  code: HeadlineBlockerCode;
  sentence: HeadlineSentence;
  /** The header's own fixes for a goal mismatch; empty for the other two. */
  actions: HeroMismatch['actions'];
};

export type HeadlineTile = {
  key: 'spend' | 'results' | 'cost' | 'decisions';
  label: string;
  value: string;
  figure: Omit<HeadlineFigure, 'text'>;
  sub: string;
  state: KpiTileState;
};

/** Jaina's latest read on the portfolio, or the deterministic headline labelled as such. */
export type JainaRead = {
  source: 'jaina' | 'auto';
  /** "Jaina · on FORMULARIOS // TODOS · 2 h ago" */
  label: string;
  /** "2 h ago" — null when the brief's stamp does not parse. */
  ago: string | null;
  sentence: string;
  figure: Omit<HeadlineFigure, 'text'>;
};

export type PortfolioHeadline = {
  status: HeadlineSentence;
  opportunity: HeadlineSentence;
  blocker: HeadlineBlocker | null;
  tiles: HeadlineTile[];
  read: JainaRead;
  decisions: { waiting: number; atStakePerDay: number };
  /** The days the growth window actually covers (see coveredDays). */
  days: number;
  words: { one: string; many: string };
};

const DAY_MS = 86_400_000;

const count = (n: number): string =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);

const windowDays = (window: BriefGrowth['window']): number => Number(window.slice(1));

const PRIOR_WORDS: Record<BriefGrowth['window'], string> = {
  d3: 'the three days before',
  d7: 'the week before',
  d14: 'the two weeks before',
};

/** The result a portfolio buys, in the words its sentences use. Keyed by the metric's KPI
 *  field so a custom conversion that behaves like a lead is still called a lead. */
const RESULT_NOUNS: Record<string, { one: string; many: string }> = {
  purchases: { one: 'purchase', many: 'purchases' },
  appInstalls: { one: 'install', many: 'installs' },
  signups: { one: 'sign-up', many: 'sign-ups' },
  leads: { one: 'lead', many: 'leads' },
  landingPageViews: { one: 'landing page view', many: 'landing page views' },
  impressions: { one: 'thousand impressions', many: 'thousand impressions' },
  conversations: { one: 'conversation', many: 'conversations' },
  linkClicks: { one: 'link click', many: 'link clicks' },
  thruplays: { one: 'ThruPlay', many: 'ThruPlays' },
  postEngagement: { one: 'engagement', many: 'engagements' },
  clicks: { one: 'click', many: 'clicks' },
};

export function resultNouns(kind: string, fallbackLabel: string): { one: string; many: string } {
  const known = RESULT_NOUNS[kind];
  if (known) return known;
  const label = fallbackLabel.toLowerCase();
  return { one: label, many: label };
}

const dayWords = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`;

/**
 * The days the window actually covers: a portfolio younger than its window has only been
 * spending since it was created, and dividing its spend by 14 would call a two-day-old
 * portfolio 86% under budget. Calendar days, both ends counted, as the snapshots are.
 */
export function coveredDays(growth: BriefGrowth, createdAt: string | null): number {
  const window = windowDays(growth.window);
  const created = createdAt ? Date.parse(createdAt.slice(0, 10)) : Number.NaN;
  const asOf = Date.parse(growth.as_of.slice(0, 10));
  if (Number.isNaN(created) || Number.isNaN(asOf)) return window;
  const age = Math.round((asOf - created) / DAY_MS) + 1;
  return Math.max(1, Math.min(window, age));
}

/** The status body's portfolio row keeps created_at although the contract does not declare it. */
function createdAtOf(report: ParsedCycleRunReport | null): string | null {
  const value = report?.portfolio?.created_at;
  return typeof value === 'string' ? value : null;
}

type Outcome = { applied: number; failed: number; held: number };

/**
 * What happened to each ad set the cycle scored. `apply_status` is the apply layer's own
 * word; without one, a frozen ad set was held on purpose and a scored change nobody wrote
 * is waiting. A zero change with no status is simply unchanged, and counts in none.
 */
export function outcomeOf(items: readonly CycleItemRow[]): Outcome {
  const out: Outcome = { applied: 0, failed: 0, held: 0 };
  for (const item of items) {
    const frozen = item.diagnostics?.freezeReason ?? null;
    switch (item.apply_status) {
      case 'applied':
        out.applied += 1;
        break;
      case 'failed':
        out.failed += 1;
        break;
      case 'held':
      case 'approved_pending':
        out.held += 1;
        break;
      case 'skipped':
        break;
      default:
        if (frozen || (item.change_abs ?? 0) !== 0) out.held += 1;
    }
  }
  return out;
}

/** Pending recommendations, plus the budget moves waiting for approval in Recommend mode. */
export function decisionsWaiting(
  report: ParsedCycleRunReport | null,
  applyMode: string | null | undefined,
): number {
  const recs = report?.recommendations.filter((r) => r.status === 'pending').length ?? 0;
  const held = applyMode === 'recommend' ? outcomeOf(report?.latest_items ?? []).held : 0;
  return recs + held;
}

/** Whole percent over (+) or under (−) the target. Null without a cost or a target. */
function vsTargetPct(cost: number | null, target: number | null): number | null {
  if (cost == null || target == null || target <= 0) return null;
  return Math.round((cost / target - 1) * 100);
}

const money = (
  key: string,
  raw: number,
  currency: string | null,
  window: FigureWindow,
): HeadlineFigure => ({
  key,
  text: formatCurrency(raw, currency),
  raw,
  currency,
  window,
  unit: 'currency',
});

const tally = (key: string, raw: number, window: FigureWindow, text: string): HeadlineFigure => ({
  key,
  text,
  raw,
  currency: null,
  window,
  unit: 'count',
});

const percent = (key: string, raw: number, window: FigureWindow): HeadlineFigure => ({
  key,
  text: `${Math.abs(raw)}%`,
  raw: Math.abs(raw),
  currency: null,
  window,
  unit: 'percent',
});

/**
 * How we are doing: "56 leads in 7 days at 38.59 MXN, 10% over the target of 35.00 MXN and
 * 34% cheaper than the week before." With nothing bought the sentence says what was spent
 * for it; with no target it says there is none.
 */
export function statusSentence(
  growth: BriefGrowth,
  words: { one: string; many: string },
  currency: string | null,
  days: number,
): HeadlineSentence {
  const window = growth.window;
  const period = `in ${dayWords(days)}`;
  const results = Math.round(growth.results);
  const resultsFigure = tally(
    'headline.results',
    results,
    window,
    `${count(results)} ${results === 1 ? words.one : words.many}`,
  );
  if (results === 0 || growth.cost_per_result == null) {
    if (growth.spend <= 0) return [resultsFigure, ` ${period}, no spend.`];
    return [
      resultsFigure,
      ` ${period} with `,
      money('headline.spend', growth.spend, currency, window),
      ' spent.',
    ];
  }
  const out: HeadlineSentence = [
    resultsFigure,
    ` ${period} at `,
    money('headline.cost', growth.cost_per_result, currency, window),
  ];
  const pct = vsTargetPct(growth.cost_per_result, growth.target);
  if (pct == null || growth.target == null) {
    out.push(', no target set');
  } else if (pct === 0) {
    out.push(', on the target of ', money('headline.target', growth.target, currency, 'none'));
  } else {
    out.push(
      ', ',
      percent('headline.vs-target', pct, window),
      pct > 0 ? ' over the target of ' : ' under the target of ',
      money('headline.target', growth.target, currency, 'none'),
    );
  }
  const delta = growth.deltas.cost_per_result;
  if (delta != null && Number.isFinite(delta)) {
    const deltaPct = Math.round(delta * 100);
    if (deltaPct === 0) {
      out.push(` and the same cost as ${PRIOR_WORDS[window]}`);
    } else {
      out.push(
        ' and ',
        percent('headline.vs-prior', deltaPct, window),
        deltaPct < 0 ? ' cheaper than ' : ' dearer than ',
        PRIOR_WORDS[window],
      );
    }
  }
  out.push('.');
  return out;
}

/** The ad set's own cost per result from the cycle row the engine scored it on. */
function adsetCost(items: readonly CycleItemRow[], adsetId: string | null): number | null {
  if (!adsetId) return null;
  const cpa = items.find((item) => item.adset_id === adsetId)?.diagnostics?.ci?.cpa;
  return typeof cpa === 'number' && Number.isFinite(cpa) && cpa > 0 ? cpa : null;
}

/**
 * Where the opportunity is: the largest candidate by money per day, in the module's own
 * verb. "The opportunity: ITESO // AGOSTO - RTG pays 101 MXN per lead; pausing it frees
 * 48.80 MXN a day." Below the impact floor, or with nothing open, the sentence says so with the
 * figure it does have.
 */
export function opportunitySentence(args: {
  brief: PortfolioBrief;
  items: readonly CycleItemRow[];
  dailyTotal: number | null;
  currency: string | null;
  words: { one: string; many: string };
}): HeadlineSentence {
  const { brief, currency, words } = args;
  const ranked = rankCandidates(brief.candidates);
  const top: BriefCandidate | undefined = ranked[0];
  if (!top) {
    return [
      'No open opportunities today: the optimizer has nothing to propose',
      ...(args.dailyTotal != null && args.dailyTotal > 0
        ? [
            ' and the portfolio keeps running at ',
            money('headline.plan', args.dailyTotal, currency, 'none'),
            ' a day.',
          ]
        : ['.']),
    ];
  }
  if (!heroThresholdMet(ranked, args.dailyTotal)) {
    return [
      'No opportunity clears the floor today: the largest is worth ',
      money('headline.opportunity', top.impact_per_day, currency, 'none'),
      ' a day against a floor of ',
      money('headline.floor', heroMinImpact(args.dailyTotal), currency, 'none'),
      '.',
    ];
  }
  const name = top.adset_name ?? top.adset_id ?? 'an ad set';
  const impact = money('headline.opportunity', top.impact_per_day, currency, 'none');
  switch (top.module) {
    case 'pause': {
      const cost = adsetCost(args.items, top.adset_id);
      if (cost != null) {
        return [
          `The opportunity: ${name} pays `,
          money('headline.opportunity.cost', cost, currency, 'none'),
          ` per ${words.one}; pausing it frees `,
          impact,
          ' a day.',
        ];
      }
      return [`The opportunity: pausing ${name} frees `, impact, ' a day.'];
    }
    case 'budget':
      return [`The opportunity: move budget toward ${name}, `, impact, ' a day at stake.'];
    case 'creative':
      return [`The opportunity: refresh the creative on ${name}, `, impact, ' a day at stake.'];
    case 'audience':
      return [`The opportunity: open an audience next to ${name}, `, impact, ' a day at stake.'];
  }
}

/**
 * The third sentence, only when something blocks a decision: ad sets bidding for a result
 * the portfolio does not measure (the engine holds them), nothing delivered in the window,
 * or spend with no result to read. One at a time, in that order.
 */
export function blockerSentence(args: {
  growth: BriefGrowth;
  mismatch: HeroMismatch | null;
  words: { one: string; many: string };
  currency: string | null;
  days: number;
}): HeadlineBlocker | null {
  const { growth, mismatch, words, currency, days } = args;
  const window = growth.window;
  if (mismatch) {
    const bought = mismatch.bought
      ? resultNouns(mismatch.bought, mismatch.bought).many
      : 'another result';
    const who =
      mismatch.scope === 'all'
        ? `all ${mismatch.total} ad sets bid`
        : `${mismatch.mismatched} of ${mismatch.total} ad sets bid`;
    const effect =
      mismatch.scope === 'all'
        ? 'the optimizer holds them and moves nothing.'
        : 'the optimizer holds them and moves only the rest.';
    return {
      code: 'kpi_mismatch',
      sentence: [
        `Blocked: ${who} for ${bought}, not for ${words.many} as this portfolio measures; ${effect}`,
      ],
      actions: mismatch.actions,
    };
  }
  const period = dayWords(days);
  if (growth.spend <= 0) {
    return {
      code: 'zero_delivery',
      sentence: [`Blocked: zero delivery, nothing spent in ${period}.`],
      actions: [],
    };
  }
  if (growth.results === 0) {
    return {
      code: 'no_signal',
      sentence: [
        'Blocked: no signal, ',
        money('headline.blocker.spend', growth.spend, currency, window),
        ` spent and 0 ${words.many} in ${period}; nothing to decide on.`,
      ],
      actions: [],
    };
  }
  return null;
}

/** "2 h ago", "35 min ago", "3 days ago" — from an ISO stamp to now. */
export function agoWords(iso: string, now: number): string | null {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}

const hasDigit = (text: string): boolean => /\d/.test(text);

/**
 * Jaina's latest read on this portfolio: the brief's hero sentence when a model wrote it,
 * else the deterministic headline, labelled as automatic. A headline with no figure (the calm
 * "nothing worth changing today") is replaced by the status sentence, which always has one.
 */
export function jainaRead(args: {
  view: HeroView;
  name: string;
  status: HeadlineSentence;
  growth: BriefGrowth;
  currency: string | null;
  now: number;
}): JainaRead {
  const { brief } = args.view;
  const written = args.view.source === 'brief' && brief.model !== 'deterministic';
  const ago = agoWords(brief.generated_at, args.now);
  const who = written ? 'Jaina' : 'Automatic read';
  const label = [who, `on ${args.name}`, ago].filter(Boolean).join(' · ');
  const headline = brief.hero.headline;
  const sentence = hasDigit(headline)
    ? headline
    : args.status.map((segment) => (typeof segment === 'string' ? segment : segment.text)).join('');
  return {
    source: written ? 'jaina' : 'auto',
    label,
    ago,
    sentence,
    figure: {
      key: 'jaina.read',
      raw: brief.hero.impact_per_day ?? args.growth.cost_per_result ?? args.growth.spend,
      currency: args.currency,
      window: args.growth.window,
      unit: 'sentence',
    },
  };
}

function tilesOf(args: {
  growth: BriefGrowth;
  words: { one: string; many: string };
  currency: string | null;
  days: number;
  dailyTotal: number | null;
  waiting: number;
  atStakePerDay: number;
}): HeadlineTile[] {
  const { growth, words, currency, days, dailyTotal } = args;
  const window = growth.window;
  const perDay = growth.spend / Math.max(days, 1);
  const plan = dailyTotal != null && dailyTotal > 0 ? dailyTotal : null;
  const spend: HeadlineTile = {
    key: 'spend',
    label: `Spend · ${dayWords(days)}`,
    value: formatCurrency(growth.spend, currency),
    figure: { key: 'tiles.spend', raw: growth.spend, currency, window, unit: 'currency' },
    sub: plan
      ? `${formatCurrency(perDay, currency)} per day · plan ${formatCurrency(plan, currency)}`
      : `${formatCurrency(perDay, currency)} per day · no daily plan`,
    state: plan ? spendState(perDay, plan) : 'none',
  };

  const results = Math.round(growth.results);
  const target = growth.target != null && growth.target > 0 ? growth.target : null;
  const atTarget = target ? growth.spend / target : null;
  const resultsDelta = growth.deltas.results;
  const resultsTile: HeadlineTile = {
    key: 'results',
    label: words.many.charAt(0).toUpperCase() + words.many.slice(1),
    value: count(results),
    figure: { key: 'tiles.results', raw: results, currency: null, window, unit: 'count' },
    sub:
      resultsDelta != null && Number.isFinite(resultsDelta)
        ? `${resultsDelta >= 0 ? '+' : '−'}${Math.abs(Math.round(resultsDelta * 100))}% vs ${PRIOR_WORDS[window]}`
        : atTarget != null && results > 0
          ? `${count(atTarget)} at target for this spend`
          : results === 0 && growth.spend > 0
            ? `${formatCurrency(growth.spend, currency)} with no result`
            : 'no prior period',
    state:
      results === 0
        ? growth.spend > 0
          ? 'bad'
          : 'none'
        : atTarget == null
          ? 'none'
          : results >= atTarget
            ? 'ok'
            : results >= atTarget * 0.87
              ? 'warn'
              : 'bad',
  };

  const pct = vsTargetPct(growth.cost_per_result, target);
  const cost: HeadlineTile = {
    key: 'cost',
    label: `Cost per ${words.one}`,
    value: growth.cost_per_result == null ? '—' : formatCurrency(growth.cost_per_result, currency),
    figure: { key: 'tiles.cost', raw: growth.cost_per_result, currency, window, unit: 'currency' },
    sub:
      growth.cost_per_result == null
        ? results === 0
          ? `no ${words.many} to divide by`
          : 'no price yet'
        : target == null
          ? 'no target'
          : pct === 0
            ? `on the ${formatCurrency(target, currency)} target`
            : `${pct != null && pct > 0 ? '+' : ''}${pct}% ${pct != null && pct > 0 ? 'over' : 'under'} target ${formatCurrency(target, currency)}`,
    state: windowState(pct),
  };

  const decisions: HeadlineTile = {
    key: 'decisions',
    label: 'Decisions',
    value: String(args.waiting),
    figure: {
      key: 'tiles.decisions',
      raw: args.waiting,
      currency: null,
      window: 'none',
      unit: 'count',
    },
    sub:
      args.waiting > 0
        ? args.atStakePerDay > 0
          ? `${formatCurrency(args.atStakePerDay, currency)}/day at stake`
          : `${args.waiting === 1 ? 'waits' : 'wait'} for your decision`
        : 'nothing waits for your decision',
    state: args.waiting > 0 ? 'warn' : 'none',
  };
  return [spend, resultsTile, cost, decisions];
}

export function buildPortfolioHeadline(args: {
  view: HeroView;
  report: ParsedCycleRunReport | null;
  portfolio: { name: string; daily_total: number | null; apply_mode: string | null };
  metric: OptimizationMetricDefinition;
  currency: string | null;
  mismatch: HeroMismatch | null;
  /** The clock, for "2 h ago"; injectable so the tests are stable. */
  now?: number;
}): PortfolioHeadline {
  const { view, report, metric, currency } = args;
  const growth = view.brief.growth;
  const words = resultNouns(metric.kpiField, metric.resultLabel);
  const days = coveredDays(growth, createdAtOf(report));
  const status = statusSentence(growth, words, currency, days);
  const items = report?.latest_items ?? [];
  const waiting = decisionsWaiting(report, args.portfolio.apply_mode);
  const atStakePerDay =
    Math.round(view.brief.candidates.reduce((sum, c) => sum + c.impact_per_day, 0) * 100) / 100;
  const now = args.now ?? Date.now();
  return {
    status,
    opportunity: opportunitySentence({
      brief: view.brief,
      items,
      dailyTotal: args.portfolio.daily_total,
      currency,
      words,
    }),
    blocker: blockerSentence({ growth, mismatch: args.mismatch, words, currency, days }),
    tiles: tilesOf({
      growth,
      words,
      currency,
      days,
      dailyTotal: args.portfolio.daily_total,
      waiting,
      atStakePerDay,
    }),
    read: jainaRead({ view, name: args.portfolio.name, status, growth, currency, now }),
    decisions: { waiting, atStakePerDay },
    days,
    words,
  };
}

// ── The one-module hero (docs/performance-plus-redesign/portafolio-unificado.html, idea D) ──
//
// The module reads the same headline, rearranged: one ANCHOR number (the cost per result),
// the sentences beside it, four tiles chosen for what this portfolio buys, the last cycle in
// one line and Jaina's bar at the foot. The functions below only recompose what
// buildPortfolioHeadline and buildBeforeAfter already decided; nothing new is measured.

const sentenceText = (sentence: HeadlineSentence): string =>
  sentence.map((segment) => (typeof segment === 'string' ? segment : segment.text)).join('');

/** Jaina's read as the one attributed line under the status sentence. */
export type AttributedRead = {
  ago: string | null;
  sentence: string;
  figure: JainaRead['figure'];
};

/**
 * Null unless a model wrote the read AND it says something the status sentence does not: a
 * deterministic brief only repeats the headline, and a line that repeats it is noise.
 */
export function attributedRead(headline: PortfolioHeadline): AttributedRead | null {
  const { read } = headline;
  if (read.source !== 'jaina') return null;
  const normal = (text: string) => text.trim().replace(/\.$/, '').toLowerCase();
  if (normal(read.sentence) === normal(sentenceText(headline.status))) return null;
  return { ago: read.ago, sentence: read.sentence, figure: read.figure };
}

/** One of the anchor's two windows: "week of Sep 21–27: 45.69". */
export type AnchorWindow = {
  which: 'after' | 'before';
  label: string;
  cost: number | null;
  text: string;
};

export type PortfolioAnchor = {
  /** The cost per result, bare ("45.69"), or "—" with nothing bought. */
  value: string;
  figure: Omit<HeadlineFigure, 'text'>;
  /** ok under the target, warn over it, none without one or without a cost. */
  state: 'ok' | 'warn' | 'none';
  /** "MXN per lead" */
  unit: string;
  /** "target 35.00" / "no target" — the target, clickable into Manage. */
  target: string;
  /** "+31%" / "−12%" / "en la meta" — null without a cost or a target. */
  vsTarget: string | null;
  /** "no leads in 14 days" when there is no cost to show. */
  empty: string | null;
  /** The range the date picker selected and the one before it, newest first. */
  windows: AnchorWindow[];
};

/**
 * The module's anchor: the portfolio's cost per result over the brief's window, coloured by
 * the target, with the selected range and the one before it named by their dates — the
 * brief's window (say 14 days) and the picker's range (say 7) differ, so each figure says
 * which days it covers rather than borrowing the other's.
 */
export function anchorOf(args: {
  growth: BriefGrowth;
  words: { one: string; many: string };
  currency: string | null;
  days: number;
  beforeAfter: BeforeAfter | null;
}): PortfolioAnchor {
  const { growth, words, currency, days } = args;
  const cost = growth.cost_per_result;
  const target = growth.target != null && growth.target > 0 ? growth.target : null;
  const pct = vsTargetPct(cost, target);
  const code = normalizeCurrency(currency);
  const windows: AnchorWindow[] = [];
  for (const which of ['after', 'before'] as const) {
    const totals = args.beforeAfter?.[which];
    if (!totals) continue;
    windows.push({
      which,
      label: totals.short,
      cost: totals.cost,
      text: totals.cost == null ? `no ${words.many}` : formatCurrency(totals.cost, null),
    });
  }
  return {
    value: cost == null ? '—' : formatCurrency(cost, null),
    figure: { key: 'anchor.cost', raw: cost, currency, window: growth.window, unit: 'currency' },
    state: pct == null ? 'none' : pct > 0 ? 'warn' : 'ok',
    unit: code ? `${code} per ${words.one}` : `per ${words.one}`,
    target: target == null ? 'no target' : `target ${formatCurrency(target, null)}`,
    vsTarget:
      pct == null ? null : pct === 0 ? 'on target' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`,
    empty: cost == null ? `no ${words.many} in ${dayWords(days)}` : null,
    windows,
  };
}

/** A tile's line: prose, or a piece that opens its setting in Manage. */
export type TileSegment = string | { setting: HeroSetting; text: string };

export type ModuleTile = {
  key: 'spend' | 'results' | 'adsets' | 'decisions';
  label: string;
  value: string;
  figure: Omit<HeadlineFigure, 'text'>;
  sub: TileSegment[];
  /** The second line; null when the tile has nothing more to say. */
  detail: string | null;
  state: KpiTileState;
};

const PRIOR_SHORT: Record<BriefGrowth['window'], string> = {
  d3: 'the 3 days before',
  d7: 'the week before',
  d14: 'the 2 weeks before',
};

const signedPct = (ratio: number): string =>
  `${ratio >= 0 ? '+' : '−'}${Math.abs(Math.round(ratio * 100))}%`;

const finite = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

/** An ad set's measured cost per result: the engine's interval centre, when it has events. */
function measuredCost(item: CycleItemRow): number | null {
  const ci = item.diagnostics?.ci;
  if (!ci || !finite(ci.cpa) || ci.cpa <= 0) return null;
  // cpa is a 0 sentinel on a zero-event row; events 0 with a cpa is the same case.
  if (finite(ci.events) && ci.events <= 0) return null;
  return ci.cpa;
}

/**
 * "Conjuntos en meta": how many of the cycle's ad sets buy at or under the target, and the
 * cheapest and dearest of them. Every scored ad set counts in the total — one that bought
 * nothing is not in the target — but only a measured cost can be best or worst.
 */
export function adsetsOnTargetTile(args: {
  items: readonly CycleItemRow[];
  target: number | null;
  window: FigureWindow;
}): ModuleTile {
  const { items, target } = args;
  const measured = items
    .map((item) => ({ name: item.adset_name ?? item.adset_id, cost: measuredCost(item) }))
    .filter((row): row is { name: string; cost: number } => row.cost != null)
    .sort((a, b) => a.cost - b.cost);
  const best = measured[0];
  const worst = measured.length > 1 ? measured[measured.length - 1] : undefined;
  const bestLine = best ? `best ${best.name} ${formatCurrency(best.cost, null)}` : null;
  const worstLine = worst ? `worst ${worst.name} ${formatCurrency(worst.cost, null)}` : null;
  const base = { key: 'adsets', label: 'Ad sets on target' } as const;
  if (items.length === 0) {
    return {
      ...base,
      value: '—',
      figure: {
        key: 'tiles.adsets-on-target',
        raw: null,
        currency: null,
        window: args.window,
        unit: 'count',
      },
      sub: ['no ad sets scored yet'],
      detail: null,
      state: 'none',
    };
  }
  if (target == null) {
    return {
      ...base,
      value: '—',
      figure: {
        key: 'tiles.adsets-on-target',
        raw: null,
        currency: null,
        window: args.window,
        unit: 'count',
      },
      sub: ['no target'],
      detail: bestLine,
      state: 'none',
    };
  }
  const on = measured.filter((row) => row.cost <= target).length;
  return {
    ...base,
    value: `${count(on)} of ${count(items.length)}`,
    figure: {
      key: 'tiles.adsets-on-target',
      raw: on,
      currency: null,
      window: args.window,
      unit: 'count',
    },
    sub: [bestLine ?? 'no measured cost'],
    detail: worstLine,
    state:
      measured.length === 0 ? 'none' : on === 0 ? 'bad' : on * 2 >= items.length ? 'ok' : 'warn',
  };
}

/**
 * The four tiles under the anchor, chosen for what the portfolio buys. The cost per result
 * left the row — it IS the anchor — and its place goes to the ad sets in target, the one
 * figure the anchor cannot say.
 *
 * Every objective the Optimizer runs today resolves to the same four: spend, the result it
 * buys (named in its own words: leads, conversaciones, compras), ad sets in target, and the
 * decisions waiting. A purchase portfolio would earn a value-per-purchase or ROAS tile in
 * the third place, but the brief's growth read carries no purchase value yet
 * (briefGrowthSchema in @continuum/contracts); when it does, this is the one switch to add.
 */
export function relevantTiles(args: {
  headline: PortfolioHeadline;
  brief: PortfolioBrief;
  items: readonly CycleItemRow[];
  dailyTotal: number | null;
  currency: string | null;
}): ModuleTile[] {
  const { headline, brief, currency } = args;
  const growth = brief.growth;
  const byKey = new Map(headline.tiles.map((tile) => [tile.key, tile]));
  const spend = byKey.get('spend');
  const results = byKey.get('results');
  const decisions = byKey.get('decisions');
  const days = Math.max(headline.days, 1);
  const plan = args.dailyTotal != null && args.dailyTotal > 0 ? args.dailyTotal : null;
  const target = growth.target != null && growth.target > 0 ? growth.target : null;
  const tiles: ModuleTile[] = [];

  if (spend) {
    tiles.push({
      key: 'spend',
      label: spend.label,
      value: spend.value,
      figure: spend.figure,
      sub: [
        `${formatCurrency(growth.spend / days, currency)}/day · `,
        {
          setting: 'budget',
          text: plan ? `plan ${formatCurrency(plan, currency)}` : 'no daily plan',
        },
      ],
      detail: finite(growth.deltas.spend)
        ? `${signedPct(growth.deltas.spend)} vs ${PRIOR_SHORT[growth.window]}`
        : null,
      state: spend.state,
    });
  }

  if (results) {
    const n = Math.round(growth.results);
    const needed = target && n > 0 ? growth.spend / target : null;
    tiles.push({
      key: 'results',
      label: results.label,
      value: results.value,
      figure: results.figure,
      sub: [
        finite(growth.deltas.results)
          ? `${signedPct(growth.deltas.results)} vs ${PRIOR_SHORT[growth.window]}`
          : n === 0 && growth.spend > 0
            ? `${formatCurrency(growth.spend, currency)} with no result`
            : 'no prior period',
      ],
      detail: needed != null ? `${count(needed)} at target for this spend` : null,
      state: results.state,
    });
  }

  tiles.push(adsetsOnTargetTile({ items: args.items, target, window: growth.window }));

  if (decisions) {
    const open = brief.candidates.length;
    tiles.push({
      key: 'decisions',
      label: decisions.label,
      value: decisions.value,
      figure: decisions.figure,
      sub: [decisions.sub],
      // Only beside a decision: "nothing waits for your decision · 1 open opportunity" contradicts
      // itself when the one candidate sits under the impact floor.
      detail:
        headline.decisions.waiting > 0 && open > 0
          ? `${open} open ${open === 1 ? 'opportunity' : 'opportunities'}`
          : null,
      state: decisions.state,
    });
  }
  return tiles;
}
