'use client';

import { type ApiRenderJob, type ForgeRenderSet, templateDisplayName } from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  type ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { Download, Loader2, RefreshCw, Search, Video } from 'lucide-react';
import { startTransition, useEffect, useMemo, useState } from 'react';
import { formatRelativeTime } from '@/components/approvals/formatters';
import { type CheckTick, checkSummary, TickBar } from '@/components/forge/CheckTable';
import { DataGrid, STICKY_LEFT, selectColumn } from '@/components/forge/DataGrid';
import { DeliveryChain, deliverySearchText } from '@/components/forge/DeliveryChain';
import { fileForFormat, type PreviewFormat } from '@/components/forge/FormatPreview';
import {
  formatsNamedByJob,
  jobTransitionName,
  RenderJobDetail,
  ViewTransition,
} from '@/components/forge/RenderJobDetail';
import { type JobCheck, renderJobChecks } from '@/components/forge/renderJobChecks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { useApiRenderJobs } from '@/StudioCanvas/nodes/api-render/useApiRenderJobs';
import { FORGE_STALE_MS, forgeQueryKeys } from './queryKeys';

// Every render this brand has asked for, wherever it was asked from — the grid, the canvas node,
// a bench — because they all write `media.ad_render_jobs`. The canvas keeps its own cards per
// node; this is the brand's ledger.
//
// Live: the node's own hook polls in-flight jobs (including the auto-judge tail) every 5 s
// through the live relay, and the list is re-read on focus, on a slow timer, and on a Realtime
// row change once `media.ad_render_jobs` is in the publication (migration
// 20260910170000). Before that migration is applied the channel subscribes and delivers
// nothing, and the timer covers it.
// ponytail: 30 s list refresh; the realtime channel makes foreign jobs land in under a second.
//
// Search, sort and grouping run over the pages already loaded; "Load older renders" widens them.
// ponytail: client-side search over ≤ N×50 loaded jobs; move it to the jobs query when a brand's
// ledger outgrows a few pages.

const PAGE_SIZE = 50;
const CONNECTED_REFRESH_MS = 120_000;
const DISCONNECTED_REFRESH_MS = 30_000;

const STATUS_TONE: Record<ApiRenderJob['status'], 'muted' | 'warning' | 'success' | 'destructive'> =
  {
    submitting: 'muted',
    queued: 'muted',
    rendering: 'warning',
    finished: 'success',
    failed: 'destructive',
  };

const isInFlight = (job: ApiRenderJob) => job.status !== 'finished' && job.status !== 'failed';

const CHECK_TICK: Record<JobCheck['state'], CheckTick> = {
  pass: 'pass',
  warn: 'warn',
  fail: 'fail',
  running: 'todo',
  todo: 'todo',
  skipped: 'todo',
};

