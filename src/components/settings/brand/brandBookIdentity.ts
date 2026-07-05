import type {
  BrandColorToken,
  BrandFontToken,
  BrandMdTokens,
  BrandReportResult,
} from '@continuum/contracts';

// Pure identity-token resolvers for the Brand Book view. The canonical source is
// brand_tokens (parsed from brand.md), but onboarding's Firecrawl scrape already
// captured a named palette + typography on the website summary. When the tokens
// haven't been promoted yet, fall back to that scraped data so the colors/type we
// grabbed at onboarding still surface. Kept React-free so it is unit-testable.

const PALETTE_ROLES = ['primary', 'secondary', 'accent', 'background', 'text'] as const;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function resolveColorTokens(
  tokens: BrandMdTokens | null,
  composite: BrandReportResult | null,
): BrandColorToken[] {
  if (tokens && tokens.colors.length > 0) return tokens.colors;
  const palette = composite?.structured.website.palette;
  if (!palette) return [];
  return PALETTE_ROLES.flatMap((role) => {
    const value = palette[role];
    return value ? [{ value, role, name: capitalize(role) }] : [];
  });
}

export function resolveFontTokens(
  tokens: BrandMdTokens | null,
  composite: BrandReportResult | null,
): BrandFontToken[] {
  if (tokens && tokens.typography.length > 0) return tokens.typography;
  const typography = composite?.structured.website.typography;
  const fonts: BrandFontToken[] = [];
  if (typography?.primary) fonts.push({ family: typography.primary, role: 'display' });
  if (typography?.secondary) fonts.push({ family: typography.secondary, role: 'body' });
  return fonts;
}
