'use client';

import {
  type BulkPublishCompleteEvent,
  bulkPublishCompleteEventSchema,
  PUBLISH_PLATFORM_LABELS,
  type PublishEvent,
  type PublishPlatform,
} from '@continuum/contracts';
import * as React from 'react';
import { useDestructiveConfirmation } from '@/components/organic/primitives/DestructiveConfirmation';
import {
  intentAccountName,
  type PublishIntentSummaryData,
  PublishTargetsSummary,
} from '@/components/organic/primitives/PublishIntentSummary';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { xCreditsHref } from '@/lib/billing/productAccess';
import { classifyOrganicError } from '@/lib/organic/error-handling';
import {
  buildPublishBody,
  describePublishError,
  groupPublishBlocker,
  inferPublishPlatform,
  parseSSE,
  unpublishedMembers,
} from '@/lib/organic/publish-utils';
import { useCalendarStore } from '@/lib/organic/store';

// The SSE frames are the backend's own PublishEvent union, imported rather than
// re-declared so the emit side and this interpreter cannot drift. Bulk-publish adds the
// member row's `id` to every one of them.
type ItemEvent<T extends PublishEvent['type']> = Extract<PublishEvent, { type: T }> & {
  id?: string;
};

/**
 * What /publish-intent reports: the verdict, the facts that will actually be sent, and the hash
 * the backend binds a confirmation to. `intent_hash` is null when the post is not publishable —
 * there is nothing legitimate to confirm.
 */
type PublishIntent = PublishIntentSummaryData & {
  publishable: boolean;
  platform: string;
  intent_hash: string | null;
};

async function fetchPublishIntent(backendDraftId: string): Promise<PublishIntent | null> {
  try {
    const token = await getBrowserAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(
      `${getApiBaseUrl()}/api/organic/calendar/drafts/${backendDraftId}/publish-intent`,
      { method: 'POST', headers, body: JSON.stringify({}) },
    );
    if (!response.ok) return null;
    return (await response.json()) as PublishIntent;
  } catch {
    return null;
  }
}

/** One member row of the group being published, with what its intent says it will send. */
type PublishMember = {
  draft: OrganicCalendarDraft;
  backendDraftId: string;
  platform: PublishPlatform;
  intent: PublishIntent;
};

function memberLabel(member: PublishMember): string {
  const label = PUBLISH_PLATFORM_LABELS[member.platform];
  return member.intent.account.id
    ? `${label} (${intentAccountName(member.intent.account)})`
    : label;
}

/** "Published to Instagram (@acme_a), TikTok (@acme_tt); LinkedIn failed: …" */
function describeOutcome(
  complete: BulkPublishCompleteEvent,
  members: PublishMember[],
): { published: string[]; failures: string[] } {
  const byId = new Map(members.map((member) => [member.backendDraftId, member]));
  const published: string[] = [];
  const failures: string[] = [];
  for (const result of complete.results) {
    const member = byId.get(result.id);
    const name = member
      ? memberLabel(member)
      : result.platform
        ? PUBLISH_PLATFORM_LABELS[result.platform]
        : 'One platform';
    if (result.status === 'published') published.push(name);
    else failures.push(`${name} failed: ${describePublishError(result.code, result.error)}`);
  }
  return { published, failures };
}

// ── Public types ────────────────────────────────────────────────────────────

export type PublishProgressStage = 'started' | 'container_created' | 'polling';

