import { describe, expect, it } from 'bun:test';
import {
  plannerCaptionTooLong,
  plannerDraftFieldPatchSchema,
  plannerDraftHasCopy,
  plannerFieldPatchToContentJson,
  plannerFieldPatchTouchesSchedule,
} from './planner-draft-edit';
import { checkPublishability, resolvePublishPlan } from './publish-plan';
import { CAPTION_MAX_ANY_PLATFORM } from './publishing';

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

  it('bounds the wire caption on the widest platform, and each platform on its own cap', () => {
    const widest = 'x'.repeat(CAPTION_MAX_ANY_PLATFORM);
    expect(plannerDraftFieldPatchSchema.safeParse({ caption: widest }).success).toBe(true);
    expect(plannerDraftFieldPatchSchema.safeParse({ caption: `${widest}x` }).success).toBe(false);
    // K6: a 2,500-character LinkedIn caption is legal; the same caption on Instagram is not.
    const linkedin = 'x'.repeat(2500);
    expect(plannerCaptionTooLong('linkedin', linkedin)).toBeNull();
    expect(plannerCaptionTooLong('instagram', linkedin)).toEqual({
      maxLength: 2200,
      length: 2500,
      message: 'Instagram captions are at most 2200 characters, hashtags included — this one is 2500',
    });
    expect(plannerCaptionTooLong('x', 'x'.repeat(281))?.maxLength).toBe(280);
  });

  it('refuses exactly one character over the limit, never at it', () => {
    expect(plannerCaptionTooLong('x', 'x'.repeat(280))).toBeNull();
    expect(plannerCaptionTooLong('x', 'x'.repeat(281))?.length).toBe(281);
  });

  // P6: the writer used to measure the body only, so a caption saved and showed "fits" that
  // approve then refused once its hashtags were added. It measures what is sent: body + tags.
  it('counts the hashtags, and refuses a hashtags-only edit that tips it over', () => {
    const body = 'x'.repeat(275);
    expect(plannerCaptionTooLong('x', body)).toBeNull();
    expect(plannerCaptionTooLong('x', body, ['#launch'])).toEqual({
      maxLength: 280,
      length: 284,
      message: 'X captions are at most 280 characters, hashtags included — this one is 284',
    });
  });

  it('agrees with the publish gate on every caption around the limit', () => {
    const platforms = ['x', 'instagram'] as const;
    for (const platform of platforms) {
      const max = platform === 'x' ? 280 : 2200;
      for (const tags of [null, ['#a'], { high: ['#launch', '#spring'], low: ['#sale'] }]) {
        for (let body = max - 30; body <= max + 2; body += 1) {
          const caption = 'w '.repeat(Math.ceil(body / 2)).slice(0, body);
          const writerRefuses = plannerCaptionTooLong(platform, caption, tags) !== null;
          const gate = resolvePublishPlan({
            draft: {
              id: 'd',
              formats: ['post'],
              caption,
              hashtags: Array.isArray(tags) ? { high: tags } : tags,
              publishingAssets: [],
              mediaSuggestion: null,
              savedPublishOptions: null,
            },
            platform,
            account: { boundAccountId: null, accounts: null },
            publishOptions: null,
            mediaGenerated: null,
          });
          const gateRefuses = checkPublishability(gate).blockers.some(
            (blocker) => blocker.reason === 'caption_too_long',
          );
          expect([platform, body, writerRefuses]).toEqual([platform, body, gateRefuses]);
        }
      }
    }
  });

  it('rejects an unknown key rather than silently dropping it', () => {
    const result = plannerDraftFieldPatchSchema.safeParse({ caption: 'hi', statuss: 'draft' });
    expect(result.success).toBe(false);
  });

  it('accepts per-platform publish options and refuses an option on an unknown platform', () => {
    expect(
      plannerDraftFieldPatchSchema.safeParse({
        publishOptions: { instagram: { firstComment: 'first!' } },
      }).success,
    ).toBe(true);
    expect(
      plannerDraftFieldPatchSchema.safeParse({ publishOptions: { threads: { firstComment: 'x' } } })
        .success,
    ).toBe(false);
    expect(
      plannerDraftFieldPatchSchema.safeParse({
        publishOptions: { instagram: { firstComment: '' } },
      }).success,
    ).toBe(false);
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

  it('maps the per-platform publish options map to content_json.publishOptions whole', () => {
    const publishOptions = {
      instagram: { firstComment: '#launch', thumbnail: { offsetMs: 3200 } },
      tiktok: { aiGenerated: true },
    };
    expect(plannerFieldPatchToContentJson({ publishOptions })).toEqual({ publishOptions });
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
