import { describe, expect, it } from 'bun:test';
import { UNSCHEDULED_DAY_ID } from './calendar-utils';
import type { PlannerPlatform } from './planner-platforms';
import {
  attentionHeading,
  derivePlannerAttention,
  derivePlannerDock,
  lookaheadHeading,
  needsMedia,
  PLANNER_HORIZON_DAYS,
  plannerHorizon,
} from './plannerIntelligence';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCalendarPostedContent,
} from './types';

const draft = (
  id: string,
  status: OrganicCalendarDraft['status'],
  extra: Partial<OrganicCalendarDraft> = {},
): OrganicCalendarDraft =>
  ({
    id,
    status,
    format: 'Post',
    mediaCount: 1,
    mediaStage: 'realized',
    timeLabel: '9:00 AM',
    platforms: ['instagram'],
    ...extra,
  }) as OrganicCalendarDraft;

const day = (id: string, slots: OrganicCalendarDraft[] = []): OrganicCalendarDay =>
  ({ id, slots }) as OrganicCalendarDay;

// Saturday. Its week (Monday-first, as the week grid lays it out) starts on Oct 12.
const TODAY = '2026-10-17';

const groupIds = (days: OrganicCalendarDay[], todayId = TODAY) =>
  derivePlannerAttention(days, todayId).map((group) => ({
    key: group.key,
    ids: group.items.map((item) => item.draft.id),
  }));

describe('derivePlannerAttention', () => {
  it('orders the groups Overdue, Failed, Needs media, Needs approval, Unscheduled', () => {
    const days = [
      day(UNSCHEDULED_DAY_ID, [draft('loose', 'draft')]),
      day('2026-10-16', [draft('late', 'draft')]),
      day('2026-10-20', [
        draft('approve', 'draft'),
        draft('text', 'draft', { mediaStage: 'text_only' }),
        draft('broken', 'failed'),
      ]),
    ];
    expect(groupIds(days)).toEqual([
      { key: 'overdue', ids: ['late'] },
      { key: 'failed', ids: ['broken'] },
      { key: 'needs-media', ids: ['text'] },
      { key: 'needs-approval', ids: ['approve'] },
      { key: 'unscheduled', ids: ['loose'] },
    ]);
  });

  it('files every past draft, placeholder or failure that never went out under Overdue', () => {
    const days = [
      day('2026-09-30', [
        draft('draft', 'draft', { mediaStage: 'text_only' }),
        draft('idea', 'placeholder'),
        draft('broken', 'failed'),
        draft('booked', 'scheduled'),
        draft('out', 'published'),
      ]),
    ];
    expect(groupIds(days)).toEqual([{ key: 'overdue', ids: ['draft', 'idea', 'broken'] }]);
  });

  it('keeps today’s drafts out of Overdue', () => {
    expect(groupIds([day(TODAY, [draft('now', 'draft')])])).toEqual([
      { key: 'needs-approval', ids: ['now'] },
    ]);
  });

  it('reads every day it is given, however far ahead', () => {
    expect(groupIds([day('2027-03-01', [draft('later', 'failed')])])).toEqual([
      { key: 'failed', ids: ['later'] },
    ]);
  });

  it('treats a storyboard as still needing its final media', () => {
    const days = [day('2026-10-20', [draft('board', 'draft', { mediaStage: 'storyboard_ready' })])];
    expect(groupIds(days)).toEqual([{ key: 'needs-media', ids: ['board'] }]);
  });

  it('files an undated draft that needs media under Needs media, not Unscheduled', () => {
    const days = [day(UNSCHEDULED_DAY_ID, [draft('loose', 'draft', { mediaStage: 'text_only' })])];
    expect(groupIds(days)).toEqual([{ key: 'needs-media', ids: ['loose'] }]);
    expect(derivePlannerAttention(days, TODAY)[0]?.items[0]?.dayId).toBe(UNSCHEDULED_DAY_ID);
  });

  it('leaves scheduled, published, generating drafts and future ideas out of the queue', () => {
    const groups = derivePlannerAttention(
      [
        day('2026-10-20', [
          draft('s', 'scheduled', { mediaStage: 'text_only' }),
          draft('p', 'published'),
          draft('g', 'streaming'),
          draft('idea', 'placeholder'),
        ]),
      ],
      TODAY,
    );
    expect(groups).toEqual([]);
  });
});

