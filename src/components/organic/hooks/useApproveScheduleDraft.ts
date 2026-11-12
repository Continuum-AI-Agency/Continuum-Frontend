'use client';

import { draftGroupApproveResponseSchema, PUBLISH_PLATFORM_LABELS } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { unpublishedMembers } from '@/lib/organic/publish-utils';
import { accountName, findAccount, usePublishAccounts } from '@/lib/organic/publishTargets';
import { useCalendarStore } from '@/lib/organic/store';
import { patchDraftStatus, platformLabel } from './useUnscheduleDraft';

// Backend gate responses surfaced to the user. `not_publishable` reasons come from
// assertPublishable (quality/media) and the unsupported-platform resolve.
const APPROVE_ERROR_MESSAGES = {
  quality_failed: 'approveQualityFailed',
  media_missing: 'approveMediaMissing',
  hyperframe_mp4_not_ready: 'approveVideoNotReady',
  unsupported_platform: 'approveUnsupported',
} as const;
function approvalMessage(
  reason: string | null | undefined,
  translate: ReturnType<typeof useTranslations<'organic'>>,
  platform: string,
): string {
  if (reason === 'account_missing') return translate('publishAccountRequired', { platform });
  if (reason === 'caption_missing') return translate('publishCaptionMissing');
  return translate(
    reason && Object.hasOwn(APPROVE_ERROR_MESSAGES, reason)
      ? APPROVE_ERROR_MESSAGES[reason as keyof typeof APPROVE_ERROR_MESSAGES]
      : 'approveUnavailable',
  );
}

export type ApproveScheduleOptions = {
  /**
   * Suppress the per-draft toasts. The bulk-approve path passes this so it can show a
   * single "Approved N • skipped M" summary instead of N toasts stacking up.
   */
  silent?: boolean;
  /**
   * Receives the reason a draft was not scheduled. A silent caller's summary toast
   * must name it — "could not be scheduled" alone hid a missing caption.
   */
  onFailure?: (message: string) => void;
};

export type UseApproveScheduleDraftResult = {
  /**
   * Persist "Approve & Schedule" for EVERY member of the card's group through the gated backend
   * chain: POST /calendar/drafts/:id/group/approve (all or nothing) → PATCH each member
   * {status:'scheduled'}. The DB approval-gate trigger rejects any direct draft→scheduled write,
   * so a local store flip alone never reaches the scheduled-publish poller. Returns true when
   * every member is now scheduled server-side.
   */
  approveAndSchedule: (
    card: OrganicCalendarDraft,
    options?: ApproveScheduleOptions,
  ) => Promise<boolean>;
  isApproving: boolean;
};

export function useApproveScheduleDraft(): UseApproveScheduleDraftResult {
  const uiText = useTranslations('organic');
  const formatUiError = useUiErrorMessage();
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  const accounts = usePublishAccounts();
  const { show } = useToast();
  const [isApproving, setIsApproving] = React.useState(false);

  const approveAndSchedule = React.useCallback(
    async (card: OrganicCalendarDraft, options?: ApproveScheduleOptions): Promise<boolean> => {
      const notify: typeof show = (toast) => {
        if (!options?.silent) show(toast);
      };
      const fail = (title: string, description: string): false => {
        options?.onFailure?.(description);
        notify({ title, description, variant: 'error' });
        return false;
      };
      // A member already live is never re-scheduled: the route refuses it, and that refusal
      // would roll back the rest of the group.
      const members = unpublishedMembers(card);
      if (!card.backendDraftId || members.some((member) => !member.backendDraftId)) {
        return fail(
          uiText('not_saved_yet_35c5fe4'),
          uiText('this_draft_has_not_been_saved_to_the_server_y_74069ce'),
        );
      }

      setIsApproving(true);
      try {
        const token = await getBrowserAccessToken();
        const authHeaders: Record<string, string> = {};
        if (token) authHeaders.Authorization = `Bearer ${token}`;
        const apiBase = getApiBaseUrl();

        // One gate for the whole group: if any member is blocked, none is approved — a post
        // that goes out on two of its three platforms is not the post the user approved.
        const approveResp = await fetch(
          `${apiBase}/api/organic/calendar/drafts/${card.backendDraftId}/group/approve`,
          { method: 'POST', headers: authHeaders },
        );
        if (!approveResp.ok) {
          const payload: unknown = await approveResp.json().catch(() => ({}));
          const group = draftGroupApproveResponseSchema.safeParse(payload).data;
          const blocked = group?.results.filter((result) => result.outcome === 'blocked') ?? [];
          if (blocked.length > 0) {
            return fail(
              uiText('approval_blocked_c669cb8'),
              blocked
                .map((result) => {
                  const message = approvalMessage(
                    result.reason,
                    uiText,
                    PUBLISH_PLATFORM_LABELS[result.platform],
                  );
                  return members.length > 1
                    ? `${PUBLISH_PLATFORM_LABELS[result.platform]}: ${message}`
                    : message;
                })
                .join('; '),
            );
          }
          const single = payload as { reason?: string; message?: string };
          return fail(
            uiText('approval_blocked_c669cb8'),
            approvalMessage(single.reason, uiText, platformLabel(card)),
          );
        }

        // scheduled_date is intentionally omitted so the route keeps each row's existing
        // timestamptz (sending the key would overwrite it). One member that will not schedule
        // takes the ones already scheduled back to draft: the poller publishes rows, and a post
        // out on some of its platforms is not the post the user approved.
        const scheduled: OrganicCalendarDraft[] = [];
        for (const member of members) {
          const failure = await patchDraftStatus(
            member.backendDraftId as string,
            'scheduled',
            authHeaders,
            formatUiError,
          );
          if (failure) {
            const stuck: OrganicCalendarDraft[] = [];
            for (const done of scheduled) {
              if (
                await patchDraftStatus(
                  done.backendDraftId as string,
                  'draft',
                  authHeaders,
                  formatUiError,
                )
              ) {
                stuck.push(done);
              }
            }
            for (const done of stuck) {
              updateDraft(done.id, (d) => ({
                ...d,
                status: 'scheduled' as const,
              }));
            }
            const reason = `${platformLabel(member)}: ${failure}`;
            return fail(
              uiText('scheduling_failed_b738a69'),
              stuck.length === 0
                ? uiText('nothingScheduledReason', { reason: reason })
                : uiText('scheduleRollbackFailed', {
                    reason: reason,
                    platforms: stuck.map(platformLabel).join(', '),
                  }),
            );
          }
          scheduled.push(member);
        }
        for (const member of members) {
          updateDraft(member.id, (d) => ({
            ...d,
            status: 'scheduled' as const,
          }));
        }

        const destinations = members.map((member) => {
          const label = platformLabel(member);
          const account = findAccount(accounts, member.targetAccountId);
          return account ? `${label} ${accountName(account)}` : label;
        });
        const when = uiText('scheduleDateTime', {
          date: card.dateLabel ?? '',
          hasTime: card.timeLabel ? 'yes' : 'no',
          time: card.timeLabel ?? '',
        });
        notify({
          title: uiText('approved_scheduled_559455a'),
          description: uiText('scheduleConfirmed', {
            hasWhen: when ? 'yes' : 'no',
            when,
            destinations: destinations.join(', '),
          }),
          variant: 'success',
        });
        return true;
      } catch {
        return fail(
          uiText('approval_failed_8246891'),
          uiText('network_error_please_try_again_9ff8cfa'),
        );
      } finally {
        setIsApproving(false);
      }
    },
    [accounts, show, updateDraft, uiText, formatUiError],
  );

  return { approveAndSchedule, isApproving };
}
