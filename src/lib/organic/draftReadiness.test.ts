import { describe, expect, it } from 'bun:test';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { evaluateDraftReadiness, hasDraftMedia } from './draftReadiness';

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

const storageAsset = {
  role: 'primary',
  kind: 'image' as const,
  storagePath: 'brand/asset.jpg',
  storageUrl: 'https://storage.example/asset.jpg',
};

describe('hasDraftMedia', () => {
  it('is false for a draft with no publishing assets and no media suggestion', () => {
    expect(hasDraftMedia(makeDraft())).toBe(false);
  });

  it('is true when a durable publishing asset is attached', () => {
    expect(hasDraftMedia(makeDraft({ publishingAssets: [storageAsset] }))).toBe(true);
  });

  it('is false when a publishing asset has no usable storage url', () => {
    const draft = makeDraft({
      publishingAssets: [{ ...storageAsset, storageUrl: '' }],
    });
    expect(hasDraftMedia(draft)).toBe(false);
  });

  it('is true for an agent media suggestion with an asset url', () => {
    const draft = makeDraft({ mediaSuggestion: { assetUrl: 'https://cdn/x.jpg' } });
    expect(hasDraftMedia(draft)).toBe(true);
  });

  it('is true when the media suggestion carries a reel url', () => {
    const draft = makeDraft({ mediaSuggestion: { reel: { url: 'https://cdn/r.mp4' } } });
    expect(hasDraftMedia(draft)).toBe(true);
  });

  it('is true when a suggestion asset entry has a signed url', () => {
    const draft = makeDraft({
      mediaSuggestion: { assets: [{ signedUrl: 'https://cdn/s.jpg' }] },
    });
    expect(hasDraftMedia(draft)).toBe(true);
  });

  it('is true when a hyperframe cover image exists', () => {
    const draft = makeDraft({
      mediaSuggestion: { hyperframe: { coverImageUrl: 'https://cdn/cover.jpg' } },
    });
    expect(hasDraftMedia(draft)).toBe(true);
  });
});

describe('evaluateDraftReadiness', () => {
  it('is not ready and flags both checks for an empty draft', () => {
    const result = evaluateDraftReadiness(makeDraft());
    expect(result.ready).toBe(false);
    const caption = result.checks.find((c) => c.id === 'caption');
    const media = result.checks.find((c) => c.id === 'media');
    expect(caption?.met).toBe(false);
    expect(media?.met).toBe(false);
    expect(result.reason).not.toBeNull();
  });

  it('treats a whitespace-only caption as missing', () => {
    const result = evaluateDraftReadiness(makeDraft({ captionPreview: '   \n  ' }));
    expect(result.checks.find((c) => c.id === 'caption')?.met).toBe(false);
  });

  it('is not ready with a caption but no media', () => {
    const result = evaluateDraftReadiness(makeDraft({ captionPreview: 'Hello world' }));
    expect(result.ready).toBe(false);
    expect(result.checks.find((c) => c.id === 'caption')?.met).toBe(true);
    expect(result.checks.find((c) => c.id === 'media')?.met).toBe(false);
  });

  it('is not ready with media but no caption', () => {
    const result = evaluateDraftReadiness(makeDraft({ publishingAssets: [storageAsset] }));
    expect(result.ready).toBe(false);
    expect(result.checks.find((c) => c.id === 'media')?.met).toBe(true);
    expect(result.checks.find((c) => c.id === 'caption')?.met).toBe(false);
  });

  it('is ready with both caption and at least one media asset', () => {
    const result = evaluateDraftReadiness(
      makeDraft({ captionPreview: 'Launch day', publishingAssets: [storageAsset] }),
    );
    expect(result.ready).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.checks.every((c) => c.met)).toBe(true);
  });

  it('is ready for an agent draft with caption and a media suggestion', () => {
    const result = evaluateDraftReadiness(
      makeDraft({
        captionPreview: 'From the agent',
        mediaSuggestion: { assetUrl: 'https://cdn/x.jpg' },
      }),
    );
    expect(result.ready).toBe(true);
  });
});
