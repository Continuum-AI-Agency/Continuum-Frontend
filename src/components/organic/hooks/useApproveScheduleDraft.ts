'use client';

import * as React from 'react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { useCalendarStore } from '@/lib/organic/store';

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
   * Persist "Approve & Schedule" through the gated backend chain:
   * POST /calendar/drafts/:id/approve → PATCH /calendar/drafts/:id {status:'scheduled'}.
   * The DB approval-gate trigger rejects any direct draft→scheduled write, so a
   * local store flip alone never reaches the scheduled-publish poller. Returns
   * true when the draft is now scheduled server-side.
   */
  approveAndSchedule: (
    draft: OrganicCalendarDraft,
    options?: ApproveScheduleOptions,
  ) => Promise<boolean>;
  isApproving: boolean;
};

export function useApproveScheduleDraft(): UseApproveScheduleDraftResult {
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  const { show } = useToast();
  const [isApproving, setIsApproving] = React.useState(false);

  const approveAndSchedule = React.useCallback(
    async (draft: OrganicCalendarDraft, options?: ApproveScheduleOptions): Promise<boolean> => {
      const notify: typeof show = (toast) => {
        if (!options?.silent) show(toast);
      };
      const fail = (title: string, description: string): false => {
        options?.onFailure?.(description);
        notify({ title, description, variant: 'error' });
        return false;
      };
      const backendDraftId = draft.backendDraftId;
      if (!backendDraftId) {
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

        const approveResp = await fetch(
          `${apiBase}/api/organic/calendar/drafts/${backendDraftId}/approve`,
          { method: 'POST', headers: authHeaders },
        );

        if (!approveResp.ok) {
          const payload = (await approveResp.json().catch(() => ({}))) as {
            error?: string;
            reason?: string;
            message?: string;
          };
          // invalid_state = the row is already approved/scheduled — scheduling may
          // still proceed; every other rejection (quality/media gate) is terminal.
          if (payload.error !== 'invalid_state') {
            return fail(
              'Approval blocked',
              (payload.reason && APPROVE_ERROR_MESSAGES[payload.reason]) ??
                payload.message ??
                'The draft could not be approved.',
            );
          }
        }

        // scheduled_date is intentionally omitted so the route keeps the draft's
        // existing timestamptz (sending the key would overwrite it).
        const scheduleResp = await fetch(
          `${apiBase}/api/organic/calendar/drafts/${backendDraftId}`,
          {
            method: 'PATCH',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'scheduled' }),
          },
        );

        if (!scheduleResp.ok) {
          const payload = (await scheduleResp.json().catch(() => ({}))) as { message?: string };
          return fail(
            'Scheduling failed',
            payload.message ?? 'The draft was approved but could not be scheduled.',
          );
        }

        updateDraft(draft.id, (d) => ({ ...d, status: 'scheduled' as const }));
        notify({
          title: 'Approved & scheduled',
          description: 'The post will publish automatically at its scheduled time.',
          variant: 'success',
        });
        return true;
      } catch {
        return fail('Approval failed', 'Network error. Please try again.');
      } finally {
        setIsApproving(false);
      }
    },
    [show, updateDraft],
  );

  return { approveAndSchedule, isApproving };
}
