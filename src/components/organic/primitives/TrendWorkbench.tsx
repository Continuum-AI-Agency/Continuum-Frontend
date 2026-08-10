'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Check,
  ChevronDown,
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchInsightCitations } from '@/lib/brand-insights/citations';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import type { Trend, TrendInsightKind } from '@/lib/organic/trends';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';

const PLATFORM_DISPLAY_NAME: Record<OrganicPlatformKey, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

type TrendWorkbenchProps = {
  trends: Trend[];
  selectedTrendIds: string[];
  activePlatforms: OrganicPlatformKey[];
  maxSelections?: number;
  onToggleTrend: (trendId: string) => void;
  onGenerateFromTrend?: (trend: Trend) => void;
  onFetch?: () => void;
  isFetching?: boolean;
  brandProfileId?: string;
  /**
   * Why the trend fetch failed, when it did. Without it an upstream failure and a brand
   * that genuinely has no trends yet both rendered "No trends match this search." — which
   * is true of neither, and is why the Trends drawer read as "opens nothing".
   */
  insightsError?: string | null;
};

// Only real (uuid) trends can anchor a durable one-shot job; seeded slug trends
// (DEFAULT_TRENDS) get no generate affordance.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MOMENTUM_DOT_TONE: Record<Trend['momentum'], string> = {
  rising: 'bg-emerald-500',
  stable: 'bg-sky-500',
  cooling: 'bg-amber-500',
};

const PLATFORM_INITIAL: Record<string, string> = {
  instagram: 'IG',
  facebook: 'FB',
  linkedin: 'LI',
  tiktok: 'TT',
  youtube: 'YT',
  x: 'X',
  reddit_basic: 'RD',
};

