'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type BrandStyle = {
  colors: string[];
  typography: { primary: string | null; secondary: string | null };
};

const EMPTY_STYLE: BrandStyle = { colors: [], typography: { primary: null, secondary: null } };

/**
 * The brand values burned into captions.
 *
 * The LIVE store is `brand_report_composites.brand_tokens` — the brand.md token primitive
 * the Settings editor writes and every AI Studio / HyperFrames / Organic generation already
 * reads. The `brand_profiles.{brand_colors, brand_typography}` columns are written exactly
 * once, by onboarding's brand-kit persist, and never updated; reading them alone pinned
 * captions to the frozen onboarding scrape, so a font changed in Settings never reached the
 * burned-in caption. Tokens win per field, with the onboarding columns still filling in for
 * brands that have no brand.md yet.
 */
export async function fetchBrandStyle(brandId: string): Promise<BrandStyle> {
  const supabase = await createSupabaseServerClient();
  const brandProfiles = supabase.schema('brand_profiles');

  const [composite, profile] = await Promise.all([
    brandProfiles
      .from('brand_report_composites')
      .select('brand_tokens')
      .eq('brand_profile_id', brandId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    brandProfiles
      .from('brand_profiles')
      .select('brand_colors, brand_typography')
      .eq('id', brandId)
      .maybeSingle(),
  ]);

  const live = readBrandTokens(composite.data?.brand_tokens);
  const onboarding = readProfileColumns(profile.data);

  return {
    colors: live.colors.length > 0 ? live.colors : onboarding.colors,
    typography: {
      primary: live.typography.primary ?? onboarding.typography.primary,
      secondary: live.typography.secondary ?? onboarding.typography.secondary,
    },
  };
}

/**
 * `brand_tokens` holds `BrandMdTokens` (packages/contracts/src/onboarding/brand-md.ts):
 * `colors: BrandColorToken[]` and `typography: BrandFontToken[]` with roles
 * 'display' | 'body'. Read defensively rather than through the schema — the column is
 * filled asynchronously and a partial snapshot (colors, no imagery) must still yield its
 * colors instead of failing whole-document validation.
 */
function readBrandTokens(raw: unknown): BrandStyle {
  if (!raw || typeof raw !== 'object') return EMPTY_STYLE;
  const tokens = raw as { colors?: unknown; typography?: unknown };

  const colorTokens = asRecords(tokens.colors).filter(
    (token): token is { value: string; role?: unknown } => typeof token.value === 'string',
  );
  // buildCaptionStyle highlights with the FIRST valid hex, so the primary role leads.
  const colors = [
    ...colorTokens.filter((token) => token.role === 'primary'),
    ...colorTokens.filter((token) => token.role !== 'primary'),
  ].map((token) => token.value);

  const fonts = asRecords(tokens.typography);
  // An unroled font is the brand's only font — treat it as the display face.
  const display = fonts.find((f) => f.role === 'display') ?? fonts.find((f) => f.role == null);

  return {
    colors,
    typography: {
      primary: familyOf(display),
      secondary: familyOf(fonts.find((f) => f.role === 'body')),
    },
  };
}

function readProfileColumns(
  data: { brand_colors: unknown; brand_typography: unknown } | null,
): BrandStyle {
  if (!data) return EMPTY_STYLE;

  const colors = Array.isArray(data.brand_colors)
    ? (data.brand_colors as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];

  const typo = (data.brand_typography ?? {}) as Record<string, unknown>;
  return {
    colors,
    typography: {
      primary: typeof typo.primary === 'string' ? typo.primary : null,
      secondary: typeof typo.secondary === 'string' ? typo.secondary : null,
    },
  };
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => {
    return !!entry && typeof entry === 'object' && !Array.isArray(entry);
  });
}

function familyOf(token: Record<string, unknown> | undefined): string | null {
  const family = token?.family;
  return typeof family === 'string' && family.trim() ? family : null;
}
