// Small formatting helpers shared across the optimizer surface. Budgets and CPA
// are whole-unit (no cents) per the spec. Currency is the AD ACCOUNT's real
// currency (AdAccount.currency from plugin_mcp.list_brand_ad_accounts — the same
// path the MCP account_map tool uses), passed in so a JPY account never reads as
// USD. The engine already reasons/scales in the account currency; the FE only
// displays — no math here.

import { type CandidateHeadline, perPeriod } from '@continuum/contracts';

const FALLBACK_CURRENCY = 'USD';

export function formatCurrency(
  value: number | null | undefined,
  currency: string | null | undefined = FALLBACK_CURRENCY,
): string {
  if (value == null || Number.isNaN(value)) return '—';
  const code = normalizeCurrency(currency);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    // Guard against a malformed ISO code from an upstream account row.
    return `${Math.round(value).toLocaleString('en-US')} ${code}`;
  }
}

export function formatCpa(
  value: number | null | undefined,
  currency: string | null | undefined = FALLBACK_CURRENCY,
): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return '—';
  return formatCurrency(Math.round(value), currency);
}

/** The currency symbol/prefix for an account, for input adornments (e.g. "$"). */
export function currencySymbol(currency: string | null | undefined): string {
  const code = normalizeCurrency(currency);
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}

function normalizeCurrency(currency: string | null | undefined): string {
  const trimmed = (currency ?? '').trim().toUpperCase();
  return trimmed.length === 3 ? trimmed : FALLBACK_CURRENCY;
}

/** Derive an objective's cost efficiency from spend / result count. Awareness
 * uses a 1,000x multiplier so its result is CPM rather than cost per impression. */
export function deriveEfficiency(
  spend: number,
  conversions: number,
  denominatorMultiplier = 1,
): number | null {
  if (conversions <= 0) return null;
  return (spend / conversions) * denominatorMultiplier;
}

/** @deprecated Prefer deriveEfficiency. Kept for existing CPA-only transforms. */
export function deriveCpa(spend: number, conversions: number): number | null {
  return deriveEfficiency(spend, conversions);
}

/** Title-case a loose DB string like "app_install" → "App install". */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  // Apply-mode tiers get product labels (observe is the no-write bottom tier).
  if (value === 'observe') return 'Observe · no writes';
  if (value === 'recommend') return 'Recommend';
  if (value === 'autopilot') return 'Autopilot';
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A portfolio's reallocation level → a short badge label. Loose DB string
 *  (default 'adset'); anything other than 'campaign' reads as ad sets. */
export function portfolioLevelLabel(level: string | null | undefined): string {
  return level === 'campaign' ? 'Campaigns' : 'Ad sets';
}

/** When the next scheduled cycle lands, in words. "After the next optimization
 *  cycle" tells a user nothing they can plan around; the schedule is already on
 *  the portfolio row, so say it. Returns null when there is no schedule to state
 *  — the caller must not invent one. */
export function nextCycleLabel(
  iso: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;

  const minutes = Math.round((at.getTime() - now.getTime()) / 60_000);
  if (minutes <= 1) return 'shortly';
  if (minutes < 60) return `in ${minutes} minutes`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;

  const days = Math.round(hours / 24);
  return `in about ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** The soonest scheduled cycle across a set of portfolios, as an ISO string. */
export function soonestNextCycle(portfolios: { next_realloc_at: string | null }[]): string | null {
  const times = portfolios
    .map((portfolio) => portfolio.next_realloc_at)
    .filter((value): value is string => Boolean(value))
    .filter((value) => !Number.isNaN(new Date(value).getTime()))
    .sort();
  return times[0] ?? null;
}

// ── The impact vocabulary ─────────────────────────────────────────────────
//
// Every "/day" on the optimizer surface used to be its own template string, and every
// percentage its own `Math.round(x * 100)` at the call site. Two figures the product says
// constantly, formatted a dozen different ways, which is how one screen ends up saying
// "33%" and the next "33.0 %" about the same finding.

/**
 * A daily figure in the two periods a person actually thinks in.
 *
 * Money per day is the scale the ranking uses, but "$2/day" is a figure the reader has to
 * finish in their head before it means anything. The month is the same money, said at the
 * size a budget is set at. The multiplier is `perPeriod` in contracts — the compiled
 * HyperFrame card uses the same one, so a card and the screen behind it cannot disagree.
 */
export function formatPerPeriod(
  perDay: number | null | undefined,
  currency: string | null | undefined = FALLBACK_CURRENCY,
): string {
  if (perDay == null || Number.isNaN(perDay) || !Number.isFinite(perDay)) return '—';
  const { day, month } = perPeriod(perDay);
  return `${formatCurrency(day, currency)}/day · ${formatCurrency(month, currency)}/mo`;
}

/**
 * A percentage already in display units — 33 for 33%, never 0.33.
 *
 * Deliberately does NOT multiply: every figure that reaches a render surface as a percentage
 * is already `*_pct` by the time a detector has recorded it, and a formatter that multiplies
 * is a formatter that will one day be handed a figure that was multiplied already.
 */
export function formatPercent(
  value: number | null | undefined,
  options: { signed?: boolean; fractionDigits?: number } = {},
): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return '—';
  const body = value.toFixed(options.fractionDigits ?? 0);
  return options.signed && value > 0 ? `+${body}%` : `${body}%`;
}

/**
 * A candidate's headline as the figure and the words that follow it.
 *
 * `unit` decides the figure and nothing else. The words are the detector's own `label`,
 * which already carries its period and its direction ("a day undelivered", "under plan"), so
 * nothing is appended here — gluing "/day" onto a label that ends in one is how a screen
 * ships "12% cheaper /day".
 */
export function formatHeadline(
  headline: CandidateHeadline,
  currency: string | null | undefined = FALLBACK_CURRENCY,
): { figure: string; label: string } {
  switch (headline.unit) {
    case 'percent':
      return { figure: formatPercent(headline.value), label: headline.label };
    case 'currency_per_day':
      return { figure: formatCurrency(headline.value, currency), label: headline.label };
    case 'count':
      return { figure: headline.value.toLocaleString('en-US'), label: headline.label };
  }
}
