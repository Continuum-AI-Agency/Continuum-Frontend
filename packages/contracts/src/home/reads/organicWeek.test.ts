import { describe, expect, it } from 'bun:test';
import {
  HOME_ORGANIC_WEEK_BASELINE_DAYS,
  type HomeOrganicWeekData,
  homeOrganicWeekDataSchema,
  homeOrganicWeekReadSchema,
} from './organicWeek';

const BRAND = '6a49e1a8-0ee8-4101-bed7-1bdc8fd5e088';
const WEEK = [
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
  '2026-11-08',
];
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function sampleWeek(): HomeOrganicWeekData {
  return {
    week: { since: '2026-11-02', until: '2026-11-08', timeZone: 'America/Mexico_City' },
    baseline: {
      since: '2026-10-05',
      until: '2026-11-01',
      days: HOME_ORGANIC_WEEK_BASELINE_DAYS,
      statistic: 'median',
    },
    days: WEEK.map((date, index) => ({
      date,
      weekday: WEEKDAYS[index],
      published:
        index === 0
          ? [
              {
                postId: '17914778196509375',
                platform: 'instagram',
                accountId: '17841402935871780',
                publishedAt: '2026-11-02T11:01:29.000Z',
                day: date,
                permalink: 'https://www.instagram.com/reel/abc/',
                mediaType: 'VIDEO',
                reach: 1200,
                interactions: 84,
                engagementRate: 0.07,
                reachCapturedOn: '2026-11-03',
                reachLift: 1.5,
                isTrial: false,
                publishedThrough: 'continuum',
              },
            ]
          : [],
      scheduled:
        index === 3
          ? [
              {
                draftId: 'd1',
                status: 'scheduled',
                platform: 'instagram',
                accountId: '17841402935871780',
                scheduledAt: '2026-11-05T11:00:00.000Z',
                day: date,
                format: 'Reel',
                topic: null,
              },
            ]
          : [],
      drafts: [],
    })),
    accounts: [
      {
        platform: 'instagram',
        accountId: '17841402935871780',
        name: 'vivo47_oficial',
        published: 1,
        scheduled: 1,
        drafts: 0,
        baseline: { posts: 12, medianReach: 800 },
        topPost: { postId: '17914778196509375', reach: 1200, reachLift: 1.5 },
      },
    ],
    totals: { published: 1, scheduled: 1, drafts: 0, withReach: 1 },
    topPost: {
      postId: '17914778196509375',
      platform: 'instagram',
      accountId: '17841402935871780',
      reach: 1200,
      reachLift: 1.5,
    },
    sources: [
      {
        kind: 'organic.post_metric_snapshots',
        ref: null,
        since: '2026-10-05',
        until: '2026-11-08',
      },
    ],
  };
}

describe('homeOrganicWeekDataSchema', () => {
  it('accepts a week with a published post, a scheduled post and an account baseline', () => {
    expect(homeOrganicWeekDataSchema.parse(sampleWeek())).toEqual(sampleWeek());
  });

  it('a week is exactly seven columns', () => {
    const week = sampleWeek();
    week.days = week.days.slice(0, 6);
    expect(homeOrganicWeekDataSchema.safeParse(week).success).toBe(false);
  });

  it('refuses a negative reach', () => {
    const week = sampleWeek();
    const post = week.days[0]?.published[0];
    if (!post) throw new Error('fixture lost its post');
    post.reach = -1;
    expect(homeOrganicWeekDataSchema.safeParse(week).success).toBe(false);
  });

  it('a draft lane holds drafts only, never a scheduled post', () => {
    const week = sampleWeek();
    const scheduled = week.days[3]?.scheduled[0];
    if (!scheduled || !week.days[3]) throw new Error('fixture lost its scheduled post');
    week.days[3].drafts = [scheduled];
    expect(homeOrganicWeekDataSchema.safeParse(week).success).toBe(false);
  });

  it('a post not yet measured carries null reach and null lift', () => {
    const week = sampleWeek();
    const post = week.days[0]?.published[0];
    if (!post) throw new Error('fixture lost its post');
    Object.assign(post, {
      reach: null,
      interactions: null,
      engagementRate: null,
      reachCapturedOn: null,
      reachLift: null,
    });
    expect(homeOrganicWeekDataSchema.safeParse(week).success).toBe(true);
  });
});

describe('homeOrganicWeekReadSchema', () => {
  it('wraps the week in the Home envelope, ready or missing', () => {
    const ready = {
      state: 'ready',
      brandId: BRAND,
      generatedAt: '2026-11-03T12:00:00.000Z',
      data: sampleWeek(),
    };
    const missing = {
      state: 'missing',
      brandId: BRAND,
      generatedAt: '2026-11-03T12:00:00.000Z',
      missing: { reason: 'no_organic_account', detail: 'No organic account is connected.' },
    };
    expect(homeOrganicWeekReadSchema.safeParse(ready).success).toBe(true);
    expect(homeOrganicWeekReadSchema.safeParse(missing).success).toBe(true);
  });
});
