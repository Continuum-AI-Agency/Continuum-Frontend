import {
  type EasyfitChipThreshold,
  type EasyfitChipThresholds,
  type EasyfitPilotConfig,
  easyfitChipThresholdsSchema,
} from '@continuum/contracts';

// Pure rules of the Easy Fit dashboard (docs/02 and docs/05 of the module package): when a
// month counts as closed, which cost earns a green or red chip, and the "¿Llegamos a las
// altas de Meta del mes?" simulator. No React here, so every rule is tested directly.

/** A month's reporting state. A month closes on the 15th of the following month (docs/02,
 *  "Cierre de mes"); between its last day and that 15th its sign-ups are still landing. */
export type MonthState = 'upcoming' | 'inProgress' | 'maturing' | 'closed';

export const MONTH_CLOSE_DAY = 15;

function parseMonth(month: string): { year: number; monthIndex: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 };
}

/** `asOfDate` is the dashboard's data date (YYYY-MM-DD, Mexico City). */
export function monthState(month: string, asOfDate: string): MonthState {
  const parsed = parseMonth(month);
  if (!parsed) return 'closed';
  const start = new Date(Date.UTC(parsed.year, parsed.monthIndex, 1));
  const nextStart = new Date(Date.UTC(parsed.year, parsed.monthIndex + 1, 1));
  const closes = new Date(Date.UTC(parsed.year, parsed.monthIndex + 1, MONTH_CLOSE_DAY));
  const today = new Date(`${asOfDate.slice(0, 10)}T00:00:00Z`);
  if (today < start) return 'upcoming';
  if (today < nextStart) return 'inProgress';
  if (today < closes) return 'maturing';
  return 'closed';
}

/** The YYYY-MM-DD calendar date of an instant in a given time zone. */
export function zonedDate(iso: string, timeZone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  // en-CA formats as YYYY-MM-DD.
  return date.toLocaleDateString('en-CA', { timeZone });
}

export type ChipTone = 'good' | 'warn' | 'bad' | 'neutral';

/** A cost against its chip thresholds: at or below `verde_max` is green, at or above
 *  `rojo_min` is red, between them carries no colour (docs/05). */
export function costTone(value: number, threshold: EasyfitChipThreshold): ChipTone {
  if (value <= threshold.verde_max) return 'good';
  if (value >= threshold.rojo_min) return 'bad';
  return 'neutral';
}

/** The chip thresholds the pilot config sets, or the contract's docs/05 defaults until the
 *  config has loaded. */
export function chipThresholds(config: EasyfitPilotConfig | null): EasyfitChipThresholds {
  return config?.piloto.umbrales_chip ?? easyfitChipThresholdsSchema.parse(undefined);
}

// ---------- simulator ----------

export type SimulatorRates = {
  /** Sign-ups per 100 ad contacts, by offer class (config/ofertas.json). */
  dayPass: number;
  annual: number;
  cheapFirstMonth: number;
};

export type SimulatorInput = {
  budgetTotal: number;
  googleSpend: number;
  costPerContact: number;
  /** % of contacts on the DayPass offer; the remainder after annual is the cheap offer. */
  pctDayPass: number;
  pctAnnual: number;
  metaSignupGoal: number;
};

export type SimulatorVerdict = 'reaches' | 'close' | 'short';

export type SimulatorResult = {
  metaSpend: number;
  contacts: number;
  metaSignups: number;
  costPerMetaSignup: number | null;
  verdict: SimulatorVerdict;
  /** Sign-ups still missing to the goal; 0 when it is reached. */
  shortfall: number;
  /** The cost per contact that would reach the goal with this mix. */
  costPerContactNeeded: number;
};

/** The two mix sliders share 100%: whichever moved last keeps its value and the other gives way. */
export function balanceMix(
  pctDayPass: number,
  pctAnnual: number,
  moved: 'dayPass' | 'annual',
): { pctDayPass: number; pctAnnual: number } {
  if (pctDayPass + pctAnnual <= 100) return { pctDayPass, pctAnnual };
  return moved === 'annual'
    ? { pctDayPass: 100 - pctAnnual, pctAnnual }
    : { pctDayPass, pctAnnual: 100 - pctDayPass };
}

/** Green at or above the goal, amber from 80%, red below (docs/05). */
export function simulate(input: SimulatorInput, rates: SimulatorRates): SimulatorResult {
  const googleSpend = Math.min(input.googleSpend, input.budgetTotal);
  const metaSpend = input.budgetTotal - googleSpend;
  const contacts = input.costPerContact > 0 ? metaSpend / input.costPerContact : 0;
  const pctCheap = Math.max(0, 100 - input.pctDayPass - input.pctAnnual);
  const ratePer100 =
    (input.pctDayPass * rates.dayPass +
      input.pctAnnual * rates.annual +
      pctCheap * rates.cheapFirstMonth) /
    100;
  const metaSignups = (contacts * ratePer100) / 100;
  const ratio = input.metaSignupGoal > 0 ? metaSignups / input.metaSignupGoal : 0;
  const verdict: SimulatorVerdict = ratio >= 1 ? 'reaches' : ratio >= 0.8 ? 'close' : 'short';
  return {
    metaSpend,
    contacts,
    metaSignups,
    costPerMetaSignup: metaSignups > 0 ? metaSpend / metaSignups : null,
    verdict,
    shortfall: Math.max(0, input.metaSignupGoal - metaSignups),
    costPerContactNeeded:
      input.metaSignupGoal > 0 ? (metaSpend * ratePer100) / 100 / input.metaSignupGoal : 0,
  };
}

/** Below this cost per contact the pilot has never bought a contact (docs/05 prototype copy). */
export const LOWEST_SEEN_COST_PER_CONTACT = 40;

/** Change of `current` over `previous`, in percent; null when there is no base. */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return (100 * (current - previous)) / previous;
}
