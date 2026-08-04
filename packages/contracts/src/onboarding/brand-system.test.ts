import { describe, expect, it } from 'bun:test';

import { brandBookResponseSchema } from './brand-book';
import { compileBrandSystem } from './brand-system';

const BRAND_MD = '# Example Brand\nAuthoritative rules.';

const brandBook = brandBookResponseSchema.parse({
  brand_id: '11111111-1111-4111-8111-111111111111',
  status: 'ready',
  present: true,
  refreshed_at: '2026-08-01T12:00:00.000Z',
  stale: false,
  brand_md: BRAND_MD,
  brand_tokens: {
    schema_version: 1,
    brand_name: 'Example Brand',
    colors: [
      { value: '#336699', role: 'primary', name: 'Ocean' },
      { value: '#f008', role: 'accent', name: 'Signal' },
    ],
    typography: [{ family: 'Inter', role: 'body' }],
    logo: {
      storage_path: '11111111-1111-4111-8111-111111111111/branding/logo.png',
      treatment_default: 'logo',
    },
    voice: {
      tone: 'Clear and assured',
      power_verbs: ['Build'],
      banned_words: ['synergy'],
    },
    personality: { archetype: 'Guide', traits: ['Direct'], descriptors: [] },
    imagery: { creative_direction: ['Human-scale scenes'], mood: ['Warm'], avoid: [] },
    audience: { primary_summary: 'Operations leaders', anchors: ['Clarity'] },
  },
  assembled: {
    onboarding: {
      present: true,
      completed: true,
      completed_at: '2026-07-31T12:00:00.000Z',
      summary: { private_invite_email: 'secret@example.com' },
    },
    guidelines: [],
    documents: [
      {
        id: 'doc-secret',
        name: 'Research.pdf',
        category: 'brand_guidelines',
        status: 'ready',
        created_at: '2026-07-30T12:00:00.000Z',
        excerpt: 'confidential source excerpt',
      },
    ],
    report: null,
  },
});

