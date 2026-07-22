import { describe, expect, it } from 'bun:test';

import { buildTextReadyEntry } from './useCalendarRunStream';

describe('buildTextReadyEntry', () => {
  it('builds a planned draft card from the nested contract placement shape', () => {
    const entry = buildTextReadyEntry({
      placement: {
        placementId: 'p1',
        schedule: {
          dayId: '2026-06-15',
          scheduledAt: '2026-06-15T09:00:00Z',
          timeOfDay: '9:00 AM',
        },
        platform: { name: 'instagram' },
        content: { titleTopic: 'Launch teaser', format: 'Reel', objective: 'Awareness' },
        copy: { caption: 'Big news coming.' },
        creative: { creativeIdea: 'Behind the scenes' },
      },
    });

    expect(entry).not.toBeNull();
    expect(entry?.placementId).toBe('p1');
    expect(entry?.dayId).toBe('2026-06-15');
    expect(entry?.draft.id).toBe('p1');
    expect(entry?.draft.status).toBe('draft');
    expect(entry?.draft.platforms).toEqual(['instagram']);
    expect(entry?.draft.format).toBe('Reel');
    expect(entry?.draft.title).toBe('Launch teaser');
    expect(entry?.draft.captionPreview).toBe('Big news coming.');
    expect(entry?.draft.creativeIdea).toBe('Behind the scenes');
  });

  it('falls back to flat snake_case fields when no nested placement is present', () => {
    const entry = buildTextReadyEntry({
      placement_id: 'p2',
      day_id: '2026-06-16',
      platform: 'facebook',
      time: '10:30 AM',
      caption_preview: 'Flat caption',
      format: 'Post',
    });

    expect(entry).not.toBeNull();
    expect(entry?.placementId).toBe('p2');
    expect(entry?.dayId).toBe('2026-06-16');
    expect(entry?.draft.platforms).toEqual(['facebook']);
    expect(entry?.draft.captionPreview).toBe('Flat caption');
    expect(entry?.draft.timeLabel).toBe('10:30 AM');
  });

  it('derives the dayId from scheduledAt when schedule.dayId is absent', () => {
    const entry = buildTextReadyEntry({
      placement: {
        placementId: 'p3',
        schedule: { dayId: '', scheduledAt: '2026-06-17T14:00:00Z' },
        platform: { name: 'instagram' },
        content: {},
      },
    });

    expect(entry?.dayId).toBe('2026-06-17');
  });

  it('returns null when no placement id can be resolved', () => {
    expect(buildTextReadyEntry({ placement: { schedule: { dayId: '2026-06-15' } } })).toBeNull();
    expect(buildTextReadyEntry({})).toBeNull();
  });

  it('returns null when no day can be resolved', () => {
    const entry = buildTextReadyEntry({
      placement: { placementId: 'p4', platform: { name: 'instagram' }, content: {} },
    });
    expect(entry).toBeNull();
  });
});
