'use client';
import { useTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';
import { ApiError } from '@/lib/api/errors';

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
  formatError?: (error: unknown) => string,
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
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      code?: string;
    };
    if (formatError)
      return formatError(
        new ApiError(payload.message ?? 'Status change refused', response.status, payload.code),
      );
    return payload.message ?? `The server refused the change (${response.status}).`;
  } catch {
    return formatError?.(new Error('Network error')) ?? 'Network error.';
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
  const uiText = useTranslations('organic');
  const formatUiError = useUiErrorMessage();
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
          title: uiText('already_published_5df8fe6'),
          description: uiText('a_published_post_cannot_move_back_to_draft_3116d9e'),
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
          const failure = await patchDraftStatus(
            member.backendDraftId as string,
            'draft',
            headers,
            formatUiError,
          );
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
              title: uiText('could_not_move_back_to_draft_4f447ea'),
              description: [
                `${platformLabel(member)}: ${failure}`,
                uiText('postStillScheduled'),
                stranded.length > 0
                  ? uiText('postStrandedUnscheduled', {
                      platforms: stranded.map(platformLabel).join(', '),
                    })
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
          title: uiText('moved_back_to_draft_f7a819a'),
          description: uiText('this_post_will_no_longer_publish_automaticall_8acd452'),
          variant: 'success',
        });
        return true;
      } finally {
        setIsUnscheduling(false);
      }
    },
    [show, updateDraft, uiText, formatUiError],
  );

  return { unschedule, isUnscheduling };
}
