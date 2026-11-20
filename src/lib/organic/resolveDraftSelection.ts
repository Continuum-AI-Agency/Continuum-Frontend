import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';

export type DraftSelection =
  | { kind: 'select'; draftId: string }
  | { kind: 'missing'; draftId: string };

/**
 * Where a request to open `requestedId` lands once the Calendar has loaded. A card can be
 * named by its own id, or by a ROW id (chat cards and `?draftId=` links carry the row; a
 * card's own id can differ, and a group card holds its other rows as members). `lastRowId`
 * is the row the selection last resolved to, which is how a card that changed id under a
 * refetch is followed. Nothing found is `missing`: the planner shows "This post failed to
 * save" with Recreate, where it used to drop the selection and the click did nothing.
 */
export function resolveDraftSelection(input: {
  requestedId: string;
  drafts: readonly OrganicCalendarDraft[];
  lastRowId?: string | null;
}): DraftSelection {
  const { requestedId, drafts, lastRowId } = input;
  if (drafts.some((draft) => draft.id === requestedId)) {
    return { kind: 'select', draftId: requestedId };
  }
  const byRow = (rowId: string) =>
    drafts.find(
      (draft) =>
        draft.backendDraftId === rowId ||
        draft.groupMembers?.some((member) => member.backendDraftId === rowId),
    );
  const found = (lastRowId ? byRow(lastRowId) : undefined) ?? byRow(requestedId);
  return found ? { kind: 'select', draftId: found.id } : { kind: 'missing', draftId: requestedId };
}
