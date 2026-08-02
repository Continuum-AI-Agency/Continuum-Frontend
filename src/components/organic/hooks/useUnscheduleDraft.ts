'use client';

/**
 * Moves a draft back to 'draft' server-side, cancelling a pending scheduled publish.
 *
 * The planner card used to do this with a local Zustand flip. That was actively dangerous, not
 * merely cosmetic: the card would render "Draft" while the server row stayed 'scheduled', so the
 * scheduled-publish poller went right on publishing a post the user believed they had pulled.
 * Un-scheduling has to reach the server or it has not happened.
 */

import * as React from 'react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { useCalendarStore } from '@/lib/organic/store';

export type UseUnscheduleDraftResult = {
  /** Returns true once the draft is back to 'draft' server-side. */
  unschedule: (draft: OrganicCalendarDraft) => Promise<boolean>;
  isUnscheduling: boolean;
};

export function useUnscheduleDraft(): UseUnscheduleDraftResult {
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  const { show } = useToast();
  const [isUnscheduling, setIsUnscheduling] = React.useState(false);

  const unschedule = React.useCallback(
    async (draft: OrganicCalendarDraft): Promise<boolean> => {
      // No server row yet means nothing is scheduled to cancel; the local flip is the whole truth.
      if (!draft.backendDraftId) {
        updateDraft(draft.id, (d) => ({ ...d, status: 'draft' as const }));
        return true;
      }

      setIsUnscheduling(true);
      try {
        const token = await getBrowserAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetch(
          `${getApiBaseUrl()}/api/organic/calendar/drafts/${draft.backendDraftId}`,
          { method: 'PATCH', headers, body: JSON.stringify({ status: 'draft' }) },
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { message?: string };
          show({
            title: 'Could not move back to draft',
            description:
              payload.message ??
              'The post is still scheduled and will publish at its scheduled time.',
            variant: 'error',
          });
          return false;
        }

        updateDraft(draft.id, (d) => ({ ...d, status: 'draft' as const }));
        show({
          title: 'Moved back to draft',
          description: 'This post will no longer publish automatically.',
          variant: 'success',
        });
        return true;
      } catch {
        show({
          title: 'Could not move back to draft',
          description:
            'Network error — the post may still be scheduled. Check its status and try again.',
          variant: 'error',
        });
        return false;
      } finally {
        setIsUnscheduling(false);
      }
    },
    [show, updateDraft],
  );

  return { unschedule, isUnscheduling };
}
