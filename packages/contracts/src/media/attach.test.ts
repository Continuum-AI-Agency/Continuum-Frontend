import { describe, expect, it } from 'bun:test';
import { resolvePublishFormat } from '../organic/publish-body';
import type { MediaAsset } from './asset';
import {
  type CreativeRef,
  creativeRefFromAsset,
  creativeRefSchema,
  findMultiVideoSelectionError,
  publishFormatForAssetKinds,
  shapeUserSuppliedMedia,
} from './attach';

function imageRef(overrides: Partial<CreativeRef> = {}): CreativeRef {
  return {
    assetId: 'asset-img',
    bucket: 'brand-profile-assets',
    storagePath: 'library/img.png',
    kind: 'image',
    mimeType: 'image/png',
    signedUrl: 'https://signed.example/img.png',
    ...overrides,
  };
}

function videoRef(overrides: Partial<CreativeRef> = {}): CreativeRef {
  return {
    assetId: 'asset-vid',
    bucket: 'brand-profile-assets',
    storagePath: 'library/clip.mp4',
    kind: 'video',
    mimeType: 'video/mp4',
    signedUrl: 'https://signed.example/clip.mp4',
    durationSec: 12,
    ...overrides,
  };
}

describe('creativeRefSchema — poster at the boundary', () => {
  it('accepts thumbnailUrl (the schema is .strict(), so it must be declared)', () => {
    const parsed = creativeRefSchema.safeParse({
      ...videoRef(),
      thumbnailUrl: 'https://signed.example/clip-poster.jpg',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.thumbnailUrl).toBe('https://signed.example/clip-poster.jpg');
    }
  });

  it('still rejects an undeclared key', () => {
    const parsed = creativeRefSchema.safeParse({ ...videoRef(), posterUrl: 'https://x/y.jpg' });
    expect(parsed.success).toBe(false);
  });

  it('carries a library asset thumbnail through creativeRefFromAsset', () => {
    const asset = {
      id: 'asset-vid',
      bucket: 'brand-profile-assets',
      storagePath: 'library/clip.mp4',
      kind: 'video',
      mimeType: 'video/mp4',
      signedUrl: 'https://signed.example/clip.mp4',
      thumbnailUrl: 'https://signed.example/clip-poster.jpg',
      durationMs: 12_000,
    } as unknown as MediaAsset;

    const ref = creativeRefFromAsset(asset);
    expect(ref.thumbnailUrl).toBe('https://signed.example/clip-poster.jpg');
    expect(ref.durationSec).toBe(12);
  });

  it('leaves thumbnailUrl undefined when the asset has none', () => {
    const asset = {
      id: 'asset-img',
      bucket: 'brand-profile-assets',
      storagePath: 'library/img.png',
      kind: 'image',
      mimeType: 'image/png',
      signedUrl: 'https://signed.example/img.png',
      thumbnailUrl: null,
    } as unknown as MediaAsset;

    expect(creativeRefFromAsset(asset).thumbnailUrl).toBeUndefined();
  });
});

describe('findMultiVideoSelectionError', () => {
  it('reports two videos rather than letting them be truncated', () => {
    expect(findMultiVideoSelectionError([videoRef(), videoRef({ assetId: 'asset-vid-2' })])).toBe(
      'Only one video per post',
    );
  });

  it('allows a single video, and any number of images', () => {
    expect(findMultiVideoSelectionError([videoRef()])).toBeNull();
    expect(
      findMultiVideoSelectionError([
        imageRef(),
        imageRef({ assetId: 'i2' }),
        imageRef({ assetId: 'i3' }),
      ]),
    ).toBeNull();
  });
});

