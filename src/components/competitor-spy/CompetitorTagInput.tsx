'use client';

import type { CompetitorSpyStreamFrame } from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useCompetitorSearch, useCompetitors, useCreateCompetitor } from '@/lib/api/competitorSpy';
import { streamCompetitorSync } from '@/lib/api/competitorSpyStream';
import { instagramLookupErrorKind } from '@/lib/api/errors';

const TAG_LIMIT = 5;

// The competitor search runs Instagram business_discovery. Distinguish "the brand
// has no connected Instagram" (409) and "reconnect Instagram" (503) from a genuine
// "handle isn't a public business account" so the user fixes the right thing. The
// "Track by name" fallback below stays available in every case.
const PERM_SHORT =
  'Instagram Business Discovery is not permitted for your connected account — competitor lookups read other profiles through your own Instagram Business account and need a permission your own analytics do not. Reconnecting will not fix it.';
const RATE = 'Instagram is rate-limiting your account — nothing needs reconnecting, try again in a few minutes.';

function competitorSearchErrorCopy(error: unknown): string {
  switch (instagramLookupErrorKind(error)) {
    case 'account_required':
      return 'Instagram account required — connect your Instagram business account to research competitors. You can still track by name below.';
    case 'permission_denied':
      return `${PERM_SHORT} You can still track by name below.`;
    case 'rate_limited':
      return `${RATE} You can still track by name below.`;
    case 'lookup_unavailable':
      return 'Instagram lookup is temporarily unavailable — reconnect your Instagram business account or try again shortly. You can still track by name below.';
    default:
      return 'Could not find a public Instagram business or creator account.';
  }
}

function describeFrame(frame: CompetitorSpyStreamFrame): string {
  switch (frame.type) {
    case 'competitor_started':
      return `Syncing ${frame.data.competitorName} (${frame.data.index + 1}/${frame.data.total})…`;
    case 'snapshot_diff':
      return `Found ${frame.data.fetched} ads (${frame.data.inserted} new)…`;
    case 'media_extracted':
      return 'Fetching creatives…';
    case 'creative_analyzed':
      return 'Analyzing creatives…';
    case 'paid_page_resolved':
      return `Resolved ${frame.data.competitorName} to ${frame.data.pageName}.`;
    case 'paid_page_needs_review':
      return `${frame.data.competitorName} needs a Meta Page review before paid sync.`;
    case 'competitor_skipped':
      return `${frame.data.competitorName} skipped: missing Meta Page ID.`;
    case 'awareness_block':
      return 'Building report…';
    case 'run_completed':
      return `Done — ${frame.data.snapshotsInserted} new, ${frame.data.analysisCompleted} analyzed.`;
    case 'run_error':
      return `Error: ${frame.data.message}`;
    default:
      return 'Working…';
  }
}

