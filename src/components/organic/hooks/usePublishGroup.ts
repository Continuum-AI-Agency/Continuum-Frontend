'use client';

import type { PublishEvent, PublishPlatform } from '@continuum/contracts';
import * as React from 'react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import {
  buildPublishBody,
  describePublishError,
  type GroupPublishTarget,
  parseSSE,
  publishPlatformLabel,
  resolveGroupPublishTargets,
} from '@/lib/organic/publish-utils';
import { useCalendarStore } from '@/lib/organic/store';

// Every bulk-publish frame is a single-publish PublishEvent with the item's draft id
// injected by the route, which is the ONLY thing that says which platform it belongs to.
type GroupPublishFrame = PublishEvent & { id?: string };

export type GroupPublishMemberStatus = 'pending' | 'publishing' | 'published' | 'failed';

export type GroupPublishMemberState = {
  draftId: string;
  platform: PublishPlatform;
  status: GroupPublishMemberStatus;
  postId: string | null;
  error: string | null;
};

export type UsePublishGroupResult = {
  /** Publish every unpublished row of the draft's group through POST …/bulk-publish. */
  publishGroup: (draft: OrganicCalendarDraft) => Promise<void>;
  /** Re-send exactly ONE failed member. Only ever called from a user click. */
  retryMember: (draftId: string) => Promise<void>;
  members: GroupPublishMemberState[];
  isPublishing: boolean;
};

function initialMembers(targets: GroupPublishTarget[]): GroupPublishMemberState[] {
  return targets.map((target) => ({
    draftId: target.draftId,
    platform: target.platform,
    status: 'pending' as const,
    postId: null,
    error: null,
  }));
}

/** "Published to 2 of 3 — LinkedIn failed": ONE line covering the whole group. */
function summarize(members: GroupPublishMemberState[]): {
  title: string;
  description: string;
  variant: 'success' | 'warning' | 'error';
} {
  const published = members.filter((member) => member.status === 'published');
  const failed = members.filter((member) => member.status === 'failed');
  const failedLabels = failed.map((member) => publishPlatformLabel(member.platform)).join(', ');

  if (failed.length === 0) {
    return {
      title: 'Published',
      description:
        members.length === 1
          ? `Your post is now live on ${publishPlatformLabel(members[0]?.platform)}.`
          : `Your post is now live on ${members
              .map((member) => publishPlatformLabel(member.platform))
              .join(', ')}.`,
      variant: 'success',
    };
  }

  if (published.length === 0) {
    return {
      title: 'Publishing failed',
      description: `Nothing was published — ${failedLabels} failed.`,
      variant: 'error',
    };
  }

  return {
    title: `Published to ${published.length} of ${members.length}`,
    description: `${failedLabels} failed. Retry just that platform — the ones that went out stay live.`,
    variant: 'warning',
  };
}