function formatConfidence(value: number | undefined): string | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.round(clamped * 100)}%`;
}

function formatSignalWindow(start?: string, end?: string): string | null {
  if (!start && !end) return null;
  const fmt = (raw?: string) => {
    if (!raw) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const s = fmt(start);
  const e = fmt(end);
  if (s && e) return `${s} – ${e}`;
  return s ?? e;
}

function formatRelativeDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatRelativeTime(date);
}

function shortHost(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const FILTERED_TAG_NOISE = new Set(['evidence_scored', 'canonicalized']);

function visibleAnalysisTags(tags?: string[]): string[] {
  if (!tags || tags.length === 0) return [];
  return tags.filter((tag) => !FILTERED_TAG_NOISE.has(tag));
}

type TrendTypeFilter = 'all' | 'event' | 'question' | 'trend';
type TrendMomentumFilter = 'all' | Trend['momentum'];
type TrendScopeFilter = 'all' | 'selected' | 'active-platform';
type ResolvedTrendType = 'event' | 'question' | 'trend';
type IndexedTrend = {
  trend: Trend;
  trendType: ResolvedTrendType;
  normalizedTitle: string;
  normalizedSummary: string;
  normalizedTags: string;
};

type TrendTableRowProps = {
  trend: Trend;
  isSelected: boolean;
  trendType: ResolvedTrendType;
  onToggleTrend: (trendId: string) => void;
  onGenerateFromTrend?: (trend: Trend) => void;
  brandProfileId?: string;
};

type CitationsPanelProps = {
  brandProfileId: string;
  kind: TrendInsightKind;
  insightId: string;
  enabled: boolean;
};

function CitationsPanel({ brandProfileId, kind, insightId, enabled }: CitationsPanelProps) {
  const query = useQuery({
    queryKey: ['insight-citations', brandProfileId, kind, insightId],
    queryFn: () => fetchInsightCitations({ brandId: brandProfileId, insightType: kind, insightId }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading source signals\u2026
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">Could not load source signals.</p>
    );
  }

  const citations = query.data ?? [];
  if (citations.length === 0) {
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        No source signals — likely a synthesis-only insight.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border/40">
      {citations.map((citation) => {
        const host = shortHost(citation.sourceUrl);
        const relative = formatRelativeDate(citation.publishedAt);
        return (
          <li key={citation.id} className="flex flex-col gap-1 px-1 py-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 text-xs text-foreground">
                {citation.signalTitle ?? citation.rationale ?? host ?? 'Untitled signal'}
              </p>
              {citation.sourceUrl ? (
                <a
                  href={citation.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
              {citation.platform ? (
                <span className="uppercase tracking-wide">{citation.platform}</span>
              ) : null}
              {host ? <span>{host}</span> : null}
              {relative ? <span>{relative}</span> : null}
              {typeof citation.likeCount === 'number' ? (
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-2.5 w-2.5" />
                  <span className="tabular-nums">{citation.likeCount}</span>
                </span>
              ) : null}
              {typeof citation.commentsCount === 'number' ? (
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="h-2.5 w-2.5" />
                  <span className="tabular-nums">{citation.commentsCount}</span>
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const TrendTableRow = React.memo(function TrendTableRow({
  trend,
  isSelected,
  trendType,
  onToggleTrend,
  onGenerateFromTrend,
  brandProfileId,
}: TrendTableRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const handleDragStart = React.useCallback(
    (event: React.DragEvent<HTMLTableRowElement>) => {
      event.dataTransfer.setData(
        'application/json',
        JSON.stringify({
          type: trendType,
          trendId: trend.id,
          title: trend.title,
        }),
      );
      event.dataTransfer.effectAllowed = 'copy';
    },
    [trend.id, trend.title, trendType],
  );

  const handleSelectionClick = React.useCallback(
    (event: React.MouseEvent<HTMLTableRowElement>) => {
      if ((event.target as HTMLElement).closest('[data-row-control]')) return;
      onToggleTrend(trend.id);
    },
    [onToggleTrend, trend.id],
  );

  const handleExpandClick = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setExpanded((prev) => !prev);
  }, []);

  const handleGenerateClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onGenerateFromTrend?.(trend);
    },
    [onGenerateFromTrend, trend],
  );
  const canGenerate = Boolean(onGenerateFromTrend) && UUID_RE.test(trend.id);

  const meta = trend.meta;
  const confidenceLabel = formatConfidence(meta?.confidence);
  const visibleTags = visibleAnalysisTags(meta?.analysisTags);
  const fallbackTags = visibleTags.length > 0 ? visibleTags : trend.tags;
  const tagsDisplay = fallbackTags.slice(0, 3);
  const tagsOverflow = fallbackTags.length - tagsDisplay.length;
  const signalWindow = formatSignalWindow(meta?.signalWindowStart, meta?.signalWindowEnd);
  const sourceHost = shortHost(meta?.sourceUrl);
  const recommended = meta?.platformRecommendations ?? [];
  const hoverHasContent = Boolean(
    meta?.relevanceToBrand || recommended.length > 0 || meta?.source || sourceHost,
  );

  const title = <p className="font-semibold text-foreground">{trend.title}</p>;

  return (
    <>
      <TableRow
        data-state={isSelected ? 'selected' : undefined}
        draggable
        onDragStart={handleDragStart}
        onClick={handleSelectionClick}
        className="cursor-pointer align-top"
      >
        <TableCell className="align-top">
          {isSelected ? (
            <span className="inline-flex rounded-full bg-primary/15 p-1 text-primary">
              <Check className="h-3 w-3" />
            </span>
          ) : (
            <span className="inline-flex h-5 w-5 rounded-full border border-border/70" />
          )}
        </TableCell>
        <TableCell className="align-top">
          <div className="flex flex-col gap-0.5">
            <span className="text-2xs uppercase tracking-wide text-muted-foreground">
              {trendType}
            </span>
            {confidenceLabel ? (
              <span className="text-2xs tabular-nums text-muted-foreground">
                conf <span className="font-medium text-foreground">{confidenceLabel}</span>
              </span>
            ) : null}
          </div>
        </TableCell>
        <TableCell className="align-top whitespace-normal">
          {hoverHasContent ? (
            <HoverCard openDelay={150} closeDelay={80}>
              <HoverCardTrigger render={<span>{title}</span>} />
              <HoverCardContent
                side="right"
                align="start"
                sideOffset={12}
                className="w-80 space-y-2 text-xs leading-relaxed"
              >
                {meta?.relevanceToBrand ? (
                  <p className="text-foreground">{meta.relevanceToBrand}</p>
                ) : null}
                {recommended.length > 0 ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                    {recommended.slice(0, 3).map((rec) => (
                      <React.Fragment key={`${trend.id}-${rec.platform}`}>
                        <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                          {rec.platform}
                        </dt>
                        <dd className="text-foreground">{rec.reason}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                ) : null}
                {meta?.source || sourceHost ? (
                  <div className="border-t border-border/40 pt-2 text-muted-foreground">
                    {meta?.sourceUrl ? (
                      <a
                        href={meta.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        <span>{meta.source ?? sourceHost}</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    ) : (
                      <span>{meta?.source}</span>
                    )}
                  </div>
                ) : null}
              </HoverCardContent>
            </HoverCard>
          ) : (
            title
          )}
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{trend.summary}</p>
        </TableCell>
        <TableCell className="align-top">
          <span className="inline-flex items-center gap-1.5 text-xs capitalize text-foreground">
            <span className={cn('h-1.5 w-1.5 rounded-full', MOMENTUM_DOT_TONE[trend.momentum])} />
            {trend.momentum}
          </span>
        </TableCell>
        <TableCell className="align-top whitespace-normal">
          <div className="flex flex-wrap items-center gap-2 text-2xs font-medium tracking-wide text-muted-foreground">
            {trend.platforms.map((platform) => (
              <span key={`${trend.id}:${platform}`} className="uppercase">
                {PLATFORM_INITIAL[platform] ?? PLATFORM_DISPLAY_NAME[platform] ?? platform}
              </span>
            ))}
            {typeof meta?.sourceSignalCount === 'number' && meta.sourceSignalCount > 0 ? (
              <span className="ml-1 inline-flex items-center gap-1">
                <Activity className="h-2.5 w-2.5" />
                <span className="tabular-nums">{meta.sourceSignalCount}</span>
              </span>
            ) : null}
          </div>
        </TableCell>
        <TableCell className="align-top whitespace-normal text-xs text-muted-foreground">
          {tagsDisplay.length > 0 ? (
            <span>
              {tagsDisplay.map((tag, index) => (
                <React.Fragment key={`${trend.id}-tag-${tag}`}>
                  {index > 0 ? <span className="mx-1 text-muted-foreground/50">\u00b7</span> : null}
                  <span>#{tag}</span>
                </React.Fragment>
              ))}
              {tagsOverflow > 0 ? (
                <span className="ml-1 text-muted-foreground/70">+{tagsOverflow}</span>
              ) : null}
            </span>
          ) : signalWindow ? (
            <span>{signalWindow}</span>
          ) : (
            '\u2014'
          )}
        </TableCell>
        <TableCell className="align-top text-right">
          {canGenerate ? (
            <button
              type="button"
              data-row-control
              aria-label="Generate content from this trend"
              title="Generate content from this trend"
              onClick={handleGenerateClick}
              className="rounded p-1 text-muted-foreground/70 outline-none transition-colors hover:bg-muted hover:text-primary focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            data-row-control
            aria-label={expanded ? 'Collapse trend detail' : 'Expand trend detail'}
            aria-expanded={expanded}
            onClick={handleExpandClick}
            className="rounded p-1 text-muted-foreground/70 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform',
                expanded ? 'rotate-180' : 'rotate-0',
              )}
            />
          </button>
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow data-row-detail className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={7} className="px-3 py-2">
            <Tabs defaultValue="why" className="w-full">
              <TabsList className="h-7 gap-1 bg-transparent p-0">
                <TabsTrigger value="why" className="h-7 px-2 text-2xs">
                  Why
                </TabsTrigger>
                <TabsTrigger value="signals" className="h-7 px-2 text-2xs">
                  Signals
                </TabsTrigger>
                <TabsTrigger value="distribution" className="h-7 px-2 text-2xs">
                  Distribution
                </TabsTrigger>
              </TabsList>
              <TabsContent value="why" className="mt-2 space-y-1.5 text-xs leading-relaxed">
                {meta?.niche ? (
                  <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                    {meta.niche}
                  </p>
                ) : null}
                {meta?.relevanceToBrand ? (
                  <p className="text-foreground">{meta.relevanceToBrand}</p>
                ) : null}
                {meta?.whyRelevant && meta.whyRelevant !== meta.relevanceToBrand ? (
                  <p className="text-foreground">{meta.whyRelevant}</p>
                ) : null}
                {meta?.opportunity ? <p className="text-foreground">{meta.opportunity}</p> : null}
                {meta?.contentTypeSuggestion ? (
                  <p className="italic text-muted-foreground">
                    Suggested format: {meta.contentTypeSuggestion}
                  </p>
                ) : null}
                {signalWindow ? (
                  <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                    Signal window: {signalWindow}
                  </p>
                ) : null}
                {!meta?.relevanceToBrand &&
                !meta?.whyRelevant &&
                !meta?.opportunity &&
                !meta?.contentTypeSuggestion ? (
                  <p className="text-muted-foreground">No additional rationale was captured.</p>
                ) : null}
              </TabsContent>
              <TabsContent value="signals" className="mt-2">
                {brandProfileId ? (
                  <CitationsPanel
                    brandProfileId={brandProfileId}
                    kind={meta?.kind ?? 'trend'}
                    insightId={trend.id}
                    enabled={expanded}
                  />
                ) : (
                  <p className="px-1 py-2 text-xs text-muted-foreground">
                    Source signals are unavailable without an active brand.
                  </p>
                )}
              </TabsContent>
              <TabsContent value="distribution" className="mt-2">
                {recommended.length > 0 ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs leading-relaxed">
                    {recommended.map((rec) => (
                      <React.Fragment key={`${trend.id}-dist-${rec.platform}`}>
                        <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                          {rec.platform}
                        </dt>
                        <dd className="text-foreground">{rec.reason}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                ) : meta?.recommendedPlatforms && meta.recommendedPlatforms.length > 0 ? (
                  <p className="text-xs text-foreground">
                    Recommended: {meta.recommendedPlatforms.join(', ')}
                  </p>
                ) : (
                  <p className="px-1 py-2 text-xs text-muted-foreground">
                    No platform recommendations were captured.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
});

/**
 * Three distinct facts, three distinct states. "No trends match this search." is correct
 * only for the third — a non-empty set filtered down to nothing.
 */
function TrendWorkbenchEmptyState({
  insightsError,
  hasAnyTrend,
  isFetching,
  onFetch,
}: {
  insightsError?: string | null;
  hasAnyTrend: boolean;
  isFetching: boolean;
  onFetch?: () => void;
}) {
  if (insightsError) {
    return (
      <div
        data-testid="trend-workbench-error"
        className="flex flex-col items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-center text-xs"
      >
        <p className="font-medium text-destructive">We could not load your trends.</p>
        <p className="text-muted-foreground">{insightsError}</p>
        {onFetch ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-2xs"
            onClick={onFetch}
            disabled={isFetching}
          >
            {isFetching ? (
              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            {isFetching ? 'Retrying…' : 'Retry'}
          </Button>
        ) : null}
      </div>
    );
  }

  if (!hasAnyTrend) {
    return (
      <div
        data-testid="trend-workbench-empty"
        className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border p-4 text-center text-xs"
      >
        <p className="font-medium text-foreground">We have not analysed your sector yet.</p>
        <p className="text-muted-foreground">
          Continuum scans your market for topics worth posting about. Run the first analysis to fill
          this list.
        </p>
        {onFetch ? (
          <Button
            type="button"
            size="sm"
            className="h-7 px-2 text-2xs"
            onClick={onFetch}
            disabled={isFetching}
          >
            {isFetching ? (
              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Zap className="mr-1 h-3 w-3" />
            )}
            {isFetching ? 'Generating…' : 'Generate Trends'}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-testid="trend-workbench-no-match"
      className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground"
    >
      No trends match this search.
    </div>
  );
}

export function TrendWorkbench({
  trends,
  selectedTrendIds,
  activePlatforms,
  maxSelections,
  onToggleTrend,
  onGenerateFromTrend,
  onFetch,
  isFetching = false,
  brandProfileId,
  insightsError,
}: TrendWorkbenchProps) {
  const [query, setQuery] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<TrendTypeFilter>('all');
  const [momentumFilter, setMomentumFilter] = React.useState<TrendMomentumFilter>('all');
  const [scopeFilter, setScopeFilter] = React.useState<TrendScopeFilter>('all');

  const normalizedQuery = query.trim().toLowerCase();
  const isCommandMode = normalizedQuery.startsWith('/');
  const effectiveQuery = isCommandMode ? '' : normalizedQuery;
  const commandNeedle = isCommandMode ? normalizedQuery.replace('/', '').trim() : '';
  const shouldShowCommandList = isCommandMode || effectiveQuery.length > 0;
  const selectedTrendIdSet = React.useMemo(() => new Set(selectedTrendIds), [selectedTrendIds]);
  const activePlatformSet = React.useMemo(() => new Set(activePlatforms), [activePlatforms]);

  const resolveTrendType = React.useCallback((trend: Trend): 'event' | 'question' | 'trend' => {
    const normalizedTags = trend.tags.map((tag) => tag.toLowerCase());
    const normalizedTitle = trend.title.toLowerCase();
    const normalizedSummary = trend.summary.toLowerCase();

    if (
      normalizedTags.includes('question') ||
      normalizedTitle.includes('?') ||
      normalizedSummary.includes('q&a')
    ) {
      return 'question';
    }

    if (
      normalizedTags.includes('event') ||
      normalizedTitle.includes('event') ||
      normalizedSummary.includes('event')
    ) {
      return 'event';
    }

    return 'trend';
  }, []);

  const indexedTrends = React.useMemo<IndexedTrend[]>(
    () =>
      trends.map((trend) => ({
        trend,
        trendType: resolveTrendType(trend),
        normalizedTitle: trend.title.toLowerCase(),
        normalizedSummary: trend.summary.toLowerCase(),
        normalizedTags: trend.tags.map((tag) => tag.toLowerCase()).join(' '),
      })),
    [resolveTrendType, trends],
  );

  const filteredTrends = React.useMemo(() => {
    const typeRank: Record<'event' | 'question' | 'trend', number> = {
      event: 0,
      question: 1,
      trend: 2,
    };

    return indexedTrends
      .map((item) => ({
        ...item,
        isSelected: selectedTrendIdSet.has(item.trend.id),
        platformFit: item.trend.platforms.reduce(
          (count, platform) => (activePlatformSet.has(platform) ? count + 1 : count),
          0,
        ),
      }))
      .filter((item) => {
        const { trend, trendType, isSelected } = item;
        const matchesType = typeFilter === 'all' || trendType === typeFilter;
        const matchesMomentum = momentumFilter === 'all' || trend.momentum === momentumFilter;
        const matchesScope =
          scopeFilter === 'all' ||
          (scopeFilter === 'selected' && isSelected) ||
          (scopeFilter === 'active-platform' && item.platformFit > 0);

        if (!matchesType || !matchesMomentum || !matchesScope) {
          return false;
        }

        if (!effectiveQuery) return true;
        return (
          item.normalizedTitle.includes(effectiveQuery) ||
          item.normalizedSummary.includes(effectiveQuery) ||
          item.normalizedTags.includes(effectiveQuery)
        );
      })
      .sort((a, b) => {
        if (a.trendType !== b.trendType) return typeRank[a.trendType] - typeRank[b.trendType];
        if (a.platformFit !== b.platformFit) return b.platformFit - a.platformFit;
        return a.trend.title.localeCompare(b.trend.title);
      })
      .map((item) => item.trend);
  }, [
    activePlatformSet,
    effectiveQuery,
    indexedTrends,
    momentumFilter,
    scopeFilter,
    selectedTrendIdSet,
    typeFilter,
  ]);

  const trendTypeById = React.useMemo(() => {
    const map = new Map<string, ResolvedTrendType>();
    indexedTrends.forEach((item) => {
      map.set(item.trend.id, item.trendType);
    });
    return map;
  }, [indexedTrends]);

  const commandSuggestions = React.useMemo(() => {
    const base = isCommandMode ? trends : filteredTrends;
    return base.slice(0, 10);
  }, [filteredTrends, isCommandMode, trends]);

  const presetCommands = React.useMemo(
    () =>
      [
        {
          key: 'all',
          label: 'Preset: show all',
          shortcut: '/all',
          apply: () => {
            setTypeFilter('all');
            setMomentumFilter('all');
            setScopeFilter('all');
            setQuery('');
          },
        },
        {
          key: 'selected',
          label: 'Preset: selected only',
          shortcut: '/selected',
          apply: () => {
            setScopeFilter('selected');
            setQuery('');
          },
        },
        {
          key: 'fit',
          label: 'Preset: active platform fit',
          shortcut: '/fit',
          apply: () => {
            setScopeFilter('active-platform');
            setQuery('');
          },
        },
        {
          key: 'events',
          label: 'Preset: events',
          shortcut: '/events',
          apply: () => {
            setTypeFilter('event');
            setQuery('');
          },
        },
        {
          key: 'questions',
          label: 'Preset: questions',
          shortcut: '/questions',
          apply: () => {
            setTypeFilter('question');
            setQuery('');
          },
        },
        {
          key: 'rising',
          label: 'Preset: rising momentum',
          shortcut: '/rising',
          apply: () => {
            setMomentumFilter('rising');
            setQuery('');
          },
        },
      ] as const,
    [],
  );

  const filteredPresetCommands = React.useMemo(() => {
    if (!isCommandMode) return presetCommands;
    if (!commandNeedle) return presetCommands;
    return presetCommands.filter(
      (command) =>
        command.label.toLowerCase().includes(commandNeedle) ||
        command.shortcut.includes(commandNeedle),
    );
  }, [commandNeedle, isCommandMode, presetCommands]);

  const selectedCount = selectedTrendIds.length;
  const selectedLabel =
    typeof maxSelections === 'number' ? `${selectedCount}/${maxSelections}` : `${selectedCount}`;

  const activePlatformLabel = React.useMemo(() => {
    if (activePlatforms.length === 0) return 'none';
    return activePlatforms.join(', ');
  }, [activePlatforms]);

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg bg-card/70 p-2.5 ring-1 ring-border/40">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Trends Workbench
          </p>
          <p className="text-xs text-muted-foreground">
            Context: {activePlatformLabel} • type `{typeFilter}` • signal `{momentumFilter}` • type
            `/` for presets
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onFetch ? (
            <Button
              type="button"
              variant={trends.length === 0 ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-2xs"
              onClick={onFetch}
              disabled={isFetching}
            >
              {isFetching ? (
                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
              ) : trends.length === 0 ? (
                <Zap className="mr-1 h-3 w-3" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              {isFetching ? 'Generating…' : trends.length === 0 ? 'Generate Trends' : 'Refresh'}
            </Button>
          ) : null}
          <Badge variant="outline" className="shrink-0 text-2xs uppercase tracking-wide">
            {selectedLabel}
          </Badge>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="rounded-md border border-border/60 bg-background/70">
          <Command className="bg-transparent">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search trends • type / for presets"
              className="text-xs"
            />
            {shouldShowCommandList ? (
              <CommandList className="max-h-[clamp(120px,40dvh,280px)]">
                <CommandEmpty>No matching commands or trends.</CommandEmpty>
                {isCommandMode ? (
                  <CommandGroup heading="Presets">
                    {filteredPresetCommands.map((command) => (
                      <CommandItem key={command.key} onSelect={command.apply}>
                        <span>{command.label}</span>
                        <CommandShortcut>{command.shortcut}</CommandShortcut>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : (
                  <>
                    <CommandGroup heading="Contextual picks">
                      {commandSuggestions.map((trend) => {
                        const isSelected = selectedTrendIdSet.has(trend.id);
                        return (
                          <CommandItem
                            key={`command-trend-${trend.id}`}
                            value={`${trend.title} ${trend.summary} ${trend.tags.join(' ')}`}
                            onSelect={() => onToggleTrend(trend.id)}
                          >
                            <span className="truncate">{trend.title}</span>
                            {isSelected ? (
                              <Check className="ml-auto h-3.5 w-3.5 text-primary" />
                            ) : null}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading="Tip">
                      <CommandItem onSelect={() => setQuery('/')}>
                        Type `/` to apply preset filters
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            ) : null}
          </Command>
        </div>

        <ScrollArea className="min-h-0 flex-1 rounded-md bg-background/45 ring-1 ring-border/35">
          <div className="px-2 pb-2">
            {filteredTrends.length === 0 ? (
              <TrendWorkbenchEmptyState
                insightsError={insightsError}
                hasAnyTrend={trends.length > 0}
                isFetching={isFetching}
                onFetch={onFetch}
              />
            ) : (
              <Table className="text-xs">
                <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                  <TableRow>
                    <TableHead className="w-8">
                      <span className="sr-only">Selected</span>
                    </TableHead>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead className="w-28">Momentum</TableHead>
                    <TableHead className="w-44">Platforms</TableHead>
                    <TableHead className="w-32">Tags</TableHead>
                    <TableHead className="w-12 text-right">
                      <span className="sr-only">Drag</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrends.map((trend) => (
                    <TrendTableRow
                      key={trend.id}
                      trend={trend}
                      isSelected={selectedTrendIdSet.has(trend.id)}
                      trendType={trendTypeById.get(trend.id) ?? 'trend'}
                      onToggleTrend={onToggleTrend}
                      onGenerateFromTrend={onGenerateFromTrend}
                      brandProfileId={brandProfileId}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </ScrollArea>
      </div>
    </section>
  );
}
