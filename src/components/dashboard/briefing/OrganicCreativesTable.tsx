'use client';

import type { OrganicCreativeMetric, OrganicCreativeRow } from '@continuum/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import {
  type InsightColumn,
  InsightDataTable,
} from '@/components/dashboard/datatable/InsightDataTable';
import type { InstagramAccountOption } from '@/components/dashboard/InstagramOrganicReportingWidget';
import { PostQuickLook } from '@/components/organic/cards/PostQuickLook';
import { DeltaBadge } from '@/components/shared/DeltaBadge';
import { ModuleShortcutLink } from '@/components/shared/ModuleShortcutLink';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useOrganicInsights } from '@/hooks/useOrganicInsights';
import { useOrganicPostDetail } from '@/hooks/useOrganicPostDetail';
import { fetchOrganicAnalytics } from '@/lib/api/organicAnalytics.client';
import { hookRateTextColor } from '@/lib/organic/hook-rate-color';
import {
  buildOrganicCreativeRows,
  extractAwarenessHookRates,
} from '@/lib/organic/organic-creative-rows';
import { resolveOrganicAccount } from '@/lib/organic/resolve-organic-account';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';
import { InsightActionsDropdown, InsightContextActions } from './insightActions';
import { LeaderboardThumbnail } from './LeaderboardThumbnail';
import { DASHBOARD_PANEL_MAX_HEIGHT } from './panelLayout';

const RANGE_PRESET = 'last_7d' as const;

type Platform = 'instagram' | 'youtube';

type PostsState =
  | { status: 'idle' | 'loading' }
  | { status: 'error' }
  | { status: 'success'; posts: OrganicPost[] };

type OrganicCreativesTableProps = {
  brandId: string;
  accounts: InstagramAccountOption[];
  youtubeAccounts?: InstagramAccountOption[];
};

type DisplayRow = OrganicCreativeRow & { rank: number };

