import { describe, expect, it } from 'bun:test';
import {
  buildOrganicScopeOptions,
  organicDraftToMentionSuggestion,
  scopeOrganicPlatformAccounts,
} from './OrganicAgentPanel';
import type { OrganicCalendarDraft } from '../primitives/types';

const accountIds = {
  instagram: 'ig-1',
  facebook: 'fb-1',
};

describe('OrganicAgentPanel account scope', () => {
  it('keeps every existing default selected on first render', () => {
    expect(scopeOrganicPlatformAccounts(accountIds, Object.keys(accountIds))).toEqual(accountIds);
  });

  it('can exclude one platform account or explicitly select none', () => {
    expect(scopeOrganicPlatformAccounts(accountIds, ['instagram'])).toEqual({ instagram: 'ig-1' });
    expect(scopeOrganicPlatformAccounts(accountIds, [])).toEqual({});
  });

  it('names the currently selected account from the available options', () => {
    expect(
      buildOrganicScopeOptions(accountIds, {
        instagram: [
          { id: 'ig-other', label: 'Other Instagram' },
          { id: 'ig-1', label: 'Main Instagram' },
        ],
        facebook: [{ id: 'fb-1', label: 'Main Facebook' }],
      }),
    ).toEqual([
      { id: 'instagram', label: 'Instagram · Main Instagram' },
      { id: 'facebook', label: 'Facebook · Main Facebook' },
    ]);
  });
});

describe('organicDraftToMentionSuggestion', () => {
  it('uses the persisted draft id and carries its schedule and copy context', () => {
    const suggestion = organicDraftToMentionSuggestion(
      {
        id: 'local-client-key',
        backendDraftId: 'persisted-row-id',
        title: 'Launch teaser',
        summary: 'Product launch',
        timeLabel: '9:00 AM',
        dateLabel: 'Sep 1',
        status: 'scheduled',
        platforms: ['tiktok'],
        format: 'video',
        objective: 'Awareness',
        captionPreview: 'A short launch teaser',
        tags: [],
        mediaCount: 0,
      } satisfies OrganicCalendarDraft,
      { dayId: '2026-09-01', dateLabel: 'Tue, Sep 1', isSelected: true },
    );

    expect(suggestion.reference).toMatchObject({
      id: 'persisted-row-id',
      type: 'draft',
      label: 'Launch teaser',
      metadata: {
        draftId: 'persisted-row-id',
        backendDraftId: 'persisted-row-id',
        status: 'scheduled',
        dayId: '2026-09-01',
        dateLabel: 'Tue, Sep 1',
        timeLabel: '9:00 AM',
        platforms: ['tiktok'],
        captionPreview: 'A short launch teaser',
        format: 'video',
        isSelected: true,
      },
    });
  });
});
