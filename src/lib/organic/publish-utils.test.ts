import { describe, expect, it } from 'bun:test';

import type {
  OrganicCalendarDraft,
  OrganicDraftGroupMember,
} from '@/components/organic/primitives/types';
import { inferPublishPlatform, resolveGroupPublishTargets } from './publish-utils';

function makeDraft(partial: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'placement-1',
    backendDraftId: 'row-1',
    title: 'One post, three destinations',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Jun 1',
    status: 'scheduled',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'engagement',
    captionPreview: 'Shared copy',
    tags: [],
    mediaCount: 1,
    ...partial,
  };
}

function member(
  platform: OrganicDraftGroupMember['platform'],
  partial: Partial<OrganicDraftGroupMember> = {},
): OrganicDraftGroupMember {
  return {
    backendDraftId: `row-${platform}`,
    platform,
    status: 'scheduled',
    ...partial,
  };
}

describe('resolveGroupPublishTargets', () => {
  it('resolves an ungrouped draft to its own single target', () => {
    const targets = resolveGroupPublishTargets(makeDraft());
    expect(targets).toEqual([{ draftId: 'row-1', platform: 'instagram' }]);
  });

  it('returns nothing for a draft that was never persisted', () => {
    // There is no id for the publish route's claim to key on.
    expect(resolveGroupPublishTargets(makeDraft({ backendDraftId: undefined }))).toEqual([]);
  });

  it('returns every group member in canonical platform order', () => {
    const targets = resolveGroupPublishTargets(
      makeDraft({
        platforms: ['linkedin', 'instagram', 'facebook'],
        groupMembers: [member('linkedin'), member('facebook'), member('instagram')],
      }),
    );

    expect(targets).toEqual([
      { draftId: 'row-instagram', platform: 'instagram' },
      { draftId: 'row-facebook', platform: 'facebook' },
      { draftId: 'row-linkedin', platform: 'linkedin' },
    ]);
  });

  it('drops already-published members so a group publish never re-posts a live post', () => {
    const targets = resolveGroupPublishTargets(
      makeDraft({
        platforms: ['instagram', 'linkedin'],
        groupMembers: [member('instagram', { status: 'published' }), member('linkedin')],
      }),
    );

    expect(targets).toEqual([{ draftId: 'row-linkedin', platform: 'linkedin' }]);
  });

  it('drops members with no persisted row and members on unpublishable platforms', () => {
    const targets = resolveGroupPublishTargets(
      makeDraft({
        platforms: ['instagram', 'facebook', 'tiktok'],
        groupMembers: [
          member('instagram', { backendDraftId: '' }),
          member('facebook'),
          member('tiktok'),
        ],
      }),
    );

    expect(targets).toEqual([{ draftId: 'row-facebook', platform: 'facebook' }]);
  });

  it('collapses a duplicated platform onto its first member so a group cannot double-post', () => {
    const targets = resolveGroupPublishTargets(
      makeDraft({
        groupMembers: [
          member('instagram', { backendDraftId: 'row-first' }),
          member('instagram', { backendDraftId: 'row-second' }),
        ],
      }),
    );

    expect(targets).toEqual([{ draftId: 'row-first', platform: 'instagram' }]);
  });

  it('leaves the single-draft path (inferPublishPlatform) intact', () => {
    expect(inferPublishPlatform(makeDraft({ platforms: ['linkedin'] }))).toBe('linkedin');
    expect(inferPublishPlatform(makeDraft({ platforms: ['tiktok'] }))).toBeNull();
  });
});
