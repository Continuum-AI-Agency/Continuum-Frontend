import { describe, expect, it } from 'bun:test';
import { buildPlatformCaption, type HashtagTiers } from '../media/instagram-caption';
import { plannerDraftFieldPatchSchema, retargetDraftPlatformRow } from './planner-draft-edit';
import type { PublishOptions } from './publish-body';
import {
  boundAccountIdFromRow,
  checkPublishability,
  draftFormatCandidates,
  type PublishPlan,
  type PublishPlanAccountCandidate,
  type PublishPlanAccountInput,
  type PublishPlanAsset,
  type PublishPlanDraft,
  type PublishPlanGeneratedSlide,
  type PublishPlanInput,
  type PublishPlanMediaSuggestion,
  publishAccountLabel,
  publishPlanDraftFromRow,
  publishPlanSchema,
  resolvePublishPlan,
} from './publish-plan';
import type { PublishPlatform } from './publishing';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_STALE = '33333333-3333-4333-8333-333333333333';

const draft = (overrides: Partial<PublishPlanDraft> = {}): PublishPlanDraft => ({
  id: 'draft-1',
  formats: [],
  caption: 'Fresh out of the oven',
  hashtags: null,
  publishingAssets: [],
  mediaSuggestion: null,
  savedPublishOptions: null,
  ...overrides,
});

const asset = (name: string, overrides: Partial<PublishPlanAsset> = {}): PublishPlanAsset => {
  const kind = overrides.kind ?? 'image';
  return {
    role: 'slide',
    kind,
    slideIndex: null,
    assetId: `asset-${name}`,
    bucket: 'brand-media',
    storagePath: `brand-1/${name}`,
    storageUrl: `https://cdn.example.com/signed/${name}`,
    mimeType: kind === 'video' ? 'video/mp4' : 'image/png',
    width: null,
    height: null,
    ...overrides,
  };
};

const images = (count: number): PublishPlanAsset[] =>
  Array.from({ length: count }, (_, index) => asset(`img-${index}.png`, { slideIndex: index }));

const ms = (overrides: Partial<PublishPlanMediaSuggestion> = {}): PublishPlanMediaSuggestion => ({
  mediaStatus: 'ready',
  url: null,
  assetUrl: null,
  signedUrl: null,
  assetBase64: null,
  bucket: null,
  mimeType: null,
  width: null,
  height: null,
  alt: null,
  assets: [],
  reel: null,
  hyperframe: null,
  ...overrides,
});

const generatedSlide = (order: number): PublishPlanGeneratedSlide => ({
  order,
  url: `https://gen.example.com/slide-${order}.png`,
  assetUrl: null,
  signedUrl: null,
  assetBase64: null,
  bucket: null,
  mimeType: 'image/png',
  width: null,
  height: null,
});

const generatedSlides = (count: number): PublishPlanGeneratedSlide[] =>
  Array.from({ length: count }, (_, index) => generatedSlide(index + 1));

const hyperframe = (
  overrides: Partial<NonNullable<PublishPlanMediaSuggestion['hyperframe']>> = {},
): NonNullable<PublishPlanMediaSuggestion['hyperframe']> => ({
  mp4Path: null,
  mp4Url: null,
  mp4Bucket: null,
  mp4Status: null,
  coverPath: null,
  coverImageUrl: null,
  bucket: null,
  ...overrides,
});

const candidate = (id: string, handle: string): PublishPlanAccountCandidate => ({
  id,
  handle,
  displayName: `${handle} display`,
  avatarUrl: `https://cdn.example.com/avatars/${handle}.png`,
});

const account = (overrides: Partial<PublishPlanAccountInput> = {}): PublishPlanAccountInput => ({
  boundAccountId: ACCOUNT_A,
  accounts: [candidate(ACCOUNT_A, 'brand_a')],
  ...overrides,
});

/** Resolves a plan and holds it to the wire schema, so every plan in this file parses. */
const plan = (
  input: PublishPlanDraft,
  platform: PublishPlatform = 'instagram',
  extra: Partial<Omit<PublishPlanInput, 'draft' | 'platform'>> = {},
): PublishPlan => {
  const result = resolvePublishPlan({
    draft: input,
    platform,
    account: account(),
    publishOptions: null,
    mediaGenerated: null,
    ...extra,
  });
  publishPlanSchema.parse(result);
  return result;
};

const codes = (p: PublishPlan) => p.notices.map((notice) => notice.code);
const blockerReasons = (p: PublishPlan) =>
  checkPublishability(p).blockers.map((blocker) => blocker.reason);

describe('resolvePublishPlan — format walk', () => {
  it('takes the first candidate that names a format, skips "Text", and defaults to POST', () => {
    expect(plan(draft({ formats: ['carousel', 'reel'] })).format).toBe('CAROUSEL');
    expect(plan(draft({ formats: ['Text', null, undefined, 'Reel'] })).format).toBe('REEL');
    expect(plan(draft({ formats: ['Text', null, undefined] })).format).toBe('POST');
    expect(plan(draft({ formats: [] })).format).toBe('POST');
    expect(plan(draft({ formats: ['hyperframe'] })).format).toBe('REEL');
  });
});

