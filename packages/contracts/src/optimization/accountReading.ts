// How the Optimizer reads one ad account: how Continuum works it (the mode), the result that
// counts, which modules the board shows, in what order and size, and why each one is there.
// It is the Home's readBrand (home/brandReading.ts) applied to an ad account, and it is pure:
// every sentence it returns names a figure from its inputs, so each one can be checked.
//
// The output types (AdAccountReading and what it holds) are the seam every board module in the
// Frontend renders from. Change them additively only.

import { z } from 'zod';

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
};

export const AD_ACCOUNT_MODE_LABELS: Record<AdAccountMode, string> = {
  fix: 'Fix first',
  operate: 'Autopilot',
  approve: 'You approve',
  recommend: 'Continuum recommends',
  setup: 'Setting up',
};

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
  dailyBudget: z.number().nullable(),
  /** The portfolio's cost-per-result goal; null when it has none. */
  goal: z.number().nullable(),
});
export type AdAccountPortfolioSignal = z.infer<typeof adAccountPortfolioSignalSchema>;

export type AdAccountSignals = {
  platform: AdAccountPlatform;
  portfolios: AdAccountPortfolioSignal[];
  /** Changes on this brand go through an approval chain before they are applied. */
  approvalRequired: boolean;
  currency: string | null;
};

const WINDOW_DAYS = 30;

function modeOf(signals: AdAccountSignals): { mode: AdAccountMode; reason: string } {
  const { portfolios } = signals;
  if (portfolios.length === 0) {
    return {
      mode: 'setup',
      reason: 'La cuenta está conectada, pero todavía no tiene portafolio ni meta.',
    };
  }
  if (portfolios.every((portfolio) => !portfolio.canWrite)) {
    return {
      mode: 'recommend',
      reason: `Continuum no escribe en esta cuenta: los ${portfolios.length} portafolios los aplica el cliente.`,
    };
  }
  if (signals.approvalRequired) {
    return { mode: 'approve', reason: 'Cada cambio pasa por la cadena de aprobación de la marca.' };
  }
  const autopilot = portfolios.filter(
    (portfolio) => portfolio.applyMode === 'autopilot' && !portfolio.autopilotPaused,
  );
  if (autopilot.length > 0) {
    return {
      mode: 'operate',
      reason: `${autopilot.length} de ${portfolios.length} portafolios aplican solos dentro de sus topes.`,
    };
  }
  return {
    mode: 'approve',
    reason: 'Continuum puede escribir, pero cada cambio espera a una persona.',
  };
}

/** Reads one ad account. The spine is always on the board; the lens rules extend it. */
export function readAdAccount(signals: AdAccountSignals): AdAccountReading {
  const { mode, reason } = modeOf(signals);
  const pending = signals.portfolios.reduce(
    (sum, portfolio) => sum + portfolio.pendingRecommendations,
    0,
  );
  const goals = signals.portfolios.flatMap((portfolio) =>
    portfolio.goal == null ? [] : [portfolio.goal],
  );
  return {
    platform: signals.platform,
    mode,
    modeLabel: AD_ACCOUNT_MODE_LABELS[mode],
    modeReason: reason,
    result: {
      label: 'resultados',
      count: null,
      platformReported: null,
      costPerResult: null,
      goal: goals.length === 1 ? (goals[0] ?? null) : null,
      spend: null,
      currency: signals.currency,
      windowDays: WINDOW_DAYS,
    },
    board: [
      {
        module: 'result',
        size: 'l',
        score: 80,
        reason: 'El resultado que cuenta, contra su meta.',
      },
      {
        module: 'decisions',
        size: 'm',
        score: pending > 0 ? 70 : 30,
        reason:
          pending > 0
            ? `${pending} ${pending === 1 ? 'decisión espera' : 'decisiones esperan'}.`
            : 'Nada espera una decisión.',
      },
      {
        module: 'portfolios',
        size: 'w',
        score: 20,
        reason: `${signals.portfolios.length} ${signals.portfolios.length === 1 ? 'portafolio' : 'portafolios'} contra su meta.`,
      },
    ],
    hidden: [],
    asks: [],
  };
}
