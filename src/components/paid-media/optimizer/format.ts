// Small formatting helpers shared across the optimizer surface. Budgets and CPA
// are whole-unit (no cents) per the spec. Currency is the AD ACCOUNT's real
// currency (AdAccount.currency from plugin_mcp.list_brand_ad_accounts — the same
// path the MCP account_map tool uses), passed in so a JPY account never reads as
// USD. The engine already reasons/scales in the account currency; the FE only
// displays — no math here.

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

/** Derive CPA from spend / conversions, guarding against divide-by-zero. */
export function deriveCpa(spend: number, conversions: number): number | null {
  if (conversions <= 0) return null;
  return spend / conversions;
}

/** Title-case a loose DB string like "app_install" → "App install". */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A portfolio's reallocation level → a short badge label. Loose DB string
 *  (default 'adset'); anything other than 'campaign' reads as ad sets. */
export function portfolioLevelLabel(level: string | null | undefined): string {
  return level === 'campaign' ? 'Campaigns' : 'Ad sets';
}
