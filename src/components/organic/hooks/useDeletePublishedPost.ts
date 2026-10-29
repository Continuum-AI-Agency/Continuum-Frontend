'use client';

import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useDestructiveConfirmation } from '@/components/organic/primitives/DestructiveConfirmation';
import type { OrganicCalendarPostedContent } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { postPlatformLabel } from '@/lib/organic/postPlatforms';

/** A post Continuum published to Facebook, the one platform the backend can delete from. */
export const canDeletePublishedPost = (post: OrganicCalendarPostedContent): boolean =>
  post.source === 'published_posts' && post.platform === 'facebook' && !!post.externalPostId;

/**
 * Deletes a published post from its platform, then from the planner, once the user confirms.
 * The backend changes nothing of ours until the platform confirms, so a refusal means the post
 * is still live. Never retried: like a publish, a lost response says nothing about the outcome.
 */
export function useDeletePublishedPost(onDeleted: () => void) {
  const queryClient = useQueryClient();
  const { requestDestructiveConfirmation } = useDestructiveConfirmation();
  const { show } = useToast();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const deletePost = React.useCallback(
    async (post: OrganicCalendarPostedContent) => {
      if (!post.externalPostId) return;
      const label = postPlatformLabel(post.platform);
      const confirmed = await requestDestructiveConfirmation({
        title: `Delete this post from ${label}?`,
        description: `It is removed from your ${label} Page for everyone, and this can't be undone. If it came from a draft, the draft returns to the planner.`,
        confirmLabel: `Delete from ${label}`,
      });
      if (!confirmed) return;

      setDeletingId(post.id);
      try {
        const token = await getBrowserAccessToken();
        const response = await fetch(
          `${getApiBaseUrl()}/api/organic/published-posts/${encodeURIComponent(post.externalPostId)}`,
          { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        // The platform deleted it but the planner still lists it: gone, and saying otherwise
        // would send the user to delete it again.
        const deleted = response.ok || body.error === 'deleted_records_stale';
        if (deleted) {
          await queryClient.invalidateQueries({ queryKey: ['organic-calendar-posts'] });
          onDeleted();
        }
        if (response.ok) {
          show({
            title: `Deleted from ${label}`,
            description: `The post is no longer on your ${label} Page.`,
            variant: 'success',
          });
        } else {
          show({
            title: deleted ? `Deleted from ${label}` : `Couldn't delete from ${label}`,
            description: body.message ?? `Something went wrong. The post is still on ${label}.`,
            variant: 'error',
          });
        }
      } catch {
        show({
          title: `Couldn't reach Continuum`,
          description: `Refresh the planner to see whether the post is still on ${label}.`,
          variant: 'error',
        });
      } finally {
        setDeletingId(null);
      }
    },
    [onDeleted, queryClient, requestDestructiveConfirmation, show],
  );

  return { deletePost, deletingId };
}
