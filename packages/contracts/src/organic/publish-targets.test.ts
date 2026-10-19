import { describe, expect, it } from 'bun:test';
import { draftFanOutRequestSchema } from './draft-fanout';
import { type PublishAccountCandidate, publishAccountCandidateSchema } from './publish-plan';
import {
  bulkPublishGroupStatus,
  PUBLISH_PLATFORM_ORDER,
  publishTargetVerdict,
  publishTargetVerdicts,
  summarizeDraftGroupStatus,
} from './publish-targets';

const candidate = (
  platform: PublishAccountCandidate['platform'],
  overrides: Partial<PublishAccountCandidate> = {},
): PublishAccountCandidate =>
  publishAccountCandidateSchema.parse({
    id: `${platform}-1`,
    platform,
    handle: `${platform}_brand`,
    displayName: null,
    avatarUrl: null,
    needsReauth: false,
    isDefault: false,
    ...overrides,
  });

describe('publishTargetVerdict', () => {
  const accounts = [
    candidate('instagram'),
    candidate('tiktok'),
    candidate('facebook', { needsReauth: true }),
  ];

  it('is available when connected, the format is supported and the caption fits', () => {
    expect(
      publishTargetVerdict({ platform: 'instagram', format: 'REEL', caption: 'Hi', accounts }),
    ).toEqual({
      platform: 'instagram',
      available: true,
      connected: true,
      needsReauth: false,
      formatSupported: true,
      caption: { length: 2, maxLength: 2200, fits: true },
      reason: null,
    });
  });

  it('names why a platform cannot take the post', () => {
    const reason = (platform: PublishAccountCandidate['platform'], format = 'POST' as const) =>
      publishTargetVerdict({ platform, format, caption: 'Hi', accounts }).reason;
    expect(reason('linkedin')).toBe('Connect LinkedIn to post here');
    expect(reason('facebook')).toBe('Reconnect Facebook to post here');
    expect(
      publishTargetVerdict({ platform: 'tiktok', format: 'STORY', caption: null, accounts }).reason,
    ).toBe('TikTok cannot publish a story');
    expect(
      publishTargetVerdict({
        platform: 'instagram',
        format: 'POST',
        caption: 'x'.repeat(2201),
        accounts,
      }).reason,
    ).toBe('Instagram captions are at most 2200 characters, hashtags included — this one is 2201');
  });

  // P6: the verdict measured the body only and said "fits" for a caption the gate refused.
  it('judges the caption as sent — hashtags included — and never a story', () => {
    const post = publishTargetVerdict({
      platform: 'tiktok',
      format: 'POST',
      caption: 'x'.repeat(2195),
      hashtags: ['#launch'],
      accounts,
    });
    expect(post.caption).toEqual({ length: 2204, maxLength: 2200, fits: false });
    const story = publishTargetVerdict({
      platform: 'instagram',
      format: 'STORY',
      caption: 'x'.repeat(5000),
      hashtags: ['#launch'],
      accounts,
    });
    expect(story.caption.fits).toBe(true);
    expect(story.available).toBe(true);
  });

  it('gives one verdict per platform in the one platform order', () => {
    const verdicts = publishTargetVerdicts({ format: 'POST', caption: 'Hi', accounts });
    expect(verdicts.map((verdict) => verdict.platform)).toEqual([...PUBLISH_PLATFORM_ORDER]);
    expect(PUBLISH_PLATFORM_ORDER).toEqual([
      'instagram',
      'facebook',
      'linkedin',
      'tiktok',
      'youtube',
      'x',
    ]);
  });
});

describe('group status', () => {
  it('reads a uniform group as its status, published-and-not as partial', () => {
    expect(summarizeDraftGroupStatus(['draft', 'draft'])).toBe('draft');
    expect(summarizeDraftGroupStatus(['published', 'scheduled'])).toBe('partial');
    expect(summarizeDraftGroupStatus(['approved', 'draft'])).toBe('mixed');
    expect(summarizeDraftGroupStatus(['archived'])).toBe('mixed');
  });

  it('summarizes a bulk publish per group', () => {
    expect(bulkPublishGroupStatus(3, 3)).toBe('published');
    expect(bulkPublishGroupStatus(1, 3)).toBe('partial');
    expect(bulkPublishGroupStatus(0, 3)).toBe('failed');
  });
});

// C4: the selector offered six platforms while fan-out took at most three.
describe('membership request', () => {
  it('takes every publishable platform at once, each once', () => {
    expect(
      draftFanOutRequestSchema.safeParse({ platforms: [...PUBLISH_PLATFORM_ORDER] }).success,
    ).toBe(true);
    expect(
      draftFanOutRequestSchema.safeParse({ platforms: ['instagram', 'instagram'] }).success,
    ).toBe(false);
  });
});
