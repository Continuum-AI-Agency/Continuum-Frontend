'use client';

import { type ReactNode, useMemo, useState } from 'react';

import { useInstagramCompetitorSearch, useInstagramPosts } from '@/lib/api/competitorSpy';
import { type InstagramLookupErrorKind, instagramLookupErrorKind } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import { CompetitorPostGrid } from './CompetitorPostGrid';
import { CompetitorSearchBar } from './CompetitorSearchBar';
import {
  type CompetitorPostView,
  organicPostToView,
  searchResultToViews,
} from './competitorPostView';

// Copy mirrors the shared Instagram lookup taxonomy (see instagramLookupErrorKind),
// phrased for competitor search. The 503 "reduce data" case is folded into
// lookup_unavailable — common for mega-accounts Graph refuses to enumerate.
const SEARCH_ERROR_COPY: Record<InstagramLookupErrorKind, string> = {
  account_required: 'Connect an Instagram business account to this brand to look up competitors.',
  permission_denied:
    'Instagram Business Discovery is not permitted for your connected account — competitor lookups read other profiles through your own Instagram Business account and need a permission your own analytics do not. Reconnecting will not fix it.',
  rate_limited: 'Instagram is rate-limiting your account — nothing needs reconnecting, try again in a few minutes.',
  lookup_unavailable:
    'That account is too large or temporarily unavailable — try again or pick another handle.',
  not_found: 'No public business or creator account was found for that username.',
  generic: "Couldn't load that competitor — try the exact @handle (e.g. @nike).",
};

// Feed + search-override explorer: shows the tracked competitors' recent posts as
// a thumbnail grid, and lets the user look up any public handle (Graph business_discovery,
// the same path as the AI Studio unfurl) which temporarily replaces the feed.
export function CompetitorOrganicExplorer({
  brandId,
  competitorId,
  feedLimit = 12,
  gridClassName,
  renderActions,
  className,
}: {
  brandId: string;
  competitorId?: string;
  feedLimit?: number;
  gridClassName?: string;
  renderActions?: (view: CompetitorPostView) => ReactNode;
  className?: string;
}) {
  const [input, setInput] = useState('');
  const [activeQuery, setActiveQuery] = useState<string | null>(null);

  const feed = useInstagramPosts({ brandId, competitorId, limit: feedLimit });
  const search = useInstagramCompetitorSearch(brandId, activeQuery ?? '');

  const feedViews = useMemo(() => (feed.data ?? []).map(organicPostToView), [feed.data]);
  const searchViews = useMemo(
    () => (search.data ? searchResultToViews(search.data) : []),
    [search.data],
  );

  const isSearching = activeQuery !== null;
  const searchError =
    isSearching && search.isError
      ? SEARCH_ERROR_COPY[instagramLookupErrorKind(search.error)]
      : null;

  const submit = () => {
    const clean = input.replace(/^@/, '').trim();
    if (clean.length < 2) return;
    setActiveQuery(clean);
  };

  const clear = () => {
    setActiveQuery(null);
    setInput('');
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <CompetitorSearchBar
        value={input}
        onChange={setInput}
        onSubmit={submit}
        onClear={clear}
        active={isSearching}
      />

      {isSearching && activeQuery ? (
        <p className="text-xs text-muted-foreground">
          Showing results for <span className="font-medium text-foreground">@{activeQuery}</span>
        </p>
      ) : null}

      {searchError ? (
        <p className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {searchError}
        </p>
      ) : (
        <CompetitorPostGrid
          views={isSearching ? searchViews : feedViews}
          isLoading={isSearching ? search.isLoading : feed.isLoading}
          isError={isSearching ? false : feed.isError}
          gridClassName={gridClassName}
          renderActions={renderActions}
          emptyText={
            isSearching
              ? 'No posts found for that account.'
              : 'No competitor posts yet — tag competitors in Brand Spy.'
          }
        />
      )}
    </div>
  );
}
