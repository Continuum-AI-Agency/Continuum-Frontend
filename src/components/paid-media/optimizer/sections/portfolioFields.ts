// The portfolio config form's units and its validator — both derived, neither hand-rolled.
//
// Four of these columns are STORED in a unit no operator ever types: max_daily_apply_minor
// is Meta MINOR units, max_change_pct_per_cycle and velocity_cap_pct are fractions, and
// cpa_target is priced per RESULT (awareness prices per 1,000 impressions, not per one).
// When those conversions are smeared across a save handler, a field shows one number and
// writes another — which is exactly how a money guardrail lies. So each field owns BOTH
// directions here, in one descriptor, and every conversion in the panel goes through it.
//
// The validator is derived from UpdatePortfolioPatchSchema (the service's own whitelist)
// rather than written beside it: each form field pipes its parsed value into the SAME
// per-column schema the service will apply. The only rule added on top is "is this text a
// number", which a text input unavoidably needs.

import {
  metaCurrencyOffset,
  toMinorUnits,
  type UpdatePortfolioPatch,
  UpdatePortfolioPatchSchema,
} from '@continuum/contracts';
import { z } from 'zod';

const PATCH_SHAPE = UpdatePortfolioPatchSchema.shape;

/** The columns the patch can explicitly NULL out. Derived from the contracts schema, so a
 *  column that gains (or loses) `.nullable()` moves this set with it. A blank input on a
 *  column that is NOT here has nothing to send — the contract cannot express the clear. */
const CLEARABLE = new Set(
  Object.entries(PATCH_SHAPE)
    .filter(([, schema]) => schema.safeParse(null).success)
    .map(([key]) => key),
);

/** What a stored value must be scaled by to become the number an operator types. */
export type UnitContext = {
  /** The ad account's currency — decides the Meta MAJOR→MINOR offset. */
  currency: string | null | undefined;
  /** getOptimizationMetricDefinition(objective).denominatorMultiplier. */
  denominatorMultiplier: number;
};

type Unit = {
  /** stored (contract) value → the string the input shows. */
  toInput(stored: number | null | undefined, unit: UnitContext): string;
  /** the number the operator typed → the stored (contract) value. */
  toStored(typed: number, unit: UnitContext): number;
};

/** Float noise: 0.2 * 100 is 20.000000000000004, and an input showing that is a defect. */
const trim = (value: number): number => Number(value.toPrecision(12));

const scaledBy = (factor: (unit: UnitContext) => number): Unit => ({
  toInput: (stored, unit) => (stored == null ? '' : String(trim(stored * factor(unit)))),
  toStored: (typed, unit) => trim(typed / factor(unit)),
});

/** MAJOR ⇄ MINOR through the ONE Meta offset (contracts/currency.ts — JPY/KRW are 1, not
 *  100). Rounds on the way in because the column counts whole minor units. */
const CURRENCY_MINOR: Unit = {
  toInput: (stored, unit) =>
    stored == null ? '' : String(trim(stored / metaCurrencyOffset(unit.currency))),
  toStored: (typed, unit) => toMinorUnits(typed, unit.currency),
};

/** One descriptor per numeric column of the config form. */
const NUMERIC_UNITS = {
  daily_total: scaledBy(() => 1),
  period_budget: scaledBy(() => 1),
  cpa_target: scaledBy((unit) => unit.denominatorMultiplier),
  velocity_cap_pct: scaledBy(() => 100),
  max_daily_apply_minor: CURRENCY_MINOR,
  max_change_pct_per_cycle: scaledBy(() => 100),
} as const satisfies Record<string, Unit>;

export type NumericFieldKey = keyof typeof NUMERIC_UNITS;

/** Each numeric column's contracts schema, with `.optional()` peeled off (the form always
 *  sends the key) and `null` allowed (a blank input). Written out per key rather than
 *  indexed generically so TypeScript checks each one against the shared field type. */
const NUMERIC_COLUMNS: Record<NumericFieldKey, z.ZodType<number | null, number | null>> = {
  daily_total: PATCH_SHAPE.daily_total.unwrap().nullable(),
  period_budget: PATCH_SHAPE.period_budget.unwrap().nullable(),
  cpa_target: PATCH_SHAPE.cpa_target.unwrap().nullable(),
  velocity_cap_pct: PATCH_SHAPE.velocity_cap_pct.unwrap().nullable(),
  max_daily_apply_minor: PATCH_SHAPE.max_daily_apply_minor.unwrap().nullable(),
  max_change_pct_per_cycle: PATCH_SHAPE.max_change_pct_per_cycle.unwrap().nullable(),
};

/** stored → the string the input shows. The ONLY place a current value becomes a field. */
export function toInput(
  key: NumericFieldKey,
  stored: number | null | undefined,
  unit: UnitContext,
): string {
  return NUMERIC_UNITS[key].toInput(stored, unit);
}

/** what the operator typed → the contract unit. null when blank or not a number, so a
 *  live read (the autopilot guardrail gate, the preview's pool) sees the same value the
 *  resolver will produce on submit. */
export function toStored(
  key: NumericFieldKey,
  raw: string,
  unit: UnitContext,
): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return NUMERIC_UNITS[key].toStored(parsed, unit);
}

/** One numeric text field: parse → convert → the contracts column schema. `clearable`
 *  is false when the column cannot store null AND the portfolio has a value today —
 *  blanking it would silently keep the old number, so it is refused where it happens.
 *
 *  `getUnit` is read at PARSE time, not at build time: cpa_target is priced in the unit of
 *  the objective currently selected IN THIS FORM, and a schema that had to be rebuilt on
 *  every objective change would need the form that the schema itself constructs. */
