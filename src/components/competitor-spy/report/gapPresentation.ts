// Pure label + formatting maps for the Competitive Report surface. Kept free
// of React so the copy the tables and badges render is unit-testable.

import type {
  CompetitorAngleMapDimension,
  CompetitorScaleTier,
  CreativeWinRateFlag,
  GapCategory,
} from '@continuum/contracts';

export const GAP_CATEGORY_META: Record<GapCategory, { label: string; className: string }> = {
  they_scale_you_absent: {
    label: "They scale, you're absent",
    className: 'bg-destructive/10 text-destructive',
  },
  they_scale_you_losing: {
    label: "They scale, you're losing",
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  you_win_they_ignore: {
    label: 'You win, they ignore',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  shared_battleground: {
    label: 'Battleground',
    className: 'bg-muted text-muted-foreground',
  },
};

export const DIMENSION_LABEL: Record<CompetitorAngleMapDimension, string> = {
  hook_archetype: 'Hook',
  angle: 'Angle',
  theme: 'Theme',
  funnel_stage: 'Funnel',
  asset_type: 'Asset',
};

export const TIER_CLASS: Record<CompetitorScaleTier, string> = {
  scaling: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  testing: 'bg-muted text-muted-foreground',
  fading: 'bg-muted/50 text-muted-foreground/70',
};

export const FLAG_LABEL: Record<CreativeWinRateFlag, string> = {
  low_evidence: 'low evidence',
  spend_concentrated: 'spend concentrated',
  warm_audience_skew: 'warm-audience skew',
  confounded: 'confounded',
  thumbnail_derived: 'thumbnail-derived',
};

export const humanize = (value: string): string => value.replace(/_/g, ' ');

export const percent = (value: number | null | undefined): string =>
  value == null ? '—' : `${Math.round(value * 100)}%`;

export const money = (value: number | null | undefined): string =>
  value == null ? '—' : `$${value.toFixed(2)}`;

export const medianDays = (days: number): string => `median ${Math.round(days)}d`;

// "seen in {countries}" only matters when coverage extends beyond the default
// US Ad Library market — a US-only exemplar carries no extra signal.
export function nonUsCountriesLabel(fetchedCountries: string[]): string | null {
  const countries = fetchedCountries.filter(Boolean);
  if (countries.length === 0) return null;
  if (countries.every((country) => country.toUpperCase() === 'US')) return null;
  return `seen in ${countries.join(', ')}`;
}
