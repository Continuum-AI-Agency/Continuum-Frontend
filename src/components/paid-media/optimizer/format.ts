// Small formatting helpers shared across the optimizer surface. Currency is USD
// with no cents (budgets/CPA are whole-dollar in the spec); adjust here if a
// per-portfolio currency is threaded through later.

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCpa(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return '—';
  return formatCurrency(Math.round(value));
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
