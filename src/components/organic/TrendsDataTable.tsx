'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import {
  Activity,
  ArrowUpDown,
  ChevronDown,
  ExternalLink,
  Filter,
  GripHorizontal,
  Heart,
  Loader2,
  MessageCircle,
  MoreHorizontal,
} from 'lucide-react';
import * as React from 'react';
import { Fragment } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
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
import type { Trend, TrendInsightKind, TrendPlatformRecommendation } from '@/lib/organic/trends';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';

interface TrendsDataTableProps {
  data: Trend[];
  selectedTrendIds: string[];
  onToggleTrend: (id: string) => void;
  activePlatforms: OrganicPlatformKey[];
  showMomentumFilter?: boolean;
  allowDrag?: boolean;
  allowSelect?: boolean;
  allowActions?: boolean;
  brandProfileId?: string;
}

const MOMENTUM_DOT_TONE: Record<Trend['momentum'], string> = {
  rising: 'bg-emerald-500',
  stable: 'bg-sky-500',
  cooling: 'bg-amber-500',
};

const PLATFORM_SHORT: Record<string, string> = {
  instagram: 'IG',
  linkedin: 'LI',
  facebook: 'FB',
  tiktok: 'TK',
  youtube: 'YT',
  twitter: 'TW',
  x: 'X',
};

const FILTERED_TAG_NOISE = new Set(['evidence_scored', 'canonicalized']);