describe('resolvePublishPlan — carousel', () => {
  it('orders slides by slideIndex, unindexed last in array order, and never sends the cover', () => {
    const p = plan(
      draft({
        formats: ['carousel'],
        publishingAssets: [
          asset('two.png', { slideIndex: 2 }),
          asset('late-a.png'),
          asset('cover.png', { role: 'cover', slideIndex: 0 }),
          asset('zero.mp4', { kind: 'video', slideIndex: 0 }),
          asset('one.png', { slideIndex: 1 }),
          asset('late-b.png'),
        ],
      }),
    );
    expect(p.verb).toBe('carousel');
    expect(p.media.map((m) => m.storagePath)).toEqual([
      'brand-1/zero.mp4',
      'brand-1/one.png',
      'brand-1/two.png',
      'brand-1/late-a.png',
      'brand-1/late-b.png',
    ]);
    expect(p.media[0]?.kind).toBe('video');
    expect(p.media.every((m) => m.source === 'publishing_asset')).toBe(true);
    expect(p.media.map((m) => m.url)).toEqual([
      'https://cdn.example.com/signed/zero.mp4',
      'https://cdn.example.com/signed/one.png',
      'https://cdn.example.com/signed/two.png',
      'https://cdn.example.com/signed/late-a.png',
      'https://cdn.example.com/signed/late-b.png',
    ]);
    expect(checkPublishability(p).publishable).toBe(true);
  });

  it('keeps a reduced selection of one slide over three generated, and blocks (Airtable 396)', () => {
    const p = plan(
      draft({
        formats: ['carousel'],
        publishingAssets: images(1),
        mediaSuggestion: ms({ assets: generatedSlides(3) }),
      }),
    );
    expect(p.media.map((m) => m.storagePath)).toEqual(['brand-1/img-0.png']);
    expect(checkPublishability(p).blockers.map((b) => b.reason)).toContain('media_missing');
  });

  it('refuses a carousel whose selection holds an item with no media source (Airtable 400)', () => {
    const [first, second, third] = images(3);
    const p = plan(
      draft({
        formats: ['carousel'],
        publishingAssets: [first, { ...second, storagePath: null, storageUrl: null }, third],
        mediaSuggestion: ms({ assets: generatedSlides(3) }),
      }),
    );
    expect(p.media).toHaveLength(3);
    const missing = checkPublishability(p).blockers.find((b) => b.reason === 'media_missing');
    expect(missing?.message).toContain('Every selected carousel item needs a media source');
  });

  it('keeps two attached slides over three generated', () => {
    const p = plan(
      draft({
        formats: ['carousel'],
        publishingAssets: images(2),
        mediaSuggestion: ms({ assets: generatedSlides(3) }),
      }),
    );
    expect(p.media.map((m) => m.storagePath)).toEqual(['brand-1/img-0.png', 'brand-1/img-1.png']);
  });

  it('keeps one attached slide when generation cannot fill the carousel either, and blocks', () => {
    const p = plan(
      draft({
        formats: ['carousel'],
        publishingAssets: images(1),
        mediaSuggestion: ms({ assets: generatedSlides(1) }),
      }),
    );
    expect(p.media.map((m) => m.storagePath)).toEqual(['brand-1/img-0.png']);
    const verdict = checkPublishability(p);
    expect(verdict.publishable).toBe(false);
    const missing = verdict.blockers.find((b) => b.reason === 'media_missing');
    expect(missing?.message).toContain('at least 2');
  });

  it('refuses an Instagram carousel past 10 slides instead of posting a subset (Airtable 397/400)', () => {
    const p = plan(draft({ formats: ['carousel'], publishingAssets: images(12) }));
    expect(p.media).toHaveLength(12);
    const over = checkPublishability(p).blockers.find((b) => b.reason === 'unsupported_format');
    expect(over?.message).toContain('at most 10');
  });

  it('blocks a Facebook carousel that carries a video slide', () => {
    const p = plan(
      draft({
        formats: ['carousel'],
        publishingAssets: [
          asset('a.png', { slideIndex: 0 }),
          asset('b.mp4', { kind: 'video', slideIndex: 1 }),
        ],
      }),
      'facebook',
    );
    const blocker = checkPublishability(p).blockers.find((b) => b.reason === 'unsupported_format');
    expect(blocker?.fix).toBe('media');
    expect(blocker?.message).toContain('slide 2 is a video');
  });
});

