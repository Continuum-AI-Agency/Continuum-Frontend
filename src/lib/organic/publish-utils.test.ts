import { describe, expect, it } from 'bun:test';

import type {
  OrganicCalendarDraft,
  OrganicDraftGroupMember,
} from '@/components/organic/primitives/types';
import {
  defaultPublishAccount,
  groupPublishBlocker,
  inferPublishPlatform,
  unpublishedMembers,
} from './publish-utils';

const IMAGE = [{ role: 'primary', kind: 'image', storageUrl: 'https://cdn.example/image.jpg' }];
const VIDEO = [{ role: 'primary', kind: 'video', storageUrl: 'https://cdn.example/clip.mp4' }];

function makeDraft(partial: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'placement-1',
    backendDraftId: 'row-instagram',
    title: 'One post, three destinations',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Jun 1',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'engagement',
    captionPreview: 'Shared copy',
    tags: [],
    mediaCount: 1,
    publishingAssets: IMAGE as never,
    ...partial,
  };
}

/** A member row other than the card's own: it carries its own draft. */
function member(
  platform: OrganicDraftGroupMember['platform'],
  draft: Partial<OrganicCalendarDraft> = {},
): OrganicDraftGroupMember {
  const status = draft.status ?? 'draft';
  return {
    backendDraftId: `row-${platform}`,
    platform,
    status,
    accountId: null,
    draft: makeDraft({
      id: `placement-1::${platform}`,
      backendDraftId: `row-${platform}`,
      platforms: [platform],
      ...draft,
    }),
  };
}

const ownRow = (status: OrganicDraftGroupMember['status'] = 'draft'): OrganicDraftGroupMember => ({
  backendDraftId: 'row-instagram',
  platform: 'instagram',
  status,
  accountId: null,
});

describe('unpublishedMembers', () => {
  it('is the card itself for a lone draft', () => {
    const card = makeDraft();
    expect(unpublishedMembers(card)).toEqual([card]);
  });

  it('drops a live member so a group publish never re-posts it', () => {
    const card = makeDraft({
      platforms: ['instagram', 'facebook', 'linkedin'],
      groupMembers: [ownRow(), member('facebook', { status: 'published' }), member('linkedin')],
    });
    expect(unpublishedMembers(card).map((draft) => draft.backendDraftId)).toEqual([
      'row-instagram',
      'row-linkedin',
    ]);
  });
});

describe('groupPublishBlocker', () => {
  it('passes a ready lone draft', () => {
    expect(groupPublishBlocker(makeDraft())).toBeNull();
  });

  it('names the reason for a lone draft without a platform prefix', () => {
    expect(groupPublishBlocker(makeDraft({ captionPreview: '' }))).toContain('caption');
  });

  // The card's row carries the group's platform union. Judged with the card's image, the
  // YouTube member (a reel with its own video) was refused.
  it('judges every member on its own platform with its own content', () => {
    const card = makeDraft({
      platforms: ['instagram', 'youtube'],
      groupMembers: [
        ownRow(),
        member('youtube', { format: 'Reel', publishingAssets: VIDEO as never }),
      ],
    });
    expect(groupPublishBlocker(card)).toBeNull();
  });

  it('names the member that is not ready', () => {
    const card = makeDraft({
      platforms: ['instagram', 'linkedin'],
      groupMembers: [ownRow(), member('linkedin', { captionPreview: '' })],
    });
    expect(groupPublishBlocker(card)).toStartWith('LinkedIn: ');
  });

  it('says so when every member is already live', () => {
    const card = makeDraft({
      platforms: ['instagram', 'linkedin'],
      groupMembers: [ownRow('published'), member('linkedin', { status: 'published' })],
    });
    expect(groupPublishBlocker(makeDraft({ ...card, status: 'published' }))).toBe(
      'Every platform of this post is already live.',
    );
  });
});

describe('inferPublishPlatform', () => {
  it('infers the publish platform for single-draft publishing', () => {
    expect(inferPublishPlatform(makeDraft({ platforms: ['linkedin'] }))).toBe('linkedin');
    expect(inferPublishPlatform(makeDraft({ platforms: ['tiktok'] }))).toBe('tiktok');
  });

  it('names the platform of the persisted row rather than the first group platform', () => {
    expect(
      inferPublishPlatform(
        makeDraft({
          backendDraftId: 'row-linkedin',
          platforms: ['instagram', 'facebook', 'linkedin'],
          groupMembers: [member('instagram'), member('facebook'), member('linkedin')],
        }),
      ),
    ).toBe('linkedin');
  });
});

describe('defaultPublishAccount', () => {
  const candidate = (id: string, extra: { isDefault?: boolean; needsReauth?: boolean } = {}) => ({
    id,
    platform: 'tiktok' as const,
    handle: id,
    displayName: null,
    avatarUrl: null,
    needsReauth: extra.needsReauth ?? false,
    isDefault: extra.isDefault ?? false,
  });

  it("takes the brand's default, else the only usable account", () => {
    expect(
      defaultPublishAccount([candidate('a'), candidate('b', { isDefault: true })], 'tiktok')?.id,
    ).toBe('b');
    expect(
      defaultPublishAccount([candidate('a'), candidate('b', { needsReauth: true })], 'tiktok')?.id,
    ).toBe('a');
  });

  it('leaves a real choice, a lapsed default and another platform unanswered', () => {
    expect(defaultPublishAccount([candidate('a'), candidate('b')], 'tiktok')).toBeNull();
    expect(
      defaultPublishAccount(
        [candidate('a', { isDefault: true, needsReauth: true }), candidate('b'), candidate('c')],
        'tiktok',
      ),
    ).toBeNull();
    expect(defaultPublishAccount([candidate('a')], 'instagram')).toBeNull();
  });
});
