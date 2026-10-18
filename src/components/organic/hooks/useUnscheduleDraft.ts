'use client';

/**
 * Moves a draft back to 'draft' server-side, cancelling a pending scheduled publish.
 *
 * The planner card used to do this with a local Zustand flip. That was actively dangerous, not
 * merely cosmetic: the card would render "Draft" while the server row stayed 'scheduled', so the
 * scheduled-publish poller went right on publishing a post the user believed they had pulled.
 * Un-scheduling has to reach the server or it has not happened.
 *
 * A card is a GROUP — one row per platform — so every scheduled member row moves, not just the
 * card's own: the poller publishes rows, and one left 'scheduled' still goes out.
 */

import { PUBLISH_PLATFORM_LABELS } from '@continuum/contracts';
import * as React from 'react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { groupMemberDrafts } from '@/lib/organic/groupDraft';
import { isPostPlatform } from '@/lib/organic/postPlatforms';
import { inferPublishPlatform } from '@/lib/organic/publish-utils';
import { useCalendarStore } from '@/lib/organic/store';

/** PATCH one row's status. Null when it landed, else why not. */
export async function patchDraftStatus(
  backendDraftId: string,
  status: 'draft' | 'scheduled',
  headers: Record<string, string>,
): Promise<string | null> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/organic/calendar/drafts/${backendDraftId}`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      },
    );
    if (response.ok) return null;
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    return payload.message ?? `The server refused the change (${response.status}).`;
  } catch {
    return 'Network error.';
  }
}

export function platformLabel(draft: OrganicCalendarDraft): string {
  const platform = inferPublishPlatform(draft);
  return isPostPlatform(platform) ? PUBLISH_PLATFORM_LABELS[platform] : 'Post';
}

/** Put an unscheduled row back on the poller: the PATCH route schedules only approved rows. */
async function rearm(backendDraftId: string, headers: Record<string, string>): Promise<boolean> {
  try {
    const approve = await fetch(
      `${getApiBaseUrl()}/api/organic/calendar/drafts/${backendDraftId}/approve`,
      { method: 'POST', headers },
    );
    return approve.ok && (await patchDraftStatus(backendDraftId, 'scheduled', headers)) === null;
  } catch {
    return false;
  }
}

export type UseUnscheduleDraftResult = {
  /** Returns true once every scheduled member of the card is back to 'draft' server-side. */
  unschedule: (draft: OrganicCalendarDraft) => Promise<boolean>;
  isUnscheduling: boolean;
};

export function useUnscheduleDraft(): UseUnscheduleDraftResult {
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  const { show } = useToast();
  const [isUnscheduling, setIsUnscheduling] = React.useState(false);

  const unschedule = React.useCallback(
    async (card: OrganicCalendarDraft): Promise<boolean> => {
      // No server row yet means nothing is scheduled to cancel; the local flip is the whole truth.
      if (!card.backendDraftId) {
        updateDraft(card.id, (d) => ({ ...d, status: 'draft' as const }));
        return true;
      }

      // The card's own row moves whatever its status, as it always did (a failed post goes back
      // to draft too); a sibling moves when it is 'scheduled', the status the poller publishes.
      // A published row is done and never reverts.
      const targets = groupMemberDrafts(card).filter(
        (member) =>
          member.backendDraftId &&
          member.status !== 'published' &&
          (member === card || member.status === 'scheduled'),
      );
      if (targets.length === 0) {
        show({
          title: 'Already published',
          description: 'A published post cannot move back to draft.',
          variant: 'error',
        });
        return false;
      }

      setIsUnscheduling(true);
      try {
        const token = await getBrowserAccessToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const moved: OrganicCalendarDraft[] = [];
        for (const member of targets) {
          const failure = await patchDraftStatus(member.backendDraftId as string, 'draft', headers);
          if (failure) {
            // All or nothing: the scheduled rows already pulled go back on the schedule, so the
            // card still reads as the one scheduled post it is.
            const stranded: OrganicCalendarDraft[] = [];
            for (const done of moved) {
              if (done.status !== 'scheduled') continue;
              if (!(await rearm(done.backendDraftId as string, headers))) stranded.push(done);
            }
            for (const done of stranded) {
              updateDraft(done.id, (d) => ({ ...d, status: 'draft' as const }));
            }
            show({
              title: 'Could not move back to draft',
              description: [
                `${platformLabel(member)}: ${failure}`,
                'The post is still scheduled and will publish at its scheduled time.',
                stranded.length > 0
                  ? `${stranded.map(platformLabel).join(', ')} could not be re-scheduled and will not publish.`
                  : '',
              ]
                .filter(Boolean)
                .join(' '),
              variant: 'error',
            });
            return false;
          }
          moved.push(member);
        }

        for (const member of targets) {
          updateDraft(member.id, (d) => ({ ...d, status: 'draft' as const }));
        }
        show({
          title: 'Moved back to draft',
          description: 'This post will no longer publish automatically.',
          variant: 'success',
        });
        return true;
      } finally {
        setIsUnscheduling(false);
      }
    },
    [show, updateDraft],
  );

  return { unschedule, isUnscheduling };
}
