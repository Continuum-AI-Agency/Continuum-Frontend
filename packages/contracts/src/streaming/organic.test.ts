import { describe, expect, it } from 'bun:test';
import {
  creativeBriefSchema,
  hasApprovablePreview,
  organicMediaCheckpointSchema,
  organicStreamFrameSchema,
  pipelineStageEnum,
  planItemSchema,
  proposedPlanSchema,
  resolveOrganicGenerationDisplay,
} from './organic';

describe('organic pipeline frames', () => {
  it('accepts a pipeline.stage frame through the discriminated union', () => {
    const frame = {
      type: 'pipeline.stage',
      data: {
        jobId: 'job_1',
        brandId: 'brand_1',
        planId: 'plan_1',
        planItemId: 'item_1',
        stage: 'draft',
        agentName: 'creative',
        pct: 45,
        status: 'active',
      },
    };
    const parsed = organicStreamFrameSchema.safeParse(frame);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'pipeline.stage') {
      expect(parsed.data.data.stage).toBe('draft');
    }
  });

  it('rejects an out-of-enum pipeline stage', () => {
    const parsed = organicStreamFrameSchema.safeParse({
      type: 'pipeline.stage',
      data: { jobId: 'j', brandId: 'b', stage: 'not_a_stage' },
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a terminal ui.pipeline_card frame with preview + quality', () => {
    const frame = {
      type: 'ui.pipeline_card',
      data: {
        jobId: 'job_1',
        brandId: 'brand_1',
        planId: 'plan_1',
        planItemId: 'item_1',
        platform: 'instagram',
        status: 'completed',
        currentStage: 'merge',
        preview: { caption: 'hi', imageUrl: null, format: 'carousel' },
        quality: { passed: true, overallScore: 88, brandFitScore: 90 },
        draftId: 'draft_1',
      },
    };
    expect(organicStreamFrameSchema.safeParse(frame).success).toBe(true);
  });

  it('carries the approved preview revision and requires a draft id on blueprint-ready frames', () => {
    expect(
      organicStreamFrameSchema.safeParse({
        type: 'ui.pipeline_card',
        data: {
          jobId: 'job_1',
          brandId: 'brand_1',
          status: 'completed',
          draftId: 'draft_1',
          checkpoint: {
            textReady: true,
            blueprintReady: true,
            mediaStatus: 'pending',
            awaitingMediaChoice: true,
            previewRevision: 'preview_1',
          },
        },
      }).success,
    ).toBe(true);
    expect(
      organicStreamFrameSchema.safeParse({
        type: 'draft.blueprint_ready',
        data: { jobId: 'job_1', brandId: 'brand_1', previewRevision: 'preview_1' },
      }).success,
    ).toBe(false);
  });

  // Bug #220. previews and previewRevision fail INDEPENDENTLY: preview signing can miss
  // while the blueprint (and the approval token realize validates) succeeded. The frame
  // contract must accept that shape, so no consumer is entitled to treat `previews` as
  // the carrier for the token and drop the frame when the list is empty.
  it('accepts a blueprint-ready frame that carries the token but no previews', () => {
    for (const previews of [undefined, []]) {
      expect(
        organicStreamFrameSchema.safeParse({
          type: 'draft.blueprint_ready',
          data: {
            jobId: 'job_1',
            brandId: 'brand_1',
            draftId: 'draft_1',
            previewRevision: 'preview_1',
            ...(previews ? { previews } : {}),
          },
        }).success,
      ).toBe(true);
    }
  });

  it('rejects a blueprint-ready frame with previews but no approval token', () => {
    expect(
      organicStreamFrameSchema.safeParse({
        type: 'draft.blueprint_ready',
        data: {
          jobId: 'job_1',
          brandId: 'brand_1',
          draftId: 'draft_1',
          previews: [{ role: 'scene_1', signedUrl: 'https://cdn/1.png' }],
        },
      }).success,
    ).toBe(false);
  });
});

// The checkpoint shape is shared by the live ui.pipeline_card frame and the FE's
// restored/durable-hydrated card state. One named schema plus one canonical predicate is
// what keeps `previewRevision` from existing on one side and not the other (#220).
describe('organic media checkpoint', () => {
  it('parses the same checkpoint shape the pipeline card frame carries', () => {
    const checkpoint = {
      textReady: true,
      blueprintReady: true,
      mediaStatus: 'pending' as const,
      awaitingMediaChoice: true,
      previewRevision: 'preview_1',
    };
    expect(organicMediaCheckpointSchema.safeParse(checkpoint).success).toBe(true);
    expect(
      organicStreamFrameSchema.safeParse({
        type: 'ui.pipeline_card',
        data: {
          jobId: 'job_1',
          brandId: 'brand_1',
          status: 'completed',
          draftId: 'draft_1',
          checkpoint,
        },
      }).success,
    ).toBe(true);
  });

  it('keeps previewRevision optional — the checkpoint predates the blueprint', () => {
    expect(organicMediaCheckpointSchema.safeParse({ textReady: true }).success).toBe(true);
  });

  it('rejects an empty previewRevision rather than passing a useless token through', () => {
    expect(
      organicMediaCheckpointSchema.safeParse({ textReady: true, previewRevision: '' }).success,
    ).toBe(false);
  });

  it('reports an approvable preview only when a non-empty token is present', () => {
    expect(hasApprovablePreview({ previewRevision: 'preview_1' })).toBe(true);
    expect(hasApprovablePreview({ previewRevision: '' })).toBe(false);
    expect(hasApprovablePreview({ previewRevision: null })).toBe(false);
    expect(hasApprovablePreview({})).toBe(false);
    expect(hasApprovablePreview(undefined)).toBe(false);
    expect(hasApprovablePreview(null)).toBe(false);
  });

  it('allows minimal pipeline.stage data (loose, optional fields omitted)', () => {
    const parsed = organicStreamFrameSchema.safeParse({
      type: 'pipeline.stage',
      data: { jobId: 'j', brandId: 'b', stage: 'strategist' },
    });
    expect(parsed.success).toBe(true);
  });

  it('exposes the canonical stages in order, including the Stage-2 blueprint', () => {
    expect(pipelineStageEnum.options).toEqual([
      'strategist',
      'concept',
      'draft',
      'blueprint',
      'assets',
      'quality',
      'merge',
    ]);
  });

  it('accepts a media.search_results frame through the discriminated union', () => {
    const frame = {
      type: 'media.search_results',
      data: {
        query: 'bright summer product shot',
        mode: 'text',
        items: [
          {
            asset: {
              id: 'asset_1',
              brandId: 'brand_1',
              kind: 'image',
              bucket: 'media-library',
              storagePath: 'brand_1/photo.png',
              fileName: 'photo.png',
              mimeType: 'image/png',
              source: 'upload',
              status: 'ready',
              tags: ['summer', 'product'],
              detectedObjects: [],
              hasImageEmbedding: false,
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
            similarity: 0.87,
          },
        ],
      },
    };
    const parsed = organicStreamFrameSchema.safeParse(frame);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'media.search_results') {
      expect(parsed.data.data.items).toHaveLength(1);
    }
  });

  it('accepts a context.media_resolution frame reporting partial grab resolution', () => {
    const frame = {
      type: 'context.media_resolution',
      data: {
        requested: 3,
        resolvedImages: 1,
        resolvedVideos: 1,
        textOnly: 1,
        failed: [{ refId: 'asset_9', type: 'media_asset', reason: 'storage_miss' }],
      },
    };
    const parsed = organicStreamFrameSchema.safeParse(frame);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'context.media_resolution') {
      expect(parsed.data.data.requested).toBe(3);
      expect(parsed.data.data.failed).toHaveLength(1);
    }
  });

  it('accepts a context.media_resolution frame with no failures (defaults failed to [])', () => {
    const parsed = organicStreamFrameSchema.safeParse({
      type: 'context.media_resolution',
      data: { requested: 2, resolvedImages: 2, resolvedVideos: 0, textOnly: 0 },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'context.media_resolution') {
      expect(parsed.data.data.failed).toEqual([]);
    }
  });

  it('validates a per-item creative brief', () => {
    const brief = {
      contentObjective: 'drive saves',
      targetAudience: 'gen-z students',
      angle: 'back to school hacks',
      trendIntegration: null,
      toneAndVoice: 'playful',
      formatSuggestion: 'carousel',
      productionNotes: ['bright palette'],
    };
    expect(creativeBriefSchema.safeParse(brief).success).toBe(true);
  });
});

describe('canonical plan schemas', () => {
  const validItem = {
    itemId: 'item-1',
    kind: 'create_post',
    platform: 'instagram',
    scheduledAt: '2026-06-01T12:00:00.000Z',
    format: 'hyperframe',
    trendId: null,
    trendTitle: null,
    angle: 'back to school',
    objective: 'save',
    audienceSegment: 'students',
    rationale: 'evidence-cited',
    guidancePrompt: null,
    draftId: null,
  };

  const validPlan = {
    planId: 'plan-1',
    sessionId: 'sess-1',
    brandId: 'brand-1',
    userId: 'user-1',
    weekStart: '2026-06-01',
    title: 'Week plan',
    summary: 'overview',
    items: [validItem],
    estimatedDurationSeconds: 120,
    createdAt: '2026-06-01T00:00:00.000Z',
  };

  it('accepts a full proposed plan and applies defaults', () => {
    const parsed = proposedPlanSchema.safeParse(validPlan);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('proposed');
      expect(parsed.data.evidence).toEqual([]);
      expect(parsed.data.items[0].status).toBe('pending');
      expect(parsed.data.items[0].creativeBrief).toBeNull();
      // Legacy 'hyperframe' format normalizes to 'reel' — HyperFrame is a
      // video-production method, not a selectable post type.
      expect(parsed.data.items[0].format).toBe('reel');
    }
  });

  it('tolerates an unknown extra field (strips, does not reject)', () => {
    const parsed = proposedPlanSchema.safeParse({ ...validPlan, somethingNew: true });
    expect(parsed.success).toBe(true);
  });

  it('rejects an item missing itemId', () => {
    const { itemId, ...itemNoId } = validItem;
    void itemId;
    const parsed = proposedPlanSchema.safeParse({ ...validPlan, items: [itemNoId] });
    expect(parsed.success).toBe(false);
  });

  it('coerces a non-uuid trendId to null', () => {
    const parsed = planItemSchema.safeParse({ ...validItem, trendId: 'not-a-uuid-slug' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.trendId).toBeNull();
  });
});

describe('post format — HyperFrame is not a selectable post type', () => {
  const validItem = {
    itemId: 'item-1',
    kind: 'create_post',
    platform: 'instagram',
    scheduledAt: '2026-06-01T12:00:00.000Z',
    format: 'post',
    trendId: null,
    trendTitle: null,
    angle: 'back to school',
    objective: 'save',
    audienceSegment: 'students',
    rationale: 'evidence-cited',
    guidancePrompt: null,
    draftId: null,
  };

  it.each(['reel', 'post', 'carousel', 'story'])('accepts canonical format %s', (format) => {
    const parsed = planItemSchema.safeParse({ ...validItem, format });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.format).toBe(format);
  });

  it('normalizes a legacy hyperframe plan-item format to reel', () => {
    const parsed = planItemSchema.safeParse({ ...validItem, format: 'hyperframe' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.format).toBe('reel');
  });

  it('keeps a null plan-item format', () => {
    const parsed = planItemSchema.safeParse({ ...validItem, format: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.format).toBeNull();
  });

  it('rejects a truly invalid plan-item format', () => {
    const parsed = planItemSchema.safeParse({ ...validItem, format: 'tweet' });
    expect(parsed.success).toBe(false);
  });

  it('normalizes a legacy hyperframe creativeBrief formatSuggestion to reel', () => {
    const parsed = creativeBriefSchema.safeParse({
      contentObjective: 'drive saves',
      targetAudience: 'gen-z students',
      angle: 'back to school hacks',
      trendIntegration: null,
      toneAndVoice: 'playful',
      formatSuggestion: 'hyperframe',
      productionNotes: ['bright palette'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.formatSuggestion).toBe('reel');
  });
});

describe('response retry frames (chat retry R1)', () => {
  it('accepts a response.retrying frame through the discriminated union', () => {
    const parsed = organicStreamFrameSchema.safeParse({
      type: 'response.retrying',
      data: { attempt: 2, reason: 'provider_overloaded' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'response.retrying') {
      expect(parsed.data.data.attempt).toBe(2);
      expect(parsed.data.data.reason).toBe('provider_overloaded');
    }
  });

  it('accepts a response.retrying frame without a reason', () => {
    const parsed = organicStreamFrameSchema.safeParse({
      type: 'response.retrying',
      data: { attempt: 1 },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a response.retrying frame missing attempt', () => {
    expect(
      organicStreamFrameSchema.safeParse({ type: 'response.retrying', data: {} }).success,
    ).toBe(false);
  });

  it('accepts a response.error frame with optional code + transient', () => {
    const parsed = organicStreamFrameSchema.safeParse({
      type: 'response.error',
      data: { message: 'boom', code: 'provider_overloaded', transient: true },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'response.error') {
      expect(parsed.data.data.code).toBe('provider_overloaded');
      expect(parsed.data.data.transient).toBe(true);
    }
  });

  it('keeps a plain response.error frame valid (code/transient optional)', () => {
    expect(
      organicStreamFrameSchema.safeParse({
        type: 'response.error',
        data: { message: 'boom' },
      }).success,
    ).toBe(true);
  });

  it('rejects a non-boolean transient on response.error', () => {
    expect(
      organicStreamFrameSchema.safeParse({
        type: 'response.error',
        data: { message: 'boom', transient: 'yes' },
      }).success,
    ).toBe(false);
  });
});

describe('response.cancelled frame', () => {
  it('accepts the exact shape the Backend emits on user cancellation', () => {
    const parsed = organicStreamFrameSchema.safeParse({
      type: 'response.cancelled',
      data: { message: 'Run cancelled' },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a bare response.cancelled frame (data optional)', () => {
    expect(organicStreamFrameSchema.safeParse({ type: 'response.cancelled' }).success).toBe(true);
  });
});

describe('generation display labels never disguise a gap as progress', () => {
  it('reports a failed mediaStage as an error, not as Working', () => {
    const display = resolveOrganicGenerationDisplay({ status: 'running', mediaStage: 'failed' });
    expect(display.tone).toBe('error');
    expect(display.label).toBe('Media failed');
  });

  it('marks a running row with no stage data distinctly from staged progress', () => {
    const display = resolveOrganicGenerationDisplay({ status: 'running' });
    expect(display.label).toBe('Working (no stage data)');
    expect(display.tone).toBe('active');
  });

  it('keeps staged running labels unchanged', () => {
    expect(resolveOrganicGenerationDisplay({ status: 'running', stage: 'assets' }).label).toBe(
      'Generating media',
    );
    expect(
      resolveOrganicGenerationDisplay({ status: 'running', mediaStage: 'realizing' }).label,
    ).toBe('Generating media');
  });
});
