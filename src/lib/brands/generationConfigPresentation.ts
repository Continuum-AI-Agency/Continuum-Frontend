import {
  type BrandBookPieceKind,
  type BrandMdTokens,
  brandBookPieceKindSchema,
  type Skill,
  skillModelFacingBody,
} from '@continuum/contracts';

export const BRAND_BOOK_PIECE_LABELS: Record<BrandBookPieceKind, string> = {
  full: 'Entire brand book',
  colors: 'Colors',
  typography: 'Typography',
  voice: 'Voice',
  imagery: 'Vision / Imagery',
  personality: 'Personality',
  audience: 'Audience',
  logo: 'Logo',
};

export const BRAND_BOOK_PIECE_KINDS: readonly BrandBookPieceKind[] =
  brandBookPieceKindSchema.options;

export type BrandBookPiecePreview =
  | { kind: 'palette'; values: string[] }
  | { kind: 'typography' | 'text'; value: string }
  | { kind: 'logo'; storagePath: string }
  | { kind: 'book'; brandName: string; colors: string[] };

export type BrandBookPiecePresentation = {
  kind: BrandBookPieceKind;
  label: string;
  description: string;
  preview: BrandBookPiecePreview;
};

function presentColors(tokens: BrandMdTokens): BrandBookPiecePresentation | null {
  if (tokens.colors.length === 0) return null;
  const description = tokens.colors
    .map((color) => {
      const name =
        color.name ??
        (color.role ? `${color.role[0].toUpperCase()}${color.role.slice(1)}` : 'Color');
      return `${name}${color.name && color.role ? ` (${color.role})` : ''} ${color.value}`;
    })
    .join(' · ');
  return {
    kind: 'colors',
    label: BRAND_BOOK_PIECE_LABELS.colors,
    description,
    preview: { kind: 'palette', values: tokens.colors.map((color) => color.value) },
  };
}

function presentTypography(tokens: BrandMdTokens): BrandBookPiecePresentation | null {
  if (tokens.typography.length === 0) return null;
  const description = tokens.typography
    .map((font) => {
      const detail = [font.role, font.note].filter(Boolean).join('; ');
      return detail ? `${font.family} (${detail})` : font.family;
    })
    .join(' · ');
  return {
    kind: 'typography',
    label: BRAND_BOOK_PIECE_LABELS.typography,
    description,
    preview: {
      kind: 'typography',
      value: tokens.typography.map((font) => font.family).join(' · '),
    },
  };
}

