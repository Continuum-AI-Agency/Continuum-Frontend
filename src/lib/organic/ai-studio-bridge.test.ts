import { describe, expect, it } from 'bun:test';

import {
  buildAiStudioHandoffStorageCandidates,
  deriveCarouselSlideSeeds,
  normalizeDraftPostType,
  plannerAiStudioApplyRequestSchema,
  plannerAiStudioHandoffSchema,
  resolveWorkflowConcept,
  resolveWorkflowConceptSpec,
} from './ai-studio-bridge';

describe('ai-studio-bridge', () => {
  it('normalizes post type from format strings', () => {
    expect(normalizeDraftPostType('Carousel')).toBe('carousel');
    expect(normalizeDraftPostType('Reel')).toBe('reel');
    expect(normalizeDraftPostType('FeedPost')).toBe('post');
    expect(normalizeDraftPostType('')).toBe('post');
  });

  it('parses planner handoff payload', () => {
    const parsed = plannerAiStudioHandoffSchema.parse({
      schemaVersion: 'planner_ai_handoff_v1',
      draftId: 'draft-1',
      brandProfileId: 'brand-1',
      weekStartId: '2026-03-23',
      platform: 'instagram',
      postType: 'post',
      format: 'Post',
      title: 'Hello',
      summary: 'World',
      captionPreview: 'Caption',
      updatedAt: new Date().toISOString(),
    });

    expect(parsed.draftId).toBe('draft-1');
    expect(parsed.platform).toBe('instagram');
  });

  it('requires assets for apply payload', () => {
    const parsed = plannerAiStudioApplyRequestSchema.safeParse({
      schemaVersion: 'planner_ai_apply_v1',
      draftId: 'draft-1',
      brandProfileId: 'brand-1',
      postType: 'post',
      platform: 'instagram',
      overwrite: true,
      contentPatch: {},
      assets: [],
    });

    expect(parsed.success).toBe(false);
  });

  it('maps platform and post type to workflow concept', () => {
    expect(resolveWorkflowConcept({ platform: 'instagram', postType: 'post' })).toBe(
      'ig_post_single_image',
    );
    expect(resolveWorkflowConcept({ platform: 'instagram', postType: 'reel' })).toBe(
      'ig_reel_single_video',
    );
    expect(resolveWorkflowConcept({ platform: 'instagram', postType: 'carousel' })).toBe(
      'ig_carousel_multi_image',
    );
    expect(resolveWorkflowConcept({ platform: 'linkedin', postType: 'post' })).toBe(
      'li_post_single_image',
    );
  });

  it('returns concept output behavior spec', () => {
    const linkedinSpec = resolveWorkflowConceptSpec({
      platform: 'linkedin',
      postType: 'post',
    });
    expect(linkedinSpec.outputKind).toBe('image');
    expect(linkedinSpec.outputMode).toBe('single');
    expect(linkedinSpec.maxReferenceImages).toBe(5);
    expect(linkedinSpec.requiresExplicitPickOnMultiOutput).toBe(true);
  });

  it('builds deduped fallback candidates for storage-constrained handoff payloads', () => {
    const handoff = plannerAiStudioHandoffSchema.parse({
      schemaVersion: 'planner_ai_handoff_v1',
      draftId: 'seeded-1',
      brandProfileId: 'brand-1',
      weekStartId: '2026-03-23',
      platform: 'instagram',
      postType: 'post',
      format: 'Post',
      title: 'Seeded title',
      summary: 'Seeded summary',
      captionPreview: 'Seeded caption',
      mediaSuggestion: {
        assetUrl: 'https://example.com/image.png',
        assetBase64: 'abc123',
        generationContext: { foo: 'bar' },
      },
      assetHints: [{ role: 'thumbnail', suggestion: 'Hero subject' }],
      updatedAt: new Date().toISOString(),
    });

    const candidates = buildAiStudioHandoffStorageCandidates(handoff);

    expect(candidates).toHaveLength(5);
    expect(candidates[0].mediaSuggestion?.assetBase64).toBe('abc123');
    expect(candidates[1].mediaSuggestion?.assetBase64).toBeUndefined();
    expect(candidates[2].mediaSuggestion?.generationContext).toBeUndefined();
    expect(candidates[3].mediaSuggestion).toBeUndefined();
    expect(candidates[4].assetHints).toBeUndefined();
  });

  it('drops per-slide direction only on the last storage fallback', () => {
    const handoff = plannerAiStudioHandoffSchema.parse({
      schemaVersion: 'planner_ai_handoff_v1',
      draftId: 'seeded-2',
      brandProfileId: 'brand-1',
      weekStartId: '2026-03-23',
      platform: 'instagram',
      postType: 'carousel',
      format: 'Carousel',
      title: 'Seeded title',
      summary: 'Seeded summary',
      captionPreview: 'Seeded caption',
      assetHints: [{ role: 'slide_1', suggestion: 'Hero subject' }],
      slides: [
        { index: 0, prompt: 'Hook slide' },
        { index: 1, prompt: 'Proof slide' },
      ],
      updatedAt: new Date().toISOString(),
    });

    const candidates = buildAiStudioHandoffStorageCandidates(handoff);

    expect(candidates[0].slides).toHaveLength(2);
    expect(candidates[candidates.length - 2].slides).toHaveLength(2);
    expect(candidates[candidates.length - 1].slides).toBeUndefined();
  });

  it('derives per-slide direction from blueprint asset prompts, ordered by slide order', () => {
    const slides = deriveCarouselSlideSeeds({
      assets: [
        { order: 2, prompt: '  Second slide direction  ' },
        { order: 1, prompt: 'First slide direction' },
        { order: 3, prompt: 'Third slide direction' },
      ],
      assetHints: [],
    });

    expect(slides).toEqual([
      { index: 0, prompt: 'First slide direction' },
      { index: 1, prompt: 'Second slide direction' },
      { index: 2, prompt: 'Third slide direction' },
    ]);
  });

  it('falls back to asset hints and keeps positional index across a blank slide', () => {
    const slides = deriveCarouselSlideSeeds({
      assets: [{ order: 1, prompt: 'Blueprint direction' }, { order: 2, prompt: '   ' }, {}],
      assetHints: [
        { suggestion: 'ignored, the asset prompt wins' },
        { suggestion: '' },
        { suggestion: 'Hint direction' },
      ],
    });

    expect(slides).toEqual([
      { index: 0, prompt: 'Blueprint direction' },
      { index: 2, prompt: 'Hint direction' },
    ]);
  });

  it('returns no slides when the draft carries no per-slide direction at all', () => {
    expect(deriveCarouselSlideSeeds({})).toEqual([]);
    expect(deriveCarouselSlideSeeds({ assets: [{ prompt: null }], assetHints: null })).toEqual([]);
  });
});
