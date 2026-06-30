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