describe('resolvePublishPlan — post and text', () => {
  it('sends the first image by slideIndex on a POST and names the rest as not sent', () => {
    const p = plan(
      draft({
        formats: ['post'],
        publishingAssets: [
          asset('c.png', { slideIndex: 2 }),
          asset('a.png', { slideIndex: 0 }),
          asset('b.png', { slideIndex: 1 }),
        ],
      }),
    );
    expect(p.verb).toBe('post');
    expect(p.media.map((m) => m.storagePath)).toEqual(['brand-1/a.png']);
    const notice = p.notices.find((n) => n.code === 'media_not_sent');
    expect(notice?.message).toContain('2 more');
  });

  it('publishes a caption-only POST as text on Facebook, LinkedIn and X', () => {
    for (const platform of ['facebook', 'linkedin', 'x'] as const) {
      const p = plan(draft({ formats: ['post'] }), platform);
      expect(p.verb).toBe('text');
      expect(p.media).toEqual([]);
      expect(p.caption.text).toBe('Fresh out of the oven');
      expect(checkPublishability(p)).toEqual({ publishable: true, blockers: [], warnings: [] });
    }
  });

  it('keeps an Instagram POST with no media a post, blocked on media', () => {
    const p = plan(draft({ formats: ['post'] }), 'instagram');
    expect(p.verb).toBe('post');
    expect(blockerReasons(p)).toContain('media_missing');
  });

  it('never turns a Facebook POST holding only a video into a text post', () => {
    const p = plan(
      draft({ formats: ['post'], publishingAssets: [asset('clip.mp4', { kind: 'video' })] }),
      'facebook',
    );
    expect(p.verb).toBe('post');
    expect(p.media).toEqual([]);
    expect(blockerReasons(p)).toContain('media_missing');
  });
});

describe('resolvePublishPlan — reel and YouTube', () => {
  it('blocks a REEL that has only images', () => {
    const p = plan(draft({ formats: ['reel'], publishingAssets: images(2) }));
    expect(p.verb).toBe('reel');
    expect(p.media).toEqual([]);
    expect(blockerReasons(p)).toContain('media_missing');
  });

  it('names YouTube when a YouTube REEL has no video', () => {
    const p = plan(draft({ formats: ['reel'] }), 'youtube');
    const missing = checkPublishability(p).blockers.find((b) => b.reason === 'media_missing');
    expect(missing?.message).toContain('YouTube');
  });

  it('refuses a YouTube POST as an unsupported format', () => {
    const p = plan(draft({ formats: ['post'], publishingAssets: images(1) }), 'youtube');
    expect(checkPublishability(p).blockers).toContainEqual(
      expect.objectContaining({ reason: 'unsupported_format', fix: 'format' }),
    );
  });
});

describe('resolvePublishPlan — hyperframe', () => {
  it('holds a hyperframe whose MP4 is still rendering', () => {
    const p = plan(
      draft({
        formats: ['hyperframe'],
        mediaSuggestion: ms({ hyperframe: hyperframe({ mp4Status: 'pending' }) }),
      }),
    );
    expect(p.media).toEqual([]);
    expect(p.mediaPending).toBe('hyperframe_rendering');
    expect(blockerReasons(p)).toContain('hyperframe_mp4_not_ready');
  });

  it('sends the rendered hyperframe MP4 from the default bucket', () => {
    const p = plan(
      draft({
        formats: ['hyperframe'],
        mediaSuggestion: ms({
          hyperframe: hyperframe({ mp4Status: 'ready', mp4Path: 'hf/reel.mp4' }),
        }),
      }),
    );
    expect(p.mediaPending).toBeNull();
    expect(p.media).toEqual([
      {
        kind: 'video',
        source: 'hyperframe',
        assetId: null,
        bucket: 'hyperframes-mp4',
        storagePath: 'hf/reel.mp4',
        url: null,
        mimeType: 'video/mp4',
        width: null,
        height: null,
        slideIndex: null,
      },
    ]);
  });
});

describe('resolvePublishPlan — generated media', () => {
  it('treats a generated url as stale while generation is in flight', () => {
    const p = plan(
      draft({
        formats: ['post'],
        mediaSuggestion: ms({
          mediaStatus: 'generating',
          url: 'https://gen.example.com/stale.png',
        }),
      }),
    );
    expect(p.media).toEqual([]);
    expect(p.mediaPending).toBe('generating');
    expect(blockerReasons(p)).toContain('media_missing');
  });

  it('uses the ready generated image, reading a non-http url as a storage path', () => {
    const p = plan(
      draft({
        formats: ['post'],
        mediaSuggestion: ms({
          url: 'brand-1/generated.png',
          bucket: 'organic-media',
          mimeType: 'image/png',
          alt: 'A latte on a desk',
        }),
      }),
    );
    expect(p.mediaPending).toBeNull();
    expect(p.media).toHaveLength(1);
    expect(p.media[0]).toMatchObject({
      kind: 'image',
      source: 'generated',
      bucket: 'organic-media',
      storagePath: 'brand-1/generated.png',
      url: null,
    });
    expect(p.options.altText).toBe('A latte on a desk');
  });
});

describe('resolvePublishPlan — story', () => {
  it('sends no caption on a story, says so, and prefers the video', () => {
    const p = plan(
      draft({
        formats: ['story'],
        caption: 'Swipe up for the menu',
        hashtags: { high: ['#pizza'] },
        publishingAssets: [
          asset('still.png', { slideIndex: 0 }),
          asset('clip.mp4', { kind: 'video', slideIndex: 1 }),
        ],
      }),
    );
    expect(p.verb).toBe('story');
    expect(p.caption.text).toBeNull();
    expect(p.caption.keptHashtags).toEqual([]);
    expect(codes(p)).toContain('caption_not_sent');
    expect(p.media.map((m) => m.storagePath)).toEqual(['brand-1/clip.mp4']);
    expect(blockerReasons(p)).not.toContain('caption_missing');
    expect(checkPublishability(p).publishable).toBe(true);
  });
});

