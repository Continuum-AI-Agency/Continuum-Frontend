// H04 Opportunity Stack: the Optimizer's opportunities, each priced in the brand's GOAL units
// ("+0.4 leads a day") whenever that is honest, and in money per day otherwise.
//
// The Optimizer prices every candidate in money per day, because that is the one scale its
// ranking can compare. The Home leads with the goal instead, and the conversion is only made
// when a cost per result of the goal's own result, for the same entity, was actually observed.
// Anything else stays money and says why (`goalUnitsBecause`), so a figure on the stack never
// borrows a denominator nobody measured.
//
// Served by the Backend at HOME_READ_PATHS.opportunities (GET ?brandId=).

import { z } from 'zod';
import { homeObjectiveMetricSchema } from '../objectives';
import { homeReadEnvelopeSchema, homeReadSourceSchema } from './envelope';

/** Where the opportunity was read from: the account read's candidates or a portfolio's brief. */
export const homeOpportunityOriginSchema = z.enum(['account_read', 'portfolio_brief']);
export type HomeOpportunityOrigin = z.infer<typeof homeOpportunityOriginSchema>;

/**
 * Money recovered now, money that buys more, money not yet lost — the Optimizer's classes,
 * carried so a card can say which kind of money it is. A brief's candidates carry no class of
 * their own: a pause recovers money, a budget move or a creative swap buys more with the same.
 */
export const homeOpportunityImpactClassSchema = z.enum(['recoverable', 'better_price', 'deferred']);
export type HomeOpportunityImpactClass = z.infer<typeof homeOpportunityImpactClassSchema>;

/**
 * How the goal units were obtained. Each one names a price that was OBSERVED:
 *   reported_results  — the source already states results per day (a brief's budget move)
 *   destination_price — the saving priced at the cost per result where the money moves to
 *   entity_price      — the cost per result of the entity the candidate is about
 *   portfolio_price   — the portfolio's own cost per result over its brief's window
 */
export const homeGoalUnitsBasisSchema = z.enum([
  'reported_results',
  'destination_price',
  'entity_price',
  'portfolio_price',
]);
export type HomeGoalUnitsBasis = z.infer<typeof homeGoalUnitsBasisSchema>;

export const homeOpportunityImpactSchema = z
  .object({
    /** The Optimizer's own money per day, before any class weighting. */
    moneyPerDay: z.number().finite().nonnegative(),
    /** ISO code the money is in; null when the account records none (never assume dollars). */
    currency: z.string().nullable(),
    impactClass: homeOpportunityImpactClassSchema,
    /** What the card leads with. */
    unit: z.enum(['goal', 'money']),
    /** The goal metric the units count; null when the stack has no countable goal here. */
    goalMetric: homeObjectiveMetricSchema.nullable(),
    /** Goal results per day, rounded to two places. Null whenever `unit` is money. */
    goalUnits: z.number().finite().nonnegative().nullable(),
    /** The cost of one goal result the conversion divided by, in `currency`. */
    costPerResult: z.number().finite().positive().nullable(),
    goalUnitsBasis: homeGoalUnitsBasisSchema.nullable(),
    /** One sentence: the price used, or why the figure stayed in money. */
    goalUnitsBecause: z.string().min(1),
  })
  .superRefine((impact, ctx) => {
    if (impact.unit === 'money' && (impact.goalUnits !== null || impact.goalUnitsBasis !== null)) {
      ctx.addIssue({ code: 'custom', message: 'A money opportunity carries no goal units.' });
    }
    if (
      impact.unit === 'goal' &&
      (impact.goalUnits === null || impact.goalMetric === null || impact.goalUnitsBasis === null)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'A goal opportunity names its units, metric and basis.',
      });
    }
  });
export type HomeOpportunityImpact = z.infer<typeof homeOpportunityImpactSchema>;

/** The detector's own lead figure, already in display units ("33" for 33%). */
export const homeOpportunityHeadlineSchema = z.object({
  value: z.number().finite(),
  unit: z.enum(['percent', 'currency_per_day', 'count']),
  label: z.string().min(1),
});
export type HomeOpportunityHeadline = z.infer<typeof homeOpportunityHeadlineSchema>;

