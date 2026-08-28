import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { z } from 'zod';

import { hexColorSchema } from './_shared';
import { type BrandDna, renderBrandBibleMarkdown, toBrandDna } from './brand-dna';
import type { BrandReportResult } from './brand-report';
import { emojiUsageSchema } from './brand-voice';
import type { BrandPalette, BrandTypography } from './website-summary';

// The brand.md token primitive — the machine-readable head of brand.md (YAML
// front matter). It is a SUPERSET brand primitive: visual tokens (colors,
// typography, logo, imagery) ground media generation; voice/personality/audience
// ground copy. Every creative consumer reads THIS instead of re-deriving brand
// identity from scattered columns. The markdown body below the front matter is the
// existing tiered Brand Book (renderBrandBibleMarkdown). The tokens are the
// normative values; the prose body provides human-readable context.

const canonicalHex = (value: unknown): unknown =>
  typeof value === 'string' ? `#${value.trim().replace(/^#+/, '').toLowerCase()}` : value;

export const brandColorRoleEnum = z.enum(['primary', 'secondary', 'accent', 'background', 'text']);
export type BrandColorRole = z.infer<typeof brandColorRoleEnum>;

// VISUAL token. `value` is canonicalized to lowercase `#rrggbb` so a mis-cased
// scraped hex and a hand-typed one compare equal downstream.
export const brandColorTokenSchema = z.object({
  value: z.preprocess(canonicalHex, hexColorSchema),
  role: brandColorRoleEnum.optional(),
  name: z.string().min(1).max(120).optional(),
});
export type BrandColorToken = z.infer<typeof brandColorTokenSchema>;

export const brandFontRoleEnum = z.enum(['display', 'body']);

// VISUAL token — fonts for text rendered ON creatives (not website chrome).
export const brandFontTokenSchema = z.object({
  family: z.string().min(1).max(240),
  role: brandFontRoleEnum.optional(),
  note: z.string().min(1).max(240).optional(),
});
export type BrandFontToken = z.infer<typeof brandFontTokenSchema>;

export const brandLogoTreatmentEnum = z.enum(['palette-only', 'logo']);

// VISUAL token. `treatment_default` mirrors decideBrandTreatment's "align with
// brand vision, not always slap the logo" default.
export const brandLogoTokenSchema = z.object({
  storage_path: z.string().min(1).nullable().default(null),
  treatment_default: brandLogoTreatmentEnum.default('palette-only'),
});
export type BrandLogoToken = z.infer<typeof brandLogoTokenSchema>;

// COPY + media tone token.
export const brandVoiceTokenSchema = z.object({
  tone: z.string().min(1).max(420).optional(),
  style: z.string().min(1).max(900).optional(),
  emoji_usage: emojiUsageSchema.optional(),
  power_verbs: z.array(z.string().min(1).max(60)).max(22).default([]),
  banned_words: z.array(z.string().min(1).max(90)).max(30).default([]),
});
export type BrandVoiceToken = z.infer<typeof brandVoiceTokenSchema>;

export const brandPersonalityTokenSchema = z.object({
  archetype: z.string().min(1).max(120).optional(),
  traits: z.array(z.string().min(1).max(60)).max(12).default([]),
  descriptors: z.array(z.string().min(1).max(90)).max(12).default([]),
});
export type BrandPersonalityToken = z.infer<typeof brandPersonalityTokenSchema>;

// VISUAL token — creative-direction anchors. LLM-authored, filled asynchronously
// (left null by the deterministic extraction; populated by the deep prose pass).
export const brandImageryTokenSchema = z.object({
  creative_direction: z.array(z.string().min(1).max(300)).max(12).default([]),
  mood: z.array(z.string().min(1).max(90)).max(12).default([]),
  avoid: z.array(z.string().min(1).max(300)).max(12).default([]),
});
export type BrandImageryToken = z.infer<typeof brandImageryTokenSchema>;

export const brandAudienceTokenSchema = z.object({
  primary_summary: z.string().min(1).max(900).optional(),
  anchors: z.array(z.string().min(1).max(180)).max(12).default([]),
});
export type BrandAudienceToken = z.infer<typeof brandAudienceTokenSchema>;

