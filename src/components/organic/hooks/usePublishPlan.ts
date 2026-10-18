'use client';

// The publish plan the preview renders and gates on. The plan itself resolves locally, on
// every edit, through the same pure `resolvePublishPlan` the backend publishes with. Only who
// the post goes out as needs the server — the brand's connected accounts and the row's own
// stamp — and that comes from one dry run per draft, platform and account choice.

import {
  checkPublishability,
  type PublishPlan,
  type PublishPlanAccountCandidate,
  type PublishPlanDryRunResponse,
  type PublishPlanVerdict,
  type PublishPlatform,
  publishPlanDryRunResponseSchema,
  resolvePublishPlan,
} from '@continuum/contracts';
import * as React from 'react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { http } from '@/lib/api/http';
import { publishPlanDraftFromCalendarDraft } from '@/lib/organic/publishPlan';

type AccountFacts = {
  accounts: PublishPlanAccountCandidate[];
  boundAccountId: string | null;
};

// Reopening a post must not refetch who it posts as; nothing in this panel changes that
// without also changing the key (platform or account). Connecting the first account does,
// in another tab — see the visibility recheck below.
const accountFactsCache = new Map<string, AccountFacts>();

export type PublishPlanState = {
  plan: PublishPlan | null;
  verdict: PublishPlanVerdict | null;
  /** False until the dry run answered: an account blocker before then is not yet known. */
  accountsLoaded: boolean;
};

export function usePublishPlan(
  draft: OrganicCalendarDraft,
  platform: PublishPlatform | null,
): PublishPlanState {
  const backendId = draft.backendDraftId ?? null;
  const key =
    backendId && platform ? `${backendId}:${platform}:${draft.targetAccountId ?? ''}` : null;
  const [loaded, setLoaded] = React.useState<{ key: string; facts: AccountFacts } | null>(null);
  const [recheck, setRecheck] = React.useState(0);
  const cached = key ? accountFactsCache.get(key) : undefined;
  const facts = cached ?? (loaded && loaded.key === key ? loaded.facts : null);

  // The account fix opens settings in a new tab. Coming back asks again, or the blocker
  // outlives the fix until a reload; the stale facts stay on screen until the answer.
  React.useEffect(() => {
    if (!key) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (accountFactsCache.get(key)?.accounts.length !== 0) return;
      accountFactsCache.delete(key);
      setRecheck((count) => count + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [key]);

  React.useEffect(() => {
    if (!key || !backendId || !platform || accountFactsCache.has(key)) return;
    const controller = new AbortController();
    http
      .request<PublishPlanDryRunResponse>({
        path: `/api/organic/calendar/drafts/${encodeURIComponent(backendId)}/publish-plan?platform=${platform}`,
        schema: publishPlanDryRunResponseSchema,
        signal: controller.signal,
      })
      .then((response) => {
        const next = { accounts: response.accounts, boundAccountId: response.boundAccountId };
        accountFactsCache.set(key, next);
        setLoaded({ key, facts: next });
      })
      .catch((error: unknown) => {
        // Decoration, not a gate: without the accounts the plan trusts the row's stamp and
        // the account blocker stays hidden, and approve still runs the server's own gate.
        if (!controller.signal.aborted) console.warn('[publish-plan] dry run failed', error);
      });
    return () => controller.abort();
  }, [key, backendId, platform, recheck]);

  return React.useMemo(() => {
    if (!platform) return { plan: null, verdict: null, accountsLoaded: false };
    const plan = resolvePublishPlan({
      draft: publishPlanDraftFromCalendarDraft(draft),
      platform,
      account: {
        requestedAccountId: null,
        boundAccountId: facts?.boundAccountId ?? draft.targetAccountId ?? null,
        accounts: facts?.accounts ?? null,
      },
      publishOptions: null,
      mediaGenerated: null,
    });
    const verdict = checkPublishability(plan);
    if (facts) return { plan, verdict, accountsLoaded: true };
    const blockers = verdict.blockers.filter((issue) => issue.reason !== 'account_missing');
    return {
      plan,
      verdict: { ...verdict, blockers, publishable: blockers.length === 0 },
      accountsLoaded: false,
    };
  }, [draft, platform, facts]);
}
