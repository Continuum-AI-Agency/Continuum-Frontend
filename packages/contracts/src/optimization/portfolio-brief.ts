// The portfolio brief: what a person sees first when they open a portfolio. The growth
// read (spend, results, cost per result vs target, pacing) and ONE hero — the highest-
// impact thing to do today across budget, pausing, creatives and audiences.
//
// Impact is money per day, computed in code from persisted figures; the model writes the
// words and may pick a non-maximum only with a justification the card shows. The same
// shape is composed deterministically (no model) as the fallback, so the screen is never
// empty and the worker's fallback reads exactly like the Frontend's.

import { z } from 'zod';

export const heroModuleSchema = z.enum(['budget', 'pause', 'creative', 'audience', 'none']);
export type HeroModule = z.infer<typeof heroModuleSchema>;

export const briefCtaSchema = z.object({
  kind: z.enum(['queue_row', 'audience_card', 'manage']),
  /** The queue row key ("rec:<id>", "budget:<adset>"), the proposal id, or null for manage. */
  target_id: z.string().nullable().default(null),
});
export type BriefCta = z.infer<typeof briefCtaSchema>;

export const briefCandidateSchema = z.object({
  /** 'budget:<adset_id>' | 'rec:<uuid>' | 'audience:<proposal uuid>' */
  id: z.string().min(1),
  module: heroModuleSchema.exclude(['none']),
  kind: z.string(),
  trigger: z.string().nullable().default(null),
  adset_id: z.string().nullable().default(null),
  adset_name: z.string().nullable().default(null),
  /** Money per day, always. Results-side figures convert through the current cost per result. */
  impact_per_day: z.number().nonnegative(),
  impact_unit: z.literal('currency').default('currency'),
  results_per_day: z.number().nullable().default(null),
  /** The formula, code-authored: "spend/day on an ad set with 0 conversions in 7d". */
  impact_basis: z.string().max(200),
  /** The persisted sentence (item.reason / rec.reason) — quoted, never regenerated. */
  reason: z.string().nullable().default(null),
  cta: briefCtaSchema,
});
export type BriefCandidate = z.infer<typeof briefCandidateSchema>;

export const briefPacingSchema = z.object({
  status: z.enum(['on_track', 'underpacing', 'overpacing']).nullable().default(null),
  ratio: z.number().nullable().default(null),
  note: z.string().nullable().default(null),
});

export const briefGrowthSchema = z.object({
  spend: z.number().nonnegative(),
  results: z.number().nonnegative(),
  cost_per_result: z.number().nullable().default(null),
  target: z.number().nullable().default(null),
  deltas: z.object({
    spend: z.number().nullable().default(null),
    results: z.number().nullable().default(null),
    cost_per_result: z.number().nullable().default(null),
  }),
  pacing: briefPacingSchema,
  scale: z
    .object({ stepped: z.boolean(), from: z.number().nullable(), to: z.number().nullable() })
    .nullable()
    .default(null),
  window: z.enum(['d3', 'd7', 'd14']),
  as_of: z.string(),
  currency: z.string().nullable().default(null),
  result_label: z.string(),
});
export type BriefGrowth = z.infer<typeof briefGrowthSchema>;

export const briefHeroSchema = z.object({
  module: heroModuleSchema,
  candidate_id: z.string().nullable().default(null),
  headline: z.string().min(1).max(90),
  why: z.string().max(240),
  impact_per_day: z.number().nullable().default(null),
  impact_unit: z.literal('currency').default('currency'),
  impact_basis: z.string().nullable().default(null),
  /** Required when the hero is not the highest-impact candidate. */
  justification: z.string().max(240).nullable().default(null),
  confidence_note: z.string().max(120).nullable().default(null),
  cta: briefCtaSchema.nullable().default(null),
});
export type BriefHero = z.infer<typeof briefHeroSchema>;