describe('resolvePublishPlan — caption', () => {
  const tags = Array.from({ length: 35 }, (_, index) => `#tag${index}`);

  it('keeps 30 hashtags on Instagram and names the 5 dropped', () => {
    const p = plan(draft({ hashtags: { high: tags } }));
    expect(p.caption.keptHashtags).toEqual(tags.slice(0, 30));
    expect(p.caption.droppedHashtags).toEqual(tags.slice(30));
    expect(codes(p)).toContain('hashtags_dropped');
  });

  // G31: this used to publish the cut caption behind a `caption_truncated` notice. An over-limit
  // caption is refused, never cut; the plan still records where the clamp would land.
  it('refuses a 2300-character caption on Instagram but not on LinkedIn', () => {
    const long = 'word '.repeat(460);
    const instagram = plan(draft({ caption: long }), 'instagram');
    expect(instagram.caption.truncated).toBe(true);
    expect(instagram.caption.truncatedAt ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(2200);
    expect(checkPublishability(instagram).blockers).toContainEqual({
      reason: 'caption_too_long',
      message: 'Instagram captions are at most 2200 characters, hashtags included — this one is 2299',
      fix: 'caption',
    });

    const linkedin = plan(draft({ caption: long }), 'linkedin');
    expect(linkedin.caption.truncated).toBe(false);
    expect(blockerReasons(linkedin)).not.toContain('caption_too_long');
  });

  it('counts the hashtags toward the limit: the wire caption is body + tags', () => {
    const body = 'word '.repeat(430).trim();
    expect(blockerReasons(plan(draft({ caption: body }), 'instagram'))).not.toContain(
      'caption_too_long',
    );
    const tagged = plan(draft({ caption: body, hashtags: { high: tags.slice(0, 15) } }));
    expect(checkPublishability(tagged).blockers).toContainEqual({
      reason: 'caption_too_long',
      message: 'Instagram captions are at most 2200 characters, hashtags included — this one is 2245',
      fix: 'caption',
    });
  });

  it('never refuses a story for its caption: a story sends none', () => {
    const story = plan(
      draft({ formats: ['story'], caption: 'word '.repeat(460), publishingAssets: images(1) }),
    );
    expect(blockerReasons(story)).not.toContain('caption_too_long');
  });

  it('sends exactly what buildPlatformCaption builds', () => {
    const cases: Array<[PublishPlatform, string, HashtagTiers | null]> = [
      ['instagram', 'Fresh out of the oven', { high: ['#pizza'], medium: ['dough'], low: [] }],
      ['instagram', 'word '.repeat(460), { high: tags }],
      ['linkedin', 'word '.repeat(460), { high: tags }],
      ['facebook', '  Weekend special  ', null],
      ['youtube', 'Launch day', { high: tags.slice(0, 20) }],
    ];
    for (const [platform, caption, hashtags] of cases) {
      const p = plan(draft({ formats: ['reel'], caption, hashtags }), platform);
      expect(p.caption.text).toBe(buildPlatformCaption(platform, caption, hashtags));
    }
  });
});

describe('resolvePublishPlan — account', () => {
  const resolveFor = (input: Partial<PublishPlanAccountInput>) =>
    plan(draft({ publishingAssets: images(1) }), 'instagram', { account: account(input) });
  const accountBlocker = (p: PublishPlan) =>
    checkPublishability(p).blockers.find((b) => b.reason === 'account_missing');

  it('publishes to exactly the stamp when it is a connected candidate', () => {
    const p = resolveFor({
      boundAccountId: ACCOUNT_B,
      accounts: [candidate(ACCOUNT_A, 'brand_a'), candidate(ACCOUNT_B, 'brand_b')],
    });
    expect(p.account).toMatchObject({
      status: 'resolved',
      id: ACCOUNT_B,
      handle: 'brand_b',
      candidateCount: 2,
      message: null,
    });
    expect(accountBlocker(p)).toBeUndefined();
  });

  // A2: this used to swap a foreign stamp for the brand's only account at publish time. The
  // single-account stamp is written at creation; at publish a foreign stamp is a question.
  it('never swaps a foreign stamp for the brand single account — it blocks and names the choice', () => {
    const p = resolveFor({
      boundAccountId: ACCOUNT_STALE,
      accounts: [candidate(ACCOUNT_B, 'brand_b')],
    });
    expect(p.account).toMatchObject({ status: 'foreign', id: ACCOUNT_STALE, candidateCount: 1 });
    expect(accountBlocker(p)?.message).toBe(
      "This draft is set to post to an account that is not one of this brand's connected Instagram accounts — choose one of: @brand_b",
    );
  });

  // P1/P4: the list shows a twice-linked account once; a draft stamped with the other link's id
  // read as "not one of this brand's accounts" and offered the very same @handle as the choice.
  it('resolves a stamp on a twin to its account, judged by that link\'s own connection', () => {
    const twinned = {
      ...candidate(ACCOUNT_B, 'brand_b'),
      needsReauth: false,
      aliases: [{ id: ACCOUNT_STALE, needsReauth: false }],
    };
    const live = resolveFor({ boundAccountId: ACCOUNT_STALE, accounts: [twinned] });
    expect(live.account).toMatchObject({ status: 'resolved', id: ACCOUNT_STALE, handle: 'brand_b' });

    const dead = resolveFor({
      boundAccountId: ACCOUNT_STALE,
      accounts: [{ ...twinned, aliases: [{ id: ACCOUNT_STALE, needsReauth: true }] }],
    });
    expect(dead.account.status).toBe('needs_reauth');
    expect(accountBlocker(dead)?.message).toBe(
      '@brand_b must be reconnected before it can post — reconnect Instagram in Settings, or choose one of: @brand_b',
    );
  });

  it('never fills a missing stamp with the brand single account at publish', () => {
    const p = resolveFor({ boundAccountId: null, accounts: [candidate(ACCOUNT_B, 'brand_b')] });
    expect(p.account).toMatchObject({ status: 'missing', id: null });
    expect(accountBlocker(p)?.message).toBe(
      'Choose which Instagram account this posts to: @brand_b',
    );
  });

  it('is missing when nothing is connected, and asks to connect', () => {
    const p = resolveFor({ boundAccountId: null, accounts: [] });
    expect(p.account.status).toBe('missing');
    expect(accountBlocker(p)?.message).toBe(
      'No Instagram account is chosen — connect Instagram first',
    );
  });

  // A17: the blocker names the accounts, never "This brand has 2 connected accounts".
  it('names every candidate when no account is chosen', () => {
    const p = resolveFor({
      boundAccountId: null,
      accounts: [candidate(ACCOUNT_A, 'brand_a'), candidate(ACCOUNT_B, 'brand_b')],
    });
    expect(p.account.candidateCount).toBe(2);
    expect(accountBlocker(p)?.message).toBe(
      'Choose which Instagram account this posts to: @brand_a, @brand_b',
    );
  });

  // A9: a candidate that needs reconnecting is never published to, and never offered.
  it('blocks a stamp whose connection needs renewing and offers the healthy ones', () => {
    const p = resolveFor({
      boundAccountId: ACCOUNT_A,
      accounts: [
        { ...candidate(ACCOUNT_A, 'brand_a'), needsReauth: true },
        candidate(ACCOUNT_B, 'brand_b'),
      ],
    });
    expect(p.account).toMatchObject({ status: 'needs_reauth', id: ACCOUNT_A, handle: 'brand_a' });
    expect(accountBlocker(p)?.message).toBe(
      '@brand_a must be reconnected before it can post — reconnect Instagram in Settings, or choose one of: @brand_b',
    );
  });

  it('trusts the stamp only when the candidates were not loaded', () => {
    const p = resolveFor({ boundAccountId: ACCOUNT_A, accounts: null });
    expect(p.account).toMatchObject({ status: 'resolved', id: ACCOUNT_A, candidateCount: null });
  });

  // A16: a bare platform id used to skip the candidate check entirely.
  it('checks a non-UUID stamp against the candidates like any other', () => {
    const p = resolveFor({
      boundAccountId: '17841400000000000',
      accounts: [candidate(ACCOUNT_A, 'brand_a')],
    });
    expect(p.account).toMatchObject({ status: 'foreign', id: '17841400000000000' });
  });

  // G29: null candidates means "not loaded", not "none connected" — so it never says connect.
  it('asks which account, without "connect", when there is no stamp and no candidates loaded', () => {
    const p = resolveFor({ boundAccountId: null, accounts: null });
    expect(p.account).toMatchObject({ status: 'missing', id: null, candidateCount: null });
    expect(accountBlocker(p)?.message).toBe('Choose which Instagram account this draft posts to');
  });

  it('reads "unassigned" as no account', () => {
    expect(resolveFor({ boundAccountId: 'unassigned', accounts: null }).account.status).toBe(
      'missing',
    );
  });

  it('labels an account by handle, a Page by its name, never by id', () => {
    expect(publishAccountLabel({ handle: 'brand_a', displayName: 'Brand A' })).toBe('@brand_a');
    expect(publishAccountLabel({ handle: 'Brand Page', displayName: 'Brand Page' })).toBe(
      'Brand Page',
    );
    expect(publishAccountLabel({ handle: null, displayName: null })).toBe('an unnamed account');
  });

  it('never doubles the @ of a handle stored with one (YouTube)', () => {
    expect(publishAccountLabel({ handle: '@plfidstudio', displayName: 'PL Fid Studio' })).toBe(
      '@plfidstudio',
    );
    expect(publishAccountLabel({ handle: '@plfidstudio', displayName: null })).toBe('@plfidstudio');
  });
});

describe('resolvePublishPlan — cover', () => {
  const video = asset('clip.mp4', { kind: 'video' });

  it('sends the hyperframe cover on an Instagram reel', () => {
    const p = plan(
      draft({
        formats: ['hyperframe'],
        mediaSuggestion: ms({
          hyperframe: hyperframe({
            mp4Status: 'ready',
            mp4Path: 'hf/reel.mp4',
            coverPath: 'hf/cover.png',
            coverImageUrl: 'https://cdn.example.com/hf/cover.png',
            bucket: 'hyperframes',
          }),
        }),
      }),
    );
    expect(p.cover).toEqual({
      source: 'hyperframe',
      url: 'https://cdn.example.com/hf/cover.png',
      bucket: 'hyperframes',
      storagePath: 'hf/cover.png',
      offsetMs: null,
    });
    expect(codes(p)).not.toContain('cover_platform_default');
  });

  it('sends a cover-role publishing asset on an Instagram reel', () => {
    const p = plan(
      draft({
        formats: ['reel'],
        publishingAssets: [video, asset('poster.png', { role: 'cover' })],
      }),
    );
    expect(p.media.map((m) => m.storagePath)).toEqual(['brand-1/clip.mp4']);
    expect(p.cover).toEqual({
      source: 'publishing_asset',
      url: 'https://cdn.example.com/signed/poster.png',
      bucket: 'brand-media',
      storagePath: 'brand-1/poster.png',
      offsetMs: null,
    });
  });

  it('sends a chosen cover URL saved for Instagram', () => {
    const p = plan(
      draft({
        formats: ['reel'],
        publishingAssets: [video],
        savedPublishOptions: { instagram: { thumbnail: { url: 'https://cdn.example.com/c.jpg' } } },
      }),
    );
    expect(p.cover).toMatchObject({ source: 'chosen_url', url: 'https://cdn.example.com/c.jpg' });
  });

  it('lets TikTok pick the frame when no cover was chosen', () => {
    const p = plan(draft({ formats: ['reel'], publishingAssets: [video] }), 'tiktok');
    expect(p.cover).toBeNull();
    expect(codes(p)).toContain('cover_platform_default');
  });

  it('sends a chosen frame offset on TikTok', () => {
    const p = plan(draft({ formats: ['reel'], publishingAssets: [video] }), 'tiktok', {
      publishOptions: { thumbnail: { offsetMs: 1500 } },
    });
    expect(p.cover).toEqual({
      source: 'chosen_frame',
      url: null,
      bucket: null,
      storagePath: null,
      offsetMs: 1500,
    });
    expect(codes(p)).not.toContain('cover_platform_default');
  });
});

describe('resolvePublishPlan — options', () => {
  const video = asset('clip.mp4', { kind: 'video' });

  it('fills the YouTube defaults with the first caption line as the title', () => {
    const p = plan(
      draft({
        formats: ['reel'],
        caption: 'Launch day\nEverything we shipped',
        publishingAssets: [video],
      }),
      'youtube',
    );
    expect(p.options.youtube).toEqual({
      title: 'Launch day',
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false,
    });
    expect(codes(p)).toContain('platform_defaults');
  });

  it('sets a TikTok privacy level on photo posts only', () => {
    const photo = plan(draft({ formats: ['post'], publishingAssets: images(1) }), 'tiktok');
    expect(photo.options.tiktok?.privacyLevel).toBe('PUBLIC_TO_EVERYONE');
    const reel = plan(draft({ formats: ['reel'], publishingAssets: [video] }), 'tiktok');
    expect(reel.options.tiktok?.privacyLevel).toBeNull();
  });

  it('labels a TikTok reel AI-generated from provenance or a generated source, never on Instagram', () => {
    const attached = draft({ formats: ['reel'], publishingAssets: [video] });
    expect(plan(attached, 'tiktok', { mediaGenerated: true }).options.aiGenerated).toBe(true);
    expect(plan(attached, 'tiktok').options.aiGenerated).toBe(false);

    const fromReel = plan(
      draft({
        formats: ['reel'],
        mediaSuggestion: ms({
          reel: {
            url: 'brand-1/reel.mp4',
            bucket: 'reels',
            signedUrl: null,
            thumbnailUrl: null,
            mimeType: null,
          },
        }),
      }),
      'tiktok',
    );
    expect(fromReel.media[0]?.source).toBe('reel');
    expect(fromReel.options.aiGenerated).toBe(true);

    expect(plan(attached, 'instagram', { mediaGenerated: true }).options.aiGenerated).toBeNull();
  });

  it('refuses a first comment on a story', () => {
    const options: PublishOptions = { firstComment: 'Link in bio' };
    const p = plan(draft({ formats: ['story'], publishingAssets: images(1) }), 'instagram', {
      publishOptions: options,
    });
    expect(p.unsupportedOptions).toEqual(['firstComment']);
    expect(p.options.firstComment).toBeNull();
    expect(checkPublishability(p).blockers).toContainEqual(
      expect.objectContaining({ reason: 'unsupported_format', fix: 'options' }),
    );
  });
});

describe('publishPlanDraftFromRow', () => {
  it('maps a persisted content_json row onto the plan input', () => {
    const row = {
      id: 'draft-row-1',
      content_json: {
        content: { format: 'Text', type: 'carousel' },
        copy: {
          caption: 'Three ways to start your morning',
          hashtags: { high: ['#coffee'], medium: ['morning'], low: [] },
        },
        publishingAssets: [
          {
            role: 'primary',
            kind: 'image',
            slideIndex: 0,
            assetId: 'asset-1',
            bucket: 'brand-media',
            storagePath: 'brand-1/one.png',
            storageUrl: 'https://cdn.example.com/signed/one.png',
            mimeType: 'image/png',
            width: 1080,
            height: 1350,
          },
          {
            kind: 'video',
            storagePath: 'brand-1/two.mp4',
            storageUrl: 'https://cdn.example.com/signed/two.mp4',
          },
          { kind: 'audio', storagePath: 'brand-1/three.mp3' },
        ],
        creative: {
          mediaSuggestion: {
            mediaStatus: 'ready',
            url: 'brand-1/generated.png',
            bucket: 'organic-media',
            mimeType: 'image/png',
            width: 1080,
            height: 1080,
            alt: 'A latte on a desk',
            assets: [
              { order: 1, url: 'https://gen.example.com/slide-1.png', mimeType: 'image/png' },
            ],
            reel: {
              url: 'brand-1/reel.mp4',
              bucket: 'reels',
              thumbnailUrl: 'https://gen.example.com/thumb.jpg',
            },
            hyperframe: {
              mp4Path: 'hf/reel.mp4',
              mp4Status: 'rendering',
              coverPath: 'hf/cover.png',
              bucket: 'hyperframes',
            },
          },
        },
        publishOptions: { instagram: { firstComment: 'Which one is yours?' } },
      },
      slot_data: { format: 'post', platform: { name: 'instagram', accountId: ACCOUNT_A } },
    };

    const mapped = publishPlanDraftFromRow(row);
    expect(mapped).toEqual({
      id: 'draft-row-1',
      formats: ['Text', 'carousel', 'post'],
      caption: 'Three ways to start your morning',
      hashtags: { high: ['#coffee'], medium: ['morning'], low: [] },
      publishingAssets: [
        {
          role: 'primary',
          kind: 'image',
          slideIndex: 0,
          assetId: 'asset-1',
          bucket: 'brand-media',
          storagePath: 'brand-1/one.png',
          storageUrl: 'https://cdn.example.com/signed/one.png',
          mimeType: 'image/png',
          width: 1080,
          height: 1350,
        },
        {
          role: 'primary',
          kind: 'video',
          slideIndex: null,
          assetId: null,
          bucket: null,
          storagePath: 'brand-1/two.mp4',
          storageUrl: 'https://cdn.example.com/signed/two.mp4',
          mimeType: null,
          width: null,
          height: null,
        },
      ],
      mediaSuggestion: {
        mediaStatus: 'ready',
        url: 'brand-1/generated.png',
        assetUrl: null,
        signedUrl: null,
        assetBase64: null,
        bucket: 'organic-media',
        mimeType: 'image/png',
        width: 1080,
        height: 1080,
        alt: 'A latte on a desk',
        assets: [
          {
            order: 1,
            url: 'https://gen.example.com/slide-1.png',
            assetUrl: null,
            signedUrl: null,
            assetBase64: null,
            bucket: null,
            mimeType: 'image/png',
            width: null,
            height: null,
          },
        ],
        reel: {
          url: 'brand-1/reel.mp4',
          bucket: 'reels',
          signedUrl: null,
          thumbnailUrl: 'https://gen.example.com/thumb.jpg',
          mimeType: null,
        },
        hyperframe: {
          mp4Path: 'hf/reel.mp4',
          mp4Url: null,
          mp4Bucket: null,
          mp4Status: null,
          coverPath: 'hf/cover.png',
          coverImageUrl: null,
          bucket: 'hyperframes',
        },
      },
      savedPublishOptions: { instagram: { firstComment: 'Which one is yours?' } },
    });
    // 'Text' names nothing, so content.type answers before the stale slot_data.format.
    const p = plan(mapped);
    expect(p.format).toBe('CAROUSEL');
    expect(p.options.firstComment).toBe('Which one is yours?');
  });

  it('walks formats freshest first: draftSnapshot, content.format, content.type, slot_data.format', () => {
    const row = {
      content_json: { content: { format: 'carousel', type: 'post' } },
      slot_data: { format: 'story', draftSnapshot: { format: 'Reel' } },
    };
    expect(draftFormatCandidates(row)).toEqual(['Reel', 'carousel', 'post', 'story']);
    expect(
      draftFormatCandidates({ content_json: { content: { format: 42 } }, slot_data: null }),
    ).toEqual([]);
    expect(plan(publishPlanDraftFromRow({ id: 'd', ...row })).format).toBe('REEL');
  });

  // A11: one stamp. The slot_data copies are never read, whatever they say.
  it('binds platform_account_id only and ignores "unassigned"', () => {
    expect(
      boundAccountIdFromRow({
        slot_data: { platform: { name: 'instagram', accountId: ACCOUNT_A } },
        platform_account_id: ACCOUNT_B,
      }),
    ).toBe(ACCOUNT_B);
    expect(
      boundAccountIdFromRow({
        slot_data: { platform: { name: 'instagram', accountId: ACCOUNT_A } },
        platform_account_id: null,
      }),
    ).toBeNull();
    expect(
      boundAccountIdFromRow({
        slot_data: { platform: 'instagram' },
        platform_account_id: 'unassigned',
      }),
    ).toBeNull();
  });
});

describe('publishPlanSchema', () => {
  it('parses the plans the resolver produces', () => {
    const plans = [
      resolvePublishPlan({
        draft: draft({ formats: ['carousel'], publishingAssets: images(12) }),
        platform: 'instagram',
        account: account(),
        publishOptions: null,
        mediaGenerated: null,
      }),
      resolvePublishPlan({
        draft: draft({ formats: ['story'], publishingAssets: images(1) }),
        platform: 'instagram',
        account: account({ boundAccountId: null, accounts: [] }),
        publishOptions: { firstComment: 'Link in bio' },
        mediaGenerated: null,
      }),
      resolvePublishPlan({
        draft: draft({ formats: ['post'] }),
        platform: 'linkedin',
        account: account({ accounts: null }),
        publishOptions: null,
        mediaGenerated: null,
      }),
      resolvePublishPlan({
        draft: draft({
          formats: ['reel'],
          publishingAssets: [asset('clip.mp4', { kind: 'video' })],
        }),
        platform: 'youtube',
        account: account(),
        publishOptions: null,
        mediaGenerated: true,
      }),
    ];
    for (const p of plans) {
      expect(publishPlanSchema.safeParse(p).success).toBe(true);
    }
  });
});

describe('retargetDraftPlatformRow', () => {
  const slotData = {
    day: 'mon',
    platform: { name: 'instagram', accountId: 'old' },
    draftSnapshot: { format: 'Reel', platforms: ['instagram'], targetAccountId: 'old' },
  };

  // A11: the account lives in the column only; every slot_data copy is removed.
  it('rewrites the platform everywhere and the account in the column only', () => {
    expect(retargetDraftPlatformRow(slotData, 'facebook', ACCOUNT_B)).toEqual({
      platform: 'facebook',
      platform_account_id: ACCOUNT_B,
      slot_data: {
        day: 'mon',
        platform: { name: 'facebook' },
        draftSnapshot: { format: 'Reel', platforms: ['facebook'] },
      },
    });
  });

  it('drops the old account everywhere when the new one is not chosen yet', () => {
    expect(retargetDraftPlatformRow(slotData, 'facebook', null)).toEqual({
      platform: 'facebook',
      platform_account_id: null,
      slot_data: {
        day: 'mon',
        platform: { name: 'facebook' },
        draftSnapshot: { format: 'Reel', platforms: ['facebook'] },
      },
    });
  });

  it('keeps a bare-string slot_data.platform a string and invents no snapshot', () => {
    expect(retargetDraftPlatformRow({ platform: 'instagram' }, 'tiktok', ACCOUNT_A)).toEqual({
      platform: 'tiktok',
      platform_account_id: ACCOUNT_A,
      slot_data: { platform: 'tiktok' },
    });
  });

  it('requires accountId with a platform change, and takes an account pick alone', () => {
    expect(plannerDraftFieldPatchSchema.safeParse({ platform: 'facebook' }).success).toBe(false);
    expect(
      plannerDraftFieldPatchSchema.safeParse({ platform: 'facebook', accountId: null }).success,
    ).toBe(true);
    expect(plannerDraftFieldPatchSchema.safeParse({ accountId: ACCOUNT_B }).success).toBe(true);
  });
});

describe('a post whose image failed to generate', () => {
  it('posts as text on a platform with text posts, and says so', () => {
    const plan = resolvePublishPlan({
      draft: publishPlanDraftFromRow({
        id: 'd-failed',
        content_json: {
          content: { format: 'post' },
          copy: { caption: 'Closed Monday.' },
          creative: { mediaSuggestion: { mediaStatus: 'failed' } },
        },
        slot_data: null,
      }),
      platform: 'facebook',
      account: { boundAccountId: 'acct', accounts: null },
      publishOptions: null,
      mediaGenerated: null,
    });
    expect(plan.verb).toBe('text');
    expect(plan.notices.map((notice) => notice.code)).toContain('media_not_sent');
  });
});

describe('alt text on a generated image', () => {
  const plan = (platform: 'linkedin' | 'tiktok') =>
    resolvePublishPlan({
      draft: publishPlanDraftFromRow({
        id: 'd-alt',
        content_json: {
          content: { format: 'post' },
          copy: { caption: 'Hello' },
          creative: {
            mediaSuggestion: { mediaStatus: 'ready', url: 'b/gen.png', alt: 'A margherita' },
          },
        },
        slot_data: null,
      }),
      platform,
      account: { boundAccountId: 'acct', accounts: null },
      publishOptions: null,
      mediaGenerated: null,
    });

  it('is sent where the platform has a field for it', () => {
    expect(plan('linkedin').options.altText).toBe('A margherita');
  });

  it('is not claimed for TikTok, whose photo API has none', () => {
    expect(plan('tiktok').options.altText).toBeNull();
  });
});
