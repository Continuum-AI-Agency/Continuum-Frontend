'use client';

import type { CompetitorSpyStreamFrame } from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { competitorApiCode } from '@/components/competitors/competitorErrorCopy';
import { localizeCompetitorCopy } from '@/i18n/competitorCopy';
import { useUiErrorMessage } from '@/i18n/errors';
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
const RATE =
  'Instagram is rate-limiting your account — nothing needs reconnecting, try again in a few minutes.';

function competitorSearchErrorCopy(
  error: unknown,
  uiText: ReturnType<typeof useTranslations<'competitor'>>,
): string {
  switch (instagramLookupErrorKind(error)) {
    case 'account_required':
      return localizeCompetitorCopy(
        'Instagram account required — connect your Instagram business account to research competitors. You can still track by name below.',
        uiText,
      );
    case 'permission_denied':
      return uiText('m_1bed4a3cef', {
        guidance: localizeCompetitorCopy(PERM_SHORT, uiText),
      });
    case 'facebook_login_required':
      return localizeCompetitorCopy(
        'Competitor research needs your Instagram connected through Facebook, not Instagram only. You can still track by name below.',
        uiText,
      );
    case 'rate_limited':
      return uiText('m_1bed4a3cef', {
        guidance: localizeCompetitorCopy(RATE, uiText),
      });
    case 'lookup_unavailable':
      return localizeCompetitorCopy(
        'Instagram lookup is temporarily unavailable — reconnect your Instagram business account or try again shortly. You can still track by name below.',
        uiText,
      );
    default:
      return localizeCompetitorCopy(
        'Could not find a public Instagram business or creator account.',
        uiText,
      );
  }
}

// The create route resolves the optional YouTube channel before tracking anything,
// so a bad channel fails the whole add and the user can fix or clear the field.
const YOUTUBE_ERROR_COPY: Record<string, string> = {
  youtube_url_invalid:
    'That is not a YouTube channel link. Paste a channel URL, an @handle or a channel id.',
  youtube_channel_not_found: 'No YouTube channel was found for that link.',
  youtube_unavailable:
    'YouTube lookup is unavailable right now. Try again shortly, or clear the YouTube field.',
};

function describeFrame(
  frame: CompetitorSpyStreamFrame,
  uiText: ReturnType<typeof useTranslations<'competitor'>>,
): string {
  switch (frame.type) {
    case 'competitor_started':
      return uiText('m_0e4a78ce12', {
        name: frame.data.competitorName,
        index: frame.data.index + 1,
        total: frame.data.total,
      });
    case 'snapshot_diff':
      return uiText('m_c8dc9953f3', {
        count: frame.data.fetched,
        newCount: frame.data.inserted,
      });
    case 'media_extracted':
      return localizeCompetitorCopy('Fetching creatives…', uiText);
    case 'creative_analyzed':
      return localizeCompetitorCopy('Analyzing creatives…', uiText);
    case 'paid_page_resolved':
      return uiText('m_58813d7d5e', {
        name: frame.data.competitorName,
        page: frame.data.pageName,
      });
    case 'paid_page_needs_review':
      return uiText('m_a2bbacf13e', { name: frame.data.competitorName });
    case 'competitor_skipped':
      return uiText('m_5d0a887606', { name: frame.data.competitorName });
    case 'awareness_block':
      return localizeCompetitorCopy('Building report…', uiText);
    case 'run_completed':
      return uiText('m_45f12842d3', {
        inserted: frame.data.snapshotsInserted,
        analyzed: frame.data.analysisCompleted,
      });
    case 'run_error':
      return localizeCompetitorCopy('Sync failed.', uiText);
    default:
      return localizeCompetitorCopy('Working…', uiText);
  }
}

