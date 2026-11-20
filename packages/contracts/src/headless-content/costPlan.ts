/**
 * The pre-plan a person approves before headless content spends: every model call the plan makes
 * (Omni seconds, opening and slide stills, a song bed), priced per unit, with the run's hard cap.
 * The Backend builds it from the request (`headless-content/costPlan.ts`); the MCP preview, the
 * Organic and the Jaina approval cards all render this one shape.
 *
 * Money is in provider USD, the unit every `max_usd` and `budgetCapUsd` is written in; `billed`
 * is what the brand is charged for it (× BILLING_MARKUP, the studio bucket's rule).
 */
import { z } from 'zod';
import { BILLING_MARKUP } from '../billing/usage';

/**
 * Unit prices of the models a headless plan calls, keyed by billing id. They mirror
 * `billing.model_pricing` (read 2026-11-17); `bun run headless:cost-plan:bench` fails when they
 * drift, so the card never quotes a price the meter does not charge.
 */
export const HEADLESS_MEDIA_PRICES = {
  'gemini-omni-flash': { unit: 'second', usd: 0.1 },
  'nano-banana-2@512px': { unit: 'image', usd: 0.045 },
  'nano-banana-2@4k': { unit: 'image', usd: 0.151 },
  'lyria-3.5': { unit: 'call', usd: 0.08 },
} as const satisfies Record<string, { unit: MediaCostUnit; usd: number }>;
export type HeadlessMediaModel = keyof typeof HEADLESS_MEDIA_PRICES;

export const mediaCostUnitSchema = z.enum(['second', 'image', 'call']);
export type MediaCostUnit = z.infer<typeof mediaCostUnitSchema>;

const usd = z.number().nonnegative();

export const mediaCostLineSchema = z.object({
  kind: z.enum(['video', 'image', 'audio']),
  /** What it is for, as a person reads it: "Omni clip · hook (4 s)". */
  what: z.string(),
  model: z.string(),
  quantity: z.number().nonnegative(),
  unit: mediaCostUnitSchema,
  unitUsd: usd,
  /** quantity × unitUsd: one pass, no retakes. */
  usd,
});
export type MediaCostLine = z.infer<typeof mediaCostLineSchema>;

export const mediaCostPlanSchema = z.object({
  lines: z.array(mediaCostLineSchema),
  /** Σ lines: one pass of every generation. */
  expectedUsd: usd,
  /** The most it may spend (its budget cap): retakes, gate re-tries and checks included. */
  capUsd: usd,
  billedExpectedUsd: usd,
  billedCapUsd: usd,
  videoSeconds: z.number().nonnegative(),
  images: z.number().int().nonnegative(),
  /** What the lines do not itemize (model reads for checks), or why there are none. */
  note: z.string().optional(),
});
export type MediaCostPlan = z.infer<typeof mediaCostPlanSchema>;

const cents = (value: number) => Math.round(value * 100) / 100;
/** Lines keep sub-cent precision so a plan's total is not off by a cent per line. */
const mills = (value: number) => Math.round(value * 10_000) / 10_000;
const billed = (value: number) => cents(value * BILLING_MARKUP);

/** One line at its model's list price. */
export function mediaCostLine(
  kind: MediaCostLine['kind'],
  what: string,
  model: HeadlessMediaModel,
  quantity: number,
): MediaCostLine {
  const price = HEADLESS_MEDIA_PRICES[model];
  return {
    kind,
    what,
    model,
    quantity,
    unit: price.unit,
    unitUsd: price.usd,
    usd: mills(quantity * price.usd),
  };
}

export function mediaCostPlan(
  lines: readonly MediaCostLine[],
  capUsd: number,
  note?: string,
): MediaCostPlan {
  const expectedUsd = cents(lines.reduce((sum, line) => sum + line.usd, 0));
  return {
    lines: [...lines],
    expectedUsd,
    capUsd: cents(capUsd),
    billedExpectedUsd: billed(expectedUsd),
    billedCapUsd: billed(capUsd),
    videoSeconds: lines
      .filter((line) => line.unit === 'second')
      .reduce((sum, line) => sum + line.quantity, 0),
    images: lines
      .filter((line) => line.unit === 'image')
      .reduce((sum, line) => sum + line.quantity, 0),
    ...(note ? { note } : {}),
  };
}

/** Several plans as one (a guided set, a batch): lines kept, caps summed. */
export function mergeMediaCostPlans(plans: readonly MediaCostPlan[], note?: string): MediaCostPlan {
  return mediaCostPlan(
    plans.flatMap((plan) => plan.lines),
    plans.reduce((sum, plan) => sum + plan.capUsd, 0),
    note,
  );
}

const dollars = (value: number) => `$${value.toFixed(2)}`;
/** A unit price keeps its third decimal ($0.045 an image), never rounded to a wrong cent. */
export const unitPriceText = (value: number) =>
  `$${value.toFixed(Math.round(value * 1000) % 10 ? 3 : 2)}`;
const UNIT_WORD: Record<MediaCostUnit, string> = { second: 's', image: 'image', call: 'call' };

/** The plan as text, for an agent to show a person before asking for their yes. */
export function mediaCostPlanText(plan: MediaCostPlan): string {
  const lines = plan.lines.map(
    (line) =>
      `- ${line.what}: ${line.quantity} ${UNIT_WORD[line.unit]}${line.quantity === 1 || line.unit === 'second' ? '' : 's'} × ${unitPriceText(line.unitUsd)} (${line.model}) = ${dollars(line.usd)}`,
  );
  return [
    ...lines,
    `Expected ${dollars(plan.expectedUsd)} (billed ${dollars(plan.billedExpectedUsd)}); at most ${dollars(plan.capUsd)} (billed ${dollars(plan.billedCapUsd)}).`,
    ...(plan.note ? [plan.note] : []),
  ].join('\n');
}
