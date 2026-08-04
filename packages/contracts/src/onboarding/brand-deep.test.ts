import { describe, expect, it } from 'bun:test';

import { brandDeepSchema, toBrandDeep } from './brand-deep';
import { brandReportResultSchema } from './brand-report';

// Mirrors the Backend strategicBrandAnalysisSchema *output* (the agent result the
// deep job produces), including the experimental `extra_*` buckets that must be
// dropped by toBrandDeep.
const STRATEGIC = {
  brand_id: 'brand-mocky',
  mission: ['Make weekly reporting effortless'],
  vision: ['Every ops team ships the brief, not the meeting'],
  core_values: ['clarity', 'speed'],
  product_market_fit: {
    summary: 'Strong fit with Series-B RevOps',
    positioning: 'report engine, not BI',
    differentiators: ['deterministic math'],
    audience_needs: ['board-ready brief'],
    opportunities: ['expand to finance'],
    risks: ['BI incumbents'],
    recommendations: ['lead with time saved'],
    go_to_market_ideas: ['RevOps communities'],
    extra_deep: { buckets: [{ label: 'fit', scores: [0.9] }] },
  },
  product_summary: {
    product_name: 'Mocky Reports',
    product_description: 'Auto-drafts board briefs',
    product_features: ['pipeline math'],
    product_benefits: ['10 min vs 4 hrs'],
    product_pricing: '$99/mo',
    product_cta: 'Book a demo',
  },
  audience_profile: {
    summary: 'RevOps + finance leaders',
    segments: [
      {
        name: 'RevOps lead',
        description: 'owns weekly cadence',
        psychographics: ['data-driven'],
        motivations: ['look sharp to the board'],
        barriers: ['trust in automation'],
        messaging: ['ship the report'],
        extra_segment: { nested: [] },
      },
    ],
    content_preferences: ['LinkedIn'],
    emotional_drivers: ['control'],
    influencer_archetypes: ['the operator'],
    extra_profile: { tier: null },
  },
  competitive_landscape: {
    top_competitors: [
      {
        name: 'BI Co',
        strategy_summary: 'dashboards for everyone',
        key_messaging: 'see everything',
        url: 'https://bi.example',
        social_media_presence: null,
        extra_competitor: { notes: [] },
      },
    ],
    insights: 'incumbents are heavy',
    recommendations: 'be fast',
    sub_topics: [],
    extra_competition: { watchouts: [] },
  },
  brand_voice: {},
};

describe('brandDeepSchema (T2 deep lane)', () => {
  it('parses an empty object to an all-null deep shape', () => {
    const parsed = brandDeepSchema.parse({});
    expect(parsed.strategic_narrative).toBeNull();
    expect(parsed.messaging_system).toBeNull();
    expect(parsed.product).toBeNull();
    expect(parsed.deep_personas).toBeNull();
    expect(parsed.competitive_frame).toBeNull();
  });

  it('parses a partial fill independently per sub-section', () => {
    const parsed = brandDeepSchema.parse({ strategic_narrative: { mission: ['x'] } });
    expect(parsed.strategic_narrative?.mission).toEqual(['x']);
    expect(parsed.strategic_narrative?.vision).toEqual([]);
    expect(parsed.messaging_system).toBeNull();
  });

  it('round-trips a fully populated deep object', () => {
    const deep = {
      strategic_narrative: { mission: ['m'], vision: ['v'], core_values: ['c'] },
      messaging_system: {
        summary: 's',
        positioning: 'p',
        differentiators: ['d'],
        audience_needs: ['n'],
        opportunities: ['o'],
        risks: ['r'],
        recommendations: ['rec'],
        go_to_market_ideas: ['gtm'],
      },
      product: {
        product_name: 'P',
        product_description: 'desc',
        product_features: ['f'],
        product_benefits: ['b'],
        product_pricing: '$1',
        product_cta: 'buy',
      },
      deep_personas: {
        summary: 'ps',
        segments: [
          {
            name: 'seg',
            description: 'd',
            psychographics: [],
            motivations: [],
            barriers: [],
            messaging: [],
          },
        ],
        content_preferences: [],
        emotional_drivers: [],
        influencer_archetypes: [],
      },
      competitive_frame: {
        top_competitors: [
          { name: 'C', strategy_summary: 'ss', key_messaging: 'km', url: 'https://c.example' },
        ],
        insights: 'i',
        recommendations: 'rec',
      },
      generated_at: '2026-06-21T00:00:00Z',
      model: 'gemini-3.1-flash-lite',
    };
    expect(() => brandDeepSchema.parse(deep)).not.toThrow();
  });

  it('strips unknown top-level keys', () => {
    const parsed = brandDeepSchema.parse({ sneaky: 'drop' }) as Record<string, unknown>;
    expect(parsed.sneaky).toBeUndefined();
  });
});

describe('toBrandDeep (strategic analysis -> canonical T2)', () => {
  it('maps the strategic analysis output and drops experimental extras', () => {
    const deep = toBrandDeep(STRATEGIC, {
      generatedAt: '2026-06-21T00:00:00Z',
      model: 'gemini-3.1-flash-lite',
    });
    expect(deep.strategic_narrative?.mission).toEqual(['Make weekly reporting effortless']);
    expect(deep.strategic_narrative?.core_values).toEqual(['clarity', 'speed']);
    expect(deep.messaging_system?.summary).toBe('Strong fit with Series-B RevOps');
    expect(deep.messaging_system?.differentiators).toEqual(['deterministic math']);
    expect(deep.product?.product_name).toBe('Mocky Reports');
    expect(deep.deep_personas?.segments[0]?.name).toBe('RevOps lead');
    expect(deep.deep_personas?.segments[0]?.motivations).toEqual(['look sharp to the board']);
    expect(deep.competitive_frame?.top_competitors[0]?.name).toBe('BI Co');
    expect(deep.generated_at).toBe('2026-06-21T00:00:00Z');
    expect(deep.model).toBe('gemini-3.1-flash-lite');
    // Experimental buckets never leak into the canonical shape.
    const ms = deep.messaging_system as Record<string, unknown>;
    expect(ms.extra_deep).toBeUndefined();
    const seg = deep.deep_personas?.segments[0] as Record<string, unknown>;
    expect(seg.extra_segment).toBeUndefined();
  });

  it('tolerates a missing product_summary', () => {
    const { product_summary, ...rest } = STRATEGIC;
    const deep = toBrandDeep(rest);
    expect(deep.product).toBeNull();
    expect(deep.strategic_narrative?.mission).toHaveLength(1);
  });
});

describe('brandReportResultSchema.deep (T2 folded into the canonical composite)', () => {
  const base = {
    brand_profile: { id: 'brand-mocky', brand_name: 'Mocky', website_url: 'https://mocky.example' },
    structured: {
      connected_accounts: [],
      website: { website_url: 'https://mocky.example' },
      documents: {},
      target_audience: {},
      business: null,
    },
    understanding: {
      positioning_thesis: 'For ops leaders, Mocky drafts the brief.',
      hypothesis_icp: 'Head of RevOps',
      brand_pillars: ['fast reporting'],
      tonal_signal: 'operator confidence',
      notable_evidence: [],
    },
  };

  it('defaults deep to null for a legacy composite that predates the deep lane', () => {
    const parsed = brandReportResultSchema.parse(base);
    expect(parsed.deep).toBeNull();
  });

  it('carries a populated deep object', () => {
    const parsed = brandReportResultSchema.parse({
      ...base,
      deep: { strategic_narrative: { mission: ['m'] } },
    });
    expect(parsed.deep?.strategic_narrative?.mission).toEqual(['m']);
  });
});