export function usePublishGroup(): UsePublishGroupResult {
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  const accountContext = useCalendarStore((state) => state.accountContext);
  const { show } = useToast();

  const [members, setMembers] = React.useState<GroupPublishMemberState[]>([]);
  const [isPublishing, setIsPublishing] = React.useState(false);

  // The last group we published, so a user-initiated retry can rebuild exactly one
  // item's body. There is no timer and no retry counter attached to it.
  const lastDraftRef = React.useRef<OrganicCalendarDraft | null>(null);
  const targetsRef = React.useRef<GroupPublishTarget[]>([]);
  // Mirrors `members` for the stream reducer: SSE frames arrive faster than React
  // commits, so routing on state would drop interleaved per-item updates.
  const membersRef = React.useRef<GroupPublishMemberState[]>([]);

  const writeMembers = React.useCallback((next: GroupPublishMemberState[]) => {
    membersRef.current = next;
    setMembers(next);
  }, []);

  const patchMember = React.useCallback(
    (draftId: string, patch: Partial<GroupPublishMemberState>) => {
      writeMembers(
        membersRef.current.map((member) =>
          member.draftId === draftId ? { ...member, ...patch } : member,
        ),
      );
    },
    [writeMembers],
  );

  const runPublish = React.useCallback(
    async (draft: OrganicCalendarDraft, targets: GroupPublishTarget[]) => {
      if (targets.length === 0) {
        show({
          title: 'Nothing to publish',
          description: 'This post has no platform we can publish to right now.',
          variant: 'error',
        });
        return;
      }

      setIsPublishing(true);
      for (const target of targets)
        patchMember(target.draftId, { status: 'publishing', error: null });

      try {
        const token = await getBrowserAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const items = targets.map((target) => ({
          id: target.draftId,
          ...buildPublishBody(
            draft,
            target.platform,
            accountContext.accountIds[target.platform] ?? null,
            accountContext.brandId,
          ),
        }));

        // These routes live on the Fastify backend, not the Next.js origin.
        const response = await fetch(
          `${getApiBaseUrl()}/api/organic/calendar/drafts/bulk-publish`,
          { method: 'POST', headers, body: JSON.stringify({ items }) },
        );

        if (!response.ok || !response.body) {
          for (const target of targets) {
            patchMember(target.draftId, {
              status: 'failed',
              error: 'The server rejected this publish.',
            });
          }
          show(summarize(membersRef.current));
          return;
        }

        for await (const { event, data } of parseSSE(response.body)) {
          let frame: GroupPublishFrame;
          try {
            frame = JSON.parse(data) as GroupPublishFrame;
          } catch {
            continue;
          }

          // Per-item frames are routed ONLY by id. Two platforms publish concurrently,
          // so frames interleave and any positional assumption mixes them up.
          const id = frame.id;
          if (!id) continue;

          if (event === 'published') {
            const published = frame as Extract<PublishEvent, { type: 'published' }>;
            patchMember(id, { status: 'published', postId: published.postId ?? null, error: null });
          } else if (event === 'failed') {
            const failed = frame as Extract<PublishEvent, { type: 'failed' }>;
            if (failed.code === 'already_published') {
              // The backend's publish claim already owns this row: it is live, not broken.
              patchMember(id, { status: 'published', error: null });
            } else {
              patchMember(id, {
                status: 'failed',
                error: describePublishError(failed.code, failed.error),
              });
            }
          }
        }

        const finalMembers = membersRef.current;
        // Any member the stream never resolved is a failure, not a silent success.
        const unresolved = finalMembers.filter(
          (member) =>
            targets.some((target) => target.draftId === member.draftId) &&
            member.status !== 'published' &&
            member.status !== 'failed',
        );
        if (unresolved.length > 0) {
          for (const member of unresolved) {
            patchMember(member.draftId, {
              status: 'failed',
              error: 'The platform never confirmed this post.',
            });
          }
        }

        if (membersRef.current.every((member) => member.status === 'published')) {
          updateDraft(draft.id, (current) => ({ ...current, status: 'published' as const }));
        }

        // Exactly ONE toast for the whole group, however many members it has.
        show(summarize(membersRef.current));
      } catch {
        // NEVER auto-retry. A network error says nothing about whether the posts went
        // out — the requests may have succeeded and only the RESPONSE been lost. On
        // 2026-07-14 an auto-retry on exactly this failure turned one click into three
        // live Instagram posts; across a group that multiplies by the member count.
        // The user retries a specific member deliberately via `retryMember`.
        for (const target of targets) {
          patchMember(target.draftId, {
            status: 'failed',
            error: 'Publishing failed. Check the post, then try again.',
          });
        }
        show(summarize(membersRef.current));
      } finally {
        setIsPublishing(false);
      }
    },
    [accountContext, patchMember, show, updateDraft],
  );

  const publishGroup = React.useCallback(
    async (draft: OrganicCalendarDraft) => {
      const targets = resolveGroupPublishTargets(draft);
      lastDraftRef.current = draft;
      targetsRef.current = targets;
      writeMembers(initialMembers(targets));
      await runPublish(draft, targets);
    },
    [runPublish, writeMembers],
  );

  // The ONLY retry: the user asked for this one platform. Nothing else is re-sent.
  const retryMember = React.useCallback(
    async (draftId: string) => {
      const draft = lastDraftRef.current;
      const target = targetsRef.current.find((candidate) => candidate.draftId === draftId);
      if (!draft || !target) return;
      await runPublish(draft, [target]);
    },
    [runPublish],
  );

  return { publishGroup, retryMember, members, isPublishing };
}
