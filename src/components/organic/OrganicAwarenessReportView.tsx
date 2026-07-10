'use client';

// AI-Awareness report: a compact, self-describing block array (summary / top posts
// / content-type / narrative) rendered flat inside one card. Top-post rows link to
// the live post with a hover preview (see AwarenessTopPostRow), content-type bars
// carry share % + a breakdown tooltip, and the summary tiles surface their
// period-over-period delta so the section reads as signal, not a wall of numbers.

import type { OrganicAwarenessBlock, OrganicAwarenessReportPayload } from '@continuum/contracts';
import * as React from 'react';

import { PillDelta } from '@/components/kibo-ui/pill';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useOrganicPostDetail } from '@/hooks/useOrganicPostDetail';
import type { OrganicPlatform, OrganicPost } from '@/lib/schemas/organicMetrics';
import { cn } from '@/lib/utils';
import { AwarenessTopPostRow } from './awareness/AwarenessTopPostRow';
import type { AwarenessContentTypeRow, AwarenessTopPost } from './awareness/types';

const nf = new Intl.NumberFormat('en-US');

type Comparison = Record<string, { percentageChange?: number } | undefined> | null | undefined;

type PostDetailPlatform = Extract<
  OrganicPlatform,
  'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'linkedin'
>;

function deltaFor(comparison: Comparison, keys: string[]): number | null {
  if (!comparison) return null;
  for (const key of keys) {
    const change = comparison[key]?.percentageChange;
    if (typeof change === 'number' && Number.isFinite(change)) return change;
  }
  return null;
}

