import {
  type BrandColorToken,
  type BrandFontToken,
  type BrandGuidelines,
  type BrandMdTokens,
  type BrandReportResult,
  brandGuidelinesSchema,
  parseBrandMd,
  readBrandMdBody,
} from '@continuum/contracts';

// Pure identity-token resolvers for the Brand Book view. The canonical source is
// brand_tokens (parsed from brand.md), but onboarding's Firecrawl scrape already
// captured a named palette + typography on the website summary. When the tokens
// haven't been promoted yet, fall back to that scraped data so the colors/type we
// grabbed at onboarding still surface. An edited doc's tokens are the user's word, so an
// edit that removed them shows none, as agents read it. Kept React-free so it is unit-testable.

const PALETTE_ROLES = ['primary', 'secondary', 'accent', 'background', 'text'] as const;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function resolveColorTokens(
  tokens: BrandMdTokens | null,
  composite: BrandReportResult | null,
  edited = false,
): BrandColorToken[] {
  if (tokens && (edited || tokens.colors.length > 0)) return tokens.colors;
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
  edited = false,
): BrandFontToken[] {
  if (tokens && (edited || tokens.typography.length > 0)) return tokens.typography;
  const typography = composite?.structured.website.typography;
  const fonts: BrandFontToken[] = [];
  if (typography?.primary) fonts.push({ family: typography.primary, role: 'display' });
  if (typography?.secondary) fonts.push({ family: typography.secondary, role: 'body' });
  return fonts;
}

// What a user's brand.md edit says about strategy, voice and audience, so the Strategy cards
// show what agents read: positioning, pillars and the Voice section's Do / Don't / Avoid themes
// lines from the body, tone and audience from the front matter. A key is present only when the
// edit has that fact; an emptied section clears it. Same facts the Backend's getBrandDna overlays.
export type EditedStrategy = {
  positioning?: string | null;
  pillars?: string[];
  tone?: string;
  audience?: string;
  dos?: string[];
  donts?: string[];
  avoidThemes?: string[];
};

export function resolveEditedStrategy(brandMd: string | null, isEdited: boolean): EditedStrategy {
  if (!isEdited || !brandMd) return {};
  const { tokens, body } = parseBrandMd(brandMd);
  const facts = readBrandMdBody(body);
  const positioning = facts?.sections.positioning;
  const pillars = facts?.sections.brand_pillars;
  return {
    ...(positioning ? { positioning: positioning.join(' ') || null } : {}),
    ...(pillars ? { pillars: pillars.map((line) => line.replace(/^-\s*/, '')) } : {}),
    ...(tokens?.voice?.tone ? { tone: tokens.voice.tone } : {}),
    ...(tokens?.audience?.primary_summary ? { audience: tokens.audience.primary_summary } : {}),
    ...(facts?.dos ? { dos: facts.dos } : {}),
    ...(facts?.donts ? { donts: facts.donts } : {}),
    ...(facts?.avoid_themes ? { avoidThemes: facts.avoid_themes } : {}),
  };
}

// The report's guidelines with the edited Do / Don't / Avoid themes lists in place. An edit
// that adds rules to a report without guidelines still gets a card.
export function withEditedGuidelines(
  guidelines: BrandGuidelines | null | undefined,
  edited: EditedStrategy,
): BrandGuidelines | null {
  const { dos, donts, avoidThemes } = edited;
  if (!dos && !donts && !avoidThemes) return guidelines ?? null;
  const base =
    guidelines ?? brandGuidelinesSchema.parse({ voice_rules: {}, messaging_guardrails: {} });
  return {
    ...base,
    voice_rules: {
      dos: dos ?? base.voice_rules.dos,
      donts: donts ?? base.voice_rules.donts,
    },
    messaging_guardrails: {
      ...base.messaging_guardrails,
      avoid_themes: avoidThemes ?? base.messaging_guardrails.avoid_themes,
    },
  };
}
