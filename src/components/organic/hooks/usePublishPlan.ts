'use client';

// The publish plan the preview renders and gates on. The plan itself resolves locally, on
// every edit, through the same pure `resolvePublishPlan` the backend publishes with. Only who
// the post goes out as needs the server — the brand's candidates and the row's own stamp — and
// that comes from one dry run per row, platform and stamp. Pass the FRAME's row: each platform
// of a group is its own row, with its own caption and its own account.

import {
  checkPublishability,
  type PublishAccountCandidate,
  type PublishPlan,
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
  accounts: PublishAccountCandidate[];
  boundAccountId: string | null;
};

// Reopening a post within a minute does not refetch who it posts as. Past that, or once the
// row's stamp changes, it asks again: accounts get connected and reconnected elsewhere.
const ACCOUNT_FACTS_TTL_MS = 60_000;
const accountFactsCache = new Map<string, { facts: AccountFacts; at: number }>();

function cachedFacts(key: string): AccountFacts | undefined {
  const entry = accountFactsCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at <= ACCOUNT_FACTS_TTL_MS) return entry.facts;
  accountFactsCache.delete(key);
  return undefined;
}

export type PublishPlanState = {
  plan: PublishPlan | null;
  verdict: PublishPlanVerdict | null;
  /** False until the dry run answered: an account blocker before then is not yet known. */
  accountsLoaded: boolean;
  /** The brand's candidates for this platform, from the dry run; null until it answered. */
  accounts: PublishAccountCandidate[] | null;
};

export function usePublishPlan(
  draft: OrganicCalendarDraft,
  platform: PublishPlatform | null,
): PublishPlanState {
  const backendId = draft.backendDraftId ?? null;
  const rowKey = backendId && platform ? `${backendId}:${platform}:` : null;
  const key = rowKey ? `${rowKey}${draft.targetAccountId ?? ''}` : null;
  const [loaded, setLoaded] = React.useState<{ key: string; facts: AccountFacts } | null>(null);
  const [recheck, setRecheck] = React.useState(0);
  const cached = key ? cachedFacts(key) : undefined;
  const facts = cached ?? (loaded && loaded.key === key ? loaded.facts : null);

  // A new stamp makes every answer for the old one stale.
  React.useEffect(() => {
    if (!rowKey || !key) return;
    for (const stale of accountFactsCache.keys()) {
      if (stale.startsWith(rowKey) && stale !== key) accountFactsCache.delete(stale);
    }
  }, [rowKey, key]);

  // The account fix opens settings in a new tab. Coming back asks again, or the blocker
  // outlives the fix until a reload; the stale facts stay on screen until the answer.
  React.useEffect(() => {
    if (!key) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (accountFactsCache.get(key)?.facts.accounts.length !== 0) return;
      accountFactsCache.delete(key);
      setRecheck((count) => count + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [key]);

  React.useEffect(() => {
    if (!key || !backendId || !platform || cachedFacts(key)) return;
    const controller = new AbortController();
    http
      .request<PublishPlanDryRunResponse>({
        path: `/api/organic/calendar/drafts/${encodeURIComponent(backendId)}/publish-plan?platform=${platform}`,
        schema: publishPlanDryRunResponseSchema,
        signal: controller.signal,
      })
      .then((response) => {
        const next = { accounts: response.accounts, boundAccountId: response.boundAccountId };
        accountFactsCache.set(key, { facts: next, at: Date.now() });
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
    if (!platform) return { plan: null, verdict: null, accountsLoaded: false, accounts: null };
    const plan = resolvePublishPlan({
      draft: publishPlanDraftFromCalendarDraft(draft),
      platform,
      account: {
        boundAccountId: facts?.boundAccountId ?? draft.targetAccountId ?? null,
        accounts: facts?.accounts ?? null,
      },
      publishOptions: null,
      mediaGenerated: null,
    });
    const verdict = checkPublishability(plan);
    if (facts) return { plan, verdict, accountsLoaded: true, accounts: facts.accounts };
    const blockers = verdict.blockers.filter((issue) => issue.reason !== 'account_missing');
    return {
      plan,
      verdict: { ...verdict, blockers, publishable: blockers.length === 0 },
      accountsLoaded: false,
      accounts: null,
    };
  }, [draft, platform, facts]);
}
