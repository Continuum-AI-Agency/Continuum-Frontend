import { describe, expect, it } from 'bun:test';
import { type BrandBookPieceKind, brandMdTokensSchema, skillSchema } from '@continuum/contracts';
import { describeSkillForGeneration, presentBrandBookPiece } from './generationConfigPresentation';

const tokens = brandMdTokensSchema.parse({
  brand_name: 'Acme',
  colors: [
    { value: '#102a43', role: 'primary', name: 'Ocean' },
    { value: '#ff6b6b', role: 'accent', name: 'Coral' },
  ],
  typography: [
    { family: 'Canela', role: 'display', note: 'Headlines' },
    { family: 'Inter', role: 'body' },
  ],
  logo: { storage_path: 'acme/branding/logo.png', treatment_default: 'logo' },
  voice: {
    tone: 'Direct and warm',
    style: 'Short sentences',
    power_verbs: ['build', 'prove'],
    banned_words: ['synergy'],
  },
  imagery: {
    creative_direction: ['Human-scale product scenes'],
    mood: ['warm', 'tactile'],
    avoid: ['stock photography'],
  },
  personality: { archetype: 'Explorer', traits: ['curious', 'direct'] },
  audience: { primary_summary: 'Independent operators', anchors: ['small teams'] },
});

describe('presentBrandBookPiece', () => {
  const expected: Record<Exclude<BrandBookPieceKind, 'full'>, string> = {
    colors: 'Ocean (primary) #102a43 · Coral (accent) #ff6b6b',
    typography: 'Canela (display; Headlines) · Inter (body)',
    voice: 'Tone: Direct and warm · Style: Short sentences · Use: build, prove · Avoid: synergy',
    imagery:
      'Direction: Human-scale product scenes · Mood: warm, tactile · Avoid: stock photography',
    personality: 'Archetype: Explorer · Traits: curious, direct',
    audience: 'Independent operators · Anchors: small teams',
    logo: 'Uses the brand logo as a reference · Treatment: logo',
  };

  for (const [piece, description] of Object.entries(expected)) {
    it(`describes ${piece} from the live token`, () => {
      expect(presentBrandBookPiece(tokens, piece as BrandBookPieceKind)?.description).toBe(
        description,
      );
    });
  }

  it('summarizes the populated full book instead of using generic copy', () => {
    expect(presentBrandBookPiece(tokens, 'full')?.description).toBe(
      'Colors: Ocean (primary) #102a43 · Coral (accent) #ff6b6b · Typography: Canela (display; Headlines) · Inter (body) · Voice: Tone: Direct and warm · Style: Short sentences · Use: build, prove · Avoid: synergy · Vision / Imagery: Direction: Human-scale product scenes · Mood: warm, tactile · Avoid: stock photography · Personality: Archetype: Explorer · Traits: curious, direct · Audience: Independent operators · Anchors: small teams · Logo: Uses the brand logo as a reference · Treatment: logo',
    );
  });

  it('returns no presentation for an empty token object', () => {
    const empty = brandMdTokensSchema.parse({ brand_name: 'Empty', voice: {} });
    expect(presentBrandBookPiece(empty, 'voice')).toBeNull();
    expect(presentBrandBookPiece(empty, 'full')).toBeNull();
  });
});

describe('describeSkillForGeneration', () => {
  const base = {
    id: 'skill-1',
    brandId: 'brand-1',
    name: 'Product fidelity',
    kind: 'creative_direction' as const,
    surface: 'visual' as const,
    directives:
      'Keep the packaging geometry exact.\n\n## Canvas recipe\nWire the product reference.',
    tags: ['product', 'fidelity'],
    status: 'active' as const,
    createdAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:00:00.000Z',
  };

  it('uses the skill config description when present', () => {
    const skill = skillSchema.parse({ ...base, description: 'Protect the supplied product.' });
    expect(describeSkillForGeneration(skill)).toBe('Protect the supplied product.');
  });

  it('falls back to the model-facing directive and excludes the canvas recipe', () => {
    const skill = skillSchema.parse({ ...base, description: null });
    expect(describeSkillForGeneration(skill)).toBe('Keep the packaging geometry exact.');
  });
});
