'use client';

import {
  type DraftFanOutAccounts,
  type DraftFanOutResponse,
  draftFanOutResponseSchema,
  type PublishPlatform,
  toPublishPlatform,
} from '@continuum/contracts';
import * as React from 'react';
import { useApproveScheduleDraft } from '@/components/organic/hooks/useApproveScheduleDraft';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { publishPlatformLabel } from '@/lib/organic/publish-utils';
import { useCalendarStore } from '@/lib/organic/store';

const FAN_OUT_ERROR_MESSAGES: Record<string, string> = {
  source_published: 'This post is already live — it can no longer be split across platforms.',
  validation_error: 'Pick at least one platform to post to.',
};

export type UseFanOutDraftResult = {
  /**
   * Mint one sibling draft row per selected platform, then approve+schedule every row.
   *
   * Fan-out happens at approve, not at selection: before it there is ONE row, so the
   * copy/media are shared by construction; after it each platform is deliberately an
   * independent post that can be tailored on its own. Returns true only when every
   * member ended up scheduled.
   */
  fanOutAndApprove: (draft: OrganicCalendarDraft) => Promise<boolean>;
  isFanningOut: boolean;
};

export function useFanOutDraft(): UseFanOutDraftResult {
  const accountContext = useCalendarStore((state) => state.accountContext);
  const requestCalendarRefetch = useCalendarStore((state) => state.requestCalendarRefetch);
  const { approveAndSchedule } = useApproveScheduleDraft();
  const { show } = useToast();
  const [isFanningOut, setIsFanningOut] = React.useState(false);

  const fanOutAndApprove = React.useCallback(
    async (draft: OrganicCalendarDraft): Promise<boolean> => {
      const backendDraftId = draft.backendDraftId;
      if (!backendDraftId) {
        show({
          title: 'Not saved yet',
          description: 'This draft has not been saved to the server yet — try again in a moment.',
          variant: 'error',
        });
        return false;
      }

      const platforms = draft.platforms
        .map((platform) => toPublishPlatform(platform))
        .filter((platform): platform is PublishPlatform => platform !== null);
      if (platforms.length === 0) {
        show({
          title: 'No publishable platform',
          description: "None of this post's platforms can be published to yet.",
          variant: 'error',
        });
        return false;
      }

      // Explicit per-platform accounts. Fan-out never guesses: an Instagram account id
      // stamped on a LinkedIn row would publish to the wrong place.
      const accounts: DraftFanOutAccounts = {};
      for (const platform of platforms) {
        const accountId = accountContext.accountIds[platform];
        if (accountId) accounts[platform] = accountId;
      }

      setIsFanningOut(true);
      try {
        const token = await getBrowserAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetch(
          `${getApiBaseUrl()}/api/organic/calendar/drafts/${backendDraftId}/fan-out`,
          { method: 'POST', headers, body: JSON.stringify({ platforms, accounts }) },
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          show({
            title: 'Could not split this post',
            description:
              (payload.error && FAN_OUT_ERROR_MESSAGES[payload.error]) ??
              payload.message ??
              'The post could not be split across platforms.',
            variant: 'error',
          });
          return false;
        }

        const parsed = draftFanOutResponseSchema.safeParse(await response.json());
        if (!parsed.success) {
          show({
            title: 'Could not split this post',
            description: 'The server returned an unexpected response.',
            variant: 'error',
          });
          return false;
        }
        const fanOut: DraftFanOutResponse = parsed.data;

        // Approve each member in turn, silently — one summary toast beats N toasts.
        // The source keeps the local draft id so its store row flips to scheduled; the
        // siblings get synthetic ids so they cannot overwrite it mid-loop.
        const outcomes = await Promise.all(
          fanOut.members.map(async (member) => {
            const memberDraft: OrganicCalendarDraft = {
              ...draft,
              id: member.isSource ? draft.id : `${draft.id}::${member.platform}`,
              backendDraftId: member.id,
              platforms: [member.platform],
            };
            const approved = await approveAndSchedule(memberDraft, { silent: true });
            return { platform: member.platform, approved };
          }),
        );

        const failed = outcomes.filter((outcome) => !outcome.approved);
        if (failed.length === 0) {
          show({
            title: `Approved for ${outcomes.length} platform${outcomes.length === 1 ? '' : 's'}`,
            description: `${outcomes
              .map((outcome) => publishPlatformLabel(outcome.platform))
              .join(', ')} will publish automatically at the scheduled time.`,
            variant: 'success',
          });
        } else {
          show({
            title: `Approved ${outcomes.length - failed.length} of ${outcomes.length}`,
            description: `${failed
              .map((outcome) => publishPlatformLabel(outcome.platform))
              .join(', ')} could not be scheduled — open that post and try again.`,
            variant: 'warning',
          });
        }

        // The siblings are new rows; the grid only learns about them on a refetch.
        requestCalendarRefetch();
        return failed.length === 0;
      } catch {
        show({
          title: 'Could not split this post',
          description: 'Network error. Please try again.',
          variant: 'error',
        });
        return false;
      } finally {
        setIsFanningOut(false);
      }
    },
    [accountContext, approveAndSchedule, requestCalendarRefetch, show],
  );

  return { fanOutAndApprove, isFanningOut };
}