describe('compileBrandSystem', () => {
  it('exports interoperable tokens and canonical knowledge without leaking source material', async () => {
    const result = await compileBrandSystem({
      brandBook,
      brandName: 'Example Brand',
      exportedAt: '2026-08-01T18:00:00.000Z',
      renderPdf: async () => new TextEncoder().encode('%PDF-test'),
      loadLogo: async () => ({
        bytes: new Uint8Array([137, 80, 78, 71]),
        mediaType: 'image/png',
        extension: 'png',
      }),
    });

    const files = new Map(result.files.map((file) => [file.path, file]));
    const tokens = JSON.parse(new TextDecoder().decode(files.get('tokens.tokens.json')?.bytes));
    const knowledge = JSON.parse(new TextDecoder().decode(files.get('brand.json')?.bytes));
    const serialized = result.files.map((file) => new TextDecoder().decode(file.bytes)).join('\n');

    expect(tokens.brand.color.primary).toEqual({
      $type: 'color',
      $description: 'Ocean',
      $value: {
        colorSpace: 'srgb',
        components: [0.2, 0.4, 0.6],
        alpha: 1,
        hex: '#336699',
      },
    });
    expect(tokens.$schema).toBe('https://www.designtokens.org/schemas/2025.10/format.json');
    expect(tokens.brand.color.accent.$value).toEqual({
      colorSpace: 'srgb',
      components: [1, 0, 0],
      alpha: 136 / 255,
      hex: '#ff0000',
    });
    expect(tokens.brand.typeface.body).toEqual({ $type: 'fontFamily', $value: 'Inter' });
    expect(knowledge.identity.voice.tone).toBe('Clear and assured');
    expect(knowledge.sources.documents).toEqual([
      {
        name: 'Research.pdf',
        category: 'brand_guidelines',
        status: 'ready',
        createdAt: '2026-07-30T12:00:00.000Z',
      },
    ]);
    expect(files.get('brand.md')?.sha256).toBe(
      '7bcdb6d14d63c26c8bb0f21d7c916535abecb2480ea8e3a4b88a29009693f054',
    );
    expect(files.has('assets/logo.png')).toBe(true);
    expect(serialized).not.toContain('secret@example.com');
    expect(serialized).not.toContain('confidential source excerpt');
    expect(serialized).not.toContain('branding/logo.png');
  });

  it('projects materialized guideline sections while stripping internal references', async () => {
    const withGuidelines = brandBookResponseSchema.parse({
      ...brandBook,
      assembled: {
        ...brandBook.assembled,
        guidelines: [
          {
            purpose: 'general',
            status: 'ready',
            version: 3,
            notes: 'Use a calm editorial hierarchy.',
            colors: { primary_usage: 'Calls to action', storage_path: 'private/palette.json' },
            logo: { clear_space: 'One cap height', signedUrl: 'https://private.example/logo' },
            verbal_identity: { tagline: 'Build with clarity', internal_id: 'secret-row' },
            unknown_source_payload: { excerpt: 'do not export' },
          },
        ],
      },
    });

    const result = await compileBrandSystem({
      brandBook: withGuidelines,
      brandName: 'Example Brand',
      exportedAt: '2026-08-01T18:00:00.000Z',
      renderPdf: async () => new TextEncoder().encode('%PDF-test'),
      loadLogo: async () => null,
    });

    const serialized = JSON.stringify(result.snapshot.strategy.guidelineSets);
    expect(result.snapshot.strategy.guidelineSets[0]?.sections.colors).toEqual({
      primary_usage: 'Calls to action',
    });
    expect(result.snapshot.strategy.guidelineSets[0]?.sections.logo).toEqual({
      clear_space: 'One cap height',
    });
    expect(serialized).toContain('Build with clarity');
    expect(serialized).not.toContain('private/palette.json');
    expect(serialized).not.toContain('private.example');
    expect(serialized).not.toContain('secret-row');
    expect(serialized).not.toContain('do not export');
  });

  it('exports without a broken logo reference when the logo bytes are unavailable', async () => {
    const result = await compileBrandSystem({
      brandBook,
      brandName: 'Example Brand',
      exportedAt: '2026-08-01T18:00:00.000Z',
      renderPdf: async (_snapshot, logo) => {
        expect(logo).toBeNull();
        return new TextEncoder().encode('%PDF-test');
      },
      loadLogo: async () => null,
    });

    expect(result.snapshot.identity.logo).toBeNull();
    expect(result.files.some((file) => file.path.startsWith('assets/logo.'))).toBe(false);
    expect(result.manifest.warnings).toEqual([
      {
        code: 'logo_unavailable',
        message: 'The referenced logo could not be included in this export.',
      },
    ]);
  });

  it('omits unavailable brand.md and records the partial package in the manifest', async () => {
    const withoutDocument = brandBookResponseSchema.parse({
      ...brandBook,
      brand_md: null,
    });
    const result = await compileBrandSystem({
      brandBook: withoutDocument,
      brandName: 'Example Brand',
      exportedAt: '2026-08-01T18:00:00.000Z',
      renderPdf: async () => new TextEncoder().encode('%PDF-test'),
      loadLogo: async () => null,
    });

    expect(result.files.some((file) => file.path === 'brand.md')).toBe(false);
    expect(result.manifest.warnings.map((warning) => warning.code)).toContain(
      'brand_document_unavailable',
    );
  });

  it('rejects an assembling Brand Book', async () => {
    const assembling = brandBookResponseSchema.parse({
      ...brandBook,
      status: 'assembling',
      present: false,
    });

    await expect(
      compileBrandSystem({
        brandBook: assembling,
        brandName: 'Example Brand',
        renderPdf: async () => new Uint8Array(),
      }),
    ).rejects.toThrow('brand_system_export_requires_ready_brand_book');
  });
});
