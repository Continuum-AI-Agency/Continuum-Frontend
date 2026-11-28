import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { OrganicCalendarDraft } from '../primitives/types';
import {
  buildOrganicScopeOptions,
  OrganicStarterSuggestions,
  organicDraftToMentionSuggestion,
  scopeOrganicPlatformAccounts,
} from './OrganicAgentPanel';

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

describe('OrganicStarterSuggestions', () => {
  afterEach(cleanup);

  it('sends the full starter prompt on click', () => {
    const onSend = mock();
    render(<OrganicStarterSuggestions disabled={false} onSend={onSend} />);
    fireEvent.click(screen.getByRole('button', { name: /^Show me trending topics/ }));
    expect(onSend).toHaveBeenCalledWith('Show me trending topics');
  });

  it('blocks the starters while the composer is disabled', () => {
    render(<OrganicStarterSuggestions disabled onSend={() => {}} />);
    // happy-dom does not inherit disabled from a fieldset; browsers do, so assert the fieldset.
    const starter = screen.getByRole('button', { name: /^Plan this week's posts/ });
    expect(starter.closest('fieldset')?.disabled).toBe(true);
  });
});