describe('shapeUserSuppliedMedia — video', () => {
  it('fills the reel slot and carries the poster into it', () => {
    const { mediaSuggestionPatch, publishingAssets } = shapeUserSuppliedMedia([
      videoRef({ thumbnailUrl: 'https://signed.example/clip-poster.jpg' }),
    ]);

    expect(publishingAssets).toHaveLength(1);
    expect(publishingAssets[0].kind).toBe('video');
    expect(publishingAssets[0].storageUrl).toBe('https://signed.example/clip.mp4');
    expect(mediaSuggestionPatch.kind).toBe('reel');
    expect(mediaSuggestionPatch.mediaStatus).toBe('user_supplied');
    expect(mediaSuggestionPatch.reel?.signedUrl).toBe('https://signed.example/clip.mp4');
    expect(mediaSuggestionPatch.reel?.url).toBe('library/clip.mp4');
    expect(mediaSuggestionPatch.reel?.thumbnailUrl).toBe('https://signed.example/clip-poster.jpg');
  });

  it('nulls the reel poster when the library asset has no thumbnail', () => {
    const { mediaSuggestionPatch } = shapeUserSuppliedMedia([videoRef()]);
    expect(mediaSuggestionPatch.reel?.thumbnailUrl).toBeNull();
  });

  /**
   * The landmine: the patch is SPREAD over the existing mediaSuggestion, so a key that
   * is merely absent leaves the previous generation's media in place. A video attach
   * that omits `assetUrl` leaves a generated image visible behind the new video.
   */
  it('NULLS every image slot rather than omitting it (absent ≠ cleared)', () => {
    const { mediaSuggestionPatch } = shapeUserSuppliedMedia([videoRef()]);

    for (const key of ['url', 'assetUrl', 'signedUrl', 'assets', 'assetBase64', 'hyperframe']) {
      expect(Object.hasOwn(mediaSuggestionPatch, key)).toBe(true);
      expect(mediaSuggestionPatch[key as 'assetUrl']).toBeNull();
    }
  });

  it('leaves no generated image behind once the patch is merged onto a prior generation', () => {
    const generated = {
      kind: 'image' as const,
      mediaStatus: 'ready' as const,
      url: 'organic/generated.png',
      assetUrl: 'https://signed.example/generated.png',
      signedUrl: 'https://signed.example/generated.png',
      assetBase64: 'data:image/png;base64,AAAA',
    };
    const { mediaSuggestionPatch } = shapeUserSuppliedMedia([videoRef()]);
    const merged = { ...generated, ...mediaSuggestionPatch };

    expect(merged.assetUrl).toBeNull();
    expect(merged.url).toBeNull();
    expect(merged.signedUrl).toBeNull();
    expect(merged.assetBase64).toBeNull();
    expect(merged.reel?.signedUrl).toBe('https://signed.example/clip.mp4');
  });

  it('throws on a two-video selection instead of silently keeping only the first', () => {
    expect(() =>
      shapeUserSuppliedMedia([videoRef(), videoRef({ assetId: 'asset-vid-2' })]),
    ).toThrow(/Only one video per post/);
  });
});

describe('shapeUserSuppliedMedia — images', () => {
  it('clears the reel when a single image replaces a video', () => {
    const { mediaSuggestionPatch } = shapeUserSuppliedMedia([imageRef()]);
    expect(mediaSuggestionPatch.kind).toBe('image');
    expect(mediaSuggestionPatch.reel).toBeNull();
    expect(mediaSuggestionPatch.assets).toBeNull();
    expect(mediaSuggestionPatch.url).toBe('library/img.png');
    expect(mediaSuggestionPatch.assetUrl).toBe('https://signed.example/img.png');
  });

  it('clears the reel when a carousel replaces a video, and orders slides by selection', () => {
    const { mediaSuggestionPatch, publishingAssets } = shapeUserSuppliedMedia([
      imageRef({ assetId: 'i1', storagePath: 'library/one.png' }),
      imageRef({ assetId: 'i2', storagePath: 'library/two.png' }),
    ]);

    expect(mediaSuggestionPatch.kind).toBe('carousel');
    expect(mediaSuggestionPatch.reel).toBeNull();
    expect(mediaSuggestionPatch.hyperframe).toBeNull();
    expect(mediaSuggestionPatch.url).toBeNull();
    expect(mediaSuggestionPatch.assets?.map((a) => a.url)).toEqual([
      'library/one.png',
      'library/two.png',
    ]);
    expect(publishingAssets.map((a) => a.slideIndex)).toEqual([0, 1]);
  });

  it('rejects an empty selection', () => {
    expect(() => shapeUserSuppliedMedia([])).toThrow(/at least one creative/);
  });
});

/**
 * The shaper always knew which format the attached media could publish as — it just kept the
 * answer to itself. Three images landing on a "Reel" draft left `content.format` saying Reel with
 * no video anywhere, which died in staging once per scheduler tick.
 */
describe('publishFormatForAssetKinds', () => {
  it('maps kinds to the format that can actually publish them', () => {
    expect(publishFormatForAssetKinds(['image'])).toBe('POST');
    expect(publishFormatForAssetKinds(['image', 'image', 'image'])).toBe('CAROUSEL');
    expect(publishFormatForAssetKinds(['video'])).toBe('REEL');
  });

  it('follows the video-first rule the shaper uses, not the count', () => {
    expect(publishFormatForAssetKinds(['video', 'image'])).toBe('REEL');
  });
});

describe('shapeUserSuppliedMedia — contentPatch', () => {
  it('restates the format from the media, so a reel carrying images becomes a carousel', () => {
    const { contentPatch } = shapeUserSuppliedMedia([
      imageRef({ assetId: 'i1', storagePath: 'library/one.jpg' }),
      imageRef({ assetId: 'i2', storagePath: 'library/two.jpg' }),
      imageRef({ assetId: 'i3', storagePath: 'library/three.jpg' }),
    ]);
    expect(contentPatch.format).toBe('CAROUSEL');
  });

  it('agrees with mediaSuggestion.kind on every branch', () => {
    expect(shapeUserSuppliedMedia([videoRef()]).contentPatch.format).toBe('REEL');
    expect(shapeUserSuppliedMedia([imageRef()]).contentPatch.format).toBe('POST');
  });

  it('resolves back to itself — the token it writes is one resolvePublishFormat reads', () => {
    const { contentPatch } = shapeUserSuppliedMedia([videoRef()]);
    expect(resolvePublishFormat(contentPatch.format)).toBe('REEL');
  });
});
