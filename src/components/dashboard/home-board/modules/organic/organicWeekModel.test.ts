import { describe, expect, it } from 'bun:test';
import { DRAFT_ROWS, NOW, POSTS } from './__fixtures__/organicWeek';
import { buildOrganicWeek, organicTileView, organicWeekStart } from './organicWeekModel';

describe('organicWeekStart — the browser-local Monday the Organic calendar opens on', () => {
  it('is the Monday of the week, at midnight', () => {
    const start = organicWeekStart(NOW);
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 10, 2]);
    expect([start.getHours(), start.getMinutes()]).toEqual([0, 0]);
  });

  it('keeps a Sunday in the week that started six days before', () => {
    const start = organicWeekStart(new Date(2026, 10, 8, 23, 30));
    expect(start.getDate()).toBe(2);
  });
});

describe('buildOrganicWeek — seven day columns from the calendar reads', () => {
  const week = buildOrganicWeek({ now: NOW, posts: POSTS, drafts: DRAFT_ROWS });

  it('lays out Monday to Sunday', () => {
    expect(week.days.map((day) => day.dayId)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(week.days.map((day) => day.isToday)).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('puts each published post on its day', () => {
    const tuesday = week.days[1];
    expect(tuesday?.published.map((item) => item.id)).toEqual(['p-ig', 'p-li']);
    expect(week.published).toBe(2);
  });

  it('counts a scheduled row once per platform, and drafts once per card', () => {
    // d4, d5, d6 on Thursday and d11 on Sunday (Mexico City). d12 is next Monday there.
    expect(week.scheduled).toBe(4);
    expect(week.days[3]?.scheduled.map((card) => card.backendDraftId).sort()).toEqual(['d4', 'd5']);
    expect(week.days[6]?.scheduled.map((card) => card.backendDraftId)).toEqual(['d11']);
    // g1 (two platforms, one approval) and d3.
    expect(week.waiting).toBe(2);
  });

  it('collapses one post on two platforms into one card to approve', () => {
    const [card] = week.days[2]?.waiting ?? [];
    expect(card?.card.platforms.sort()).toEqual(['facebook', 'instagram']);
    expect(card?.approvedNotScheduled).toBe(false);
  });

  it('says when a draft was approved but never scheduled', () => {
    const [card] = week.days[1]?.waiting ?? [];
    expect(card?.card.backendDraftId).toBe('d3');
    expect(card?.approvedNotScheduled).toBe(true);
  });

  it('never counts a published draft row, a placeholder, last week or an undated draft', () => {
    const ids = week.days.flatMap((day) => [
      ...day.scheduled.map((card) => card.backendDraftId),
      ...day.waiting.map((item) => item.card.backendDraftId),
    ]);
    for (const id of ['d7', 'd8', 'd9', 'd10', 'd12']) expect(ids).not.toContain(id);
  });

  it('heads with the posts this week: published plus scheduled', () => {
    expect(week.postsThisWeek).toBe(6);
    expect(week.isEmpty).toBe(false);
  });

  it('drops a published post outside the week', () => {
    const late = { ...POSTS[0], id: 'p-old', dayId: '2026-10-22' } as (typeof POSTS)[number];
    expect(buildOrganicWeek({ now: NOW, posts: [late], drafts: [] }).published).toBe(0);
  });

  it('is empty when the week holds nothing', () => {
    const empty = buildOrganicWeek({
      now: NOW,
      posts: [],
      drafts: DRAFT_ROWS.filter((row) => row.id === 'd8'),
    });
    expect(empty.isEmpty).toBe(true);
    expect(empty.postsThisWeek).toBe(0);
  });
});

describe('organicTileView — what the tile can show', () => {
  const ready = buildOrganicWeek({ now: NOW, posts: POSTS, drafts: DRAFT_ROWS });
  const empty = buildOrganicWeek({ now: NOW, posts: [], drafts: [] });

  it('is missing, naming why, when the brand has no organic account', () => {
    const view = organicTileView({ hasAccounts: false, loading: false, failed: false, week: null });
    expect(view.state).toBe('missing');
    expect(view.missing).toBe(
      'No organic account is connected — connect Instagram or Facebook in Integrations.',
    );
  });

  it('loads while either read is on its way, and fails when either read failed', () => {
    expect(
      organicTileView({ hasAccounts: true, loading: true, failed: false, week: null }).state,
    ).toBe('loading');
    expect(
      organicTileView({ hasAccounts: true, loading: false, failed: true, week: ready }).state,
    ).toBe('error');
  });

  it('is missing when the reads settle with nothing this week', () => {
    const view = organicTileView({ hasAccounts: true, loading: false, failed: false, week: empty });
    expect(view.state).toBe('missing');
    expect(view.missing).toBe(
      'Nothing published, scheduled or drafted this week — plan posts in the Organic calendar.',
    );
  });

  it('is ready with the week', () => {
    expect(
      organicTileView({ hasAccounts: true, loading: false, failed: false, week: ready }).state,
    ).toBe('ready');
  });
});
