'use client';

import {
  type ApiRenderJob,
  type ApiRenderOutput,
  type ForgeRenderSet,
  templateDisplayName,
} from '@continuum/contracts';
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
import { ArrowLeft, Download, Loader2, RefreshCw, Search, Video } from 'lucide-react';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { startTransition, useEffect, useMemo, useState } from 'react';
import { type CheckTick, checkSummary, TickBar } from '@/components/forge/CheckTable';
import { DataGrid, STICKY_LEFT, selectColumn } from '@/components/forge/DataGrid';
import { DeliveryChain, deliverySearchText } from '@/components/forge/DeliveryChain';
import { fileForFormat, type PreviewFormat, playableFirst } from '@/components/forge/FormatPreview';
import { ReviewStatusPill, reviewSummary, useLibraryState } from '@/components/forge/libraryState';
import {
  filesSummary,
  formatsNamedByJob,
  jobTransitionName,
  RenderEnginePill,
  RenderJobDetail,
  RenderModePill,
  TemplateVersion,
  ViewTransition,
} from '@/components/forge/RenderJobDetail';
import {
  batchStatus,
  groupJobsIntoBatches,
  type RenderBatch,
} from '@/components/forge/renderBatches';
import { type JobCheck, renderJobChecks } from '@/components/forge/renderJobChecks';
import { describeRenderJobFailure } from '@/components/forge/renderJobFailureCopy';
import { imageFailed, thumbnailSrc } from '@/components/forge/renderOutputMedia';
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
import { pluralize } from '@/lib/format/pluralize';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { useApiRenderJobs } from '@/StudioCanvas/nodes/api-render/useApiRenderJobs';
import { FORGE_STALE_MS, forgeQueryKeys } from './queryKeys';

// Every render this brand has asked for, wherever it was asked from — the grid, the canvas node,
// a bench — because they all write `media.ad_render_jobs`. The canvas keeps its own cards per
// node; this is the brand's ledger.
//
// The brand's ledger reads in batches: one row per Render click, which opens into that click's
// renders, and a render opens into its detail. Each batch says how far its outputs are through
// review in the Library, where they are shared from. One template's ledger (on the template itself)
// stays a list of renders by set.
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
  const translateUi = useUiTranslations('forge');
  const checkLocale = useUiLocale();

  const checks = renderJobChecks(job, {}, Date.now(), { t: translateUi, locale: checkLocale });
  const summary = checkSummary(checks, translateUi);
  return (
    <span className="flex items-center gap-2" title={summary}>
      <TickBar ticks={checks.map((check) => CHECK_TICK[check.state])} />
      <span className="whitespace-nowrap text-muted-foreground">
        {!checks.some((check) => ['fail', 'warn', 'running', 'todo'].includes(check.state))
          ? translateUi('passed_436fe71b')
          : summary.split(' · ')[0]}
      </span>
    </span>
  );
}

/**
 * An image draws itself; a video draws its poster still and NEVER the video — a <video> per row
 * fetched every render (≈9 MB each, index at the end, from the fleet's bucket) to paint 36 px,
 * and froze the ledger. A still that fails to load — an expired signed link, a deleted file — or
 * a video whose poster is not made yet falls back to the tile.
 */
