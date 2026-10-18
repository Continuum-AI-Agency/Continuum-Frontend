'use client';

// A post's platforms are its rows. Ticking one creates its row at once (`/fan-out`, the FULL
// ticked set); unticking one removes its row in one server transaction (`/group/remove`), the
// card's own row included: the server promotes another member to carry the post. Either way the
// server's answer is written into the card at once (a second tick before the refetch must build
// on it) and the calendar is refetched. It never approves: that is the workspace's.

import {
  type DraftFanOutAccounts,
  type DraftFanOutResponse,
  type DraftGroupResponse,
  draftFanOutResponseSchema,
  draftGroupResponseSchema,
  PUBLISH_PLATFORM_LABELS,
  PUBLISH_PLATFORM_ORDER,
  type PublishPlatform,
  toPublishPlatform,
} from '@continuum/contracts';
import * as React from 'react';
import type {
  OrganicCalendarDraft,
  OrganicDraftGroupMember,
} from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { ApiError } from '@/lib/api/errors';
import { request } from '@/lib/api/http';
import { inferPublishPlatform } from '@/lib/organic/publish-utils';
import { useCalendarStore } from '@/lib/organic/store';

export type UseDraftMembershipResult = {
  /** Make the card's group exactly `platforms`. True when the server holds that set. */
  setPlatforms: (
    card: OrganicCalendarDraft,
    platforms: readonly string[],
    accounts?: DraftFanOutAccounts,
  ) => Promise<boolean>;
  isSaving: boolean;
};

function inOrder(platforms: readonly string[]): PublishPlatform[] {
  const wanted = new Set(platforms.map((platform) => toPublishPlatform(platform)));
  return PUBLISH_PLATFORM_ORDER.filter((platform) => wanted.has(platform));
}

/**
 * The card as the server now holds its group. A member the card already knew keeps its own
 * draft; a row this call created stands in as a copy of the card's row (the server copied it
 * from there) under the NEW row's id, so its frame edits that row from the first keystroke —
 * never the card's — until the refetch maps it for real.
 */
export function withServerMembers(
  card: OrganicCalendarDraft,
  answer: DraftFanOutResponse,
): OrganicCalendarDraft {
  const known = new Map((card.groupMembers ?? []).map((member) => [member.backendDraftId, member]));
  const groupMembers = answer.members.map((member): OrganicDraftGroupMember => {
    const was = known.get(member.id);
    if (was) return { ...was, accountId: member.platformAccountId };
    return {
      backendDraftId: member.id,
      platform: member.platform,
      status: 'draft',
      clientKey: member.clientKey,
      accountId: member.platformAccountId,
      draft: member.isSource
        ? undefined
        : {
            ...card,
            // The id the refetch will map this row to (its slot_data.placementId is its client
            // key), so typing in flight survives the refetch instead of resetting its editor.
            id: member.clientKey === card.id ? `${card.id}::${member.platform}` : member.clientKey,
            backendDraftId: member.id,
            clientKey: member.clientKey,
            status: 'draft',
            platforms: [member.platform],
            targetAccountId: member.platformAccountId ?? undefined,
            groupId: answer.groupId,
            groupMembers: undefined,
            // The new row's token is not in the answer; a null token is the route's "no check".
            updatedAt: null,
          },
    };
  });
  return {
    ...card,
    groupId: answer.groupId,
    platforms: inOrder(groupMembers.map((member) => member.platform)),
    groupMembers,
  };
}

/** Why the server would not remove `platform`'s row, in plain words. */
export function removalRefusal(platform: PublishPlatform, error: unknown): string {
  const label = PUBLISH_PLATFORM_LABELS[platform];
  if (!(error instanceof ApiError)) return 'Network error. Nothing changed; try again.';
  const code =
    error.code ?? (typeof error.payload?.error === 'string' ? error.payload.error : null);
  switch (code) {
    case 'member_scheduled':
      return `${label} is scheduled. Move it back to draft before removing it.`;
    case 'already_published':
      return `${label} is already live, so it stays part of this post.`;
    case 'last_member':
      return 'A post needs at least one platform. Delete the draft instead.';
    case 'persist_failed':
      return error.status === 409
        ? `${label} was scheduled or published while it was being removed. Nothing changed.`
        : `Could not remove ${label}. Nothing changed; try again.`;
    default:
      return error.message;
  }
}

/**
 * The card after `group/remove` answered with the post as it now stands. When the card's own row
 * went, the promoted member's draft becomes the card (its caption, account, media), keeping the
 * card's id and client key (the promoted row now holds that key). The card always keeps a row id,
 * so the browser autosave, which only inserts rows that have none, can never write it again under
 * the promoted row's OLD key before the refetch maps the rows for real.
 */