export function CompetitorTagInput({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const { data: competitors } = useCompetitors(brandId);
  const create = useCreateCompetitor(brandId);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query);
      setSelectedPageId(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const {
    data: competitorResult,
    isFetching,
    error: searchError,
  } = useCompetitorSearch(brandId, debounced);

  const tracked = competitors ?? [];
  const taggedCount = tracked.filter((c) => c.source === 'user' && c.status === 'active').length;
  const atLimit = taggedCount >= TAG_LIMIT;

  const alreadyTracked = (pageId: string | null, username: string | null, name: string): boolean =>
    tracked.some(
      (c) =>
        (pageId && c.metaPageId === pageId) ||
        (username && c.instagramUsername?.toLowerCase() === username.toLowerCase()) ||
        c.name.toLowerCase() === name.trim().toLowerCase(),
    );

  const selectedCandidate =
    competitorResult?.metaPageResolution.candidates.find(
      (page) => page.pageId === selectedPageId,
    ) ??
    competitorResult?.metaPageResolution.candidates[0] ??
    null;
  const account = competitorResult?.account ?? null;
  const instagramName = account?.name ?? account?.username ?? '';
  const resultAlreadyTracked =
    competitorResult && account
      ? alreadyTracked(selectedCandidate?.pageId ?? null, account.username, instagramName)
      : false;
  const limitError =
    create.error instanceof Error && create.error.message === 'competitor_limit_reached';

  const addInstagramCompetitor = () => {
    if (!competitorResult || !account || atLimit) return;
    const resolved = competitorResult.metaPageResolution;
    const selectedPageIdForCreate =
      selectedCandidate?.pageId ??
      (resolved.status === 'resolved' ? resolved.selectedPageId : null);
    const selectedPageNameForCreate =
      selectedCandidate?.pageName ??
      (resolved.status === 'resolved' ? resolved.selectedPageName : null);
    const name = account.name ?? selectedPageNameForCreate ?? account.username;
    if (alreadyTracked(selectedPageIdForCreate ?? null, account.username, name)) return;
    create.mutate(
      {
        name,
        metaPageId: selectedPageIdForCreate ?? undefined,
        metaPageName: selectedPageNameForCreate ?? undefined,
        metaPageResolutionStatus: selectedPageIdForCreate ? 'resolved' : resolved.status,
        metaPageResolutionConfidence:
          selectedCandidate?.confidence ?? resolved.confidence ?? undefined,
        metaPageResolutionCandidates: resolved.candidates,
        instagramUsername: account.username,
        instagramUserId: account.id ?? undefined,
        instagramName: account.name ?? undefined,
        instagramFollowersCount: account.followersCount ?? undefined,
      },
      {
        onSuccess: () => {
          setQuery('');
          setSelectedPageId(null);
        },
      },
    );
  };

  const addByName = () => {
    const name = query.trim();
    if (!name || atLimit) return;
    create.mutate({ name }, { onSuccess: () => setQuery('') });
  };

  const runSync = async () => {
    if (running) return;
    setRunning(true);
    setProgress('Starting sync…');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamCompetitorSync({
        brandId,
        signal: ac.signal,
        onFrame: (frame) => setProgress(describeFrame(frame)),
      });
    } catch {
      setProgress('Sync failed.');
    } finally {
      setRunning(false);
      void qc.invalidateQueries({ queryKey: ['competitor-spy'] });
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Competitors</h3>
          <p className="text-xs text-muted-foreground">
            Tag up to {TAG_LIMIT}. These also drive the competitors Trends monitors.
          </p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {taggedCount}/{TAG_LIMIT}
        </span>
      </div>

      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={atLimit}
          placeholder={
            atLimit
              ? `Limit of ${TAG_LIMIT} reached`
              : 'Search Instagram handle or brand (e.g. @nike)…'
          }
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
          aria-label="Search competitors to tag"
        />
        {!atLimit && debounced.trim().length >= 2 ? (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-md">
            {isFetching ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Searching competitor…</div>
            ) : null}

            {!isFetching && competitorResult && account ? (
              <div className="space-y-3 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {account.name ?? account.username}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      @{account.username}
                      {account.followersCount !== null
                        ? ` · ${account.followersCount.toLocaleString()} followers`
                        : ''}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-2xs font-medium text-emerald-700 dark:text-emerald-300">
                        Organic ready
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-2xs font-medium ${
                          competitorResult.paidStatus === 'ready'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : competitorResult.paidStatus === 'needs_review'
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                              : 'border-border bg-muted text-muted-foreground'
                        }`}
                      >
                        {competitorResult.paidStatus === 'ready'
                          ? 'Paid ready'
                          : competitorResult.paidStatus === 'needs_review'
                            ? 'Paid needs review'
                            : 'Paid unresolved'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={addInstagramCompetitor}
                    disabled={create.isPending || resultAlreadyTracked}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    <Plus className="size-3" />
                    Tag
                  </button>
                </div>

                {competitorResult.posts.length > 0 ? (
                  <div className="grid grid-cols-6 gap-1">
                    {competitorResult.posts.slice(0, 6).map((post) => (
                      <div
                        key={post.id}
                        className="aspect-square overflow-hidden rounded-md bg-muted"
                      >
                        {post.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={post.coverUrl} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Meta ad Page ID
                  </div>
                  {competitorResult.metaPageResolution.candidates.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {competitorResult.metaPageResolution.candidates.slice(0, 5).map((page) => (
                        <button
                          key={page.pageId}
                          type="button"
                          onClick={() => setSelectedPageId(page.pageId)}
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            (selectedCandidate?.pageId ?? null) === page.pageId
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {page.pageName} · {Math.round(page.confidence * 100)}%
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      No Page ID candidate found. Organic preview can still be tagged.
                    </div>
                  )}
                </div>

                {competitorResult.warnings.length > 0 ? (
                  <div className="text-xs text-muted-foreground">
                    {competitorResult.warnings.includes('meta_page_search_failed')
                      ? 'Ad Library Page lookup failed; Instagram lookup succeeded.'
                      : competitorResult.warnings.includes('paid_page_needs_review')
                        ? 'Pick the exact Meta Page before paid ad tracking runs.'
                        : 'Some lookup data may be incomplete.'}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!isFetching && searchError ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {competitorSearchErrorCopy(searchError)}
              </div>
            ) : null}

            <button
              type="button"
              onClick={addByName}
              className="w-full border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              Track “{query.trim()}” by name (less precise)
            </button>
          </div>
        ) : null}
      </div>

      {limitError ? (
        <p className="text-xs text-destructive">
          You can tag at most {TAG_LIMIT} competitors. Remove one first.
        </p>
      ) : null}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={runSync}
          disabled={running || tracked.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Syncing…' : 'Sync now'}
        </button>
        {progress ? <span className="text-xs text-muted-foreground">{progress}</span> : null}
      </div>
    </div>
  );
}
