import { describe, expect, it } from 'bun:test';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { evaluateDraftReadiness } from './draftReadiness';

function makeDraft(overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'draft-1',
    title: 'New Instagram post',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Jun 15',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'Manual',
    captionPreview: '',
    tags: [],
    mediaCount: 0,
    ...overrides,
  };
}

const image = {
  role: 'primary',
  kind: 'image' as const,
  storagePath: 'brand/asset.jpg',
  storageUrl: 'https://storage.example/asset.jpg',
};
const video = {
  role: 'primary',
  kind: 'video' as const,
  storagePath: 'brand/clip.mp4',
  storageUrl: 'https://storage.example/clip.mp4',
  mimeType: 'video/mp4',
};

const reasons = (draft: OrganicCalendarDraft) =>
  evaluateDraftReadiness(draft).blockers.map((issue) => issue.reason);
const fixes = (draft: OrganicCalendarDraft) =>
  evaluateDraftReadiness(draft).blockers.map((issue) => issue.fix);

describe('evaluateDraftReadiness — the shared publish gate', () => {
  it('flags caption and media on an empty post, each pointing at its fix', () => {
    const readiness = evaluateDraftReadiness(makeDraft());
    expect(readiness.ready).toBe(false);
    expect(fixes(makeDraft()).sort()).toEqual(['caption', 'media']);
    expect(readiness.reason).toContain('caption');
  });

  it('is ready with a caption and an image', () => {
    const readiness = evaluateDraftReadiness(
      makeDraft({ captionPreview: 'Hello', publishingAssets: [image] }),
    );
    expect(readiness).toEqual({ ready: true, blockers: [], reason: null });
  });

  it('treats a whitespace-only caption as missing', () => {
    expect(reasons(makeDraft({ captionPreview: '   ', publishingAssets: [image] }))).toEqual([
      'caption_missing',
    ]);
  });

  // The backend signs bucket + storagePath; an expired or empty signed URL is not missing media.
  it('counts an attached asset whose signed url is empty', () => {
    expect(
      evaluateDraftReadiness(
        makeDraft({ captionPreview: 'Hi', publishingAssets: [{ ...image, storageUrl: '' }] }),
      ).ready,
    ).toBe(true);
  });

  it('ignores leftover generated URLs while media is generating', () => {
    expect(
      reasons(
        makeDraft({
          captionPreview: 'Hi',
          mediaSuggestion: { mediaStatus: 'generating', assetUrl: 'https://old.example/a.png' },
        }),
      ),
    ).toEqual(['media_missing']);
  });

  it('never needs an account here: cards hold no account list', () => {
    expect(reasons(makeDraft({ captionPreview: 'Hi', publishingAssets: [image] }))).not.toContain(
      'account_missing',
    );
  });
});

describe('evaluateDraftReadiness — stories', () => {
  it('needs no caption, only media', () => {
    expect(reasons(makeDraft({ format: 'Story' }))).toEqual(['media_missing']);
    expect(
      evaluateDraftReadiness(makeDraft({ format: 'story', publishingAssets: [image] })).ready,
    ).toBe(true);
  });
});

describe('evaluateDraftReadiness — media kind', () => {
  it('blocks a reel that only has an image', () => {
    expect(
      reasons(makeDraft({ format: 'Reel', captionPreview: 'Hi', publishingAssets: [image] })),
    ).toEqual(['media_missing']);
  });

  it('passes a reel that has a video', () => {
    expect(
      evaluateDraftReadiness(
        makeDraft({ format: 'Reel', captionPreview: 'Hi', publishingAssets: [video] }),
      ).ready,
    ).toBe(true);
  });

  it('blocks a hyperframe until its mp4 is rendered, then passes', () => {
    const hyperframe = (mp4Status: 'pending' | 'ready') =>
      makeDraft({
        format: 'hyperframe',
        captionPreview: 'Hi',
        mediaSuggestion: {
          mediaStatus: 'ready',
          hyperframe: { mp4Status, mp4Path: 'hf/a.mp4', coverPath: 'hf/a.png' },
        },
      });
    expect(reasons(hyperframe('pending'))).toEqual(['hyperframe_mp4_not_ready']);
    expect(evaluateDraftReadiness(hyperframe('ready')).ready).toBe(true);
  });

  it('blocks a YouTube video without a video, and a YouTube photo post outright', () => {
    const youtube = (format: string) =>
      makeDraft({ platforms: ['youtube'], format, captionPreview: 'Hi', publishingAssets: [image] });
    expect(reasons(youtube('Reel'))).toEqual(['media_missing']);
    expect(fixes(youtube('Post'))).toContain('format');
  });

  it('lets a one-image carousel through only once it has two slides', () => {
    const carousel = (slides: number) =>
      makeDraft({
        format: 'Carousel',
        captionPreview: 'Hi',
        publishingAssets: Array.from({ length: slides }, (_, index) => ({
          ...image,
          storagePath: `brand/${index}.jpg`,
          slideIndex: index,
        })),
      });
    expect(reasons(carousel(1))).toEqual(['media_missing']);
    expect(evaluateDraftReadiness(carousel(2)).ready).toBe(true);
  });

  it('lets a text post through on Facebook and LinkedIn', () => {
    for (const platform of ['facebook', 'linkedin'] as const) {
      expect(
        evaluateDraftReadiness(makeDraft({ platforms: [platform], captionPreview: 'Hi' })).ready,
      ).toBe(true);
    }
  });
});

describe('evaluateDraftReadiness — several platforms', () => {
  // Approve fans the draft out into one row per platform; each row meets its own gate.
  it('is ready only when every selected platform is', () => {
    const draft = makeDraft({
      platforms: ['facebook', 'youtube'],
      format: 'Reel',
      captionPreview: 'Hi',
      publishingAssets: [image],
    });
    // One item per fix: both platforms want a video, and the line says so once.
    expect(reasons(draft)).toEqual(['media_missing']);
  });
});