export const homeOpportunityCtaSchema = z.object({
  kind: z.enum(['portfolio', 'queue_row', 'audience_card', 'manage', 'none']),
  targetId: z.string().nullable(),
});
export type HomeOpportunityCta = z.infer<typeof homeOpportunityCtaSchema>;

/** The pending recommendation a card can approve or dismiss, when the source offers one. */
export const homeOpportunityCardActionSchema = z.object({
  recommendationId: z.string().uuid(),
  portfolioId: z.string().uuid(),
  /** False: the account's write switch is off, so the control shows itself switched off. */
  applyEnabled: z.boolean().nullable(),
});
export type HomeOpportunityCardAction = z.infer<typeof homeOpportunityCardActionSchema>;

export const homeOpportunityCardSchema = z.object({
  id: z.string().min(1),
  origin: homeOpportunityOriginSchema,
  /** The account detector, or the brief's module ('budget', 'pause', 'creative', 'audience'). */
  detector: z.string().min(1),
  adAccountId: z.string().min(1),
  portfolioIds: z.array(z.string()),
  /** What the finding is, in words ("Move budget between portfolios"). */
  label: z.string().min(1),
  /** The code-authored formula with its figures. */
  basis: z.string(),
  headline: homeOpportunityHeadlineSchema.nullable(),
  /** 0..1, the Optimizer's own reading of the sample; null when the source states none (a brief). */
  confidence: z.number().min(0).max(1).nullable(),
  /** What happens when it fires, if anyone was asked. */
  state: z.enum(['off', 'recommend', 'autopilot']).nullable(),
  cta: homeOpportunityCtaSchema,
  cardAction: homeOpportunityCardActionSchema.nullable(),
  impact: homeOpportunityImpactSchema,
  source: homeReadSourceSchema,
});
export type HomeOpportunityCard = z.infer<typeof homeOpportunityCardSchema>;

/** The goal the stack is priced in for the brand as a whole. */
export const homeOpportunityGoalSchema = z.object({
  metric: homeObjectiveMetricSchema,
  label: z.string().min(1),
  /** 'saved': the team's own primary objective. 'portfolio': what the Optimizer optimises for. */
  from: z.enum(['saved', 'portfolio']),
});
export type HomeOpportunityGoal = z.infer<typeof homeOpportunityGoalSchema>;

export const homeOpportunityAccountSchema = z.object({
  adAccountId: z.string().min(1),
  /** The account read the candidates came from; null when the account has none composed. */
  readId: z.string().nullable(),
  readyAt: z.string().nullable(),
  currency: z.string().nullable(),
});
export type HomeOpportunityAccount = z.infer<typeof homeOpportunityAccountSchema>;

export const homeOpportunitiesDataSchema = z.object({
  goal: homeOpportunityGoalSchema.nullable(),
  /** Sorted by `sortHomeOpportunities` and capped; `total` counts before the cap. */
  opportunities: z.array(homeOpportunityCardSchema),
  total: z.number().int().nonnegative(),
  accounts: z.array(homeOpportunityAccountSchema),
});
export type HomeOpportunitiesData = z.infer<typeof homeOpportunitiesDataSchema>;

export const homeOpportunitiesReadSchema = homeReadEnvelopeSchema(homeOpportunitiesDataSchema);
export type HomeOpportunitiesRead = z.infer<typeof homeOpportunitiesReadSchema>;

/**
 * The stack's order: opportunities priced in goal units first, largest first; then money per
 * day; then id, so two runs over the same data read the same. Returns a new array.
 */
export function sortHomeOpportunities(list: readonly HomeOpportunityCard[]): HomeOpportunityCard[] {
  const goalUnits = (o: HomeOpportunityCard) => o.impact.goalUnits ?? -1;
  return [...list].sort(
    (a, b) =>
      goalUnits(b) - goalUnits(a) ||
      b.impact.moneyPerDay - a.impact.moneyPerDay ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