export function CompetitorTagInput({ brandId }: { brandId: string }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('competitor');
  const formatUiError = useUiErrorMessage();
  const qc = useQueryClient();
  const { data: competitors } = useCompetitors(brandId);
  const create = useCreateCompetitor(brandId);

  const [query, setQuery] = useState('');
  const [youtube, setYoutube] = useState('');
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
  const limitError = competitorApiCode(create.error) === 'competitor_limit_reached';
  const youtubeError = competitorApiCode(create.error)
    ? (YOUTUBE_ERROR_COPY[competitorApiCode(create.error)!] ?? null)
    : null;
  const youtubeInput = youtube.trim() || undefined;

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
        youtube: youtubeInput,
      },
      {
        onSuccess: () => {
          setQuery('');
          setYoutube('');
          setSelectedPageId(null);
        },
      },
    );
  };

  const addByName = () => {
    const name = query.trim();
    if (!name || atLimit) return;
    create.mutate(
      { name, youtube: youtubeInput },
      {
        onSuccess: () => {
          setQuery('');
          setYoutube('');
        },
      },
    );
  };

  const runSync = async () => {
    if (running) return;
    setRunning(true);
    setProgress(localizeCompetitorCopy('Starting sync…', uiText));
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamCompetitorSync({
        brandId,
        signal: ac.signal,
        onFrame: (frame) => setProgress(describeFrame(frame, uiText)),
      });
    } catch {
      setProgress(localizeCompetitorCopy('Sync failed.', uiText));
    } finally {
      setRunning(false);
      void qc.invalidateQueries({ queryKey: ['competitor-spy'] });
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{uiText('competitors_e699b0b')}</h3>
          <p className="text-xs text-muted-foreground">
            {uiText.rich('sentence_0b47960cbdc8', { v0: () => TAG_LIMIT })}
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
              ? uiText('m_66aeb7bc21', { count: TAG_LIMIT })
              : uiText('search_instagram_handle_or_brand_e_g_nike_15d61e0')
          }
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
          aria-label={uiText('search_competitors_to_tag_e72e9f0')}
        />
        {!atLimit && debounced.trim().length >= 2 ? (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-md">
            {isFetching ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {uiText('searching_competitor_ffb723b')}
              </div>
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
                        ? uiText('m_cf43d01572', {
                            count: account.followersCount,
                          })
                        : ''}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-2xs font-medium text-emerald-700 dark:text-emerald-300">
                        {uiText('organic_ready_be84257')}
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
                          ? uiText('paid_ready_b330cf9')
                          : competitorResult.paidStatus === 'needs_review'
                            ? uiText('paid_needs_review_f5fe1ae')
                            : uiText('paid_unresolved_07521d6')}
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
                    {uiText('tag_1503916')}
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
                    {uiText('meta_ad_page_id_7ba8990')}
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
                          {page.pageName} ·{' '}
                          {new Intl.NumberFormat(uiLocale, {
                            style: 'percent',
                            maximumFractionDigits: 0,
                          }).format(Math.round(page.confidence * 100) / 100)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {uiText('no_page_id_candidate_found_organic_preview_ca_8bbecf4')}
                    </div>
                  )}
                </div>

                {competitorResult.warnings.length > 0 ? (
                  <div className="text-xs text-muted-foreground">
                    {competitorResult.warnings.includes('meta_page_search_failed')
                      ? uiText('ad_library_page_lookup_failed_instagram_looku_ea9834f')
                      : competitorResult.warnings.includes('paid_page_needs_review')
                        ? uiText('pick_the_exact_meta_page_before_paid_ad_track_bb4f7da')
                        : uiText('some_lookup_data_may_be_incomplete_b42ade6')}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!isFetching && searchError ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {competitorSearchErrorCopy(searchError, uiText)}
              </div>
            ) : null}

            <button
              type="button"
              onClick={addByName}
              className="w-full border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              {uiText.rich('sentence_225ea2d9f311', { v0: () => query.trim() })}
            </button>
          </div>
        ) : null}
      </div>

      <input
        value={youtube}
        onChange={(e) => setYoutube(e.target.value)}
        disabled={atLimit}
        placeholder={uiText('youtube_channel_optional_url_handle_or_channe_766e3fe')}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
        aria-label={uiText('youtube_channel_c048cfe')}
      />

      {youtubeError ? (
        <p className="text-xs text-destructive">{localizeCompetitorCopy(youtubeError, uiText)}</p>
      ) : null}

      {create.error && !limitError && !youtubeError ? (
        <p className="text-xs text-destructive">{formatUiError(create.error)}</p>
      ) : null}
      {limitError ? (
        <p className="text-xs text-destructive">
          {uiText.rich('sentence_d6bce43427d5', { v0: () => TAG_LIMIT })}
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
          {running ? uiText('syncing_8a046cc') : uiText('sync_now_885e8f4')}
        </button>
        {progress ? <span className="text-xs text-muted-foreground">{progress}</span> : null}
      </div>
    </div>
  );
}
