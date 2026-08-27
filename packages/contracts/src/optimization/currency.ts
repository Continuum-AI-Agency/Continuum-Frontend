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

/** MINOR units -> a rendered amount, or null when the currency code is absent or unusable.
 *
 *  The offset comes from {@link metaCurrencyOffset} — the same table the amount was
 *  RECORDED with. Re-deriving it from ICU instead reads the number back on a different
 *  scale than it was written on, and is wrong in both directions: HUF is zero-decimal at
 *  Meta and 2-decimal in ICU (100x low), and KWD/BHD/JOD/OMR/TND are 2-decimal at Meta and
 *  3-decimal in ICU (10x low).
 *
 *  Returns null rather than guessing when the code is absent, and every caller MUST render
 *  nothing in that case. Every live ad account records a null currency today, and a
 *  confidently wrong amount in a customer's Slack channel is worse than no amount. */
export function formatMinorAmount(
  minor: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (minor === null || minor === undefined || !Number.isFinite(minor) || !currency) return null;
  const offset = metaCurrencyOffset(currency);
  // The offset IS the decimal count: 1 -> no sub-unit, 100 -> two. Letting Intl choose
  // instead is the exact bug this function exists to avoid.
  const digits = offset === 1 ? 0 : 2;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(minor / offset);
  } catch {
    // An unrecognisable code is not a licence to guess.
    return null;
  }
}