describe('needsMedia', () => {
  it('falls back to mediaCount only for formats that cannot post without media', () => {
    expect(
      needsMedia(draft('r', 'draft', { mediaStage: undefined, mediaCount: 0, format: 'Reel' })),
    ).toBe(true);
    expect(
      needsMedia(draft('p', 'draft', { mediaStage: undefined, mediaCount: 0, format: 'Post' })),
    ).toBe(false);
  });

  // The preview frame draws these as complete text posts, so the dock must not ask for media.
  it('never asks a Facebook or LinkedIn text post for media', () => {
    const text = { mediaStage: 'text_only', mediaCount: 0, format: 'Post' } as const;
    expect(needsMedia(draft('fb', 'draft', { ...text, platforms: ['facebook'] }))).toBe(false);
    expect(
      needsMedia(draft('both', 'draft', { ...text, platforms: ['facebook', 'linkedin'] })),
    ).toBe(false);
  });

  it('still asks when the post also goes somewhere a picture is required, or is a reel', () => {
    const text = { mediaStage: 'text_only', mediaCount: 0 } as const;
    expect(
      needsMedia(
        draft('mixed', 'draft', { ...text, format: 'Post', platforms: ['facebook', 'instagram'] }),
      ),
    ).toBe(true);
    expect(
      needsMedia(draft('reel', 'draft', { ...text, format: 'Reel', platforms: ['facebook'] })),
    ).toBe(true);
    // The week grid files a platformless draft under Instagram.
    expect(needsMedia(draft('none', 'draft', { ...text, format: 'Post', platforms: [] }))).toBe(
      true,
    );
  });
});

describe('headings', () => {
  it('reads the groups’ own counts, singular and plural', () => {
    const groups = derivePlannerAttention(
      [
        day('2026-10-10', [draft('old', 'draft'), draft('older', 'draft')]),
        day('2026-10-20', [
          draft('a', 'draft', { mediaStage: 'text_only' }),
          draft('b', 'draft', { mediaStage: 'text_only' }),
          draft('c', 'draft'),
          draft('d', 'failed'),
        ]),
      ],
      TODAY,
    );
    expect(attentionHeading(groups)).toBe(
      'Needs attention · 2 overdue · 1 failed · 2 need media · 1 needs approval',
    );
  });

  it('counts open days', () => {
    expect(lookaheadHeading(1)).toBe('Next 4 weeks · 1 open day');
    expect(lookaheadHeading(9)).toBe('Next 4 weeks · 9 open days');
  });
});

