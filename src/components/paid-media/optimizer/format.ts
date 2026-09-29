// Small formatting helpers shared across the optimizer surface. Currency is the AD ACCOUNT's
// real currency (AdAccount.currency from plugin_mcp.list_brand_ad_accounts — the same path the
// MCP account_map tool uses), passed in so a JPY account never reads as USD. The engine already
// reasons/scales in the account currency; the FE only displays — no math here.
//
// AN UNKNOWN CURRENCY IS NOT DOLLARS. `account.currency` is null on real accounts, and every
// live one here is Mexican. A formatter that answers a missing code with "$" does not fail
// loudly — it silently relabels pesos as dollars on a card a client reads. So a code that is
// not a 3-letter ISO code prints the bare figure: `324`, not `$324`. This is the rule
// `money()` in `@continuum/contracts/optimization/account-card-html` already follows for the
// COMPILED card of the same finding ("Null prints bare figures"), the rule the portfolio
// briefs follow (the model may not emit a symbol at all), and the rule Jaina follows
// ("N (currency unknown)"). It is adopted here rather than reinvented, so the card and the
// screen behind it cannot disagree about what money a figure is in.
//
// THE DIGIT RULE IS ALSO THEIRS. `perPeriod` passes the day through unrounded and cent-rounds
// the month, so a screen that printed both at 0 decimals rendered "$26/day · $766/mo" — a
// reader who multiplies gets 780. `money()` uses 2 decimals under 100 and 0 at or above it,
// which is why the compiled card already read "$25.54/day · $766/mo". Same rule here. The
// grouping separator stays (a screen has room for "$2,000"; a 320px frame does not).

import { type CandidateHeadline, perPeriod } from '@continuum/contracts';

const ISO_CURRENCY = /^[A-Z]{3}$/;

export function formatCurrency(
  value: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const code = normalizeCurrency(currency);
  const digits = Math.abs(value) >= 100 ? 0 : 2;
  const body = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(value));
  // The sign stays outside the unit: "-$25.54" reads as a debit, "$-25.54" reads as a typo.
  const sign = value < 0 ? '-' : '';
  if (!code) return `${sign}${body}`;
  return code === 'USD' ? `${sign}$${body}` : `${sign}${body} ${code}`;
}

/** Cost per result, in the account's own currency. The digit rule owns the precision — a
 *  cost of 28.60 is not usefully reported as 29, and rounding before formatting would print
 *  "29.00" under the sub-100 rule. */
export function formatCpa(
  value: number | null | undefined,
  currency: string | null | undefined,
): string {
  return formatCurrency(value, currency);
}

/** The currency prefix for an input adornment (e.g. "$"). EMPTY when the account carries no
 *  code — a field labelled "Daily budget ($)" on a peso account is the same lie the figures
 *  used to tell. Non-USD gets the ISO code, the same spelling `formatCurrency` appends. */
export function currencySymbol(currency: string | null | undefined): string {
  const code = normalizeCurrency(currency);
  if (!code) return '';
  return code === 'USD' ? '$' : code;
}

/** A field label's parenthetical currency hint, or nothing at all when the code is unknown.
 *  One definition so three forms cannot each decide differently what "()" means. */
export function currencyFieldSuffix(currency: string | null | undefined): string {
  const symbol = currencySymbol(currency);
  return symbol ? ` (${symbol})` : '';
}

/** The account's ISO code, or null when the row does not carry a usable one. Null is the
 *  answer, never a fallback: see the note at the top of this file. */
function normalizeCurrency(currency: string | null | undefined): string | null {
  const trimmed = (currency ?? '').trim().toUpperCase();
  return ISO_CURRENCY.test(trimmed) ? trimmed : null;
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
  currency: string | null | undefined,
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
  currency: string | null | undefined,
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

// ── Figure provenance ──────────────────────────────────────────────────────
//
// Every costly bug in this module was a number: a `d7` window summing 8 days, a null currency
// printed as `$`, `$26/day` beside `$766/mo`. A screenshot cannot catch that class, and a unit
// test only grades the formatter with the figure the test chose. `paid:parity:e2e:bench`
// grades the SCREEN: it captures the payload the page fetched and checks, node by node, that
// what the page rendered equals what it was handed. For that the raw figure has to travel
// with its text — on the same element, from the same call site, so the two cannot be
// computed from different inputs. That is what these attributes carry; nothing reads them at
// runtime.

/** The window a figure was computed over, in the range vocabulary, or `none` for a point. */
export type FigureWindow = 'd1' | 'd3' | 'd7' | 'd14' | 'd30' | 'none';

/** How the raw figure is meant to read on screen — the rule the bench re-derives. */
export type FigureUnit =
  | 'currency'
  | 'per-period'
  | 'per-month'
  | 'percent'
  | 'percent-signed'
  | 'count'
  /** Prose that quotes figures: the node names the one it is about, the bench reads every
   *  money token in it against the payload's figures. */
  | 'sentence';

export type FigureProps = {
  'data-testid': 'figure';
  'data-figure': string;
  'data-figure-raw': string;
  'data-figure-currency': string;
  'data-figure-window': FigureWindow;
  'data-figure-unit': FigureUnit;
};

/**
 * The provenance attributes for one numeric node.
 *
 * `raw` is the figure BEFORE formatting, in the unit the text is about (money in account
 * currency, a percent already in display units, a count). `currency` is the code the site
 * formatted with, normalised the same way `formatCurrency` normalises it, so `none` on the
 * node means the text must carry no symbol.
 */
export function figureProps(
  key: string,
  raw: number | null | undefined,
  currency: string | null | undefined,
  window: FigureWindow = 'none',
  unit: FigureUnit = 'currency',
): FigureProps {
  return {
    'data-testid': 'figure',
    'data-figure': key,
    'data-figure-raw': raw == null || !Number.isFinite(raw) ? '' : String(raw),
    'data-figure-currency': normalizeCurrency(currency) ?? 'none',
    'data-figure-window': window,
    'data-figure-unit': unit,
  };
}
