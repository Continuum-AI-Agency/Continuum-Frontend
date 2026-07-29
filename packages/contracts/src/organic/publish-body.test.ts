import { describe, expect, it } from 'bun:test';
import {
  buildFullCaption,
  buildPublishBody,
  inferPostType,
  type PublishableDraft,
  resolvePublishFormat,
} from './publish-body';

const draft = (overrides: Partial<PublishableDraft> = {}): PublishableDraft => ({
  id: 'draft-1',
  format: 'post',
  captionPreview: 'Fresh out of the oven',
  ...overrides,
});

describe('resolvePublishFormat', () => {
  it.each([
    ['carousel', 'CAROUSEL'],
    ['Carousel', 'CAROUSEL'],
    ['CAROUSEL_ALBUM', 'CAROUSEL'],
    ['reel', 'REEL'],
    ['Reel', 'REEL'],
    ['Video', 'REEL'],
    ['hyperframe', 'REEL'],
    ['FeedPost', 'POST'],
    ['static', 'POST'],
    [undefined, 'POST'],
  ])('maps %s to %s', (format, expected) => {
    expect(resolvePublishFormat(format)).toBe(expected as 'POST' | 'REEL' | 'CAROUSEL');
  });
});

describe('inferPostType', () => {
  // The generators write a lowercase "carousel"; the planner used to compare against
  // "Carousel" and silently downgrade the draft to a single-image POST.
  it('treats a lowercase carousel format as a carousel', () => {
    expect(inferPostType(draft({ format: 'carousel' }))).toBe('CAROUSEL');
  });
});

describe('buildPublishBody', () => {
  it('carries the hashtag block into the caption', () => {
    const body = buildPublishBody(
      draft({ hashtags: { high: ['#pizza'], medium: ['#dough'], low: [] } }),
      'instagram',
      'ig-1',
      'brand-1',
    );
    expect(body.caption).toBe('Fresh out of the oven\n\n#pizza #dough');
  });

  it('targets the account it was given', () => {
    const body = buildPublishBody(draft(), 'instagram', 'ig-account-b', 'brand-1');
    expect(body.accountId).toBe('ig-account-b');
    expect(body.platform).toBe('instagram');
  });

  it('sends every carousel slide, in order', () => {
    const body = buildPublishBody(
      draft({
        format: 'carousel',
        publishingAssets: [
          { role: 'slide_2', kind: 'image', slideIndex: 2, storageUrl: 'https://cdn/2.jpg' },
          { role: 'slide_1', kind: 'image', slideIndex: 1, storageUrl: 'https://cdn/1.jpg' },
          { role: 'slide_3', kind: 'image', slideIndex: 3, storageUrl: 'https://cdn/3.jpg' },
        ],
      }),
      'instagram',
      'ig-1',
      'brand-1',
    );

    expect(body.postType).toBe('CAROUSEL');
    expect(body.postType === 'CAROUSEL' && body.items).toEqual([
      { imageUrl: 'https://cdn/1.jpg' },
      { imageUrl: 'https://cdn/2.jpg' },
      { imageUrl: 'https://cdn/3.jpg' },
    ]);
  });

  it('prefers the assigned creative over the headless generation', () => {
    const body = buildPublishBody(
      draft({
        publishingAssets: [
          { role: 'primary', kind: 'image', storageUrl: 'https://cdn/assigned.jpg' },
        ],
        mediaSuggestion: { assets: [{ order: 1, assetUrl: 'https://cdn/headless.jpg' }] },
      }),
      'instagram',
      'ig-1',
      'brand-1',
    );

    expect(body.postType === 'POST' && body.imageUrl).toBe('https://cdn/assigned.jpg');
  });

  it('prefers assigned carousel slides over generated ones', () => {
    const body = buildPublishBody(
      draft({
        format: 'carousel',
        publishingAssets: [
          { role: 'slide_1', kind: 'image', slideIndex: 1, storageUrl: 'https://cdn/a1.jpg' },
          { role: 'slide_2', kind: 'image', slideIndex: 2, storageUrl: 'https://cdn/a2.jpg' },
        ],
        mediaSuggestion: {
          assets: [
            { order: 1, assetUrl: 'https://cdn/g1.jpg' },
            { order: 2, assetUrl: 'https://cdn/g2.jpg' },
          ],
        },
      }),
      'instagram',
      'ig-1',
      'brand-1',
    );

    expect(body.postType === 'CAROUSEL' && body.items).toEqual([
      { imageUrl: 'https://cdn/a1.jpg' },
      { imageUrl: 'https://cdn/a2.jpg' },
    ]);
  });

  // A refetched draft has no base64 left on its mediaSuggestion, so the generated slides
  // must still be reachable by their durable assetUrl.
  it('falls back to generated slide URLs when nothing is assigned', () => {
    const body = buildPublishBody(
      draft({
        format: 'carousel',
        mediaSuggestion: {
          assets: [
            { order: 2, assetUrl: 'https://cdn/g2.jpg' },
            { order: 1, assetUrl: 'https://cdn/g1.jpg' },
          ],
        },
      }),
      'instagram',
      'ig-1',
      'brand-1',
    );

    expect(body.postType === 'CAROUSEL' && body.items).toEqual([
      { imageUrl: 'https://cdn/g1.jpg' },
      { imageUrl: 'https://cdn/g2.jpg' },
    ]);
  });

  it('omits items below the carousel minimum so the backend can derive them', () => {
    const body = buildPublishBody(draft({ format: 'carousel' }), 'instagram', 'ig-1', 'brand-1');
    expect(body.postType === 'CAROUSEL' && body.items).toBeUndefined();
  });
});

describe('buildFullCaption', () => {
  const long = `${'word '.repeat(519)}finalword`;

  it('defaults to the Instagram ceiling when no platform is given', () => {
    const captioned = draft({ captionPreview: long });
    expect(buildFullCaption(captioned)).toBe(buildFullCaption(captioned, 'instagram'));
    expect(buildFullCaption(captioned).length).toBeLessThanOrEqual(2200);
  });

  it('leaves a 2,600-char caption whole for LinkedIn', () => {
    const captioned = draft({ captionPreview: long });
    expect(buildFullCaption(captioned, 'linkedin')).toBe(long.trim());
  });

  it('is unchanged for short captions on every platform', () => {
    const captioned = draft({ captionPreview: 'Fresh bread', hashtags: { high: ['#bake'] } });
    for (const platform of ['instagram', 'facebook', 'linkedin'] as const) {
      expect(buildFullCaption(captioned, platform)).toBe('Fresh bread\n\n#bake');
    }
  });
});

describe('buildPublishBody caption', () => {
  it('threads the target platform into the caption clamp', () => {
    const long = `${'word '.repeat(519)}finalword`;
    const captioned = draft({ captionPreview: long });

    const linkedinBody = buildPublishBody(captioned, 'linkedin', 'acct', 'brand');
    expect(linkedinBody.caption).toBe(long.trim());

    const instagramBody = buildPublishBody(captioned, 'instagram', 'acct', 'brand');
    expect((instagramBody.caption ?? '').length).toBeLessThanOrEqual(2200);

    // No platform resolved yet → the tightest ceiling, so nothing over-reports.
    const untargeted = buildPublishBody(captioned, null, null, null);
    expect(untargeted.caption).toBe(instagramBody.caption);
  });
});