function formatCompact(value: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

// Top organic creatives ranked by reach (views for YouTube) as a dense, sortable
// data table: each row carries its Engine B hook-rate insight inline and a
// right-click action menu. Replaces the ranked-list leaderboard while reusing
// the same data pipeline.
export function OrganicCreativesTable({
  brandId,
  accounts,
  youtubeAccounts = [],
}: OrganicCreativesTableProps) {
  const uiLocale = useLocale();

  const uiText = useTranslations('dashboard');
  const organicText = useTranslations('organic');
  const resolved = resolveOrganicAccount(brandId, accounts, youtubeAccounts);
  const integrationAccountId = resolved?.account.integrationAccountId ?? null;
  const platform: Platform = resolved?.platform ?? 'instagram';
  const metric: OrganicCreativeMetric = platform === 'youtube' ? 'views' : 'reach';
  const metricLabel = metric === 'views' ? 'Views' : 'Reach';

  const [postsState, setPostsState] = useState<PostsState>({ status: 'idle' });

  const { awareness } = useOrganicInsights({
    brandId,
    integrationAccountId,
    platform,
    rangePreset: RANGE_PRESET,
    enabled: Boolean(integrationAccountId),
  });

  // The bulk posts fetch above is cached server-side for 12h; Meta's signed
  // thumbnail/media URLs routinely expire inside that window. requestPostDetail
  // lazily resolves a fresh single-post detail (fresh thumbnail_url + full
  // caption/stats for the hovercard) per row, decoupled from the bulk fetch,
  // sharing the same cache the organic post gallery's hovercard reads from.
  const { requestPostDetail, loadingPostId, postDetailsById } = useOrganicPostDetail({
    brandId,
    platform,
    integrationAccountId,
  });

  useEffect(() => {
    if (!integrationAccountId) {
      setPostsState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setPostsState({ status: 'loading' });
    fetchOrganicAnalytics({
      brandId,
      integrationAccountId,
      platform,
      range: { preset: RANGE_PRESET },
      scope: 'posts',
      postsLimit: 25,
    })
      .then((response) => {
        if (!cancelled) setPostsState({ status: 'success', posts: response.posts ?? [] });
      })
      .catch(() => {
        if (!cancelled) setPostsState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, integrationAccountId, platform]);

  const rows = useMemo<DisplayRow[]>(() => {
    if (postsState.status !== 'success') return [];
    const awarenessHookRateById = extractAwarenessHookRates(awareness);
    return buildOrganicCreativeRows({
      posts: postsState.posts,
      metric,
      awarenessHookRateById,
      translate: organicText,
      locale: uiLocale,
    }).map((row, index) => ({ ...row, rank: index + 1 }));
  }, [postsState, awareness, metric, organicText, uiLocale]);

  // The bulk-fetched post (immediate, may carry a stale/expired thumbnail) used
  // as the hovercard's low-fidelity fallback until requestPostDetail resolves.
  const bulkPostById = useMemo(() => {
    const map = new Map<string, OrganicPost>();
    if (postsState.status === 'success') {
      for (const post of postsState.posts) map.set(post.id, post);
    }
    return map;
  }, [postsState]);

  // Relabeling for a new UI locale must not repeat post-detail requests.
  const postDetailIds = JSON.stringify(rows.map((row) => row.id));
  useEffect(() => {
    for (const id of JSON.parse(postDetailIds) as string[]) {
      requestPostDetail(id);
    }
  }, [postDetailIds, requestPostDetail]);

  const columns = useMemo<InsightColumn<DisplayRow>[]>(() => {
    const cols: InsightColumn<DisplayRow>[] = [
      {
        id: 'rank',
        header: '#',
        cellClassName: 'w-8 text-muted-foreground',
        cell: (row) => <span className="font-mono text-xs tabular-nums">{row.rank}</span>,
      },
      {
        id: 'creative',
        header: uiText('m_20ccbc66c1'),
        // max-w-0 + w-full is the table-layout trick that lets this column take
        // remaining width without expanding the table past the panel (which
        // would enable overflow-x-auto). Content truncates instead of scrolling.
        cellClassName: 'min-w-0 max-w-0 w-full overflow-hidden',
        // The lazily-fetched fresh detail (when it lands) beats the bulk row's
        // baked-in thumbnail/name, which can already be stale by render time
        // (see useOrganicPostDetail). Both feed the same PostQuickLook hovercard
        // so the full caption + stat tiles + sparkline are one hover away
        // instead of needing dedicated always-visible columns.
        cell: (row) => {
          const detail = postDetailsById[row.id];
          const fallbackPost = bulkPostById.get(row.id);
          const thumbnailUrl = detail?.thumbnailUrl ?? row.thumbnailUrl;
          const quickLookPost = detail ?? fallbackPost;
          return (
            <HoverCard
              openDelay={150}
              closeDelay={120}
              onOpenChange={(open) => {
                if (open) requestPostDetail(row.id);
              }}
            >
              <HoverCardTrigger
                render={
                  <div className="flex min-w-0 max-w-full items-center gap-3 overflow-hidden">
                    {thumbnailUrl ? (
                      <LeaderboardThumbnail
                        src={thumbnailUrl}
                        alt={row.name}
                        fallbackSeed={row.name}
                      />
                    ) : null}
                    <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
                      <p
                        className="min-w-0 flex-1 truncate text-sm text-foreground"
                        title={row.name}
                      >
                        {row.name}
                      </p>
                      {row.mediaType ? (
                        <span className="shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">
                          {row.mediaType}
                        </span>
                      ) : null}
                    </div>
                  </div>
                }
              />
              {quickLookPost ? (
                <HoverCardContent side="right" align="start" className="w-[340px] p-3">
                  <PostQuickLook post={quickLookPost} loading={loadingPostId === row.id} />
                </HoverCardContent>
              ) : null}
            </HoverCard>
          );
        },
      },
      {
        id: 'metric',
        header: metricLabel,
        align: 'right',
        sortValue: (row) => row.metricValue,
        cell: (row) => formatCompact(row.metricValue, uiLocale),
      },
      {
        id: 'hook',
        header: uiText('m_b3e0a103da'),
        align: 'right',
        sortValue: (row) => row.hookRate ?? -1,
        cell: (row) =>
          typeof row.hookRate === 'number' ? (
            <span style={{ color: hookRateTextColor(row.hookRate) }}>
              {Math.round(row.hookRate)}%
            </span>
          ) : (
            '—'
          ),
      },
      {
        id: 'delta',
        header: uiText('m_b91fb55764'),
        align: 'right',
        sortValue: (row) => row.vsAveragePct ?? 0,
        cell: (row) =>
          typeof row.vsAveragePct === 'number' ? <DeltaBadge value={row.vsAveragePct} /> : '—',
      },
    ];

    return cols;
  }, [
    metricLabel,
    postDetailsById,
    bulkPostById,
    loadingPostId,
    requestPostDetail,
    uiText,
    uiLocale,
  ]);

  return (
    <InsightDataTable
      title={uiText('top_creatives_ea765e1')}
      metricLabel={metricLabel}
      headerAction={
        <ModuleShortcutLink href="/ai-studio" label={uiText('creative_studio_c0a1ec0')} />
      }
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      maxHeight={DASHBOARD_PANEL_MAX_HEIGHT}
      defaultSort={{ columnId: 'metric', direction: 'desc' }}
      isLoading={postsState.status === 'idle' || postsState.status === 'loading'}
      emptyState={
        postsState.status === 'error'
          ? uiText('creativesLoadFailedEmpty')
          : uiText('creativeNoPostsEmpty')
      }
      contextMenu={(row) => <InsightContextActions permalink={row.permalink} />}
      rowActions={(row) => <InsightActionsDropdown permalink={row.permalink} />}
    />
  );
}