function formatConfidence(value: number | undefined): string | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.round(clamped * 100)}%`;
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

function formatRelativeDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatRelativeTime(date);
}

function CitationsList({
  brandProfileId,
  kind,
  insightId,
  enabled,
}: {
  brandProfileId: string;
  kind: TrendInsightKind;
  insightId: string;
  enabled: boolean;
}) {
  const query = useQuery({
    queryKey: ['insight-citations', brandProfileId, kind, insightId],
    queryFn: () => fetchInsightCitations({ brandId: brandProfileId, insightType: kind, insightId }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading source signals…
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

function RecommendationsList({
  recommendations,
  fallback,
}: {
  recommendations: TrendPlatformRecommendation[] | undefined;
  fallback?: string[];
}) {
  if (recommendations && recommendations.length > 0) {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs leading-relaxed">
        {recommendations.map((rec) => (
          <Fragment key={`${rec.platform}-${rec.reason}`}>
            <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
              {rec.platform}
            </dt>
            <dd className="text-foreground">{rec.reason}</dd>
          </Fragment>
        ))}
      </dl>
    );
  }

  if (fallback && fallback.length > 0) {
    return <p className="text-xs text-foreground">Recommended: {fallback.join(', ')}</p>;
  }

  return (
    <p className="px-1 py-2 text-xs text-muted-foreground">
      No platform recommendations were captured.
    </p>
  );
}

export function TrendsDataTable({
  data,
  selectedTrendIds,
  onToggleTrend,
  activePlatforms,
  showMomentumFilter = true,
  allowDrag = false,
  allowSelect = false,
  allowActions = false,
  brandProfileId,
}: TrendsDataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [momentumFilter, setMomentumFilter] = React.useState<string>('all');
  const [expandedId, setExpandedId] = React.useState<string | undefined>(undefined);

  const filteredData = React.useMemo(() => {
    if (momentumFilter === 'all') return data;
    return data.filter((item) => item.momentum === momentumFilter);
  }, [data, momentumFilter]);

  const columns = React.useMemo<ColumnDef<Trend>[]>(() => {
    const cols: ColumnDef<Trend>[] = [];

    if (allowDrag) {
      cols.push({
        id: 'drag',
        header: () => <span className="sr-only">Drag</span>,
        size: 40,
        cell: ({ row }) => {
          const trend = row.original;
          const handleDragStart = (e: React.DragEvent) => {
            const seedType = trend.tags.includes('question')
              ? 'question'
              : trend.tags.includes('event')
                ? 'event'
                : 'trend';
            e.dataTransfer.setData(
              'application/json',
              JSON.stringify({ type: seedType, trendId: trend.id, title: trend.title }),
            );
            e.dataTransfer.effectAllowed = 'copy';
          };
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only drag affordance; the row itself carries the keyboard semantics
            // biome-ignore lint/a11y/useKeyWithClickEvents: onClick only stops the row handler; there is no click action of its own
            <div
              draggable
              onDragStart={handleDragStart}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <GripHorizontal className="text-muted-foreground opacity-50" />
            </div>
          );
        },
      });
    }

    if (allowSelect) {
      cols.push({
        id: 'select',
        header: () => <span className="sr-only">Select</span>,
        size: 40,
        cell: ({ row }) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: wrapper exists only to stop the row click; the Checkbox is the control
          // biome-ignore lint/a11y/useKeyWithClickEvents: no click action of its own
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedTrendIds.includes(row.original.id)}
              onCheckedChange={() => onToggleTrend(row.original.id)}
              aria-label="Select row"
            />
          </div>
        ),
      });
    }

    cols.push(
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-7 text-xs font-medium text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              column.toggleSorting(column.getIsSorted() === 'asc');
            }}
          >
            Trend
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => {
          const trend = row.original;
          const meta = trend.meta;
          const confidenceLabel = formatConfidence(meta?.confidence);
          const sourceHost = shortHost(meta?.sourceUrl);
          const recommendations = meta?.platformRecommendations ?? [];
          const hoverHasContent = Boolean(
            meta?.relevanceToBrand || recommendations.length > 0 || meta?.source || sourceHost,
          );
          const titleNode = (
            <div className="font-medium text-sm truncate" title={trend.title}>
              {trend.title}
            </div>
          );
          return (
            <div className="min-w-0 space-y-0.5">
              {hoverHasContent ? (
                <HoverCard openDelay={150} closeDelay={80}>
                  <HoverCardTrigger render={<span>{titleNode}</span>} />
                  <HoverCardContent
                    side="right"
                    align="start"
                    sideOffset={12}
                    className="w-80 space-y-2 text-xs leading-relaxed"
                  >
                    {meta?.relevanceToBrand ? (
                      <p className="text-foreground">{meta.relevanceToBrand}</p>
                    ) : null}
                    {recommendations.length > 0 ? (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                        {recommendations.slice(0, 3).map((rec) => (
                          <Fragment key={`${trend.id}-${rec.platform}`}>
                            <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                              {rec.platform}
                            </dt>
                            <dd className="text-foreground">{rec.reason}</dd>
                          </Fragment>
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
                titleNode
              )}
              <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                {confidenceLabel ? (
                  <span className="tabular-nums text-muted-foreground">
                    conf <span className="font-medium text-foreground">{confidenceLabel}</span>
                  </span>
                ) : null}
                {typeof meta?.sourceSignalCount === 'number' && meta.sourceSignalCount > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Activity className="h-2.5 w-2.5" />
                    <span className="tabular-nums">{meta.sourceSignalCount}</span>
                  </span>
                ) : null}
                {meta?.niche ? <span className="tracking-wide">{meta.niche}</span> : null}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'momentum',
        header: 'Momentum',
        cell: ({ row }) => {
          const momentum = row.getValue('momentum') as Trend['momentum'];
          return (
            <span className="inline-flex items-center gap-1.5 text-xs capitalize text-foreground">
              <span className={cn('h-1.5 w-1.5 rounded-full', MOMENTUM_DOT_TONE[momentum])} />
              {momentum}
            </span>
          );
        },
      },
      {
        id: 'platforms',
        header: 'Platforms',
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2 text-2xs font-medium uppercase tracking-wide">
            {row.original.platforms.map((p) => (
              <span
                key={p}
                className={cn(
                  activePlatforms.includes(p as OrganicPlatformKey)
                    ? 'text-brand-primary'
                    : 'text-muted-foreground/60',
                )}
              >
                {PLATFORM_SHORT[p] ?? p.slice(0, 2).toUpperCase()}
              </span>
            ))}
          </div>
        ),
      },
    );

    if (allowActions) {
      cols.push({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        size: 50,
        cell: ({ row }) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: wrapper exists only to stop the row click; the menu trigger is the control
          // biome-ignore lint/a11y/useKeyWithClickEvents: no click action of its own
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" className="h-6 w-6 p-0" aria-label="Row actions">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
                <DropdownMenuItem
                  className="text-xs"
                  onClick={() => onToggleTrend(row.original.id)}
                >
                  {selectedTrendIds.includes(row.original.id) ? 'Remove from plan' : 'Add to plan'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive text-xs">Ignore</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      });
    }

    cols.push({
      id: 'expand',
      header: () => <span className="sr-only">Expand</span>,
      size: 40,
      cell: ({ row }) => (
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            expandedId === row.id && 'rotate-180',
          )}
        />
      ),
    });

    return cols.filter((col) => {
      if (col.id === 'momentum' || ('accessorKey' in col && col.accessorKey === 'momentum')) {
        return showMomentumFilter;
      }
      return true;
    });
  }, [
    selectedTrendIds,
    onToggleTrend,
    activePlatforms,
    showMomentumFilter,
    allowDrag,
    allowSelect,
    allowActions,
    expandedId,
  ]);

  const table = useReactTable({
    data: filteredData,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { sorting, columnFilters },
  });

  return (
    <div className="flex flex-col h-full space-y-2">
      <div className="flex items-center gap-2 px-1 shrink-0">
        <Input
          placeholder="Filter trends…"
          value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
          onChange={(event) => table.getColumn('title')?.setFilterValue(event.target.value)}
          className="h-7 text-xs bg-muted/50 border-border/60 flex-1"
        />
        {showMomentumFilter && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-3xs uppercase font-semibold"
                >
                  <Filter className="mr-1 h-3 w-3" />
                  {momentumFilter === 'all' ? 'All' : momentumFilter}
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {['all', 'rising', 'stable', 'cooling'].map((value) => (
                <DropdownMenuItem
                  key={value}
                  className="text-xs capitalize"
                  onClick={() => setMomentumFilter(value)}
                >
                  {value === 'all' ? 'All momentum' : value}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex-1 min-h-0 rounded-lg border border-border bg-card overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="px-3 h-8 text-xs font-medium text-muted-foreground"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <Fragment key={row.id}>
                    <TableRow
                      data-state={
                        selectedTrendIds.includes(row.original.id) ? 'selected' : undefined
                      }
                      onClick={() =>
                        setExpandedId((prev) => (prev === row.id ? undefined : row.id))
                      }
                      className="cursor-pointer transition-colors motion-safe:duration-150"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="px-3 py-2">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {expandedId === row.id && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={columns.length} className="px-4 pb-4 pt-2">
                          {(() => {
                            const trend = row.original;
                            const meta = trend.meta;
                            const visibleTags = (meta?.analysisTags ?? trend.tags).filter(
                              (tag) => !FILTERED_TAG_NOISE.has(tag),
                            );
                            return (
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
                                <TabsContent
                                  value="why"
                                  className="mt-2 space-y-1.5 text-xs leading-relaxed"
                                >
                                  <p className="text-foreground">{trend.summary}</p>
                                  {meta?.relevanceToBrand &&
                                  meta.relevanceToBrand !== trend.summary ? (
                                    <p className="text-foreground">{meta.relevanceToBrand}</p>
                                  ) : null}
                                  {meta?.whyRelevant &&
                                  meta.whyRelevant !== meta.relevanceToBrand ? (
                                    <p className="text-foreground">{meta.whyRelevant}</p>
                                  ) : null}
                                  {meta?.opportunity ? (
                                    <p className="text-foreground">{meta.opportunity}</p>
                                  ) : null}
                                  {meta?.contentTypeSuggestion ? (
                                    <p className="italic text-muted-foreground">
                                      Suggested format: {meta.contentTypeSuggestion}
                                    </p>
                                  ) : null}
                                  {visibleTags.length > 0 ? (
                                    <p className="text-2xs text-muted-foreground">
                                      {visibleTags
                                        .slice(0, 6)
                                        .map((tag) => `#${tag}`)
                                        .join('  ·  ')}
                                    </p>
                                  ) : null}
                                </TabsContent>
                                <TabsContent value="signals" className="mt-2">
                                  {brandProfileId ? (
                                    <CitationsList
                                      brandProfileId={brandProfileId}
                                      kind={meta?.kind ?? 'trend'}
                                      insightId={trend.id}
                                      enabled={expandedId === row.id}
                                    />
                                  ) : (
                                    <p className="px-1 py-2 text-xs text-muted-foreground">
                                      Source signals are unavailable without an active brand.
                                    </p>
                                  )}
                                </TabsContent>
                                <TabsContent value="distribution" className="mt-2">
                                  <RecommendationsList
                                    recommendations={meta?.platformRecommendations}
                                    fallback={meta?.recommendedPlatforms}
                                  />
                                </TabsContent>
                              </Tabs>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-16 text-center text-xs text-muted-foreground"
                  >
                    {data.length === 0 ? 'No trends yet.' : 'No trends match your filters.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