/** Every check as a tick, and the one word a row has room for. */
function ChecksCell({ job }: { job: ApiRenderJob }) {
  const checks = renderJobChecks(job, {});
  const summary = checkSummary(checks);
  return (
    <span className="flex items-center gap-2" title={summary}>
      <TickBar ticks={checks.map((check) => CHECK_TICK[check.state])} />
      <span className="whitespace-nowrap text-muted-foreground">
        {summary === 'All checks passed' ? 'Passed' : summary.split(' · ')[0]}
      </span>
    </span>
  );
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Opening and closing a job morphs through its ViewTransition — instantly for reduced motion. */
const withTransition = (update: () => void) =>
  prefersReducedMotion() ? update() : startTransition(update);

export function RenderJobsGrid({
  brandId,
  active = true,
  templateKey,
  formats,
}: {
  brandId: string;
  active?: boolean;
  /** One template's renders, grouped by set — the ledger embedded in template detail. */
  templateKey?: string;
  /** That template's formats, so each thumbnail and detail shows the right file per format. */
  formats?: PreviewFormat[];
}) {
  const queryClient = useQueryClient();
  const [sets, setSets] = useState<ForgeRenderSet[]>([]);
  const [renderSetId, setRenderSetId] = useState<string>('all');
  const [pushed, setPushed] = useState(false);
  const { jobs, refreshJobs, refreshOne, hasMore, loadMore } = useApiRenderJobs({
    brandId,
    trackedIds: [],
    limit: PAGE_SIZE,
    pollIntervalMs: pushed ? false : DISCONNECTED_REFRESH_MS,
    templateKey,
    ...(renderSetId === 'all' ? {} : { renderSetId }),
  });
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  // Which workspace a job ran in is an internal fact — off by default, one click away. One
  // template's ledger is already grouped by set, so its Set column would only repeat the group.
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    environment: false,
    ...(templateKey ? { set: false } : {}),
  });
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // Held here, not in the grid: opening a job unmounts the grid, and Back must not re-expand.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [loaded, setLoaded] = useState(false);

  // Mount, every time the tab comes back, the window regains focus, and on a slow timer.
  useEffect(() => {
    if (!active) return;
    void queryClient
      .fetchQuery({
        queryKey: forgeQueryKeys.renderSetList(brandId, templateKey),
        queryFn: () => apiRendersApi.listRenderSets(brandId, templateKey),
        staleTime: FORGE_STALE_MS.lists,
      })
      .then((response) => setSets(response.items))
      .catch(() => undefined);
    const load = () => {
      if (!active || document.visibilityState !== 'visible') return;
      void refreshJobs()
        .catch(() => undefined)
        .finally(() => setLoaded(true));
    };
    void refreshJobs({ preferCache: true })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
    window.addEventListener('focus', load);
    const timer = setInterval(load, pushed ? CONNECTED_REFRESH_MS : DISCONNECTED_REFRESH_MS);
    return () => {
      window.removeEventListener('focus', load);
      clearInterval(timer);
    };
  }, [active, brandId, pushed, queryClient, refreshJobs, templateKey]);

  // Realtime: a row change is a signal to re-read, never a row to merge — the API read is what
  // re-signs output URLs and runs the judge.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let inserted = false;
    const changed = new Set<string>();
    // Updates re-read their jobs once per burst; only an insert changes the page's order.
    const onRow = (event: 'INSERT' | 'UPDATE', row: Record<string, unknown>) => {
      if (row.brand_id !== brandId) return;
      if (templateKey && row.template_key !== templateKey) return;
      inserted ||= event === 'INSERT';
      if (typeof row.id === 'string') changed.add(row.id);
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.approvals(brandId) });
        if (inserted || changed.size === 0) {
          void queryClient
            .invalidateQueries({ queryKey: forgeQueryKeys.renderJobs(brandId) })
            .then(() => refreshJobs())
            .catch(() => undefined);
        } else {
          void Promise.all([...changed].map((id) => refreshOne(id))).catch(() => undefined);
        }
        inserted = false;
        changed.clear();
      }, 400);
    };
    if (!cancelled)
      unsubscribe = subscribeToPostgresChanges({
        label: 'ad-render-jobs',
        bindings: (['INSERT', 'UPDATE'] as const).map((event) => ({
          event,
          schema: 'media',
          table: 'ad_render_jobs',
          filter: `brand_id=eq.${brandId}`,
          onRow: (row) => onRow(event, row),
        })),
        onSubscribed: () =>
          queryClient
            .invalidateQueries({ queryKey: forgeQueryKeys.renderJobs(brandId) })
            .then(() => refreshJobs())
            .catch(() => undefined),
        onStatus: (status) => setPushed(status === 'SUBSCRIBED'),
      });
    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      unsubscribe?.();
    };
  }, [brandId, queryClient, refreshJobs, refreshOne, templateKey]);

  const templateOf = (job: ApiRenderJob) => templateDisplayName(job.templateName);
  const setOf = (job: ApiRenderJob) =>
    job.renderSetName ??
    sets.find((set) => set.id === job.renderSetId)?.name ??
    (templateKey ? 'No set' : 'Unassigned');
  const nameOf = (job: ApiRenderJob) => job.label ?? job.labelPath.at(-1) ?? templateOf(job);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the name helpers read only sets and formats.
  const columns = useMemo<ColumnDef<ApiRenderJob>[]>(
    () => [
      { ...selectColumn<ApiRenderJob>(), enableHiding: false },
      {
        id: 'preview',
        size: 52,
        // With the checkbox and the name, what says which render a row is — kept in view.
        meta: STICKY_LEFT,
        enableSorting: false,
        enableHiding: false,
        header: '',
        cell: ({ row: { original: job } }) => {
          // The first format's file, found by its name: the fleet lists files in a different
          // order per job. No file for that format is an empty tile, never whichever came first.
          const jobFormats = formats ?? formatsNamedByJob(job);
          const first = jobFormats[0]
            ? fileForFormat(job.outputs, jobFormats, jobFormats[0].id)
            : null;
          return (
            <ViewTransition name={jobTransitionName(job.id)}>
              {first?.kind === 'image' ? (
                <img
                  src={first.url}
                  alt=""
                  width={36}
                  height={36}
                  loading="lazy"
                  decoding="async"
                  className="size-9 rounded-sm object-contain"
                />
              ) : first ? (
                <div className="flex size-9 items-center justify-center rounded-sm bg-muted">
                  <Video className="size-4 text-muted-foreground" aria-hidden />
                </div>
              ) : (
                <div className="size-9 rounded-sm bg-muted" />
              )}
            </ViewTransition>
          );
        },
      },
      {
        id: 'label',
        accessorFn: nameOf,
        header: 'Name',
        meta: STICKY_LEFT,
        enableSorting: true,
        enableHiding: false,
        cell: ({ row: { original: job } }) => {
          const ancestry = job.labelPath.slice(0, -1);
          return (
            <div className="max-w-60 min-w-40">
              {ancestry.length ? (
                <p className="truncate text-3xs text-muted-foreground">{ancestry.join(' / ')}</p>
              ) : null}
              <p className="truncate font-medium" title={nameOf(job)}>
                {nameOf(job)}
              </p>
            </div>
          );
        },
      },
      {
        id: 'set',
        accessorFn: setOf,
        header: 'Set',
        enableSorting: true,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        enableSorting: true,
        cell: ({ getValue }) => {
          const status = getValue<ApiRenderJob['status']>();
          return (
            <Badge variant={STATUS_TONE[status]}>
              {status === 'rendering' || status === 'queued' || status === 'submitting' ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : null}
              {status}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: 'Requested',
        sortingFn: 'datetime',
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="tabular-nums text-muted-foreground" title={getValue<string>()}>
            {formatRelativeTime(getValue<string>())}
          </span>
        ),
      },
      {
        id: 'verdict',
        header: 'Checks',
        enableSorting: false,
        cell: ({ row: { original: job } }) => <ChecksCell job={job} />,
      },
      {
        id: 'outputs',
        header: 'Files',
        enableSorting: false,
        cell: ({ row: { original: job } }) => (
          <span className="tabular-nums">{job.outputs.length || '—'}</span>
        ),
      },
      {
        id: 'delivery',
        header: 'Delivery',
        enableSorting: false,
        cell: ({ row: { original: job } }) => <DeliveryChain job={job} />,
      },
      {
        accessorKey: 'environment',
        header: 'Workspace',
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string | null>() ?? '—'}</span>
        ),
      },
      {
        id: 'error',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row: { original: job } }) =>
          job.error ? (
            <span className="line-clamp-1 max-w-64 text-destructive" title={job.error}>
              {job.error}
            </span>
          ) : null,
      },
    ],
    [sets, formats],
  );

  const needle = search.trim().toLowerCase();
  // biome-ignore lint/correctness/useExhaustiveDependencies: the name helpers read only sets.
  const visible = useMemo(
    () =>
      needle
        ? jobs.filter((job) =>
            [
              nameOf(job),
              job.labelPath.join(' '),
              templateOf(job),
              setOf(job),
              deliverySearchText(job),
            ]
              .join(' ')
              .toLowerCase()
              .includes(needle),
          )
        : jobs,
    [jobs, needle, sets],
  );

  const table = useReactTable({
    data: visible,
    columns,
    getRowId: (job) => job.id,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Grouped by what a person calls the template, so ratio twins and a template shared across
  // workspaces under one name read as one group. One template's own ledger groups by set instead.
  const groupOf = (job: ApiRenderJob) => (templateKey ? setOf(job) : templateOf(job));
  // biome-ignore lint/correctness/useExhaustiveDependencies: groupOf reads only sets.
  const groupSummary = useMemo(() => {
    const summary = new Map<string, { finished: number; inFlight: number; failed: number }>();
    for (const job of visible) {
      const name = groupOf(job);
      const counts = summary.get(name) ?? { finished: 0, inFlight: 0, failed: 0 };
      if (job.status === 'finished') counts.finished += 1;
      else if (job.status === 'failed') counts.failed += 1;
      else counts.inFlight += 1;
      summary.set(name, counts);
    }
    return summary;
  }, [visible, sets, templateKey]);

  const selected = jobs.filter((job) => rowSelection[job.id]);
  const downloadable = selected.flatMap((job) => job.outputs);
  const finished = visible.filter((job) => job.status === 'finished').length;
  const inFlight = visible.filter(isInFlight).length;
  const open = openId ? (jobs.find((job) => job.id === openId) ?? null) : null;

  if (open) {
    return (
      <RenderJobDetail
        job={open}
        templateName={templateOf(open)}
        setName={setOf(open)}
        formats={formats}
        onBack={() => withTransition(() => setOpenId(null))}
        onRefresh={() => void refreshOne(open.id).catch(() => undefined)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          {templateKey
            ? 'Every render of this template, newest first.'
            : 'Renders for this brand, from here and from the canvas.'}
          {pushed ? '' : ' Live updates unavailable — refreshing on a timer.'}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Search renders"
              placeholder="Name, template, set, ad, channel"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-7 w-60 pl-7 text-xs"
            />
          </div>
          {templateKey ? null : (
            <Select value={renderSetId} onValueChange={setRenderSetId}>
              <SelectTrigger className="h-7 w-44 text-xs" aria-label="Filter by render set">
                <SelectValue>
                  {renderSetId === 'all'
                    ? 'All render sets'
                    : (sets.find((set) => set.id === renderSetId)?.name ?? 'Render set')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All render sets</SelectItem>
                  {sets.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={downloadable.length === 0}
            onClick={() => {
              for (const output of downloadable) {
                const anchor = document.createElement('a');
                anchor.href = output.url;
                anchor.download = output.fileName;
                anchor.rel = 'noopener';
                anchor.click();
              }
            }}
          >
            <Download className="size-3.5" aria-hidden /> Download {downloadable.length || ''}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => void refreshJobs().catch(() => undefined)}
          >
            <RefreshCw className="size-3.5" aria-hidden /> Refresh
          </Button>
        </div>
      </div>
      <DataGrid
        table={table}
        columnVisibility
        groupHeader={
          needle
            ? `${visible.length} of ${jobs.length} loaded render${jobs.length === 1 ? '' : 's'} match • ${finished} finished • ${inFlight} in flight`
            : `${jobs.length} render${jobs.length === 1 ? '' : 's'} • ${finished} finished • ${inFlight} in flight`
        }
        collapsedGroups={collapsedGroups}
        onCollapsedGroupsChange={setCollapsedGroups}
        groupBy={(job) => {
          const name = groupOf(job);
          const counts = groupSummary.get(name);
          return {
            key: name,
            label: (
              <>
                {name}
                {counts ? (
                  <span className="font-normal text-muted-foreground">
                    {[
                      counts.finished ? `${counts.finished} finished` : null,
                      counts.inFlight ? `${counts.inFlight} in flight` : null,
                      counts.failed ? `${counts.failed} failed` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                ) : null}
              </>
            ),
          };
        }}
        onRowClick={(job) => withTransition(() => setOpenId(job.id))}
        empty={
          !loaded
            ? 'Loading…'
            : needle && jobs.length
              ? `No loaded renders match “${search.trim()}”.${hasMore ? ' Load older renders to search further.' : ''}`
              : templateKey
                ? 'No renders of this template yet.'
                : 'No renders yet. Set some up on the Render tab.'
        }
      />
      {hasMore ? (
        <div className="flex justify-center">
          <Button type="button" size="sm" variant="outline" onClick={() => void loadMore()}>
            Load older renders
          </Button>
        </div>
      ) : null}
    </div>
  );
}