export const portfolioBriefSchema = z.object({
  version: z.literal(1),
  growth: briefGrowthSchema,
  hero: briefHeroSchema,
  growth_sentence: z.string().max(160),
  candidates: z.array(briefCandidateSchema),
  /** Candidate ids worth a second look; the maximum comes first when the hero is not it. */
  secondary: z.array(z.string()).default([]),
  prompt_version: z.string(),
  /** 'deterministic' when no model wrote the words. */
  model: z.string(),
  generated_at: z.string(),
});
export type PortfolioBrief = z.infer<typeof portfolioBriefSchema>;

export const portfolioBriefRowSchema = z
  .object({
    id: z.string().uuid(),
    portfolio_id: z.string().uuid(),
    brand_id: z.string().uuid(),
    cycle_run_id: z.string().uuid().nullable().default(null),
    utc_day: z.string(),
    status: z.enum(['queued', 'generating', 'ready', 'failed']),
    brief: z.record(z.string(), z.unknown()).nullable().default(null),
    model: z.string().nullable().default(null),
    prompt_version: z.string().nullable().default(null),
    error: z.record(z.string(), z.unknown()).nullable().default(null),
    ready_at: z.string().nullable().default(null),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .loose();
export type PortfolioBriefRow = z.infer<typeof portfolioBriefRowSchema>;

export function readPortfolioBrief(
  row: Pick<PortfolioBriefRow, 'brief'> | null | undefined,
): PortfolioBrief | null {
  if (!row?.brief) return null;
  const parsed = portfolioBriefSchema.safeParse(row.brief);
  return parsed.success ? parsed.data : null;
}

// ── Ranking ─────────────────────────────────────────────────────────────────

const MODULE_ORDER: Record<Exclude<HeroModule, 'none'>, number> = {
  budget: 0,
  pause: 1,
  creative: 2,
  audience: 3,
};

/** Highest money first; ties by module (what moves money > what stops waste > creative >
 *  audience), then id, so the order is stable across runs. */
export function rankCandidates(candidates: readonly BriefCandidate[]): BriefCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      b.impact_per_day - a.impact_per_day ||
      MODULE_ORDER[a.module] - MODULE_ORDER[b.module] ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Below this, nothing is a hero: the growth read stands alone. 2% of the daily total, at
 *  least 5 units of currency. */
export function heroMinImpact(dailyTotal: number | null | undefined): number {
  return Math.max(0.02 * (dailyTotal ?? 0), 5);
}

/** How big a candidate is against the portfolio's own scale, in words a reader can rank
 *  without doing the arithmetic. Medium starts at the hero floor (2% of the daily total, at
 *  least 5); high at five times that — a tenth of the day's budget. */
export const impactTierSchema = z.enum(['low', 'medium', 'high']);
export type ImpactTier = z.infer<typeof impactTierSchema>;

export function impactTier(
  impactPerDay: number,
  dailyTotal: number | null | undefined,
): ImpactTier {
  const floor = heroMinImpact(dailyTotal);
  if (impactPerDay >= floor * 5) return 'high';
  if (impactPerDay >= floor) return 'medium';
  return 'low';
}

export const IMPACT_TIER_COPY: Record<ImpactTier, string> = {
  low: 'Low impact',
  medium: 'Medium impact',
  high: 'High impact',
};

export const HERO_MODULE_COPY: Record<Exclude<HeroModule, 'none'>, { label: string }> = {
  budget: { label: 'Budget' },
  pause: { label: 'Pausing' },
  creative: { label: 'Creatives' },
  audience: { label: 'Audience' },
};

/** The strongest candidate of each module, strongest module first. A module with nothing
 *  to say is absent — the read never pads itself with an empty category. */
export function topCandidatePerModule(candidates: readonly BriefCandidate[]): BriefCandidate[] {
  const seen = new Set<BriefCandidate['module']>();
  const out: BriefCandidate[] = [];
  for (const candidate of rankCandidates(candidates)) {
    if (seen.has(candidate.module)) continue;
    seen.add(candidate.module);
    out.push(candidate);
  }
  return out;
}

export function heroThresholdMet(
  candidates: readonly BriefCandidate[],
  dailyTotal: number | null | undefined,
): boolean {
  const [top] = rankCandidates(candidates);
  return top !== undefined && top.impact_per_day >= heroMinImpact(dailyTotal);
}

export type HeroPickCheck = { ok: true } | { ok: false; reason: string };

/** The model chose; code checks the choice: in the packet, and if not the maximum, a
 *  justification and the maximum listed first among the secondary ids. */
export function validateHeroPick(args: {
  candidates: readonly BriefCandidate[];
  chosenId: string | null;
  justification: string | null;
  secondary: readonly string[];
}): HeroPickCheck {
  const ranked = rankCandidates(args.candidates);
  if (ranked.length === 0) {
    return args.chosenId === null
      ? { ok: true }
      : { ok: false, reason: 'chose a candidate but the packet has none' };
  }
  if (args.chosenId === null) return { ok: false, reason: 'chose nothing while candidates exist' };
  const chosen = ranked.find((c) => c.id === args.chosenId);
  if (!chosen) return { ok: false, reason: `chosen id ${args.chosenId} is not in the packet` };
  const max = ranked[0] as BriefCandidate;
  if (chosen.impact_per_day < max.impact_per_day) {
    if (!args.justification?.trim()) {
      return {
        ok: false,
        reason: `chose ${chosen.id} over the maximum ${max.id} without a justification`,
      };
    }
    if (args.secondary[0] !== max.id) {
      return { ok: false, reason: 'the maximum candidate must be first among the secondary ids' };
    }
  }
  return { ok: true };
}

// ── The digit gate ──────────────────────────────────────────────────────────
// The model writes words. Every number it uses must already exist in the packet, in one of
// the ways a person would round it. Anything else is an invented figure.

const numberTokens = (text: string): string[] =>
  (text.match(/\d[\d.,]*/g) ?? []).map((token) => token.replace(/,/g, '').replace(/\.$/, ''));

function variants(value: number): string[] {
  const out = new Set<string>();
  const abs = Math.abs(value);
  const push = (n: number) => {
    if (!Number.isFinite(n)) return;
    out.add(String(n));
    out.add(n.toFixed(0));
    out.add(n.toFixed(1));
    out.add(n.toFixed(2));
    out.add(String(Math.round(n)));
  };
  push(abs);
  push(Math.round(abs / 10) * 10);
  push(Math.round(abs / 100) * 100);
  push(Math.round(abs / 1000) * 1000);
  out.add((abs / 1000).toFixed(1)); // "1.4" as in 1.4K
  out.add((abs / 1_000_000).toFixed(1)); // "2.3" as in 2.3M
  return [...out].map((v) => v.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'));
}

/** Numbers already written in packet prose (a quoted reason, an impact basis, a pacing
 *  note) may be quoted back verbatim. */
export function numberTokensIn(texts: readonly (string | null | undefined)[]): string[] {
  return texts.flatMap((t) => (t ? numberTokens(t) : []));
}

export function allowedNumberTokens(
  figures: readonly (number | null | undefined)[],
  quotedTexts: readonly (string | null | undefined)[] = [],
): Set<string> {
  const allowed = new Set<string>();
  for (const token of numberTokensIn(quotedTexts)) {
    allowed.add(token.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'));
  }
  for (const figure of figures) {
    if (figure == null || !Number.isFinite(figure)) continue;
    for (const v of variants(figure)) allowed.add(v);
    // A fraction may be quoted as a percentage.
    if (Math.abs(figure) < 10) for (const v of variants(figure * 100)) allowed.add(v);
  }
  // Small counts and calendar-ish numbers are never inventions.
  for (let n = 0; n <= 31; n += 1) allowed.add(String(n));
  return allowed;
}

/** Numbers in the text that no packet figure explains. Empty = clean. */
export function numbersOutsidePacket(text: string, allowed: ReadonlySet<string>): string[] {
  return numberTokens(text)
    .map((token) => token.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'))
    .filter((token) => token !== '' && !allowed.has(token));
}

/** Every figure the model may quote for a brief packet. */
export function briefFigures(growth: BriefGrowth, candidates: readonly BriefCandidate[]): number[] {
  const out: (number | null | undefined)[] = [
    growth.spend,
    growth.results,
    growth.cost_per_result,
    growth.target,
    growth.deltas.spend,
    growth.deltas.results,
    growth.deltas.cost_per_result,
    growth.pacing.ratio,
    growth.scale?.from,
    growth.scale?.to,
  ];
  for (const c of candidates) out.push(c.impact_per_day, c.results_per_day);
  return out.filter((n): n is number => n != null && Number.isFinite(n));
}

// ── The deterministic brief ─────────────────────────────────────────────────
// Same shape, no model. The worker falls back to it; the Frontend composes it while a
// brief is missing. Money is formatted by the renderer; here the headline carries the
// figure as a plain number so both sides say the same thing.

const money = (n: number, currency: string | null): string =>
  `${currency ?? ''}${currency ? ' ' : ''}${Math.round(n).toLocaleString('en-US')}`.trim();

function headlineFor(c: BriefCandidate, currency: string | null, resultLabel: string): string {
  const name = c.adset_name ?? c.adset_id ?? 'an ad set';
  switch (c.module) {
    case 'pause':
      return `Stop ${money(c.impact_per_day, currency)}/day going to ${name}`.slice(0, 90);
    case 'budget':
      return `Move budget toward cheaper ${resultLabel}: ${money(c.impact_per_day, currency)}/day at stake`.slice(
        0,
        90,
      );
    case 'creative':
      return `Rotate the creative on ${name}: ${money(c.impact_per_day, currency)}/day at stake`.slice(
        0,
        90,
      );
    case 'audience':
      return `Open a new audience beside ${name}: ${money(c.impact_per_day, currency)}/day at stake`.slice(
        0,
        90,
      );
  }
}

export function growthSentence(growth: BriefGrowth): string {
  const parts: string[] = [];
  const pct = (v: number | null) =>
    v == null ? null : `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  const r = pct(growth.deltas.results);
  const c = pct(growth.deltas.cost_per_result);
  if (r) parts.push(`${growth.result_label} ${r}`);
  if (c) parts.push(`cost per result ${c}`);
  if (growth.target != null && growth.cost_per_result != null) {
    const vs = growth.cost_per_result / growth.target - 1;
    parts.push(`${Math.abs(Math.round(vs * 100))}% ${vs <= 0 ? 'under' : 'over'} target`);
  }
  if (growth.pacing.status) parts.push(growth.pacing.status.replace('_', ' '));
  const line =
    parts.length > 0 ? parts.join(' · ') : `Reading the last ${growth.window.slice(1)} days`;
  return line.slice(0, 160);
}

// ── The calm hero ───────────────────────────────────────────────────────────
// When no candidate clears the impact floor, the hero has nothing to point at — but it still
// has to tell the truth about where the portfolio stands. "On its plan" is a claim, and it
// is only made when the figures back it: cost per result within 15% of target, results in
// the window, and at least one ad set the optimizer is actually allowed to move. Otherwise
// the hero states the true status with the figures, placed here by code, and names the lever.

/** Cost per result this far over target, read with enough confidence, is off plan. */
export const MATERIAL_OVER_TARGET = 0.15;
/** The engine's event floor: with no persisted confidence band, this many results in the
 *  window is enough to read the cost as real (the Frontend fallback has no band). */
export const STANDING_EVENT_FLOOR = 20;

export const briefStandingSchema = z.object({
  /** The cycle's confidence band, null when the run carries none. */
  confidence: z.enum(['low', 'medium', 'high']).nullable(),
  adsets_total: z.number().int().nonnegative(),
  /** Ad sets the cycle held (froze) rather than scored. */
  adsets_held: z.number().int().nonnegative(),
  /** The engine freeze reason most held ad sets share ('kpi_mismatch', …). */
  held_reason: z.string().nullable(),
});
export type BriefStanding = z.infer<typeof briefStandingSchema>;

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** The standing, read from a persisted cycle run and its items (the rows as stored:
 *  `latest_run.confidence.band`, `item.diagnostics.status` / `freezeReason`). */
export function readBriefStanding(latestRun: unknown, items: readonly unknown[]): BriefStanding {
  const band = asRecord(asRecord(latestRun)?.confidence)?.band;
  const reasons = new Map<string, number>();
  let held = 0;
  for (const item of items) {
    const diagnostics = asRecord(asRecord(item)?.diagnostics);
    const reason = typeof diagnostics?.freezeReason === 'string' ? diagnostics.freezeReason : null;
    if (diagnostics?.status !== 'frozen' && !reason) continue;
    held += 1;
    if (reason) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  let heldReason: string | null = null;
  for (const [reason, count] of reasons) {
    if (heldReason === null || count > (reasons.get(heldReason) ?? 0)) heldReason = reason;
  }
  return {
    confidence: band === 'low' || band === 'medium' || band === 'high' ? band : null,
    adsets_total: items.length,
    adsets_held: held,
    held_reason: heldReason,
  };
}

const HELD_COPY: Record<string, { why: (resultLabel: string) => string; lever: string }> = {
  kpi_mismatch: {
    why: (label) => `bid for a different result than the ${label} this portfolio measures`,
    lever: 'Move them to a portfolio that measures what they buy.',
  },
  no_own_budget: {
    why: () => 'have no ad-set daily budget the optimizer can move',
    lever: 'Give them ad-set daily budgets in Meta.',
  },
  unsupported_budget: {
    why: () => 'have no ad-set daily budget the optimizer can move',
    lever: 'Give them ad-set daily budgets in Meta.',
  },
  lifetime_budget: {
    why: () => 'run on a lifetime budget, not a daily one',
    lever: 'Switch them to ad-set daily budgets in Meta.',
  },
  no_declared_objective: {
    why: () => 'declare no optimization goal',
    lever: 'Set a goal on each ad set in Meta.',
  },
  missing_window: {
    why: () => 'lack the trailing history to score',
    lever: 'They are scored again once the history fills in.',
  },
};

/** A figure as a person writes it: at most two decimals, the currency code after it
 *  ("40.53 MXN"), or bare when the account's currency is unknown — never assumed. */
const figure = (n: number, currency: string | null): string => {
  const plain = String(Math.round(n * 100) / 100);
  return currency ? `${plain} ${currency}` : plain;
};

const costPerLabel = (resultLabel: string): string =>
  resultLabel === 'impressions'
    ? 'Cost per 1,000 impressions'
    : `Cost per ${resultLabel.endsWith('s') ? resultLabel.slice(0, -1) : resultLabel}`;

const CALM_HEADLINE = 'Nothing worth changing today — the portfolio is on its plan.';

export function calmHero(args: {
  growth: BriefGrowth;
  /** Ranked; the first is the largest, still under the floor. */
  candidates: readonly BriefCandidate[];
  dailyTotal: number | null | undefined;
  standing: BriefStanding | null;
}): BriefHero {
  const { growth, standing } = args;
  const cur = growth.currency;
  const days = growth.window.slice(1);
  const label = growth.result_label;
  const top = args.candidates[0];
  const underFloor = top
    ? `No single change clears the impact floor today (largest: ${figure(top.impact_per_day, cur)}/day vs a ${figure(heroMinImpact(args.dailyTotal), cur)}/day floor).`
    : 'No open recommendations to act on today.';

  const allHeld =
    standing !== null &&
    standing.adsets_total > 0 &&
    standing.adsets_held === standing.adsets_total;
  const held = standing?.held_reason ? HELD_COPY[standing.held_reason] : undefined;
  const heldWhy = allHeld
    ? `All ${standing.adsets_total} ad sets ${held ? held.why(label) : 'are held this cycle'}, so none is optimized.${held ? ` ${held.lever}` : ''}`
    : '';

  let headline = CALM_HEADLINE;
  let why = top
    ? 'The open recommendations are below the impact floor.'
    : 'No open recommendations.';

  const cpr = growth.cost_per_result;
  const target = growth.target;
  const over = cpr != null && target != null && target > 0 ? cpr / target - 1 : null;
  const confident =
    standing?.confidence != null
      ? standing.confidence !== 'low'
      : growth.results >= STANDING_EVENT_FLOOR;

  if (growth.results === 0) {
    headline =
      growth.spend <= 0
        ? `No spend and no ${label} in ${days} days`
        : allHeld
          ? `No ${label} in ${days} days — all ${standing.adsets_total} ad sets are held`
          : `No ${label} in ${days} days on ${figure(growth.spend, cur)} spent`;
    const lead =
      growth.spend <= 0
        ? 'Nothing delivered in the window.'
        : `${figure(growth.spend, cur)} spent over ${days} days bought no ${label}.`;
    why = allHeld
      ? `${lead} ${heldWhy}`
      : `${lead} Check that the ad sets optimize for ${label} and the event is tracked, then the creatives.`;
  } else if (allHeld) {
    headline = `All ${standing.adsets_total} ad sets are held — the optimizer is not moving budget`;
    why = heldWhy;
  } else if (over != null && over > MATERIAL_OVER_TARGET && cpr != null && target != null) {
    if (confident) {
      headline = `${costPerLabel(label)} is ${figure(cpr, cur)}, ${Math.round(over * 100)}% over the ${figure(target, cur)} target`;
      why = `${underFloor} The gap is portfolio-wide: new creatives, less budget until cost falls, or a target that fits what ${growth.results} ${label} cost.`;
    } else {
      headline = `${costPerLabel(label)} is ${figure(cpr, cur)} against a ${figure(target, cur)} target`;
      why = `Confidence is low: too little data to say the gap will hold. ${underFloor}`;
    }
  }

  return {
    module: 'none',
    candidate_id: null,
    headline: headline.slice(0, 90),
    why: why.slice(0, 240),
    impact_per_day: null,
    impact_unit: 'currency',
    impact_basis: null,
    justification: null,
    confidence_note: null,
    cta: null,
  };
}

export function deterministicBrief(args: {
  growth: BriefGrowth;
  candidates: readonly BriefCandidate[];
  dailyTotal: number | null | undefined;
  /** What the cycle held and how sure it is; absent on the Frontend fallback. */
  standing?: BriefStanding | null;
  promptVersion: string;
  generatedAt: string;
}): PortfolioBrief {
  const ranked = rankCandidates(args.candidates);
  const top = ranked[0];
  const hero: BriefHero =
    top && heroThresholdMet(ranked, args.dailyTotal)
      ? {
          module: top.module,
          candidate_id: top.id,
          headline: headlineFor(top, args.growth.currency, args.growth.result_label),
          why: (top.reason ?? top.impact_basis).slice(0, 240),
          impact_per_day: top.impact_per_day,
          impact_unit: 'currency',
          impact_basis: top.impact_basis,
          justification: null,
          confidence_note: null,
          cta: top.cta,
        }
      : calmHero({
          growth: args.growth,
          candidates: ranked,
          dailyTotal: args.dailyTotal,
          standing: args.standing ?? null,
        });
  return {
    version: 1,
    growth: args.growth,
    hero,
    growth_sentence: growthSentence(args.growth),
    candidates: ranked,
    secondary: ranked.slice(1, 3).map((c) => c.id),
    prompt_version: args.promptVersion,
    model: 'deterministic',
    generated_at: args.generatedAt,
  };
}