function presentVoice(tokens: BrandMdTokens): BrandBookPiecePresentation | null {
  const voice = tokens.voice;
  if (!voice) return null;
  if (typeof voice === 'string') {
    return {
      kind: 'voice',
      label: BRAND_BOOK_PIECE_LABELS.voice,
      description: voice,
      preview: { kind: 'text', value: voice },
    };
  }
  const parts = [
    voice.tone ? `Tone: ${voice.tone}` : null,
    voice.style ? `Style: ${voice.style}` : null,
    voice.power_verbs?.length ? `Use: ${voice.power_verbs.join(', ')}` : null,
    voice.banned_words?.length ? `Avoid: ${voice.banned_words.join(', ')}` : null,
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return null;
  return {
    kind: 'voice',
    label: BRAND_BOOK_PIECE_LABELS.voice,
    description: parts.join(' · '),
    preview: { kind: 'text', value: voice.tone ?? voice.style ?? voice.power_verbs?.[0] ?? '' },
  };
}

function presentImagery(tokens: BrandMdTokens): BrandBookPiecePresentation | null {
  const imagery = tokens.imagery;
  if (!imagery) return null;
  const parts = [
    imagery.creative_direction.length > 0
      ? `Direction: ${imagery.creative_direction.join('; ')}`
      : null,
    imagery.mood.length > 0 ? `Mood: ${imagery.mood.join(', ')}` : null,
    imagery.avoid.length > 0 ? `Avoid: ${imagery.avoid.join('; ')}` : null,
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return null;
  return {
    kind: 'imagery',
    label: BRAND_BOOK_PIECE_LABELS.imagery,
    description: parts.join(' · '),
    preview: {
      kind: 'text',
      value: imagery.creative_direction[0] ?? imagery.mood[0] ?? imagery.avoid[0] ?? '',
    },
  };
}

function presentPersonality(tokens: BrandMdTokens): BrandBookPiecePresentation | null {
  const personality = tokens.personality;
  if (!personality) return null;
  const parts = [
    personality.archetype ? `Archetype: ${personality.archetype}` : null,
    personality.traits.length > 0 ? `Traits: ${personality.traits.join(', ')}` : null,
    personality.descriptors.length > 0
      ? `Descriptors: ${personality.descriptors.join(', ')}`
      : null,
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return null;
  return {
    kind: 'personality',
    label: BRAND_BOOK_PIECE_LABELS.personality,
    description: parts.join(' · '),
    preview: {
      kind: 'text',
      value: personality.archetype ?? personality.traits[0] ?? personality.descriptors[0] ?? '',
    },
  };
}

function presentAudience(tokens: BrandMdTokens): BrandBookPiecePresentation | null {
  const audience = tokens.audience;
  if (!audience) return null;
  const parts = [
    audience.primary_summary ?? null,
    audience.anchors.length > 0 ? `Anchors: ${audience.anchors.join(', ')}` : null,
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return null;
  return {
    kind: 'audience',
    label: BRAND_BOOK_PIECE_LABELS.audience,
    description: parts.join(' · '),
    preview: { kind: 'text', value: audience.primary_summary ?? audience.anchors[0] ?? '' },
  };
}

function presentLogo(tokens: BrandMdTokens): BrandBookPiecePresentation | null {
  const storagePath = tokens.logo?.storage_path?.trim();
  if (!storagePath) return null;
  return {
    kind: 'logo',
    label: BRAND_BOOK_PIECE_LABELS.logo,
    description: `Uses the brand logo as a reference · Treatment: ${tokens.logo?.treatment_default ?? 'palette-only'}`,
    preview: { kind: 'logo', storagePath },
  };
}

const PRESENTERS: Record<
  Exclude<BrandBookPieceKind, 'full'>,
  (tokens: BrandMdTokens) => BrandBookPiecePresentation | null
> = {
  colors: presentColors,
  typography: presentTypography,
  voice: presentVoice,
  imagery: presentImagery,
  personality: presentPersonality,
  audience: presentAudience,
  logo: presentLogo,
};

export function presentBrandBookPiece(
  tokens: BrandMdTokens | null | undefined,
  kind: BrandBookPieceKind,
): BrandBookPiecePresentation | null {
  if (!tokens) return null;
  if (kind !== 'full') return PRESENTERS[kind](tokens);

  const pieces = (Object.keys(PRESENTERS) as Array<Exclude<BrandBookPieceKind, 'full'>>)
    .map((piece) => PRESENTERS[piece](tokens))
    .filter((piece): piece is BrandBookPiecePresentation => Boolean(piece));
  if (pieces.length === 0) return null;

  return {
    kind: 'full',
    label: BRAND_BOOK_PIECE_LABELS.full,
    description: pieces.map((piece) => `${piece.label}: ${piece.description}`).join(' · '),
    preview: {
      kind: 'book',
      brandName: tokens.brand_name,
      colors: tokens.colors.map((color) => color.value),
    },
  };
}

export function describeSkillForGeneration(skill: Skill): string {
  const description = skill.description?.trim();
  if (description) return description;
  const firstLine = skillModelFacingBody(skill.directives)
    .split('\n')
    .map((line) => line.replace(/^\s*[#>*-]+\s*/, '').trim())
    .find(Boolean);
  return firstLine ?? skill.name;
}
