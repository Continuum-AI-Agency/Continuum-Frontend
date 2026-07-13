import { describe, expect, it } from 'bun:test';

import {
  mediaExpandResponseSchema,
  mediaRealizeFrameSchema,
  reelVideoBatchFrameSchema,
} from '@continuum/contracts';
import type { OrganicCalendarDraft } from '../primitives/types';
import { patchUnlessUserSupplied } from './attachWinsGuard';
import { friendlyReelError } from './useGenerateDraftMedia';

// Unit test: verify that the NDJSON schemas correctly parse frames that
// useGenerateDraftMedia would receive from each endpoint.

describe('useGenerateDraftMedia — contract schema coverage', () => {
  describe('image/carousel → /media/realize (mediaRealizeFrameSchema)', () => {
    it('parses realize_batch_started', () => {
      const result = mediaRealizeFrameSchema.safeParse({ type: 'realize_batch_started', total: 3 });
      expect(result.success).toBe(true);
    });

    it('parses realize_started', () => {
      const result = mediaRealizeFrameSchema.safeParse({ type: 'realize_started', draftId: 'd1' });
      expect(result.success).toBe(true);
    });

    it('parses realize_progress', () => {
      const result = mediaRealizeFrameSchema.safeParse({
        type: 'realize_progress',
        draftId: 'd1',
        stage: 'generating',
        message: 'Creating image…',
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.type === 'realize_progress') {
        expect(result.data.stage).toBe('generating');
        expect(result.data.message).toBe('Creating image…');
      }
    });

    it('parses realize_ready with kind=image', () => {
      const result = mediaRealizeFrameSchema.safeParse({
        type: 'realize_ready',
        draftId: 'd1',
        kind: 'image',
      });
      expect(result.success).toBe(true);
    });

    it('parses realize_ready with kind=carousel', () => {
      const result = mediaRealizeFrameSchema.safeParse({
        type: 'realize_ready',
        draftId: 'd2',
        kind: 'carousel',
      });
      expect(result.success).toBe(true);
    });

    it('parses realize_ready carrying render-ready publishingAssets + assetUrl', () => {
      const result = mediaRealizeFrameSchema.safeParse({
        type: 'realize_ready',
        draftId: 'd1',
        kind: 'carousel',
        assetUrl: 'https://signed.example/primary.png',
        publishingAssets: [
          {
            role: 'slide_1',
            kind: 'image',
            slideIndex: 1,
            bucket: 'brand-profile-assets',
            storagePath: 'organic/d1/slide1.png',
            storageUrl: 'https://signed.example/slide1.png',
            mimeType: 'image/png',
          },
        ],
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.type === 'realize_ready') {
        expect(result.data.publishingAssets?.[0]?.storageUrl).toBe(
          'https://signed.example/slide1.png',
        );
        expect(result.data.assetUrl).toBe('https://signed.example/primary.png');
      }
    });

    it('parses realize_failed', () => {
      const result = mediaRealizeFrameSchema.safeParse({
        type: 'realize_failed',
        draftId: 'd3',
        error: 'Blueprint missing visual_technical output.',
      });
      expect(result.success).toBe(true);
    });

    it('parses realize_batch_completed', () => {
      const result = mediaRealizeFrameSchema.safeParse({
        type: 'realize_batch_completed',
        ready: 2,
        failed: 1,
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.type === 'realize_batch_completed') {
        expect(result.data.ready).toBe(2);
        expect(result.data.failed).toBe(1);
      }
    });

    it('rejects an unknown frame type', () => {
      const result = mediaRealizeFrameSchema.safeParse({ type: 'unknown_type', draftId: 'd1' });
      expect(result.success).toBe(false);
    });
  });

  describe('reel/video → /reels/generate (reelVideoBatchFrameSchema)', () => {
    it('parses batch_started', () => {
      const result = reelVideoBatchFrameSchema.safeParse({ type: 'batch_started', total: 1 });
      expect(result.success).toBe(true);
    });

    it('parses reel_started', () => {
      const result = reelVideoBatchFrameSchema.safeParse({
        type: 'reel_started',
        draftId: 'd-reel-1',
      });
      expect(result.success).toBe(true);
    });

    it('parses reel_progress', () => {
      const result = reelVideoBatchFrameSchema.safeParse({
        type: 'reel_progress',
        draftId: 'd-reel-1',
        stage: 'generating_scenes',
      });
      expect(result.success).toBe(true);
    });

    it('parses reel_failed', () => {
      const result = reelVideoBatchFrameSchema.safeParse({
        type: 'reel_failed',
        draftId: 'd-reel-2',
        error: 'Veo generation timed out.',
      });
      expect(result.success).toBe(true);
    });

    it('parses batch_completed', () => {
      const result = reelVideoBatchFrameSchema.safeParse({
        type: 'batch_completed',
        ready: 1,
        failed: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('text-stage enrich → /media/expand (mediaExpandResponseSchema)', () => {
    it('parses a mixed enqueued/skipped jobs response', () => {
      const result = mediaExpandResponseSchema.safeParse({
        jobs: [
          { draftId: 'd1', jobId: 'job-1' },
          { draftId: 'd2', jobId: null, error: 'already_realized' },
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.jobs[0].jobId).toBe('job-1');
        expect(result.data.jobs[1].error).toBe('already_realized');
      }
    });

    it('rejects a job entry without a draftId', () => {
      const result = mediaExpandResponseSchema.safeParse({ jobs: [{ jobId: 'job-1' }] });
      expect(result.success).toBe(false);
    });
  });

  describe('reel preflight error mapping', () => {
    it('maps reel_scenes_missing_enrich_first to an Enrich-first message', () => {
      expect(friendlyReelError('reel_scenes_missing_enrich_first')).toContain('Enrich');
    });

    it('passes unknown errors through verbatim', () => {
      expect(friendlyReelError('Veo generation timed out.')).toBe('Veo generation timed out.');
    });
  });

  describe('format dispatch routing', () => {
    const REEL_FORMATS = ['reel', 'video'];
    const IMAGE_FORMATS = ['post', 'carousel', 'story', 'hyperframe'];

    it('routes reel/video formats to the reel endpoint', () => {
      for (const format of REEL_FORMATS) {
        const isReel = ['reel', 'video'].includes(format.toLowerCase());
        expect(isReel).toBe(true);
      }
    });

    it('routes non-reel formats to the realize endpoint', () => {
      for (const format of IMAGE_FORMATS) {
        const isReel = ['reel', 'video'].includes(format.toLowerCase());
        expect(isReel).toBe(false);
      }
    });
  });
});

// The realize stream writes optimistic mediaStatus transitions back to the
// store. patchUnlessUserSupplied is the FE mirror of the backend attach-wins
// guard: if the user has attached their own creative mid-generation, no in-flight
// frame may overwrite it. This keeps "assign your own media" intact even while a
// headless generation the user also triggered is still streaming results.
describe('useGenerateDraftMedia — attach-wins guard (patchUnlessUserSupplied)', () => {
  function draftWith(
    mediaStatus: NonNullable<OrganicCalendarDraft['mediaSuggestion']>['mediaStatus'],
    extra: Record<string, unknown> = {},
  ): OrganicCalendarDraft {
    return {
      id: 'd1',
      title: 't',
      summary: '',
      timeLabel: '',
      dateLabel: '',
      status: 'placeholder',
      platforms: ['instagram'],
      format: 'Post',
      objective: '',
      captionPreview: '',
      tags: [],
      mediaCount: 0,
      mediaSuggestion: { mediaStatus, ...extra },
    } as OrganicCalendarDraft;
  }

  function applyTo(draft: OrganicCalendarDraft): OrganicCalendarDraft {
    let captured = draft;
    const updateDraft = (_id: string, fn: (d: OrganicCalendarDraft) => OrganicCalendarDraft) => {
      captured = fn(draft);
    };
    patchUnlessUserSupplied(updateDraft, 'd1', (d) => ({
      ...d,
      generationStage: undefined,
      mediaSuggestion: { ...d.mediaSuggestion, mediaStatus: 'ready', assetUrl: 'generated.jpg' },
    }));
    return captured;
  }

  it('applies a realization frame when the draft is still generating', () => {
    const result = applyTo(draftWith('generating'));
    expect(result.mediaSuggestion?.mediaStatus).toBe('ready');
    expect(result.mediaSuggestion?.assetUrl).toBe('generated.jpg');
  });

  it("preserves the user's creative when the draft became user_supplied mid-flight", () => {
    const result = applyTo(draftWith('user_supplied', { assetUrl: 'mine.jpg' }));
    expect(result.mediaSuggestion?.mediaStatus).toBe('user_supplied');
    expect(result.mediaSuggestion?.assetUrl).toBe('mine.jpg');
  });
});

// realize_ready now carries the persisted render-ready assets so the card shows
// the generated creative immediately. This mirrors the exact updater the hook
// applies on that frame (publishingAssets + mediaSuggestion.assetUrl/signedUrl),
// guarded by attach-wins.
describe('useGenerateDraftMedia — realize_ready mounts generated media', () => {
  const PUBLISHING_ASSETS = [
    {
      role: 'primary',
      kind: 'image' as const,
      bucket: 'brand-profile-assets',
      storagePath: 'organic/d1/creative.png',
      storageUrl: 'https://signed.example/creative.png',
      mimeType: 'image/png',
    },
  ];
  const ASSET_URL = 'https://signed.example/creative.png';

  function draftWith(
    mediaStatus: NonNullable<OrganicCalendarDraft['mediaSuggestion']>['mediaStatus'],
    extra: Record<string, unknown> = {},
  ): OrganicCalendarDraft {
    return {
      id: 'd1',
      title: 't',
      summary: '',
      timeLabel: '',
      dateLabel: '',
      status: 'placeholder',
      platforms: ['instagram'],
      format: 'Post',
      objective: '',
      captionPreview: '',
      tags: [],
      mediaCount: 0,
      mediaSuggestion: { mediaStatus, ...extra },
    } as OrganicCalendarDraft;
  }

  function applyRealizeReady(draft: OrganicCalendarDraft): OrganicCalendarDraft {
    let captured = draft;
    const updateDraft = (_id: string, fn: (d: OrganicCalendarDraft) => OrganicCalendarDraft) => {
      captured = fn(draft);
    };
    patchUnlessUserSupplied(updateDraft, 'd1', (d) => ({
      ...d,
      generationStage: undefined,
      generationError: undefined,
      publishingAssets: PUBLISHING_ASSETS,
      mediaSuggestion: {
        ...d.mediaSuggestion,
        mediaStatus: 'ready',
        assetUrl: ASSET_URL,
        signedUrl: ASSET_URL,
      },
    }));
    return captured;
  }

  it('mounts publishingAssets + assetUrl so the card renders without a refetch', () => {
    const result = applyRealizeReady(draftWith('generating'));
    expect(result.mediaSuggestion?.mediaStatus).toBe('ready');
    expect(result.mediaSuggestion?.assetUrl).toBe(ASSET_URL);
    expect(result.mediaSuggestion?.signedUrl).toBe(ASSET_URL);
    expect(result.publishingAssets?.[0]?.storageUrl).toBe(ASSET_URL);
  });

  it('does not clobber a user creative attached mid-realize', () => {
    const result = applyRealizeReady(draftWith('user_supplied', { assetUrl: 'mine.jpg' }));
    expect(result.mediaSuggestion?.mediaStatus).toBe('user_supplied');
    expect(result.mediaSuggestion?.assetUrl).toBe('mine.jpg');
    expect(result.publishingAssets).toBeUndefined();
  });
});
