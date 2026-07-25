import { describe, expect, it } from 'bun:test';

import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { summarizeDraftMedia } from './draftMediaSummary';

const baseDraft = (overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft => ({
  id: 'd1',
  title: 't',
  summary: '',
  timeLabel: '9:00 AM',
  dateLabel: 'Mon, Apr 21',
  status: 'draft',
  platforms: ['instagram'],
  format: 'Post',
  objective: 'Draft',
  captionPreview: '',
  tags: [],
  mediaCount: 0,
  ...overrides,
});

describe('summarizeDraftMedia', () => {
  it('reports no media for an empty draft', () => {
    const summary = summarizeDraftMedia(baseDraft());
    expect(summary.label).toBe('No media yet');
    expect(summary.reusable).toHaveLength(0);
    expect(summary.imageCount).toBe(0);
    expect(summary.videoCount).toBe(0);
  });

  it('counts realized images from publishingAssets ordered by slideIndex', () => {
    const summary = summarizeDraftMedia(
      baseDraft({
        publishingAssets: [
          {
            role: 'primary',
            kind: 'image',
            slideIndex: 1,
            storagePath: 'p1.jpg',
            storageUrl: 'https://cdn/p1.jpg',
          },
          {
            role: 'primary',
            kind: 'image',
            slideIndex: 0,
            storagePath: 'p0.jpg',
            storageUrl: 'https://cdn/p0.jpg',
          },
        ],
      }),
    );
    expect(summary.imageCount).toBe(2);
    expect(summary.carouselSlides).toBe(2);
    expect(summary.label).toBe('2 images');
    expect(summary.reusable.map((item) => item.url)).toEqual([
      'https://cdn/p0.jpg',
      'https://cdn/p1.jpg',
    ]);
    expect(summary.reusable.every((item) => item.source === 'realized')).toBe(true);
  });

  it('counts a realized video from publishingAssets', () => {
    const summary = summarizeDraftMedia(
      baseDraft({
        publishingAssets: [
          { role: 'primary', kind: 'video', storagePath: 'v.mp4', storageUrl: 'https://cdn/v.mp4' },
        ],
      }),
    );
    expect(summary.videoCount).toBe(1);
    expect(summary.label).toBe('1 video');
  });

  it('falls back to mediaSuggestion.assets when no publishingAssets exist', () => {
    const summary = summarizeDraftMedia(
      baseDraft({
        mediaSuggestion: {
          assets: [{ assetUrl: 'https://cdn/a0.jpg' }, { signedUrl: 'https://cdn/a1.jpg' }],
        },
      }),
    );
    expect(summary.imageCount).toBe(2);
    expect(summary.label).toBe('2 images');
  });

  it('surfaces a reel as a reusable video', () => {
    const summary = summarizeDraftMedia(
      baseDraft({
        mediaSuggestion: { reel: { signedUrl: 'https://cdn/reel.mp4' } },
      }),
    );
    expect(summary.videoCount).toBe(1);
    expect(summary.label).toBe('1 video');
    expect(summary.reusable[0]).toMatchObject({ source: 'reel', kind: 'video' });
  });

  it('reports blueprint frames as reusable when no realized media exists', () => {
    const summary = summarizeDraftMedia(
      baseDraft({
        mediaSuggestion: {
          mediaStatus: 'pending',
          storyboard: [
            { storageUrl: 'https://signed/1.png' },
            { storageUrl: 'https://signed/2.png' },
          ],
        },
      }),
    );
    expect(summary.blueprintFrames).toBe(2);
    expect(summary.imageCount).toBe(0);
    expect(summary.label).toBe('Blueprint: 2 frames');
    expect(summary.reusable.every((item) => item.source === 'blueprint')).toBe(true);
  });

  it('drops blueprint frames from reuse once realized media exists, and combines counts', () => {
    const summary = summarizeDraftMedia(
      baseDraft({
        publishingAssets: [
          {
            role: 'primary',
            kind: 'image',
            slideIndex: 0,
            storagePath: 'p0.jpg',
            storageUrl: 'https://cdn/p0.jpg',
          },
        ],
        mediaSuggestion: {
          reel: { url: 'https://cdn/reel.mp4' },
          storyboard: [{ storageUrl: 'https://signed/1.png' }],
        },
      }),
    );
    expect(summary.imageCount).toBe(1);
    expect(summary.videoCount).toBe(1);
    expect(summary.label).toBe('1 image · 1 video');
    expect(summary.reusable.some((item) => item.source === 'blueprint')).toBe(false);
  });
});

// A user-attached video lands in BOTH the realized publishingAssets and
// `mediaSuggestion.reel` — the same file, twice — which is why the inventory
// reported "2 videos" for one attached video.
describe('summarizeDraftMedia — one video counted once', () => {
  const attachedVideoDraft = () =>
    baseDraft({
      publishingAssets: [
        {
          role: 'primary',
          kind: 'video',
          storagePath: 'library/clip.mp4',
          storageUrl: 'https://cdn/clip.mp4?sig=asset',
        },
      ],
      mediaSuggestion: {
        kind: 'reel',
        mediaStatus: 'user_supplied',
        reel: {
          generated: true,
          url: 'library/clip.mp4',
          bucket: 'brand-profile-assets',
          signedUrl: 'https://cdn/clip.mp4?sig=reel',
          durationSec: 12,
        },
      },
    });

  it('reads as "1 video", not two', () => {
    const summary = summarizeDraftMedia(attachedVideoDraft());
    expect(summary.videoCount).toBe(1);
    expect(summary.label).toBe('1 video');
  });

  it('keeps a single reusable entry, the realized one', () => {
    const summary = summarizeDraftMedia(attachedVideoDraft());
    expect(summary.reusable).toHaveLength(1);
    expect(summary.reusable[0].source).toBe('realized');
    expect(summary.reusable[0].url).toBe('https://cdn/clip.mp4?sig=asset');
  });

  it('still surfaces a reel that has no publishing asset, with a renderable URL', () => {
    const summary = summarizeDraftMedia(
      baseDraft({
        mediaSuggestion: {
          kind: 'reel',
          mediaStatus: 'ready',
          reel: {
            generated: true,
            url: 'organic/generated.mp4',
            signedUrl: 'https://cdn/generated.mp4?sig=reel',
            durationSec: 8,
          },
        },
      }),
    );
    expect(summary.videoCount).toBe(1);
    expect(summary.reusable).toHaveLength(1);
    expect(summary.reusable[0].url).toBe('https://cdn/generated.mp4?sig=reel');
  });

  it('does not collapse two genuinely different videos', () => {
    const summary = summarizeDraftMedia(
      baseDraft({
        publishingAssets: [
          {
            role: 'primary',
            kind: 'video',
            storagePath: 'library/a.mp4',
            storageUrl: 'https://cdn/a.mp4',
          },
        ],
        mediaSuggestion: {
          reel: {
            generated: true,
            url: 'organic/b.mp4',
            signedUrl: 'https://cdn/b.mp4',
            durationSec: 4,
          },
        },
      }),
    );
    expect(summary.videoCount).toBe(2);
    expect(summary.label).toBe('2 videos');
  });
});