function Thumbnail({ output }: { output: ApiRenderOutput | null }) {
  const [broken, setBroken] = useState(false);
  const still = output?.kind === 'image' ? thumbnailSrc(output) : output?.posterUrl;
  if (still && !broken) {
    return (
      <img
        src={still}
        alt=""
        width={36}
        height={36}
        loading="lazy"
        decoding="async"
        className="size-9 rounded-sm object-contain"
        ref={(element) => {
          if (imageFailed(element)) setBroken(true);
        }}
        onError={() => setBroken(true)}
      />
    );
  }
  if (output?.kind === 'video') {
    return (
      <div className="flex size-9 items-center justify-center rounded-sm bg-muted">
        <Video className="size-4 text-muted-foreground" aria-hidden />
      </div>
    );
  }
  return <div className="size-9 rounded-sm bg-muted" />;
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
  const currentUiLocale = useUiLocale();

  const translateUi = useUiTranslations('forge');

  const queryClient = useQueryClient();
  const [sets, setSets] = useState<ForgeRenderSet[]>([]);
  const [renderSetId, setRenderSetId] = useState<string>('all');
  const [pushed, setPushed] = useState(false);
  const batchLevel = !templateKey;
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);
  const { jobs, refreshJobs, refreshOne, hasMore, loadMore } = useApiRenderJobs({
    brandId,
    trackedIds: [],
    limit: PAGE_SIZE,
    pollIntervalMs: active ? 5_000 : false,
    templateKey,
    // An open batch is read whole from the server; the set filter is for choosing one.
    ...(openBatchId ? { batchId: openBatchId } : renderSetId === 'all' ? {} : { renderSetId }),
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
  // Prefer the first format that actually rendered; older jobs can lack their first format.
  const firstFileOf = (job: ApiRenderJob) => {
    const jobFormats = formats ?? formatsNamedByJob(job);
    const matched = jobFormats
      .map((format) => fileForFormat(job.outputs, jobFormats, format.id))
      .filter((output) => output !== null);
    return (
      matched.find((output) => output.assetId) ??
      matched[0] ??
      playableFirst(job.outputs)[0] ??
      null
    );
  };

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
          const first = firstFileOf(job);
          return (
            <ViewTransition name={jobTransitionName(job.id)}>
              {/* Keyed by the link it draws: a re-signed or newly made still gets a fresh try. */}
              <Thumbnail
                key={first ? (first.posterUrl ?? thumbnailSrc(first)) : 'none'}
                output={first}
              />
            </ViewTransition>
          );
        },
      },
      {
        id: 'label',
        accessorFn: nameOf,
        header: translateUi('name_dcd1d522'),
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
        header: translateUi('set_b6f6f3ad'),
        enableSorting: true,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'status',
        header: translateUi('status_920e413c'),
        enableSorting: true,
        cell: ({ row: { original: job } }) => (
          <span className="flex items-center gap-1.5">
            <Badge variant={STATUS_TONE[job.status]}>
              {isInFlight(job) ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
              {job.status}
              {job.status === 'rendering' && typeof job.progressPct === 'number'
                ? ` ${job.progressPct}%`
                : ''}
            </Badge>
            <RenderModePill test={job.test} />
            <RenderEnginePill job={job} />
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: translateUi('requested_2d9e2828'),
        sortingFn: 'datetime',
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="tabular-nums text-muted-foreground" title={getValue<string>()}>
            {formatRelativeTime(getValue<string>(), undefined, currentUiLocale)}
          </span>
        ),
      },
      {
        id: 'verdict',
        header: translateUi('checks_de07d072'),
        enableSorting: false,
        cell: ({ row: { original: job } }) => <ChecksCell job={job} />,
      },
      {
        id: 'version',
        header: translateUi('variant_revision_a5050560'),
        enableSorting: false,
        cell: ({ row: { original: job } }) => <TemplateVersion job={job} />,
      },
      {
        id: 'outputs',
        header: translateUi('files_abc7e989'),
        enableSorting: false,
        cell: ({ row: { original: job } }) => (
          <span className="flex items-center gap-1.5 tabular-nums">
            <span>{filesSummary(job.outputs) || '—'}</span>
            {job.outputs
              .filter((output) => /\.(mov|mxf)$/i.test(output.fileName))
              .map((output) => (
                <a
                  key={output.id}
                  href={output.libraryUrl ?? output.url}
                  download={output.fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={translateUi('download_value0_0f5a93c3', {
                    value0: String(output.fileName),
                  })}
                  aria-label={translateUi('download_value0_0f5a93c3', {
                    value0: String(output.fileName),
                  })}
                  onClick={(event) => event.stopPropagation()}
                  className="text-primary hover:underline"
                >
                  {output.fileName.split('.').pop()?.toUpperCase()}
                </a>
              ))}
          </span>
        ),
      },
      {
        id: 'delivery',
        header: translateUi('delivery_52bfe584'),
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
        // The whole sentence, wrapped: a failure cut off mid-sentence hides the part that says why.
        cell: ({ row: { original: job } }) => {
          const failure = describeRenderJobFailure(job.error, translateUi);
          return failure ? (
            <p className="m-0 max-w-80 min-w-48 whitespace-normal text-destructive">{failure}</p>
          ) : null;
        },
      },
    ],
    [sets, formats, translateUi, currentUiLocale],
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
              // Pasting a digest from a handoff or a Slack thread finds the renders that used it.
              job.templateSource?.sha256 ?? '',
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

  // Built from every loaded job, then kept when any of its renders matches the search, so a
  // batch's counts are the whole batch's and never just the matching part.
  const batches = useMemo(() => {
    const matching = new Set(visible.map((job) => job.id));
    return groupJobsIntoBatches(jobs).filter((batch) =>
      batch.jobs.some((job) => matching.has(job.id)),
    );
  }, [jobs, visible]);
  // One Library read for every output of the batches on screen, not one per batch.
  const libraryState = useLibraryState(
    brandId,
    batchLevel && !openBatchId
      ? batches.flatMap((batch) =>
          batch.jobs.flatMap((job) => job.outputs.map((output) => output.assetId)),
        )
      : [],
  );
  const [batchSorting, setBatchSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the name helpers read only sets and formats.
  const batchColumns = useMemo<ColumnDef<RenderBatch>[]>(
    () => [
      {
        id: 'preview',
        size: 52,
        meta: STICKY_LEFT,
        enableSorting: false,
        header: '',
        cell: ({ row: { original: batch } }) => {
          const first = firstFileOf(batch.preview);
          return (
            <Thumbnail
              key={first ? (first.posterUrl ?? thumbnailSrc(first)) : 'none'}
              output={first}
            />
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: translateUi('created_d70b9e24'),
        sortingFn: 'datetime',
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="tabular-nums text-muted-foreground" title={getValue<string>()}>
            {formatRelativeTime(getValue<string>(), undefined, currentUiLocale)}
          </span>
        ),
      },
      {
        id: 'template',
        accessorFn: (batch) => templateOf(batch.preview),
        header: translateUi('template_0575f29d'),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="block max-w-60 min-w-32 truncate font-medium">{getValue<string>()}</span>
        ),
      },
      {
        id: 'set',
        accessorFn: (batch) => setOf(batch.preview),
        header: translateUi('set_b6f6f3ad'),
        enableSorting: true,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: 'pieces',
        header: translateUi('pieces_dd05d0e2'),
        enableSorting: false,
        cell: ({ row: { original: batch } }) => (
          <span className="whitespace-nowrap tabular-nums">
            {pluralize(batch.jobs.length, 'render')} · {pluralize(batch.files, 'file')}
          </span>
        ),
      },
      {
        id: 'status',
        header: translateUi('status_920e413c'),
        enableSorting: false,
        cell: ({ row: { original: batch } }) => {
          const status = batchStatus(batch);
          return (
            <span className="flex items-center gap-1.5">
              <Badge variant={status.tone}>
                {status.busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                {status.label}
              </Badge>
              <RenderModePill test={batch.preview.test} />
              <RenderEnginePill job={batch.preview} />
            </span>
          );
        },
      },
      {
        id: 'createdBy',
        accessorFn: (batch) => batch.createdByEmail ?? '',
        header: 'By',
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string>() || '—'}</span>
        ),
      },
      {
        id: 'review',
        header: translateUi('review_aff0766a'),
        enableSorting: false,
        cell: ({ row: { original: batch } }) => {
          const summary = reviewSummary(
            batch.jobs.flatMap((job) =>
              job.outputs.flatMap((output) => {
                const state = output.assetId ? libraryState.get(output.assetId) : undefined;
                return state ? [state] : [];
              }),
            ),
          );
          return summary ? (
            <ReviewStatusPill status={summary.status} label={summary.label} />
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
    ],
    [sets, formats, libraryState, currentUiLocale, translateUi],
  );
  const batchTable = useReactTable({
    data: batches,
    columns: batchColumns,
    getRowId: (batch) => batch.id,
    state: { sorting: batchSorting },
    onSortingChange: setBatchSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const showBatches = batchLevel && !openBatchId;
  // The open batch as the server returned it — the hook is scoped to it.
  const openBatch = openBatchId ? (groupJobsIntoBatches(jobs)[0] ?? null) : null;
  const openBatchTitle = openBatch
    ? [templateOf(openBatch.preview), setOf(openBatch.preview)].join(' · ')
    : '';

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
      {openBatchId ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => {
              setRowSelection({});
              setOpenBatchId(null);
            }}
          >
            <ArrowLeft className="size-3.5" aria-hidden /> {translateUi(
              'all_batches_8d0b27c3',
            )}{' '}
          </Button>
          <p className="min-w-0 truncate text-sm font-medium">{openBatchTitle}</p>
          {openBatch ? (
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(openBatch.createdAt, undefined, currentUiLocale)}
              {openBatch.createdByEmail ? ` · ${openBatch.createdByEmail}` : ''}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          {templateKey
            ? translateUi('every_render_of_this_template_newes_7a4f2c18')
            : openBatchId
              ? translateUi('every_render_from_this_render_click_f835b4c3')
              : translateUi('one_row_per_render_click_from_here__555de35c')}
          {pushed ? '' : translateUi('live_updates_unavailable_refreshing_53cb4f38')}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label={translateUi('search_renders_332edd2c')}
              placeholder={translateUi('name_template_set_ad_channel_a854c065')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-7 w-60 pl-7 text-xs"
            />
          </div>
          {!showBatches ? null : (
            <Select value={renderSetId} onValueChange={setRenderSetId}>
              <SelectTrigger
                className="h-7 w-44 text-xs"
                aria-label={translateUi('filter_by_render_set_692653b2')}
              >
                <SelectValue>
                  {renderSetId === 'all'
                    ? translateUi('all_render_sets_b57e100e')
                    : (sets.find((set) => set.id === renderSetId)?.name ??
                      translateUi('render_set_ecd0e66e'))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{translateUi('all_render_sets_b57e100e')}</SelectItem>
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
            className={showBatches ? 'hidden' : 'gap-1.5'}
            disabled={downloadable.length === 0}
            onClick={() => {
              for (const output of downloadable) {
                const anchor = document.createElement('a');
                anchor.href = output.libraryUrl ?? output.url;
                anchor.download = output.fileName;
                anchor.rel = 'noopener';
                anchor.click();
              }
            }}
          >
            <Download className="size-3.5" aria-hidden /> {translateUi('download_d6eafe82')}{' '}
            {downloadable.length || ''}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => void refreshJobs().catch(() => undefined)}
          >
            <RefreshCw className="size-3.5" aria-hidden /> {translateUi('refresh_0e916101')}{' '}
          </Button>
        </div>
      </div>
      {showBatches ? (
        <DataGrid
          table={batchTable}
          groupHeader={`${pluralize(batches.length, 'batch', 'batches')} • ${pluralize(jobs.length, 'render')} loaded`}
          onRowClick={(batch) => {
            setRowSelection({});
            setOpenBatchId(batch.id);
          }}
          empty={
            !loaded
              ? translateUi('loading_ba3bbbe1')
              : needle && jobs.length
                ? `No loaded renders match “${search.trim()}”.${hasMore ? translateUi('load_older_renders_to_search_furthe_2c86f732') : ''}`
                : translateUi('no_renders_yet_set_some_up_on_the_r_d81125e6')
          }
        />
      ) : (
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
              ? translateUi('loading_ba3bbbe1')
              : needle && jobs.length
                ? `No loaded renders match “${search.trim()}”.${hasMore ? translateUi('load_older_renders_to_search_furthe_2c86f732') : ''}`
                : templateKey
                  ? translateUi('no_renders_of_this_template_yet_2f5e3dd3')
                  : translateUi('no_renders_yet_set_some_up_on_the_r_d81125e6')
          }
        />
      )}
      {hasMore && !openBatchId ? (
        <div className="flex justify-center">
          <Button type="button" size="sm" variant="outline" onClick={() => void loadMore()}>
            {' '}
            {translateUi('load_older_renders_79128701')}{' '}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
