import { describe, expect, it } from 'bun:test';
import {
  PLANNER_CAPTION_MAX_LENGTH,
  plannerDraftFieldPatchSchema,
  plannerDraftHasCopy,
  plannerFieldPatchToContentJson,
  plannerFieldPatchTouchesSchedule,
} from './planner-draft-edit';

describe('plannerDraftFieldPatchSchema', () => {
  it('accepts a single-field patch', () => {
    expect(plannerDraftFieldPatchSchema.safeParse({ caption: 'hello' }).success).toBe(true);
    expect(plannerDraftFieldPatchSchema.safeParse({ format: 'Carousel' }).success).toBe(true);
  });

  it('rejects a patch that names no editable field', () => {
    expect(plannerDraftFieldPatchSchema.safeParse({}).success).toBe(false);
    // expected_updated_at alone is a concurrency token, not an edit.
    expect(
      plannerDraftFieldPatchSchema.safeParse({ expected_updated_at: '2026-07-30T00:00:00Z' })
        .success,
    ).toBe(false);
  });

  it('rejects a caption past the platform cap', () => {
    const tooLong = 'x'.repeat(PLANNER_CAPTION_MAX_LENGTH + 1);
    expect(plannerDraftFieldPatchSchema.safeParse({ caption: tooLong }).success).toBe(false);
    expect(
      plannerDraftFieldPatchSchema.safeParse({ caption: 'x'.repeat(PLANNER_CAPTION_MAX_LENGTH) })
        .success,
    ).toBe(true);
  });

  it('rejects an unknown key rather than silently dropping it', () => {
    const result = plannerDraftFieldPatchSchema.safeParse({ caption: 'hi', statuss: 'draft' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed day or time', () => {
    expect(plannerDraftFieldPatchSchema.safeParse({ dayId: '30-07-2026' }).success).toBe(false);
    expect(plannerDraftFieldPatchSchema.safeParse({ timeOfDay: '9:00 AM' }).success).toBe(false);
    expect(
      plannerDraftFieldPatchSchema.safeParse({ dayId: '2026-07-30', timeOfDay: '09:30' }).success,
    ).toBe(true);
  });

  it('accepts an empty format only when non-empty', () => {
    expect(plannerDraftFieldPatchSchema.safeParse({ format: '' }).success).toBe(false);
  });
});

describe('plannerFieldPatchTouchesSchedule', () => {
  it('is true for either half of a schedule change', () => {
    expect(plannerFieldPatchTouchesSchedule({ dayId: '2026-07-30' })).toBe(true);
    expect(plannerFieldPatchTouchesSchedule({ timeOfDay: '17:30' })).toBe(true);
  });

  it('is false for a content-only edit', () => {
    expect(plannerFieldPatchTouchesSchedule({ caption: 'hi' })).toBe(false);
  });
});

describe('plannerFieldPatchToContentJson', () => {
  it('maps a caption under copy', () => {
    expect(plannerFieldPatchToContentJson({ caption: 'hello' })).toEqual({
      copy: { caption: 'hello' },
    });
  });

  it('maps hashtags under copy without inventing a caption', () => {
    const result = plannerFieldPatchToContentJson({ hashtags: { high: ['#a'] } });
    expect(result).toEqual({ copy: { hashtags: { high: ['#a'] } } });
    expect((result.copy as Record<string, unknown>).caption).toBeUndefined();
  });

  it('maps caption and hashtags into one copy object', () => {
    expect(plannerFieldPatchToContentJson({ caption: 'hi', hashtags: { low: ['#b'] } })).toEqual({
      copy: { caption: 'hi', hashtags: { low: ['#b'] } },
    });
  });

  it('maps format and titleTopic under content', () => {
    expect(plannerFieldPatchToContentJson({ format: 'Carousel', titleTopic: 'Occupancy' })).toEqual(
      {
        content: { format: 'Carousel', titleTopic: 'Occupancy' },
      },
    );
  });

  it('writes creative direction under BOTH names the two readers use', () => {
    expect(plannerFieldPatchToContentJson({ creativeDirection: 'moody, wide' })).toEqual({
      creative: { creativeIdea: 'moody, wide', creativeDirectionPrompt: 'moody, wide' },
    });
  });

  it('maps media to publishingAssets and the render-time suggestion', () => {
    const result = plannerFieldPatchToContentJson({
      media: {
        publishingAssets: [{ role: 'slide_1', storagePath: 'a/b.jpg', storageUrl: 'https://x/b' }],
        mediaSuggestion: { type: 'image' },
      },
    });
    expect(result.publishingAssets).toHaveLength(1);
    expect((result.creative as Record<string, unknown>).mediaSuggestion).toEqual({ type: 'image' });
  });

  it('maps media with no suggestion without emitting an empty creative object', () => {
    const result = plannerFieldPatchToContentJson({
      media: { publishingAssets: [] },
    });
    expect(result.publishingAssets).toEqual([]);
    expect(result.creative).toBeUndefined();
  });

  it('emits nothing for the schedule half — planner-schedule composes that instant', () => {
    expect(plannerFieldPatchToContentJson({ dayId: '2026-07-30', timeOfDay: '17:30' })).toEqual({});
  });

  it('never emits a key the patch did not name, so the merge cannot clobber siblings', () => {
    const result = plannerFieldPatchToContentJson({ caption: 'only this' });
    expect(Object.keys(result)).toEqual(['copy']);
    expect(Object.keys(result.copy as Record<string, unknown>)).toEqual(['caption']);
  });
});

describe('plannerDraftHasCopy', () => {
  it('is true only when a caption has real text', () => {
    expect(plannerDraftHasCopy({ copy: { caption: 'a caption' } })).toBe(true);
  });

  it('is false for an empty or whitespace caption', () => {
    expect(plannerDraftHasCopy({ copy: { caption: '' } })).toBe(false);
    expect(plannerDraftHasCopy({ copy: { caption: '   ' } })).toBe(false);
  });

  it('is false for a non-empty content_json that carries no caption', () => {
    // The regression that made /generate-copy refuse drafts it had never written:
    // a media-only attach populates content_json without producing any copy.
    expect(plannerDraftHasCopy({ publishingAssets: [{ role: 'single' }] })).toBe(false);
    expect(plannerDraftHasCopy({ content: { format: 'Reel' } })).toBe(false);
  });

  it('is false for empty, null and non-object input', () => {
    expect(plannerDraftHasCopy({})).toBe(false);
    expect(plannerDraftHasCopy(null)).toBe(false);
    expect(plannerDraftHasCopy(undefined)).toBe(false);
    expect(plannerDraftHasCopy('caption')).toBe(false);
    expect(plannerDraftHasCopy([{ copy: { caption: 'x' } }])).toBe(false);
  });

  it('is false when copy is present but not an object', () => {
    expect(plannerDraftHasCopy({ copy: 'a caption' })).toBe(false);
  });
});