// Strips unknown keys (does not reject), matching the DESIGN.md spec's
// "accept unknown content, don't error" stance — a user-added custom key is
// dropped rather than failing the whole document.
export const brandMdTokensSchema = z.object({
  schema_version: z.literal(1).default(1),
  brand_name: z.string().min(1).max(240),
  colors: z.array(brandColorTokenSchema).max(24).default([]),
  typography: z.array(brandFontTokenSchema).max(12).default([]),
  logo: brandLogoTokenSchema.nullable().default(null),
  voice: brandVoiceTokenSchema.nullable().default(null),
  personality: brandPersonalityTokenSchema.nullable().default(null),
  imagery: brandImageryTokenSchema.nullable().default(null),
  audience: brandAudienceTokenSchema.nullable().default(null),
});
export type BrandMdTokens = z.infer<typeof brandMdTokensSchema>;

export interface ParsedBrandMd {
  // Null when there is no front matter or it fails to parse/validate — callers
  // then treat the whole document as prose body (never an exception).
  tokens: BrandMdTokens | null;
  body: string;
  raw: string;
}

// Matches a leading `---\n … \n---\n` fence at the very top of the document.
const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

export function parseBrandMd(input: string): ParsedBrandMd {
  const match = FRONT_MATTER_RE.exec(input);
  if (!match) return { tokens: null, body: input, raw: input };
  try {
    const parsed = brandMdTokensSchema.safeParse(parseYaml(match[1]));
    if (!parsed.success) return { tokens: null, body: input, raw: input };
    return { tokens: parsed.data, body: input.slice(match[0].length), raw: input };
  } catch {
    return { tokens: null, body: input, raw: input };
  }
}

// Shared FE↔BE edit boundary. Prose-only documents remain valid, but once a
// front-matter fence is present it must preserve a usable structured token set.
// This prevents an invalid manual edit from silently nulling the Brand Book
// fields that generation and settings cards consume.
export const brandMdSaveRequestSchema = z
  .object({
    brand_md: z.string().min(1).max(200_000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.brand_md.trimStart().startsWith('---') && !parseBrandMd(value.brand_md).tokens) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['brand_md'],
        message: 'brand.md front matter is invalid',
      });
    }
  });
export type BrandMdSaveRequest = z.infer<typeof brandMdSaveRequestSchema>;

function omitEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

// Build the plain object emitted as YAML — populated fields only, in a fixed key
// order so serialization is deterministic (idempotent round-trips).
function tokensToPlain(tokens: BrandMdTokens): Record<string, unknown> {
  const out: Record<string, unknown> = {
    schema_version: tokens.schema_version,
    brand_name: tokens.brand_name,
  };
  if (tokens.colors.length > 0)
    out.colors = tokens.colors.map((c) =>
      omitEmpty({ value: c.value, role: c.role, name: c.name }),
    );
  if (tokens.typography.length > 0)
    out.typography = tokens.typography.map((f) =>
      omitEmpty({ family: f.family, role: f.role, note: f.note }),
    );
  if (tokens.logo) {
    const logo = omitEmpty({
      storage_path: tokens.logo.storage_path,
      treatment_default: tokens.logo.treatment_default,
    });
    if (Object.keys(logo).length > 0) out.logo = logo;
  }
  if (tokens.voice) {
    const voice = omitEmpty({
      tone: tokens.voice.tone,
      style: tokens.voice.style,
      emoji_usage: tokens.voice.emoji_usage,
      power_verbs: tokens.voice.power_verbs,
      banned_words: tokens.voice.banned_words,
    });
    if (Object.keys(voice).length > 0) out.voice = voice;
  }
  if (tokens.personality) {
    const personality = omitEmpty({
      archetype: tokens.personality.archetype,
      traits: tokens.personality.traits,
      descriptors: tokens.personality.descriptors,
    });
    if (Object.keys(personality).length > 0) out.personality = personality;
  }
  if (tokens.imagery) {
    const imagery = omitEmpty({
      creative_direction: tokens.imagery.creative_direction,
      mood: tokens.imagery.mood,
      avoid: tokens.imagery.avoid,
    });
    if (Object.keys(imagery).length > 0) out.imagery = imagery;
  }
  if (tokens.audience) {
    const audience = omitEmpty({
      primary_summary: tokens.audience.primary_summary,
      anchors: tokens.audience.anchors,
    });
    if (Object.keys(audience).length > 0) out.audience = audience;
  }
  return out;
}

export function serializeBrandMd(args: { tokens: BrandMdTokens; body: string }): string {
  const frontMatter = stringifyYaml(tokensToPlain(args.tokens), { lineWidth: 0 });
  return `---\n${frontMatter}---\n${args.body}`;
}

