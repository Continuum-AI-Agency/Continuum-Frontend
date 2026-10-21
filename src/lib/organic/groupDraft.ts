// A planner card is a GROUP: one row per platform. The card is the source row's draft; every
// other member carries its own mapped draft (`groupMembers[].draft`). Whatever is shown or edited
// for one platform reads that platform's row through `resolveFrameDraft`, so a caption typed on
// the TikTok frame is the TikTok row's caption, and nothing on the card stands in for it.

import { buildPlatformCaption, type PublishPlatform } from '@continuum/contracts';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
} from '@/components/organic/primitives/types';
import { publishPlanDraftFromCalendarDraft } from '@/lib/organic/publishPlan';

/** The draft of the row that publishes `platform`: a member's own draft, else the card. */
export function resolveFrameDraft(
  card: OrganicCalendarDraft,
  platform: string,
): OrganicCalendarDraft {
  return card.groupMembers?.find((member) => member.platform === platform)?.draft ?? card;
}

/** Every member as a draft, in member order: the card for its own row, the member's draft else. */
export function groupMemberDrafts(card: OrganicCalendarDraft): OrganicCalendarDraft[] {
  const members = card.groupMembers ?? [];
  if (members.length === 0) return [card];
  return members.map((member) => member.draft ?? card);
}

export function isGroup(card: OrganicCalendarDraft): boolean {
  return (card.groupMembers?.length ?? 0) > 1;
}

/** The caption `platform` receives — the frame row's body and hashtags, assembled as published. */
export function cardCaption(card: OrganicCalendarDraft, platform: PublishPlatform): string {
  const plan = publishPlanDraftFromCalendarDraft(resolveFrameDraft(card, platform));
  return buildPlatformCaption(platform, plan.caption, plan.hashtags);
}

/** The draft with this id among the loaded days: a card, or one of a card's member rows. */
export function findDraftInDays(
  days: readonly OrganicCalendarDay[],
  draftId: string,
): OrganicCalendarDraft | undefined {
  for (const day of days) {
    for (const slot of day.slots) {
      if (slot.id === draftId) return slot;
      const member = slot.groupMembers?.find((candidate) => candidate.draft?.id === draftId);
      if (member?.draft) return member.draft;
    }
  }
  return undefined;
}

/**
 * The other rows of `draftId`'s group that take a value just saved on it: a row with nothing of
 * its own in that field (`valueOf` answers ''), or one still holding exactly what an earlier fill
 * gave it (`filled`, by row id). A platform ticked before the caption was typed or the media
 * placed copies an empty row, and that empty row's readiness then blocks the whole group's
 * publish. A row with a value of its own is never overwritten.
 */
export function groupRowsToFill(
  days: readonly OrganicCalendarDay[],
  draftId: string,
  valueOf: (draft: OrganicCalendarDraft) => string,
  filled: ReadonlyMap<string, string>,
): OrganicCalendarDraft[] {
  for (const day of days) {
    for (const card of day.slots) {
      if (!isGroup(card)) continue;
      const members = groupMemberDrafts(card);
      if (!members.some((member) => member.id === draftId)) continue;
      return members.filter((member) => {
        if (member.id === draftId || member.status === 'published') return false;
        const value = valueOf(member);
        return value === '' || filled.get(member.id) === value;
      });
    }
  }
  return [];
}