function numericField(
  key: NumericFieldKey,
  getUnit: () => UnitContext,
  current: number | null | undefined,
) {
  const clearable = CLEARABLE.has(key) || current == null;
  return z
    .string()
    .transform((raw, ctx) => {
      const trimmed = raw.trim();
      if (trimmed === '') {
        if (clearable) return null;
        ctx.addIssue({ code: 'custom', message: 'Enter a number — this cannot be cleared.' });
        return z.NEVER;
      }
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a number.' });
        return z.NEVER;
      }
      return NUMERIC_UNITS[key].toStored(parsed, getUnit());
    })
    .pipe(NUMERIC_COLUMNS[key]);
}

/** The stored values the form initializes from. `daily_total` and the two autopilot caps
 *  ride on the list row; `cpa_target` and `velocity_cap_pct` only exist on the portfolio
 *  row inside the performance report, which is why the panel reads it. */
export type PortfolioCurrentValues = Record<NumericFieldKey, number | null | undefined> & {
  name: string;
  objective: string;
  mode: string;
  apply_mode: string;
  budget_source: string | null | undefined;
  lookback_window: string | null | undefined;
  creative_analysis: string | null | undefined;
  period_start: string | null | undefined;
  period_end: string | null | undefined;
};

/** The form's resolver: every field piped into the SAME contracts column schema the service
 *  applies. `getUnit` supplies the live conversion context at parse time. */
export function createPortfolioFormSchema(
  getUnit: () => UnitContext,
  current: PortfolioCurrentValues,
) {
  return z
    .object({
      name: PATCH_SHAPE.name.unwrap(),
      objective: PATCH_SHAPE.objective.unwrap(),
      mode: PATCH_SHAPE.mode.unwrap(),
      apply_mode: PATCH_SHAPE.apply_mode.unwrap(),
      budget_source: PATCH_SHAPE.budget_source.unwrap(),
      lookback_window: PATCH_SHAPE.lookback_window.unwrap(),
      creative_analysis: PATCH_SHAPE.creative_analysis.unwrap(),
      period_start: PATCH_SHAPE.period_start.unwrap(),
      period_end: PATCH_SHAPE.period_end.unwrap(),
      daily_total: numericField('daily_total', getUnit, current.daily_total),
      period_budget: numericField('period_budget', getUnit, current.period_budget),
      cpa_target: numericField('cpa_target', getUnit, current.cpa_target),
      velocity_cap_pct: numericField('velocity_cap_pct', getUnit, current.velocity_cap_pct),
      max_daily_apply_minor: numericField(
        'max_daily_apply_minor',
        getUnit,
        current.max_daily_apply_minor,
      ),
      max_change_pct_per_cycle: numericField(
        'max_change_pct_per_cycle',
        getUnit,
        current.max_change_pct_per_cycle,
      ),
    })
    // The client mirror of optimizer_portfolios_autopilot_guardrails_chk. The DB refuses to
    // STORE autopilot without both caps positive, so a form that let you submit it would
    // only reach a failing save.
    .superRefine((values, ctx) => {
      if (values.apply_mode !== 'autopilot') return;
      if (!values.max_daily_apply_minor || values.max_daily_apply_minor <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['max_daily_apply_minor'],
          message: 'Autopilot needs a spend ceiling above 0.',
        });
      }
      if (!values.max_change_pct_per_cycle || values.max_change_pct_per_cycle <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['max_change_pct_per_cycle'],
          message: 'Autopilot needs a change cap above 0.',
        });
      }
    });
}

export type PortfolioFormSchema = ReturnType<typeof createPortfolioFormSchema>;
/** What the inputs hold — numbers as the strings a text input actually carries. */
export type PortfolioFormValues = z.input<PortfolioFormSchema>;
/** What submit receives — every field already in its contract unit. */
export type PortfolioFormPatch = z.output<PortfolioFormSchema>;

/** Every field seeded from the portfolio's CURRENT value. There is no blank-means-keep
 *  sentinel: what the operator sees is what the portfolio is running. */
export function toFormValues(
  current: PortfolioCurrentValues,
  unit: UnitContext,
): PortfolioFormValues {
  return {
    name: current.name,
    objective: current.objective,
    mode: current.mode,
    apply_mode: current.apply_mode,
    budget_source: current.budget_source ?? 'observed',
    lookback_window: current.lookback_window ?? 'd14',
    // Fails closed to match the service: an unknown/absent value is OFF, never on.
    creative_analysis: current.creative_analysis ?? 'off',
    period_start: current.period_start ?? null,
    period_end: current.period_end ?? null,
    daily_total: toInput('daily_total', current.daily_total, unit),
    period_budget: toInput('period_budget', current.period_budget, unit),
    cpa_target: toInput('cpa_target', current.cpa_target, unit),
    velocity_cap_pct: toInput('velocity_cap_pct', current.velocity_cap_pct, unit),
    max_daily_apply_minor: toInput('max_daily_apply_minor', current.max_daily_apply_minor, unit),
    max_change_pct_per_cycle: toInput(
      'max_change_pct_per_cycle',
      current.max_change_pct_per_cycle,
      unit,
    ),
  } as PortfolioFormValues;
}

/** The patch is the DIRTY fields, in contract units. React Hook Form tracks dirtiness
 *  against the seeded current values, so "what changed" needs no hand-written diff. */
export function buildPatch(
  values: PortfolioFormPatch,
  dirtyFields: Partial<Record<string, unknown>>,
): UpdatePortfolioPatch {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!dirtyFields[key]) continue;
    // Blanked a column the contract cannot null out: there is nothing to send. The
    // resolver already refused this when the portfolio HAD a value, so this only skips
    // a field that was empty to begin with.
    if (value === null && !CLEARABLE.has(key)) continue;
    patch[key] = value;
  }
  return patch as UpdatePortfolioPatch;
}