// brand.md = token front matter + the existing tiered Brand Book body. The body
// defaults to renderBrandBibleMarkdown(result); callers pass bodyOverride to
// preserve a user-edited body across regeneration.
export function assembleBrandMd(args: {
  tokens: BrandMdTokens;
  result: BrandReportResult;
  bodyOverride?: string;
}): string {
  return serializeBrandMd({
    tokens: args.tokens,
    body: args.bodyOverride ?? renderBrandBibleMarkdown(args.result),
  });
}

const COLOR_ROLES = brandColorRoleEnum.options;

/**
 * The brand's colours as role-tagged tokens, from a palette or a bare kit list.
 *
 * Exported because the burn-in's ink chain (design-system/typeResolution.ts) reads the
 * SAME shapes from the kit and the scrape. A second copy of this mapping is how "the kit
 * says navy" and "the piece is navy" stop meaning the same thing.
 */
export function extractBrandColorTokens(
  palette: BrandPalette | null | undefined,
  kitColors: readonly string[],
): Array<{ value: string; role: BrandColorRole }> {
  const fromPalette = COLOR_ROLES.flatMap((role) => {
    const value = palette?.[role];
    return typeof value === 'string' && value.trim().length > 0 ? [{ value, role }] : [];
  });
  if (fromPalette.length > 0) return fromPalette;
  return kitColors
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .slice(0, COLOR_ROLES.length)
    .map((value, index) => ({ value, role: COLOR_ROLES[index] }));
}

/** `primary -> display`, `secondary -> body`. The one place that mapping is written. */
export function extractBrandFontTokens(
  typography: BrandTypography | null | undefined,
): Array<{ family: string; role: 'display' | 'body' }> {
  const out: Array<{ family: string; role: 'display' | 'body' }> = [];
  if (typography?.primary) out.push({ family: typography.primary, role: 'display' });
  if (typography?.secondary) out.push({ family: typography.secondary, role: 'body' });
  return out;
}

function extractVoice(dna: BrandDna): z.input<typeof brandVoiceTokenSchema> | null {
  const tone = dna.voice?.tone ?? undefined;
  const style = dna.voice?.voice_style ?? undefined;
  const emoji_usage =
    dna.guidelines?.formatting?.emoji_usage ?? dna.voice?.emoji_usage ?? undefined;
  const power_verbs = dna.voice?.power_verbs ?? [];
  const banned_words =
    dna.guidelines?.messaging_guardrails?.banned_words ?? dna.voice?.banned_words ?? [];
  if (!tone && !style && !emoji_usage && power_verbs.length === 0 && banned_words.length === 0)
    return null;
  return { tone, style, emoji_usage, power_verbs, banned_words };
}

function extractPersonality(dna: BrandDna): z.input<typeof brandPersonalityTokenSchema> | null {
  const personality = dna.strategy?.personality;
  if (!personality) return null;
  return {
    archetype: personality.archetype ?? undefined,
    traits: personality.traits ?? [],
    descriptors: personality.descriptors ?? [],
  };
}

function extractAudience(dna: BrandDna): z.input<typeof brandAudienceTokenSchema> | null {
  const primary_summary = dna.audience?.summary ?? undefined;
  const anchors = dna.brand_pillars ?? [];
  if (!primary_summary && anchors.length === 0) return null;
  return { primary_summary, anchors };
}

// Deterministic projection of the report into tokens — NEVER invents values
// (no hex/typography is produced that the report/kit didn't carry). `imagery`
// is left null for the asynchronous LLM prose pass to fill.
export function extractBrandTokens(
  result: BrandReportResult,
  kit?: { colors?: string[]; logoPath?: string | null },
): BrandMdTokens {
  const dna = toBrandDna(result);
  const logoPath = kit?.logoPath ?? null;
  return brandMdTokensSchema.parse({
    schema_version: 1,
    brand_name: dna.brand_name,
    colors: extractBrandColorTokens(dna.palette, kit?.colors ?? []),
    typography: extractBrandFontTokens(dna.typography),
    logo: logoPath ? { storage_path: logoPath, treatment_default: 'palette-only' } : null,
    voice: extractVoice(dna),
    personality: extractPersonality(dna),
    imagery: null,
    audience: extractAudience(dna),
  });
}
