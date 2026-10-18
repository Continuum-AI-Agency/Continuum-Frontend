'use client';

import { draftGroupApproveResponseSchema, PUBLISH_PLATFORM_LABELS } from '@continuum/contracts';
import * as React from 'react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { unpublishedMembers } from '@/lib/organic/publish-utils';
import { accountName, findAccount, usePublishAccounts } from '@/lib/organic/publishTargets';
import { useCalendarStore } from '@/lib/organic/store';
import { patchDraftStatus, platformLabel } from './useUnscheduleDraft';

// Backend gate responses surfaced to the user. `not_publishable` reasons come from
// assertPublishable (quality/media) and the unsupported-platform resolve.
const APPROVE_ERROR_MESSAGES: Record<string, string> = {
  quality_failed: 'This draft failed quality review — revise it before approving.',
  media_missing: 'This draft has no publishable media yet — generate or attach a creative first.',
  hyperframe_mp4_not_ready: 'The video is still rendering — approve once it is ready.',
  unsupported_platform: "Posts for this platform can't be auto-published yet.",
};

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
          'Not saved yet',
          'This draft has not been saved to the server yet — try again in a moment.',
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
              'Approval blocked',
              blocked
                .map((result) => {
                  const message =
                    result.message ??
                    (result.reason ? APPROVE_ERROR_MESSAGES[result.reason] : undefined) ??
                    'This platform could not be approved.';
                  return members.length > 1
                    ? `${PUBLISH_PLATFORM_LABELS[result.platform]}: ${message}`
                    : message;
                })
                .join('; '),
            );
          }
          const single = payload as { reason?: string; message?: string };
          return fail(
            'Approval blocked',
            (single.reason && APPROVE_ERROR_MESSAGES[single.reason]) ??
              single.message ??
              'The draft could not be approved.',
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
          );
          if (failure) {
            const stuck: OrganicCalendarDraft[] = [];
            for (const done of scheduled) {
              if (await patchDraftStatus(done.backendDraftId as string, 'draft', authHeaders)) {
                stuck.push(done);
              }
            }
            for (const done of stuck) {
              updateDraft(done.id, (d) => ({ ...d, status: 'scheduled' as const }));
            }
            const reason = `${platformLabel(member)}: ${failure}`;
            return fail(
              'Scheduling failed',
              stuck.length === 0
                ? `Nothing was scheduled. ${reason}`
                : `${reason} ${stuck.map(platformLabel).join(', ')} could not be reverted and will publish at its scheduled time.`,
            );
          }
          scheduled.push(member);
        }
        for (const member of members) {
          updateDraft(member.id, (d) => ({ ...d, status: 'scheduled' as const }));
        }

        const destinations = members.map((member) => {
          const label = platformLabel(member);
          const account = findAccount(accounts, member.targetAccountId);
          return account ? `${label} ${accountName(account)}` : label;
        });
        const when = [card.dateLabel, card.timeLabel].filter(Boolean).join(' at ');
        notify({
          title: 'Approved & scheduled',
          description: `Scheduled${when ? ` for ${when}` : ''} · ${destinations.join(', ')}`,
          variant: 'success',
        });
        return true;
      } catch {
        return fail('Approval failed', 'Network error. Please try again.');
      } finally {
        setIsApproving(false);
      }
    },
    [accounts, show, updateDraft],
  );

  return { approveAndSchedule, isApproving };
}
