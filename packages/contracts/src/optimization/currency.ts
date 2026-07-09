// Meta ad-account currency scaling — the one source of truth for MAJOR -> MINOR units.
//
// This crosses three boundaries and MUST agree at every one of them:
//   - the Frontend, converting a user-typed "max autopilot spend/day" into the
//     `max_daily_apply_minor` guardrail column,
//   - the optimizer service, keying optimizer.apply_ledger + the immutable
//     optimizer.apply_audits row on minor units,
//   - the Meta Graph write itself (budget fields are minor units).
//
// Meta's offset is its OWN, not ISO 4217 — the Gulf dinars are 100 here, and only the set
// below has no sub-unit. A hardcoded *100 would record (and, for a write, send) a
// 100x-inflated JPY/KRW budget.
// Source: developers.facebook.com/docs/marketing-api/currencies

const META_ZERO_DECIMAL_CURRENCIES = new Set([
  'CLP',
  'COP',
  'CRC',
  'HUF',
  'IDR',
  'ISK',
  'JPY',
  'KRW',
  'PYG',
  'TWD',
  'VND',
]);

/** The multiplier from MAJOR currency units (what a human types, what the engine reasons
 *  in) to the MINOR units Meta's budget fields and our money ledger both key on. */
export function metaCurrencyOffset(currency: string | null | undefined): number {
  if (!currency) return 100;
  return META_ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 1 : 100;
}

/** MAJOR -> MINOR for an account's currency. Rounds once, at the boundary. */
export function toMinorUnits(major: number, currency: string | null | undefined): number {
  return Math.round(major * metaCurrencyOffset(currency));
}
