import { describe, expect, it } from 'bun:test';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { resolveDraftSelection } from './resolveDraftSelection';

const card = (overrides: Partial<OrganicCalendarDraft>): OrganicCalendarDraft =>
  ({
    id: 'card-1',
    title: 'Post',
    status: 'draft',
    platforms: ['linkedin'],
    ...overrides,
  }) as OrganicCalendarDraft;

describe('resolveDraftSelection', () => {
  it('selects a card by its own id', () => {
    expect(resolveDraftSelection({ requestedId: 'card-1', drafts: [card({})] })).toEqual({
      kind: 'select',
      draftId: 'card-1',
    });
  });

  it('selects the card a chat card names by its row id', () => {
    const drafts = [card({ id: 'local-7', backendDraftId: 'row-7' })];
    expect(resolveDraftSelection({ requestedId: 'row-7', drafts })).toEqual({
      kind: 'select',
      draftId: 'local-7',
    });
  });

  it('selects the group card that holds the row as a member', () => {
    const drafts = [
      card({
        id: 'group-head',
        backendDraftId: 'row-ig',
        groupMembers: [
          { backendDraftId: 'row-ig', platform: 'instagram' },
          { backendDraftId: 'row-li', platform: 'linkedin' },
        ] as OrganicCalendarDraft['groupMembers'],
      }),
    ];
    expect(resolveDraftSelection({ requestedId: 'row-li', drafts })).toEqual({
      kind: 'select',
      draftId: 'group-head',
    });
  });

  it('follows the row the selection last resolved to when the card changed id', () => {
    const drafts = [card({ id: 'card-new', backendDraftId: 'row-1' })];
    expect(resolveDraftSelection({ requestedId: 'card-old', drafts, lastRowId: 'row-1' })).toEqual({
      kind: 'select',
      draftId: 'card-new',
    });
  });

  it('reports a draft that is nowhere as missing instead of dropping it', () => {
    expect(
      resolveDraftSelection({
        requestedId: 'row-deleted',
        drafts: [card({ backendDraftId: 'row-1' })],
      }),
    ).toEqual({ kind: 'missing', draftId: 'row-deleted' });
  });
});
