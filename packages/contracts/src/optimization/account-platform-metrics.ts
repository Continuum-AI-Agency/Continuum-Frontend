// The Optimizer Overview's MP1 frame across platforms, before entering a portfolio
// (decisiones.md 24; frontend.html §2 MP1 and §7 features 01–05). One producer —
// public.optimizer_get_account_platform_metrics — so the Overview tiles, the headline and
// Jaina read the same figures instead of each summing portfolios on their own.
//
// Two rules hold every field below:
//   * a figure nobody measured is null, never 0 — a disconnected platform, a connected account
//     with nothing ingested, a cost with no results;
//   * different currencies are never summed into one figure: spend is reported per currency,
//     a result kind is summed per (kind, currency), and a share of spend exists only when the
//     whole account spends in one currency.

import { z } from 'zod';
import { CurrencyCodeSchema, type PlatformId, PlatformIdSchema } from '../paid/platform';
import { MetricWindowSchema } from './portfolio-metrics';

/** Major units; null when nothing was measured. */
const nullableMoney = z.number().nonnegative().nullable();
/** A cost per result: positive, or null when there are no results. Never 0. */
const costPerResult = z.number().positive().nullable();

const costMatchesResults = (
  row: { results: number; spend: number; cost_per_result: number | null },
  ctx: z.RefinementCtx,
): void => {
  if ((row.results === 0 || row.spend === 0) !== (row.cost_per_result === null)) {
    ctx.addIssue({
      code: 'custom',
      message: 'cost_per_result is spend / results, and null exactly when either is 0',
      path: ['cost_per_result'],
    });
  }
};

/** One result kind (the portfolio KPI field: 'leads', 'conversations', …) on one platform. */
export const PlatformKindResultSchema = z
  .object({
    kind: z.string().min(1),
    results: z.number().nonnegative(),
    /** Spend of the entities whose result is this kind. */
    spend: z.number().nonnegative(),
    cost_per_result: costPerResult,
    /** Null when the prior window is unknown for this platform. */
    prior_results: z.number().nonnegative().nullable(),
    prior_cost_per_result: costPerResult,
  })
  .superRefine(costMatchesResults);
export type PlatformKindResult = z.infer<typeof PlatformKindResultSchema>;

export const PlatformAccountSchema = z.object({
  account_id: z.string().min(1),
  currency: CurrencyCodeSchema.nullable(),
  /** False when the account is connected but the Optimizer has read nothing from it yet. */
  ingested: z.boolean(),
});

export const PlatformTotalsSchema = z
  .object({
    platform: PlatformIdSchema,
    /** A disconnected platform stays in the frame (the "conectar" tab), with null figures. */
    connected: z.boolean(),
    /** 'portfolios': only what the brand's portfolios hold is measured (Meta today).
     *  'account': every campaign of the connected accounts (Google, TikTok). */
    coverage: z.enum(['portfolios', 'account']),
    /** The platform's one currency; null when its accounts disagree or none is known. */
    currency: CurrencyCodeSchema.nullable(),
    accounts: z.array(PlatformAccountSchema),
    spend: nullableMoney,
    /** spend / the account's spend; null unless the whole account spends in one currency. */
    share_of_spend: z.number().min(0).max(1).nullable(),
    prior_spend: nullableMoney,
    /** (spend − prior) / prior; null without a prior or with a prior of 0. */
    spend_delta_pct: z.number().nullable(),
    /** Spend of entities with no declared result kind: in spend, in no kind. */
    unclassified_spend: nullableMoney,
    results_by_kind: z.array(PlatformKindResultSchema),
  })
  .superRefine((row, ctx) => {
    if (!row.connected) {
      const empty =
        row.spend === null &&
        row.share_of_spend === null &&
        row.prior_spend === null &&
        row.spend_delta_pct === null &&
        row.unclassified_spend === null &&
        row.results_by_kind.length === 0 &&
        row.accounts.length === 0 &&
        row.currency === null;
      if (!empty) {
        ctx.addIssue({
          code: 'custom',
          message: 'a disconnected platform carries no accounts and no figures (null, never 0)',
        });
      }
      return;
    }
    if (row.spend === null && (row.results_by_kind.length > 0 || row.share_of_spend !== null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'no measured spend means no results and no share',
        path: ['spend'],
      });
    }
    if (row.prior_spend === null && row.spend_delta_pct !== null) {
      ctx.addIssue({ code: 'custom', message: 'a delta needs a prior', path: ['spend_delta_pct'] });
    }
    const kinds = row.results_by_kind.map((k) => k.kind);
    if (new Set(kinds).size !== kinds.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'a kind appears once per platform',
        path: ['results_by_kind'],
      });
    }
    if (row.spend !== null) {
      const classified = row.results_by_kind.reduce((acc, k) => acc + k.spend, 0);
      if (cents(classified + (row.unclassified_spend ?? 0)) !== cents(row.spend)) {
        ctx.addIssue({
          code: 'custom',
          message: 'kind spend + unclassified spend = platform spend',
          path: ['unclassified_spend'],
        });
      }
    }
  });
