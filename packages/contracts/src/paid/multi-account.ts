// Cross-account result shape for paid tools.
//
// A brand can link many Meta ad accounts (19 do today; the largest links 9), and a single
// tool call may be fanned across a selected subset. This module defines the ONE shape such a
// call returns, so a consumer never has to guess whether a number covers one account or
// several — and defines when those numbers may legally be added together.
//
// Deliberately agent-neutral: Jaina is the first caller, but Organic, Trends, Optimizer and
// Competitor Spy read the same accounts and must not each invent their own envelope.

import { z } from 'zod';

/** Canonical `act_<id>` form. Meta returns both prefixed and bare for the SAME account. */
export const normalizeAdAccountId = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
};

/**
 * An ad account as every surface should refer to it.
 *
 * `currency` is nullable and, at time of writing, null for every row in production — the
 * Meta ingest only persists {account_id, business, id, name}. That is exactly why the
 * rollup guard below treats unknown currency as un-summable rather than assuming a default.
 */
export const adAccountRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  currency: z.string().nullable(),
});
export type AdAccountRef = z.infer<typeof adAccountRefSchema>;

/** Why a per-account fetch failed. One account failing must never fail the whole call. */
export const adAccountFetchErrorSchema = z.enum([
  'token_unavailable',
  'permission_denied',
  'graph_error',
  'timeout',
]);
export type AdAccountFetchError = z.infer<typeof adAccountFetchErrorSchema>;

/**
 * One account's slice of a fanned call. `ok:false` entries are first-class results, not
 * exceptions — a report covering 4 of 5 accounts must be able to say so.
 *
 * `naming_schema_scope` is a standing honesty marker: ad_naming_schemas is unique per
 * (brand, platform) with no account column, so two accounts under one brand parse against
 * ONE taxonomy. Any consumer inferring per-account naming correctness would be wrong.
 */
export const accountSliceSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.discriminatedUnion('ok', [
    z.object({
      ok: z.literal(true),
      ad_account_id: z.string().min(1),
      account_name: z.string().nullable(),
      currency: z.string().nullable(),
      naming_schema_scope: z.literal('brand'),
      data: dataSchema,
    }),
    z.object({
      ok: z.literal(false),
      ad_account_id: z.string().min(1),
      account_name: z.string().nullable(),
      error: adAccountFetchErrorSchema,
      error_detail: z.string(),
    }),
  ]);

/** Why a set of accounts cannot be summed into one headline number. */
export const rollupBlockedReasonSchema = z.enum([
  // Two or more accounts report in different currencies. Adding them is arithmetic nonsense;
  // real case in production: one brand links "BCP - COP - PPAL" and "BCP - USD PPAL".
  'currency_mismatch',
  // At least one account's currency is unknown, so we cannot prove they match.
  'currency_unknown',
  // Fewer than two successful accounts — nothing to roll up.
  'insufficient_accounts',
]);
export type RollupBlockedReason = z.infer<typeof rollupBlockedReasonSchema>;

export const accountRollupSchema = z.object({
  summable: z.boolean(),
  reason: rollupBlockedReasonSchema.optional(),
  /** The shared currency when summable. Absent when not. */
  currency: z.string().nullable().optional(),
  account_count: z.number().int().nonnegative(),
});
export type AccountRollup = z.infer<typeof accountRollupSchema>;

export const multiAccountEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    by_account: z.array(accountSliceSchema(dataSchema)),
    rollup: accountRollupSchema,
    accounts_requested: z.array(z.string()),
    accounts_ok: z.array(z.string()),
    accounts_failed: z.array(
      z.object({ ad_account_id: z.string(), error: adAccountFetchErrorSchema }),
    ),
  });

/**
 * THE rollup rule. Every agent that produces a blended total must go through this.
 *
 * Refuses on unknown currency rather than assuming. That makes the guard vacuous until the
 * currency backfill lands — which is the correct failure direction: withholding a total is
 * recoverable, publishing a total that adds pesos to dollars is not.
 */
export const canSumAccounts = (
  accounts: ReadonlyArray<Pick<AdAccountRef, 'currency'>>,
): AccountRollup => {
  const account_count = accounts.length;
  if (account_count < 2) {
    return { summable: false, reason: 'insufficient_accounts', account_count };
  }
  if (accounts.some((account) => !account.currency)) {
    return { summable: false, reason: 'currency_unknown', account_count };
  }
  const currencies = new Set(accounts.map((account) => account.currency as string));
  if (currencies.size > 1) {
    return { summable: false, reason: 'currency_mismatch', account_count };
  }
  return { summable: true, currency: [...currencies][0], account_count };
};

/** Human-readable explanation for why a total was withheld. Rendered to the user verbatim. */
export const explainRollupBlocked = (reason: RollupBlockedReason): string => {
  switch (reason) {
    case 'currency_mismatch':
      return 'These accounts report in different currencies, so a combined total would not be meaningful. Figures are shown per account.';
    case 'currency_unknown':
      return 'The reporting currency is not known for every account, so a combined total could be misleading. Figures are shown per account.';
    case 'insufficient_accounts':
      return 'Only one account returned data, so there is nothing to combine.';
  }
};