export function withGroupAfterRemoval(
  card: OrganicCalendarDraft,
  answer: DraftGroupResponse,
): OrganicCalendarDraft {
  const known = new Map((card.groupMembers ?? []).map((member) => [member.backendDraftId, member]));
  const source = answer.members.find((member) => member.id === answer.sourceId);
  const promoted = source && source.id !== card.backendDraftId ? source : null;
  const base = promoted ? (known.get(promoted.id)?.draft ?? card) : card;
  const head: OrganicCalendarDraft = promoted
    ? {
        ...base,
        id: card.id,
        clientKey: card.clientKey,
        backendDraftId: promoted.id,
        captionPreview: promoted.caption ?? base.captionPreview,
        targetAccountId: promoted.accountId ?? undefined,
        updatedAt: promoted.updatedAt ?? base.updatedAt,
      }
    : card;
  const groupMembers = answer.members.map((member): OrganicDraftGroupMember => {
    const was = known.get(member.id);
    const entry: OrganicDraftGroupMember = {
      backendDraftId: member.id,
      platform: member.platform,
      status: was?.draft?.status ?? was?.status ?? head.status,
      clientKey: member.id === answer.sourceId ? card.clientKey : was?.clientKey,
      accountId: member.accountId,
    };
    if (member.id === answer.sourceId) return entry;
    return {
      ...entry,
      draft: was?.draft ?? {
        ...head,
        id: `${card.id}::${member.platform}`,
        backendDraftId: member.id,
        platforms: [member.platform],
        captionPreview: member.caption ?? head.captionPreview,
        targetAccountId: member.accountId ?? undefined,
        updatedAt: member.updatedAt,
        groupMembers: undefined,
      },
    };
  });
  return {
    ...head,
    groupId: answer.groupId ?? head.groupId,
    platforms: inOrder(groupMembers.map((member) => member.platform)),
    groupMembers,
  };
}

export function useDraftMembership(): UseDraftMembershipResult {
  const requestCalendarRefetch = useCalendarStore((state) => state.requestCalendarRefetch);
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  const { show } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);

  const fanOut = React.useCallback(
    async (
      rowId: string,
      platforms: PublishPlatform[],
      accounts?: DraftFanOutAccounts,
    ): Promise<DraftFanOutResponse | null> => {
      try {
        return await request<DraftFanOutResponse>({
          path: `/api/organic/calendar/drafts/${encodeURIComponent(rowId)}/fan-out`,
          method: 'POST',
          body: accounts ? { platforms, accounts } : { platforms },
          schema: draftFanOutResponseSchema,
        });
      } catch (error) {
        show({
          title: 'Platforms not changed',
          description:
            error instanceof ApiError ? error.message : 'Network error. Please try again.',
          variant: 'error',
        });
        return null;
      }
    },
    [show],
  );

  const removeMember = React.useCallback(
    async (memberId: string, platform: PublishPlatform): Promise<DraftGroupResponse | null> => {
      try {
        return await request<DraftGroupResponse>({
          path: `/api/organic/calendar/drafts/${encodeURIComponent(memberId)}/group/remove`,
          method: 'POST',
          schema: draftGroupResponseSchema,
        });
      } catch (error) {
        show({
          title: 'Platform not removed',
          description: removalRefusal(platform, error),
          variant: 'error',
        });
        return null;
      }
    },
    [show],
  );

  const setPlatforms = React.useCallback(
    async (
      card: OrganicCalendarDraft,
      platforms: readonly string[],
      // The account each NEW row posts as, when the caller already showed one (the composer).
      accounts?: DraftFanOutAccounts,
    ): Promise<boolean> => {
      const next = inOrder(platforms);
      if (!card.backendDraftId || !inferPublishPlatform(card)) {
        show({
          title: 'Not saved yet',
          description: 'This draft is still saving — try again in a moment.',
          variant: 'error',
        });
        return false;
      }
      // A post keeps at least one platform.
      if (next.length === 0) return false;

      setIsSaving(true);
      let current = card;
      try {
        // Removals first, one transaction each; the card's own row may go (another is promoted).
        for (const platform of inOrder(card.platforms).filter((p) => !next.includes(p))) {
          const memberId =
            platform === inferPublishPlatform(current)
              ? current.backendDraftId
              : current.groupMembers?.find((member) => member.platform === platform)
                  ?.backendDraftId;
          if (!memberId) {
            show({
              title: 'Platform not removed',
              description: 'This post is still saving — try again in a moment.',
              variant: 'error',
            });
            return false;
          }
          const answer = await removeMember(memberId, platform);
          if (!answer) return false;
          current = withGroupAfterRemoval(current, answer);
          updateDraft(card.id, (existing) => withGroupAfterRemoval(existing, answer));
        }

        if (next.some((platform) => !current.platforms.includes(platform))) {
          const saved = await fanOut(current.backendDraftId as string, next, accounts);
          if (!saved) return false;
          updateDraft(card.id, (existing) => withServerMembers(existing, saved));
          // A published member is never deleted: deselecting it is refused, and said so.
          if (saved.retained.length > 0) {
            show({
              title: 'Already published',
              description: `${saved.retained
                .map((member) => PUBLISH_PLATFORM_LABELS[member.platform])
                .join(', ')} stays: that post is live.`,
              variant: 'error',
            });
          }
        }
        return true;
      } finally {
        setIsSaving(false);
        // The promoted row's key changed: only the refetch maps the rows as they now are.
        requestCalendarRefetch();
      }
    },
    [fanOut, removeMember, requestCalendarRefetch, show, updateDraft],
  );

  return { setPlatforms, isSaving };
}