export type UsePublishDraftResult = {
  /** Publishes every unpublished member of the card's group (a lone draft is a group of one). */
  publish: (card: OrganicCalendarDraft) => Promise<void>;
  retryPublish: () => void;
  isPublishing: boolean;
  stage: PublishProgressStage | null;
  pollingAttempt: number;
  tokenExpired: boolean;
  error: string | null;
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePublishDraft(): UsePublishDraftResult {
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  const brandId = useCalendarStore((state) => state.accountContext.brandId);
  const { show } = useToast();
  const { requestDestructiveConfirmation } = useDestructiveConfirmation();

  const [isPublishing, setIsPublishing] = React.useState(false);
  const [stage, setStage] = React.useState<PublishProgressStage | null>(null);
  const [pollingAttempt, setPollingAttempt] = React.useState(0);
  const [tokenExpired, setTokenExpired] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Retained so the user can re-fire the last publish deliberately (retryPublish). There is no
  // timer and no retry counter: publishing is never retried automatically.
  const lastCardRef = React.useRef<OrganicCalendarDraft | null>(null);

  const publish = React.useCallback(
    async (card: OrganicCalendarDraft) => {
      const fail = (title: string, message: string) => {
        setError(message);
        show({ title, description: message, variant: 'error' });
      };

      // The invariant lives HERE, not on the buttons. Four surfaces call this hook (the
      // preview footer, the card context menu, the hover card and the command menu), and a
      // group publish must gate every member, not only the one the card shows. Every gate runs
      // before any network call. A member already live is never posted twice.
      const blocker = groupPublishBlocker(card);
      if (blocker) {
        fail('Not ready to publish', blocker);
        return;
      }
      const planned: Array<Omit<PublishMember, 'intent'>> = [];
      for (const draft of unpublishedMembers(card)) {
        const platform = inferPublishPlatform(draft);
        // A row the autosave has not created yet has no intent to confirm against.
        if (!platform || !draft.backendDraftId) {
          fail('Not saved yet', 'This post is still saving — try again in a moment.');
          return;
        }
        planned.push({ draft, backendDraftId: draft.backendDraftId, platform });
      }

      // Recorded before the preflight so `retryPublish()` still works when it is the preflight
      // that failed — otherwise a transient blip on the intent request left the user with an
      // error and a Retry button that did nothing.
      lastCardRef.current = card;

      // Ask the server what will ACTUALLY be sent for every member, show the user exactly that,
      // and carry each member's hash. A confirmation obtained against this caption/account
      // cannot be redeemed for a different one — so the dialog cannot show one thing and
      // publish another.
      const intents = await Promise.all(
        planned.map((member) => fetchPublishIntent(member.backendDraftId)),
      );
      const members: PublishMember[] = [];
      for (const [index, intent] of intents.entries()) {
        if (!intent) {
          fail(
            'Publishing failed',
            'Could not check this post before publishing. Please try again.',
          );
          return;
        }
        members.push({ ...planned[index], intent });
      }

      const destination =
        members.length === 1
          ? PUBLISH_PLATFORM_LABELS[members[0].platform]
          : `${members.length} platforms`;
      const allPublishable = members.every(
        ({ intent }) => intent.publishable && Boolean(intent.intent_hash),
      );
      const confirmed = await requestDestructiveConfirmation({
        title: `Publish to ${destination}?`,
        description: allPublishable
          ? 'This posts publicly right away and cannot be undone from Continuum. Review each account and caption below.'
          : 'This post is not ready to publish yet.',
        confirmLabel: `Publish to ${destination}`,
        confirmDisabled: !allPublishable,
        // createElement rather than JSX: this hook is a .ts module, and the summary is a real
        // component so it stays testable and reusable on its own.
        details: React.createElement(PublishTargetsSummary, {
          intents: members.map(({ intent }) => intent),
        }),
      });
      if (!confirmed) return;

      setIsPublishing(true);
      setStage(null);
      setPollingAttempt(0);
      setTokenExpired(false);
      setError(null);

      const storeIdByRow = new Map(members.map((m) => [m.backendDraftId, m.draft.id]));

      try {
        const token = await getBrowserAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        // ONE request for the whole group. No account goes with it: each member publishes to
        // its own `platform_account_id`, the account the confirm just named — a toolbar
        // default sent here used to override the stamp and post somewhere else.
        // The route lives on the Fastify backend; there is no rewrite for /api/organic/*, so a
        // relative fetch here 404s in production.
        const response = await fetch(
          `${getApiBaseUrl()}/api/organic/calendar/drafts/bulk-publish`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              items: members.map((member) => ({
                id: member.backendDraftId,
                ...buildPublishBody(member.draft, member.platform, null, brandId),
                // The hash the user's confirmation was taken against. The backend recomputes it
                // from the row at publish time and refuses a mismatch, so a member edited
                // between the dialog and this request cannot go out on the old approval.
                confirmationHash: member.intent.intent_hash,
              })),
            }),
          },
        );

        if (response.status === 401) {
          fail(
            'Publishing failed',
            classifyOrganicError({ status: 401 }, 'Publishing').userMessage,
          );
          return;
        }

        if (!response.body) {
          fail('Publishing failed', 'Empty response from server.');
          return;
        }

        let complete: BulkPublishCompleteEvent | null = null;
        let creditsExhausted = false;
        for await (const { event, data } of parseSSE(response.body)) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }

          if (event === 'complete') {
            complete = bulkPublishCompleteEventSchema.safeParse(parsed).data ?? null;
          } else if (event === 'started') {
            setStage('started');
          } else if (event === 'processing') {
            const ev = parsed as ItemEvent<'processing'>;
            setStage(ev.stage === 'polling' ? 'polling' : 'container_created');
            if (ev.stage === 'polling' && typeof ev.attempt === 'number') {
              setPollingAttempt(ev.attempt);
            }
          } else if (event === 'published') {
            const ev = parsed as ItemEvent<'published'>;
            const storeId = ev.id ? storeIdByRow.get(ev.id) : undefined;
            // platform_post_id is canonical; instagram_post_id is the legacy mirror the
            // backend dual-writes for Instagram ONLY. Stamping it for every platform put a
            // Facebook post id behind an instagram.com/p/ permalink.
            if (storeId) {
              updateDraft(storeId, (d) => ({
                ...d,
                status: 'published' as const,
                platform_post_id: ev.postId ?? null,
                ...(ev.platform === 'instagram' ? { instagram_post_id: ev.postId ?? null } : {}),
              }));
            }
          } else if (event === 'failed') {
            const ev = parsed as ItemEvent<'failed'>;
            const storeId = ev.id ? storeIdByRow.get(ev.id) : undefined;
            if (ev.code === 'already_published') {
              if (storeId) updateDraft(storeId, (d) => ({ ...d, status: 'published' as const }));
            } else {
              const classified = classifyOrganicError(
                { status: 0, message: ev.error, code: ev.code },
                'Publishing',
              );
              if (
                !classified.retryable &&
                (ev.code === 'token_expired' || ev.error.toLowerCase().includes('token'))
              ) {
                setTokenExpired(true);
              }
              if (ev.code === 'credits_exhausted') creditsExhausted = true;
            }
          }
        }

        if (!complete) {
          // The stream ended without its summary: some members may be live. Saying "failed"
          // here would invite a second click that posts them twice.
          fail(
            'Publishing status unknown',
            'The connection closed before every platform reported back. Check the post before publishing again.',
          );
          return;
        }

        const { published, failures } = describeOutcome(complete, members);
        const sentence = [
          published.length > 0 ? `Published to ${published.join(', ')}` : null,
          failures.length > 0 ? failures.join('; ') : null,
        ]
          .filter(Boolean)
          .join('; ');
        if (failures.length > 0) setError(failures.join('; '));
        show({
          title:
            complete.groupStatus === 'published'
              ? 'Published'
              : complete.groupStatus === 'partial'
                ? 'Partly published'
                : 'Publishing failed',
          description: `${sentence}.`,
          variant:
            complete.groupStatus === 'published'
              ? 'success'
              : complete.groupStatus === 'partial'
                ? 'warning'
                : 'error',
          ...(creditsExhausted && brandId
            ? {
                action: {
                  label: 'Buy X credits',
                  onClick: () => window.location.assign(xCreditsHref(brandId)),
                },
              }
            : {}),
        });
      } catch (err) {
        // NEVER auto-retry a publish. It is not idempotent, and a network-level failure tells us
        // nothing about whether the post went out — the request may have succeeded and only the
        // RESPONSE been lost. This hook used to retry twice on a backoff, and on 2026-07-14 that
        // turned one click into three live Instagram posts: the backend had stripped CORS from
        // the publish stream, so `fetch` rejected with "Failed to fetch" while the server
        // published anyway, and each retry published again.
        //
        // The user retries deliberately via `retryPublish()`. The backend's publish claim is the
        // backstop that makes even a duplicate request safe.
        fail(
          'Publishing failed',
          err instanceof Error && err.message
            ? err.message
            : 'Publishing failed. Check the post, then try again.',
        );
      } finally {
        setIsPublishing(false);
        setStage(null);
      }
    },
    [updateDraft, brandId, show, requestDestructiveConfirmation],
  );

  // The ONLY retry: the user asked for it. A publish is never replayed by a timer.
  const retryPublish = React.useCallback(() => {
    if (lastCardRef.current) publish(lastCardRef.current);
  }, [publish]);

  return { publish, retryPublish, isPublishing, stage, pollingAttempt, tokenExpired, error };
}