describe('plannerHorizon', () => {
  it('counts forward from its first day, across a month end', () => {
    expect(plannerHorizon('2026-10-30', 4)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('defaults to four weeks', () => {
    const horizon = plannerHorizon('2026-10-12');
    expect(horizon).toHaveLength(PLANNER_HORIZON_DAYS);
    expect(horizon.at(-1)).toBe('2026-11-08');
  });
});

describe('derivePlannerDock', () => {
  const platform = (key: PlannerPlatform['key'], extra: Partial<PlannerPlatform> = {}) =>
    ({ key, label: key, canCreate: true, ...extra }) as PlannerPlatform;
  const instagram = platform('instagram');
  const facebook = platform('facebook');
  const post = (dayId: string, platformKey: string) =>
    ({
      id: `${dayId}-${platformKey}`,
      dayId,
      platform: platformKey,
    }) as OrganicCalendarPostedContent;

  const dock = (
    days: OrganicCalendarDay[],
    extra: Partial<Parameters<typeof derivePlannerDock>[0]> = {},
  ) =>
    derivePlannerDock({
      todayId: TODAY,
      attentionDays: days,
      allDays: days,
      postedContent: [],
      platforms: [instagram, facebook],
      ...extra,
    });
  const lookaheadDay = (result: ReturnType<typeof dock>, dayId: string) =>
    result.lookahead.find((entry) => entry.dayId === dayId);
  const openKeys = (result: ReturnType<typeof dock>, dayId: string) =>
    lookaheadDay(result, dayId)?.open.map((p) => p.key);

  it('lays out four Monday-first weeks from the current one, past days marked', () => {
    const result = dock([]);
    expect(result.lookahead).toHaveLength(28);
    expect(result.lookahead[0]?.dayId).toBe('2026-10-12');
    expect(result.lookahead.at(-1)?.dayId).toBe('2026-11-08');
    expect(result.lookahead.filter((entry) => entry.past).map((entry) => entry.dayId)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
    ]);
    // Today and the 22 days after it are open.
    expect(result.openDays).toBe(23);
  });

  it('counts drafts and published posts as planned, and closes their platforms', () => {
    const result = dock(
      [
        day('2026-10-18', [
          draft('a', 'scheduled', { platforms: ['instagram'] }),
          draft('b', 'draft', { platforms: ['instagram'] }),
        ]),
      ],
      { postedContent: [post('2026-10-18', 'facebook'), post('2026-10-19', 'facebook')] },
    );
    expect(lookaheadDay(result, '2026-10-18')?.planned).toBe(3);
    expect(openKeys(result, '2026-10-18')).toEqual([]);
    expect(lookaheadDay(result, '2026-10-19')?.planned).toBe(1);
    expect(openKeys(result, '2026-10-19')).toEqual(['instagram']);
    expect(openKeys(result, '2026-10-20')).toEqual(['instagram', 'facebook']);
    expect(result.openDays).toBe(21);
  });

  it('counts a cross-posted draft once but closes every platform it goes to', () => {
    const result = dock([
      day('2026-10-18', [draft('both', 'scheduled', { platforms: ['instagram', 'facebook'] })]),
    ]);
    expect(lookaheadDay(result, '2026-10-18')?.planned).toBe(1);
    expect(openKeys(result, '2026-10-18')).toEqual([]);
  });

  it('files a platformless draft under Instagram, as the week grid does', () => {
    const result = dock([day('2026-10-18', [draft('a', 'scheduled', { platforms: [] })])]);
    expect(openKeys(result, '2026-10-18')).toEqual(['facebook']);
  });

  it('never offers a read-only or coming-soon row', () => {
    const result = dock([], {
      platforms: [
        instagram,
        platform('youtube', { canCreate: false }),
        platform('x', { comingSoon: true }),
      ],
    });
    expect(
      result.lookahead.every((entry) => entry.open.map((p) => p.key).join() === 'instagram'),
    ).toBe(true);
  });

  it('keeps a day taken by a draft the lens hides', () => {
    const hidden = day('2026-10-18', [draft('planned', 'scheduled', { platforms: ['instagram'] })]);
    const result = dock([], { allDays: [hidden], platforms: [instagram] });
    expect(lookaheadDay(result, '2026-10-18')?.planned).toBe(1);
    expect(openKeys(result, '2026-10-18')).toEqual([]);
  });

  it('queues every loaded draft: overdue, far ahead and undated alike', () => {
    const days = [
      day('2026-10-10', [draft('past', 'failed')]),
      day('2026-10-18', [draft('soon', 'draft', { mediaStage: 'text_only' })]),
      day('2026-12-20', [draft('later', 'draft')]),
      day(UNSCHEDULED_DAY_ID, [draft('loose', 'draft')]),
    ];
    expect(
      dock(days).attention.map((group) => ({
        key: group.key,
        ids: group.items.map((item) => item.draft.id),
      })),
    ).toEqual([
      { key: 'overdue', ids: ['past'] },
      { key: 'needs-media', ids: ['soon'] },
      { key: 'needs-approval', ids: ['later'] },
      { key: 'unscheduled', ids: ['loose'] },
    ]);
  });

  // ONE classification: the rail says exactly what the dock's heading counts.
  it('builds the rail sentence from the same groups as the dock heading', () => {
    const result = dock([
      day('2026-10-14', [draft('late', 'draft'), draft('later', 'placeholder')]),
      day('2026-10-20', [
        draft('text', 'draft', { mediaStage: 'text_only' }),
        draft('ok', 'draft'),
      ]),
    ]);
    expect(result.insight).toBe('2 overdue · 1 needs media · 1 needs approval');
    expect(attentionHeading(result.attention)).toBe(`Needs attention · ${result.insight}`);
  });

  it('falls back to the lookahead when nothing needs attention', () => {
    expect(dock([day('2026-10-18', [draft('a', 'scheduled')])]).insight).toBe(
      'Nothing needs attention · 22 open days in the next 4 weeks',
    );
    expect(dock([]).insight).toBe(
      'Start with 3–5 posts across at least two days to shape a useful week.',
    );
    const full = plannerHorizon(TODAY, 23).map((dayId) =>
      day(dayId, [draft(`${dayId}-a`, 'scheduled')]),
    );
    expect(dock(full).insight).toBe('All set for the next 4 weeks');
  });
});
