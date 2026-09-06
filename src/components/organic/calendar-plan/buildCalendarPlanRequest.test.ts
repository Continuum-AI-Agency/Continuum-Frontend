import { describe, expect, it } from 'bun:test';
import type { OrganicCalendarDay, OrganicCalendarDraft } from '../primitives/types';
import { buildCalendarPlanRequest } from './buildCalendarPlanRequest';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const WEEK_START = new Date(2026, 8, 7);

function day(id: string, slots: OrganicCalendarDraft[] = []): OrganicCalendarDay {
  return { id, label: id, dateLabel: id, suggestedTimes: [], slots };
}

function draft(partial: Partial<OrganicCalendarDraft>): OrganicCalendarDraft {
  return {
    id: 'local-1',
    title: '',
    summary: '',
    timeLabel: '',
    dateLabel: '',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: '',
    captionPreview: '',
    tags: [],
    mediaCount: 0,
    ...partial,
  };
}

const week = ['07', '08', '09', '10', '11', '12', '13'].map((d) => day(`2026-09-${d}`));

describe('buildCalendarPlanRequest', () => {
  it('proposes one slot per visible day per active platform when nothing is sketched', () => {
    const request = buildCalendarPlanRequest({
      brandId: BRAND_ID,
      weekStart: WEEK_START,
      weekDays: week,
      activePlatforms: ['instagram', 'linkedin'],
      accountIds: { instagram: 'ig-1' },
      selectedTrendIds: [],
    });
    expect(request.weekStart).toBe('2026-09-07');
    expect(request.placements).toHaveLength(14);
    expect(request.placements.filter((p) => p.platform === 'linkedin')).toHaveLength(7);
    expect(request.placements[0]).toMatchObject({
      dayId: '2026-09-07',
      accountId: 'ig-1',
      trendId: null,
    });
    expect(new Set(request.placements.map((p) => p.placementId)).size).toBe(14);
  });

  it('falls back to an Instagram row when no active platform can generate', () => {
    const request = buildCalendarPlanRequest({
      brandId: BRAND_ID,
      weekStart: WEEK_START,
      weekDays: week.slice(0, 2),
      activePlatforms: [],
      accountIds: {},
      selectedTrendIds: [],
    });
    expect(request.placements.map((p) => p.platform)).toEqual(['instagram', 'instagram']);
  });

  it('uses only the sketched placeholders, keeping their day, time and format', () => {
    const days = [
      day('2026-09-07', [draft({ status: 'draft' })]),
      day('2026-09-09', [
        draft({ id: 'ph-1', status: 'placeholder', timeLabel: '2:30 PM', format: 'Reel' }),
        draft({ id: 'ph-2', status: 'placeholder', platforms: ['linkedin'] }),
      ]),
    ];
    const request = buildCalendarPlanRequest({
      brandId: BRAND_ID,
      weekStart: WEEK_START,
      weekDays: days,
      activePlatforms: ['instagram'],
      accountIds: { instagram: 'ig-1', linkedin: 'li-1' },
      selectedTrendIds: ['trend-a', 'trend-b', 'trend-c'],
    });
    expect(request.placements).toHaveLength(2);
    const [reel, linkedin] = request.placements;
    expect(reel).toMatchObject({
      dayId: '2026-09-09',
      format: 'reel',
      accountId: 'ig-1',
      trendId: 'trend-a',
    });
    expect(new Date(reel.scheduledAt).getHours()).toBe(14);
    expect(linkedin).toMatchObject({ platform: 'linkedin', accountId: 'li-1', trendId: 'trend-b' });
    expect(linkedin.format).toBe('post');
  });
});
