'use client';

import type { PublishEvent } from '@continuum/contracts';
import * as React from 'react';
import { useDestructiveConfirmation } from '@/components/organic/primitives/DestructiveConfirmation';
import { PublishIntentSummary } from '@/components/organic/primitives/PublishIntentSummary';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { evaluateDraftReadiness } from '@/lib/organic/draftReadiness';
import { classifyOrganicError } from '@/lib/organic/error-handling';
import {
  buildPublishBody,
  describePublishError,
  inferPublishPlatform,
  parseSSE,
  publishPlatformLabel,
} from '@/lib/organic/publish-utils';
import { useCalendarStore } from '@/lib/organic/store';

// The SSE frames are the backend's own PublishEvent union, imported rather than
// re-declared so the emit side and this interpreter cannot drift.
type ProcessingEvent = Extract<PublishEvent, { type: 'processing' }>;
type PublishedEvent = Extract<PublishEvent, { type: 'published' }>;
type FailedEvent = Extract<PublishEvent, { type: 'failed' }>;

/**
 * What /publish-intent reports: the verdict, the facts that will actually be sent, and the hash
 * the backend binds a confirmation to. `intent_hash` is null when the post is not publishable —
 * there is nothing legitimate to confirm.
 */
type PublishIntent = {
  publishable: boolean;
  blockers: { reason: string; message: string }[];
  platform: string;
  format: string;
  account: { id: string | null; source: string };
  caption: { present: boolean; length: number; preview: string | null };
  media: { count: number; required: number; source: string };
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

// ── Public types ────────────────────────────────────────────────────────────

export type PublishProgressStage = 'started' | 'container_created' | 'polling';

export type UsePublishDraftResult = {
  publish: (draft: OrganicCalendarDraft) => Promise<void>;
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
  const accountContext = useCalendarStore((state) => state.accountContext);
  const { show } = useToast();
  const { requestDestructiveConfirmation } = useDestructiveConfirmation();

  const [isPublishing, setIsPublishing] = React.useState(false);
  const [stage, setStage] = React.useState<PublishProgressStage | null>(null);
  const [pollingAttempt, setPollingAttempt] = React.useState(0);
  const [tokenExpired, setTokenExpired] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Retained so the user can re-fire the last publish deliberately (retryPublish). There is no
  // timer and no retry counter: publishing is never retried automatically.
  const lastDraftRef = React.useRef<OrganicCalendarDraft | null>(null);

  const publish = React.useCallback(
    async (draft: OrganicCalendarDraft) => {
      // The invariant lives HERE, not on the buttons. Four surfaces call this hook (the
      // preview footer, the card context menu, the hover card and the command menu) and
      // only the footer used to check readiness — so "Publish to Instagram" was live on a
      // draft with NEEDS SETUP and no media. Both gates run before any network call.
      const platform = inferPublishPlatform(draft);
      if (!platform) {
        const message = 'This draft has no platform we can publish to.';
        setError(message);
        show({ title: 'Publishing failed', description: message, variant: 'error' });
        return;
      }

      const readiness = evaluateDraftReadiness(draft);
      if (!readiness.ready) {
        const message = readiness.reason ?? 'This post is not ready to publish yet.';
        setError(message);
        show({ title: 'Not ready to publish', description: message, variant: 'error' });
        return;
      }

      // Recorded before the preflight so `retryPublish()` still works when it is the preflight
      // that failed — otherwise a transient blip on the intent request left the user with an
      // error and a Retry button that did nothing.
      lastDraftRef.current = draft;

      // Ask the server what will ACTUALLY be sent, show the user exactly that, and carry the hash
      // it binds to. A confirmation obtained against this caption/account cannot be redeemed for
      // a different one — so the dialog cannot show one thing and publish another.
      let intent: PublishIntent | null = null;
      if (draft.backendDraftId) {
        intent = await fetchPublishIntent(draft.backendDraftId);
        if (!intent) {
          const message = 'Could not check this post before publishing. Please try again.';
          setError(message);
          show({ title: 'Publishing failed', description: message, variant: 'error' });
          return;
        }
      }

      const confirmed = await requestDestructiveConfirmation({
        title: `Publish to ${publishPlatformLabel(platform)}?`,
        description:
          intent?.publishable === false
            ? 'This post is not ready to publish yet.'
            : 'This posts publicly right away and cannot be undone from Continuum. Review the caption and account below.',
        confirmLabel: `Publish to ${publishPlatformLabel(platform)}`,
        confirmDisabled: intent ? !intent.publishable || !intent.intent_hash : false,
        // createElement rather than JSX: this hook is a .ts module, and the summary is a real
        // component so it stays testable and reusable on its own.
        ...(intent ? { details: React.createElement(PublishIntentSummary, { intent }) } : {}),
      });
      if (!confirmed) return;

      lastDraftRef.current = draft;
      setIsPublishing(true);
      setStage(null);
      setPollingAttempt(0);
      setTokenExpired(false);
      setError(null);

      try {
        const token = await getBrowserAccessToken();

        const accountId = accountContext.accountIds[platform] ?? null;

        // The hash the user's confirmation was taken against. The backend recomputes it from the
        // row at publish time and refuses a mismatch, so a draft edited between the dialog and
        // this request cannot be published on the strength of the old approval.
        const body = {
          ...buildPublishBody(draft, platform, accountId, accountContext.brandId),
          ...(intent?.intent_hash ? { confirmationHash: intent.intent_hash } : {}),
        };

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        // These routes live on the Fastify backend, not the Next.js origin, and there is no
        // rewrite for /api/organic/* — a relative fetch here 404s in production.
        const apiBase = getApiBaseUrl();

        let publishDraftId = draft.backendDraftId;
        if (!publishDraftId) {
          if (!accountContext.brandId)
            throw new Error('Brand context required to register draft for publishing');
          const createResp = await fetch(`${apiBase}/api/organic/calendar/drafts`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              brand_id: accountContext.brandId,
              platform,
              platform_account_id: accountId ?? '',
              slot_data: {
                placementId: draft.id,
                caption: draft.captionPreview,
                platform: { name: platform, accountId },
              },
              status: 'draft',
            }),
          });
          if (!createResp.ok) throw new Error('Failed to register draft before publishing');
          const created = (await createResp.json()) as { id: string };
          publishDraftId = created.id;
          updateDraft(draft.id, (d) => ({ ...d, backendDraftId: created.id }));
          if (lastDraftRef.current) {
            lastDraftRef.current = { ...lastDraftRef.current, backendDraftId: created.id };
          }
        }

        const response = await fetch(
          `${apiBase}/api/organic/calendar/drafts/${publishDraftId}/publish`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          },
        );

        if (response.status === 401) {
          const classified = classifyOrganicError({ status: 401 }, 'Publishing');
          setError(classified.userMessage);
          show({
            title: 'Publishing failed',
            description: classified.userMessage,
            variant: 'error',
          });
          return;
        }

        if (!response.body) {
          setError('Empty response from server.');
          show({ title: 'Publishing failed', description: 'Empty response.', variant: 'error' });
          return;
        }

        for await (const { event, data } of parseSSE(response.body)) {
          let parsed: PublishEvent;
          try {
            parsed = JSON.parse(data) as PublishEvent;
          } catch {
            continue;
          }

          if (event === 'started') {
            setStage('started');
          } else if (event === 'processing') {
            const ev = parsed as ProcessingEvent;
            setStage(ev.stage === 'polling' ? 'polling' : 'container_created');
            if (ev.stage === 'polling' && typeof ev.attempt === 'number') {
              setPollingAttempt(ev.attempt);
            }
          } else if (event === 'published') {
            const ev = parsed as PublishedEvent;
            // platform_post_id is canonical; instagram_post_id is the legacy mirror the
            // backend dual-writes for Instagram ONLY. Stamping it for every platform put a
            // Facebook post id behind an instagram.com/p/ permalink.
            updateDraft(draft.id, (d) => ({
              ...d,
              status: 'published' as const,
              platform_post_id: ev.postId ?? null,
              ...(ev.platform === 'instagram' ? { instagram_post_id: ev.postId ?? null } : {}),
            }));
            show({
              title: 'Published',
              description: `Your post is now live on ${publishPlatformLabel(ev.platform)}.`,
              variant: 'success',
            });
          } else if (event === 'failed') {
            const ev = parsed as FailedEvent;
            if (ev.code === 'already_published') {
              updateDraft(draft.id, (d) => ({ ...d, status: 'published' as const }));
            } else {
              const classified = classifyOrganicError(
                { status: 0, message: ev.error, code: ev.code },
                'Publishing',
              );
              if (classified.retryable) {
                setTokenExpired(false);
              } else if (ev.code === 'token_expired' || ev.error.toLowerCase().includes('token')) {
                setTokenExpired(true);
              }
              const description = describePublishError(ev.code, ev.error);
              setError(description);
              show({ title: 'Publishing failed', description, variant: 'error' });
            }
          }
        }
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
        const msg =
          err instanceof Error && err.message
            ? err.message
            : 'Publishing failed. Check the post, then try again.';
        setError(msg);
        show({ title: 'Publishing failed', description: msg, variant: 'error' });
      } finally {
        setIsPublishing(false);
        setStage(null);
      }
    },
    [updateDraft, accountContext, show, requestDestructiveConfirmation],
  );

  // The ONLY retry: the user asked for it. A publish is never replayed by a timer.
  const retryPublish = React.useCallback(() => {
    if (lastDraftRef.current) publish(lastDraftRef.current);
  }, [publish]);

  return { publish, retryPublish, isPublishing, stage, pollingAttempt, tokenExpired, error };
}
