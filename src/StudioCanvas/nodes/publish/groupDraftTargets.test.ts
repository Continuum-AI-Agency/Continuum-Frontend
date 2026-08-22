import { describe, expect, it } from 'bun:test';
import type { OrganicCanvasTarget } from '@continuum/contracts';
import { draftWindowRange, groupDraftTargets } from './groupDraftTargets';

const target = (over: Partial<OrganicCanvasTarget> = {}): OrganicCanvasTarget => ({
  id: '11111111-1111-4111-8111-111111111111',
  format: 'image',
  platform: 'instagram',
  platformAccountId: 'ig-1',
  status: 'draft',
  scheduledAt: '2026-08-19T13:00:00.000Z',
  title: 'Launch teaser',
  captionPreview: 'A caption',
  updatedAt: '2026-08-17T00:00:00.000Z',
  empty: false,
  blockers: [],
  deliverable: true,
  mediaCount: 0,
  thumbnailUrl: null,
  ...over,
});

describe('groupDraftTargets', () => {
  it('groups by planner week and keeps the incoming order inside a group', () => {
    const groups = groupDraftTargets([
      target({ id: 'a', scheduledAt: '2026-08-19T13:00:00.000Z' }),
      target({ id: 'b', scheduledAt: '2026-08-20T13:00:00.000Z' }),
      target({ id: 'c', scheduledAt: '2026-08-27T13:00:00.000Z' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.targets.map((item) => item.id)).toEqual(['a', 'b']);
    expect(groups[1]?.targets.map((item) => item.id)).toEqual(['c']);
  });

  it('sends undated drafts to the end, however they arrived', () => {
    const groups = groupDraftTargets([
      target({ id: 'undated', scheduledAt: null }),
      target({ id: 'dated', scheduledAt: '2026-08-19T13:00:00.000Z' }),
    ]);

    expect(groups.map((group) => group.key)).toEqual(['2026-08-17', 'unscheduled']);
    expect(groups[1]?.heading).toBe('Unscheduled');
  });

  it('treats an unparseable date as undated rather than crashing', () => {
    const groups = groupDraftTargets([target({ id: 'bad', scheduledAt: 'not-a-date' })]);
    expect(groups[0]?.key).toBe('unscheduled');
  });
});

describe('draftWindowRange', () => {
  const now = new Date('2026-08-17T15:30:00.000Z');

  it('bounds a forward window from the start of today', () => {
    const week = draftWindowRange('week', now);
    expect(week.scheduledFrom).toBeDefined();
    expect(week.scheduledTo).toBeDefined();
    expect(new Date(week.scheduledTo as string).getTime()).toBeGreaterThan(
      new Date(week.scheduledFrom as string).getTime(),
    );
  });

  it('bounds the past with an upper limit only', () => {
    const past = draftWindowRange('past', now);
    expect(past.scheduledFrom).toBeUndefined();
    expect(past.scheduledTo).toBeDefined();
  });

  it('sends nothing at all for "any", so unscheduled drafts stay visible', () => {
    expect(draftWindowRange('any', now)).toEqual({});
  });
});