export type PlatformTotals = z.infer<typeof PlatformTotalsSchema>;

/** One result kind across platforms, in ONE currency. Conversations and leads are two kinds
 *  and never one sum; the same kind in two currencies is two rows. */
export const KindAcrossPlatformsSchema = z
  .object({
    kind: z.string().min(1),
    currency: CurrencyCodeSchema.nullable(),
    results: z.number().nonnegative(),
    spend: z.number().nonnegative(),
    cost_per_result: costPerResult,
    platforms: z
      .array(
        z
          .object({
            platform: PlatformIdSchema,
            results: z.number().nonnegative(),
            spend: z.number().nonnegative(),
            cost_per_result: costPerResult,
          })
          .superRefine(costMatchesResults),
      )
      .min(1),
  })
  .superRefine((row, ctx) => {
    costMatchesResults(row, ctx);
    const results = row.platforms.reduce((acc, p) => acc + p.results, 0);
    const spend = row.platforms.reduce((acc, p) => acc + p.spend, 0);
    if (Math.abs(results - row.results) > 1e-6 || cents(spend) !== cents(row.spend)) {
      ctx.addIssue({
        code: 'custom',
        message: 'a kind sums exactly the platforms it lists',
        path: ['platforms'],
      });
    }
    const platforms = row.platforms.map((p) => p.platform);
    if (new Set(platforms).size !== platforms.length) {
      ctx.addIssue({ code: 'custom', message: 'a platform appears once per kind' });
    }
  });
export type KindAcrossPlatforms = z.infer<typeof KindAcrossPlatformsSchema>;

export const CheapestFactSchema = z.object({
  kind: z.string().min(1),
  currency: CurrencyCodeSchema.nullable(),
  platform: PlatformIdSchema,
  cost_per_result: z.number().positive(),
  /** Every other platform buying the same kind in the same currency, at a real cost. */
  compared: z
    .array(z.object({ platform: PlatformIdSchema, cost_per_result: z.number().positive() }))
    .min(1),
});
export type CheapestFact = z.infer<typeof CheapestFactSchema>;

