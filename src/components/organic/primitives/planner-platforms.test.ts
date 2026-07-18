import { describe, expect, it } from 'bun:test';
import { buildPlannerPlatforms } from './planner-platforms';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCalendarPostedContent,
  OrganicPlatformTag,
} from './types';

function makeDraft(platform: OrganicPlatformTag): OrganicCalendarDraft {
  return {
    id: `draft-${platform}`,
    title: 'Post',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Feb 23',
    status: 'draft',
    platforms: [platform],
    format: 'Post',
    objective: 'Engagement',
    captionPreview: '',
    tags: [],
    mediaCount: 0,
  };
}

function makeDay(slots: OrganicCalendarDraft[] = []): OrganicCalendarDay {
  return {
    id: '2026-02-23',
    label: 'Mon',
    dateLabel: 'Feb 23',
    suggestedTimes: ['9:00 AM'],
    slots,
  };
}

const platformKeys = (platforms: ReturnType<typeof buildPlannerPlatforms>) =>
  platforms.map((platform) => platform.key);

describe('buildPlannerPlatforms', () => {
  it('drops a platform with no connected account and no posts', () => {
    const platforms = buildPlannerPlatforms(['instagram'], [makeDay([makeDraft('instagram')])]);

    expect(platformKeys(platforms)).toEqual(['instagram']);
  });

  it('keeps a connected platform even when the loaded weeks hold no posts for it', () => {
    const platforms = buildPlannerPlatforms(['instagram', 'linkedin'], [makeDay()]);

    expect(platformKeys(platforms)).toEqual(['instagram', 'linkedin']);
  });

  it('keeps a platform that already has posts even when its account is not connected', () => {
    const platforms = buildPlannerPlatforms([], [makeDay([makeDraft('linkedin')])]);

    expect(platformKeys(platforms)).toContain('linkedin');
  });

  it('always leaves one schedulable row, so the planner never renders a grid with nowhere to post', () => {
    const platforms = buildPlannerPlatforms([], [makeDay()]);

    expect(platformKeys(platforms)).toEqual(['instagram']);
    expect(platforms[0]?.canCreate).toBe(true);
  });

  it('shows published platforms as read-only rows', () => {
    const postedContent: OrganicCalendarPostedContent[] = [
      {
        id: 'youtube-post',
        source: 'external',
        platform: 'youtube',
        timestamp: '2026-02-23T15:00:00.000Z',
        dayId: '2026-02-23',
        timeLabel: '3:00 PM',
        title: 'Published video',
      },
    ];

    const platforms = buildPlannerPlatforms([], [makeDay()], postedContent);

    expect(platformKeys(platforms)).toEqual(['instagram', 'youtube']);
    expect(platforms.find((platform) => platform.key === 'youtube')?.canCreate).toBe(false);
  });

  it('leaves the not-yet-supported channels out unless they are explicitly asked for', () => {
    const withoutComingSoon = buildPlannerPlatforms(['instagram'], [makeDay()]);
    const withComingSoon = buildPlannerPlatforms(['instagram'], [makeDay()], [], {
      includeComingSoon: true,
    });

    expect(withoutComingSoon.some((platform) => platform.comingSoon)).toBe(false);
    expect(platformKeys(withComingSoon)).toEqual([
      'instagram',
      'facebook',
      'youtube',
      'tiktok',
      'x',
    ]);
    expect(
      withComingSoon.filter((platform) => platform.comingSoon).every((platform) => platform.Icon),
    ).toBe(true);
  });
});