function SummaryDelta({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  return (
    <span
      className={cn(
        'mt-0.5 flex items-center gap-0.5 text-3xs tabular-nums leading-none',
        delta > 0 ? 'text-success' : delta < 0 ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      <PillDelta delta={delta} />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function SummaryBlock({ data }: { data: Record<string, unknown> }) {
  const comparison = data.comparison as Comparison;
  const metrics: Array<{ label: string; value: number; delta: number | null }> = [
    { label: 'Reach', value: Number(data.reach ?? 0), delta: deltaFor(comparison, ['reach']) },
    { label: 'Views', value: Number(data.views ?? 0), delta: deltaFor(comparison, ['views']) },
    {
      label: 'Engagement',
      value: Number(data.engagement ?? 0),
      delta: deltaFor(comparison, ['totalInteractions', 'engagement', 'accountsEngaged']),
    },
    {
      label: 'Comments',
      value: Number(data.comments ?? 0),
      delta: deltaFor(comparison, ['comments']),
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-lg bg-muted/40 px-3 py-2">
          <span className="block text-xl font-semibold tabular-nums tracking-tight leading-tight">
            {nf.format(metric.value)}
          </span>
          <span className="block text-xs text-muted-foreground leading-none">{metric.label}</span>
          <SummaryDelta delta={metric.delta} />
        </div>
      ))}
    </div>
  );
}

function TopPostsBlock({
  posts,
  postsById,
  postDetailsById,
  loadingPostId,
  onRequestDetail,
}: {
  posts: AwarenessTopPost[];
  postsById: Map<string, OrganicPost>;
  postDetailsById: Record<string, OrganicPost>;
  loadingPostId: string | null;
  onRequestDetail?: (postId: string) => void;
}) {
  if (posts.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No reel hook rates available for this window yet.
      </span>
    );
  }
  return (
    <div className="flex flex-col divide-y divide-border/40">
      {posts.map((post, index) => {
        const livePost = postDetailsById[post.id] ?? postsById.get(post.id) ?? null;
        return (
          <AwarenessTopPostRow
            key={post.id || index}
            post={post}
            rank={index + 1}
            livePost={livePost}
            loadingDetail={loadingPostId === post.id}
            onRequestDetail={onRequestDetail}
          />
        );
      })}
    </div>
  );
}

function contentTypeTooltip(row: AwarenessContentTypeRow): string {
  const parts: string[] = [];
  if (typeof row.posts === 'number')
    parts.push(`${row.posts} ${row.posts === 1 ? 'post' : 'posts'}`);
  if (typeof row.reach === 'number') parts.push(`reach ${nf.format(row.reach)}`);
  if (typeof row.engagement === 'number') parts.push(`eng ${nf.format(row.engagement)}`);
  if (typeof row.comments === 'number') parts.push(`${nf.format(row.comments)} comments`);
  return parts.join(' · ') || 'No breakdown available';
}

function ContentTypeBlock({ rows }: { rows: AwarenessContentTypeRow[] }) {
  const withViews = rows.filter((row) => (row.views ?? 0) > 0);
  if (withViews.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No content-type performance for this window.
      </span>
    );
  }
  const total = withViews.reduce((sum, row) => sum + (row.views ?? 0), 0);
  const max = Math.max(...withViews.map((row) => row.views ?? 0), 1);
  return (
    <ul className="space-y-2">
      {withViews.map((row) => {
        const views = row.views ?? 0;
        const share = total > 0 ? Math.round((views / total) * 100) : 0;
        return (
          <li key={row.contentType}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex cursor-default items-center gap-3">
                  <span className="w-16 shrink-0 truncate text-xs font-medium capitalize">
                    {row.contentType}
                  </span>
                  <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted/50">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-accent/70"
                      style={{ width: `${(views / max) * 100}%` }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums">
                    {nf.format(views)}
                  </span>
                  <span className="w-8 shrink-0 text-right text-2xs text-muted-foreground tabular-nums">
                    {share}%
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>{contentTypeTooltip(row)}</TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

function NarrativeBlock({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {lines.map((line, index) => (
        <li key={index} className="flex gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/70" />
          <span className="text-sm leading-snug">{line}</span>
        </li>
      ))}
    </ul>
  );
}

function AwarenessSection({
  block,
  postsById,
  postDetailsById,
  loadingPostId,
  onRequestDetail,
}: {
  block: OrganicAwarenessBlock;
  postsById: Map<string, OrganicPost>;
  postDetailsById: Record<string, OrganicPost>;
  loadingPostId: string | null;
  onRequestDetail?: (postId: string) => void;
}) {
  const data = (block.data ?? {}) as Record<string, unknown>;
  const body =
    block.category === 'summary' ? (
      <SummaryBlock data={data} />
    ) : block.category === 'top_posts' ? (
      <TopPostsBlock
        posts={(block.data as AwarenessTopPost[]) ?? []}
        postsById={postsById}
        postDetailsById={postDetailsById}
        loadingPostId={loadingPostId}
        onRequestDetail={onRequestDetail}
      />
    ) : block.category === 'content_type' ? (
      <ContentTypeBlock rows={(block.data as AwarenessContentTypeRow[]) ?? []} />
    ) : block.category === 'narrative' ? (
      <NarrativeBlock lines={(block.data as string[]) ?? []} />
    ) : null;
  if (!body) return null;
  return (
    <section className="py-3 first:pt-0 last:pb-0">
      <span className="mb-2 block text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        {block.title}
      </span>
      {body}
    </section>
  );
}

export function OrganicAwarenessReportView({
  report,
  isRefreshing = false,
  onRefresh,
  brandId,
  integrationAccountId,
  platform,
  posts = [],
}: {
  report: OrganicAwarenessReportPayload | null;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  // Optional account context so top-post rows can hydrate a live caption +
  // thumbnail on hover (awareness snapshots often omit them or carry expired
  // signed CDN URLs).
  brandId?: string;
  integrationAccountId?: string | null;
  platform?: PostDetailPlatform;
  posts?: OrganicPost[];
}) {
  const [open, setOpen] = React.useState(true);

  const canHydratePosts = Boolean(brandId && integrationAccountId && platform);
  const { requestPostDetail, loadingPostId, postDetailsById } = useOrganicPostDetail({
    brandId: brandId ?? '',
    platform: platform ?? 'instagram',
    integrationAccountId: canHydratePosts ? (integrationAccountId ?? null) : null,
  });

  const postsById = React.useMemo(() => {
    const map = new Map<string, OrganicPost>();
    for (const post of posts) map.set(post.id, post);
    return map;
  }, [posts]);

  const handleRequestDetail = React.useCallback(
    (postId: string) => {
      if (!canHydratePosts) return;
      void requestPostDetail(postId);
    },
    [canHydratePosts, requestPostDetail],
  );

  if (!report) {
    return (
      <div className="rounded-lg border border-dashed border-subtle bg-surface/60">
        <div className="px-4 py-6">
          <span className="block text-sm font-medium">
            AI-Awareness report builds with your data
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Once analytics run for this account, the flash-lite agents summarize what changed — top
            hooks, content-type shifts, and the week&apos;s momentum.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-subtle bg-surface/95">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="block text-sm font-semibold">AI-Awareness</span>
            <span className="text-xs text-muted-foreground">
              {report.windowStart} – {report.windowEnd}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="rounded-md border border-subtle px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="rounded-md border border-subtle px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              aria-expanded={open}
            >
              {open ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {open ? (
          <TooltipProvider delayDuration={200}>
            <div className="mt-3 divide-y divide-subtle/60">
              {report.blocks.map((block, index) => (
                <AwarenessSection
                  key={`${block.category}-${index}`}
                  block={block}
                  postsById={postsById}
                  postDetailsById={postDetailsById}
                  loadingPostId={loadingPostId}
                  onRequestDetail={handleRequestDetail}
                />
              ))}
            </div>
          </TooltipProvider>
        ) : null}
      </div>
    </div>
  );
}