export const AccountPlatformMetricsSchema = z
  .object({
    brand_id: z.string().uuid(),
    window: MetricWindowSchema,
    /** Null when a same-length prior is unknown (Meta snapshots carry one for d7 alone). */
    prior_window: MetricWindowSchema.nullable(),
    /** The account's spend, one row per currency — never one figure across currencies. */
    spend_by_currency: z.array(
      z.object({ currency: CurrencyCodeSchema.nullable(), spend: z.number().nonnegative() }),
    ),
    /** meta, google_ads, tiktok_ads — each exactly once, connected or not. */
    totals_by_platform: z.array(PlatformTotalsSchema),
    results_by_kind: z.array(KindAcrossPlatformsSchema),
    /** Pending recommendations across the brand's active portfolios. */
    decisions_waiting: z.number().int().nonnegative(),
    autopilot: z.object({
      on: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
    headline_facts: z.object({
      /** Null unless the account spends in one currency. */
      top_spend: z
        .object({ platform: PlatformIdSchema, share_of_spend: z.number().min(0).max(1) })
        .nullable(),
      /** Per (kind, currency) bought by two or more platforms at a real cost. */
      cheapest: z.array(CheapestFactSchema),
    }),
    /** Meta portfolios summed into the frame, and those left out (a different window). */
    portfolios: z.object({
      counted: z.number().int().nonnegative(),
      excluded: z.array(
        z.object({
          portfolio_id: z.string().uuid(),
          reason: z.enum(['window', 'no_cycle']),
        }),
      ),
    }),
    read_at: z.string().datetime({ offset: true }),
  })
  .superRefine((m, ctx) => {
    const platforms = m.totals_by_platform.map((p) => p.platform);
    if (
      platforms.length !== PlatformIdSchema.options.length ||
      PlatformIdSchema.options.some((id) => !platforms.includes(id))
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'every platform appears exactly once — a disconnected one never disappears',
        path: ['totals_by_platform'],
      });
    }
    const keys = m.results_by_kind.map((k) => `${k.kind}|${k.currency}`);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'one row per (kind, currency)',
        path: ['results_by_kind'],
      });
    }
    const currencies = m.spend_by_currency.map((s) => s.currency);
    if (new Set(currencies).size !== currencies.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'one row per currency',
        path: ['spend_by_currency'],
      });
    }
    const oneCurrency = m.spend_by_currency.length === 1 && currencies[0] !== null;
    if (!oneCurrency) {
      if (m.totals_by_platform.some((p) => p.share_of_spend !== null)) {
        ctx.addIssue({
          code: 'custom',
          message: 'a share of spend needs the whole account in one currency',
          path: ['totals_by_platform'],
        });
      }
      if (m.headline_facts.top_spend !== null) {
        ctx.addIssue({
          code: 'custom',
          message: 'no top-spend headline across currencies',
          path: ['headline_facts', 'top_spend'],
        });
      }
    }
    const expected = JSON.stringify(cheapestPlatformByKind(m.results_by_kind));
    if (JSON.stringify(m.headline_facts.cheapest) !== expected) {
      ctx.addIssue({
        code: 'custom',
        message: 'cheapest facts are exactly cheapestPlatformByKind(results_by_kind)',
        path: ['headline_facts', 'cheapest'],
      });
    }
  });
export type AccountPlatformMetrics = z.infer<typeof AccountPlatformMetricsSchema>;

function cents(n: number): number {
  return Math.round(n * 100);
}

const PLATFORM_ORDER: Record<PlatformId, number> = { meta: 0, google_ads: 1, tiktok_ads: 2 };

/** "Which platform buys this result cheapest": per (kind, currency) with at least two platforms
 *  at a real cost. A null cost (no results) never wins and is never compared as 0. The SQL
 *  producer emits the same list; the schema refuses a frame where the two disagree. */
export function cheapestPlatformByKind(kinds: readonly KindAcrossPlatforms[]): CheapestFact[] {
  const facts: CheapestFact[] = [];
  for (const kind of kinds) {
    const priced = kind.platforms
      .flatMap((p) =>
        p.cost_per_result === null ? [] : [{ platform: p.platform, cost: p.cost_per_result }],
      )
      .sort((a, b) => a.cost - b.cost || PLATFORM_ORDER[a.platform] - PLATFORM_ORDER[b.platform]);
    const [best, ...rest] = priced;
    if (!best || rest.length === 0) continue;
    facts.push({
      kind: kind.kind,
      currency: kind.currency,
      platform: best.platform,
      cost_per_result: best.cost,
      compared: rest.map((p) => ({ platform: p.platform, cost_per_result: p.cost })),
    });
  }
  return facts;
}
