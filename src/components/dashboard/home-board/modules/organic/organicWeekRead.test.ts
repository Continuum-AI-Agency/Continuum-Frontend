import { describe, expect, it } from 'bun:test';
import type { HomeOrganicPublishedPost, HomeOrganicWeekData } from '@continuum/contracts';
import { organicWeekQuery, organicWeekReadFor, reachRowsOf, topPostLine } from './organicWeekRead';

const post = (over: Partial<HomeOrganicPublishedPost> = {}): HomeOrganicPublishedPost => ({
  postId: 'p1',
  platform: 'instagram',
  accountId: '1784',
  publishedAt: '2026-11-03T15:00:00Z',
  day: '2026-11-03',
  permalink: 'https://instagram.com/p/1',
  mediaType: 'REEL',
  reach: 12_300,
  interactions: 240,
  engagementRate: 0.0195,
  reachCapturedOn: '2026-11-04',
  reachLift: 2.14,
  isTrial: false,
  publishedThrough: 'external',
  ...over,
});

const weekDays = (posts: HomeOrganicPublishedPost[]) =>
  (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((weekday, index) => {
    const date = `2026-11-0${index + 2}`;
    return {
      date,
      weekday,
      published: posts.filter((candidate) => candidate.day === date),
      scheduled: [],
      drafts: [],
    };
  });

const data = (
  posts: HomeOrganicPublishedPost[],
  over: Partial<HomeOrganicWeekData> = {},
): HomeOrganicWeekData => ({
  week: { since: '2026-11-02', until: '2026-11-08', timeZone: 'America/Mexico_City' },
  baseline: { since: '2026-10-05', until: '2026-11-01', days: 28, statistic: 'median' },
  days: weekDays(posts),
  accounts: [],
  totals: { published: posts.length, scheduled: 0, drafts: 0, withReach: 1 },
  topPost: null,
  sources: [],
  ...over,
});

describe('topPostLine', () => {
  it('prints the week’s top post and how it did against its account', () => {
    expect(
      topPostLine(
        data([post()], {
          topPost: {
            postId: 'p1',
            platform: 'instagram',
            accountId: '1784',
            reach: 12_300,
            reachLift: 2.14,
          },
        }),
      ),
    ).toBe('Top post: 12.3K reach · 2.1× its account’s usual');
  });

  it('a top post with no baseline shows its reach alone', () => {
    expect(
      topPostLine(
        data([post()], {
          topPost: {
            postId: 'p1',
            platform: 'instagram',
            accountId: '1784',
            reach: 900,
            reachLift: null,
          },
        }),
      ),
    ).toBe('Top post: 900 reach');
  });

  it('no measured post says nothing', () => {
    expect(topPostLine(data([post({ reach: null })]))).toBeNull();
  });
});

describe('reachRowsOf', () => {
  it('lists every post the read returned, highest reach first, unmeasured last', () => {
    const rows = reachRowsOf(
      data([
        post({ postId: 'a', reach: 100, reachLift: null }),
        post({ postId: 'b', reach: null, reachLift: null, interactions: null }),
        post({ postId: 'c', reach: 900 }),
      ]),
    );
    expect(rows.map((row) => row.post.postId)).toEqual(['c', 'a', 'b']);
    expect(rows[0]?.reach).toBe('900 reach');
    expect(rows[0]?.lift).toBe('2.1× usual');
    expect(rows[1]?.lift).toBeNull();
    expect(rows[2]?.reach).toBe('Not measured yet');
  });

  it('marks a trial reel and the day the reach was read', () => {
    const [row] = reachRowsOf(data([post({ isTrial: true })]));
    expect(row?.note).toBe('Trial reel · read Nov 4');
  });
});

describe('organicWeekReadFor', () => {
  it('holds a read of the week it asked for', () => {
    const answer = data([post()]);
    expect(organicWeekReadFor(answer, '2026-11-02')).toBe(answer);
  });

  it('never labels another week with this one', () => {
    expect(organicWeekReadFor(data([post()]), '2026-11-09')).toBeNull();
    expect(organicWeekReadFor(null, '2026-11-02')).toBeNull();
  });
});

describe('organicWeekQuery', () => {
  it('asks for the Monday the calendar opens on, in the viewer’s zone', () => {
    expect(organicWeekQuery(new Date(2026, 10, 4, 12), 'America/Mexico_City')).toEqual({
      weekStart: '2026-11-02',
      timeZone: 'America/Mexico_City',
    });
  });
});
