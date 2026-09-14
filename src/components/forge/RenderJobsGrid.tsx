'use client';

import type { ApiRenderJob, ForgeRenderSet } from '@continuum/contracts';
import {
  type ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { Download, Loader2, RefreshCw, Video } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatRelativeTime } from '@/components/approvals/formatters';
import { DataGrid, selectColumn } from '@/components/forge/DataGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { RenderJobCard } from '@/StudioCanvas/nodes/api-render/RenderJobCard';
import { useApiRenderJobs } from '@/StudioCanvas/nodes/api-render/useApiRenderJobs';

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

const PAGE_SIZE = 50;

/** How far from square an output is — 0 for a square, growing either way. Unknown sizes sort last. */
const squareness = (output: { width: number | null; height: number | null; fileName: string }) => {
  if (output.width && output.height) return Math.abs(Math.log(output.width / output.height));
  const ratio = /(\d+)[_x](\d+)/.exec(output.fileName);
  return ratio ? Math.abs(Math.log(Number(ratio[1]) / Number(ratio[2]))) : Number.POSITIVE_INFINITY;
};
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

/** `unknown` is never a pass: the judge could not run, and the badge says so. */
function verdictOf(job: ApiRenderJob): {
  text: string;
  tone: 'muted' | 'warning' | 'success' | 'destructive';
  title?: string;
} {
  if (job.judge) {
    return job.judge.state === 'pass'
      ? { text: 'Judged · pass', tone: 'success' }
      : job.judge.state === 'fail'
        ? { text: 'Judged · fail', tone: 'destructive' }
        : {
            text: 'Judge unknown',
            tone: 'warning',
            title: 'The judge could not run on this frame',
          };
  }
  if (!job.fit) return { text: '—', tone: 'muted' };
  if (!job.fit.escalate) return { text: 'Fits', tone: 'success', title: job.fit.why };
  return job.status === 'finished'
    ? { text: 'Judging…', tone: 'warning', title: job.fit.why }
    : { text: 'Needs judge', tone: 'warning', title: job.fit.why };
}

export function RenderJobsGrid({ brandId, active = true }: { brandId: string; active?: boolean }) {
  const [sets, setSets] = useState<ForgeRenderSet[]>([]);
  const [renderSetId, setRenderSetId] = useState<string>('all');
  const [pushed, setPushed] = useState(false);
  const { jobs, refreshJobs, refreshOne, hasMore, loadMore } = useApiRenderJobs({
    brandId,
    trackedIds: [],
    limit: PAGE_SIZE,
    pollIntervalMs: pushed ? false : DISCONNECTED_REFRESH_MS,
    ...(renderSetId === 'all' ? {} : { renderSetId }),
  });
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Mount, every time the tab comes back, the window regains focus, and on a slow timer.
  useEffect(() => {
    if (!active) return;
    void apiRendersApi
      .listRenderSets(brandId)
      .then((response) => setSets(response.items))
      .catch(() => undefined);
    const load = () => {
      if (!active || document.visibilityState !== 'visible') return;
      void refreshJobs()
        .catch(() => undefined)
        .finally(() => setLoaded(true));
    };
    load();
    window.addEventListener('focus', load);
    const timer = setInterval(load, pushed ? CONNECTED_REFRESH_MS : DISCONNECTED_REFRESH_MS);
    return () => {
      window.removeEventListener('focus', load);
      clearInterval(timer);
    };
  }, [active, pushed, refreshJobs]);

  // Realtime: a row change is a signal to re-read, never a row to merge — the relay is what
  // re-signs output URLs and runs the judge, and only the list read goes through it.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onRow = (row: Record<string, unknown>) => {
      if (row.brand_id !== brandId) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void refreshJobs().catch(() => undefined), 400);
    };
    if (!cancelled)
      unsubscribe = subscribeToPostgresChanges({
        label: 'ad-render-jobs',
        bindings: (['INSERT', 'UPDATE'] as const).map((event) => ({
          event,
          schema: 'media',
          table: 'ad_render_jobs',
          filter: `brand_id=eq.${brandId}`,
          onRow,
        })),
        onSubscribed: () => refreshJobs().catch(() => undefined),
        onStatus: (status) => setPushed(status === 'SUBSCRIBED'),
      });
    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      unsubscribe?.();
    };
  }, [brandId, refreshJobs]);

  const columns = useMemo<ColumnDef<ApiRenderJob>[]>(
    () => [
      selectColumn<ApiRenderJob>(),
      {
        id: 'preview',
        size: 52,
        enableSorting: false,
        header: '',
        cell: ({ row: { original: job } }) => {
          // The Library copy when there is one: the fleet's own URL serves the bytes as
          // application/octet-stream and only exists while the bucket keeps them. The
          // squarest frame of the set reads best in a square thumbnail.
          const first = [...job.outputs]
            .sort(
              (a, b) =>
                Number(Boolean(b.assetId)) - Number(Boolean(a.assetId)) ||
                squareness(a) - squareness(b),
            )
            .at(0);
          return first?.kind === 'image' ? (
            <img src={first.url} alt="" className="size-9 rounded-sm object-cover" />
          ) : first ? (
            <Video className="size-4 text-muted-foreground" aria-hidden />
          ) : (
            <div className="size-9 rounded-sm bg-muted" />
          );
        },
      },
      {
        accessorKey: 'label',
        header: 'Name',
        cell: ({ row: { original: job } }) => {
          const ancestry = (job.labelPath ?? []).slice(0, -1);
          return (
            <div className="min-w-40">
              {ancestry.length ? (
                <p className="truncate text-3xs text-muted-foreground">{ancestry.join(' / ')}</p>
              ) : null}
              <span className="font-medium">{job.label ?? job.templateName}</span>
            </div>
          );
        },
      },
      {
        id: 'set',
        header: 'Set',
        cell: ({ row: { original: job } }) => (
          <span className="text-muted-foreground">
            {job.renderSetName ??
              sets.find((set) => set.id === job.renderSetId)?.name ??
              'Unassigned'}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
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
        cell: ({ getValue }) => (
          <span className="tabular-nums text-muted-foreground" title={getValue<string>()}>
            {formatRelativeTime(getValue<string>())}
          </span>
        ),
      },
      {
        id: 'verdict',
        header: 'Check',
        cell: ({ row: { original: job } }) => {
          const verdict = verdictOf(job);
          return (
            <Badge variant={verdict.tone} title={verdict.title}>
              {verdict.text}
            </Badge>
          );
        },
      },
      {
        id: 'outputs',
        header: 'Files',
        cell: ({ row: { original: job } }) => (
          <span className="tabular-nums">{job.outputs.length || '—'}</span>
        ),
      },
      {
        accessorKey: 'environment',
        header: 'Workspace',
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string | null>() ?? '—'}</span>
        ),
      },
      {
        id: 'delivery',
        header: 'Delivery',
        cell: ({ row: { original: job } }) => {
          const receipt = job.delivery[0];
          if (!receipt) return <span className="text-muted-foreground">Library</span>;
          return (
            <Badge
              variant={
                receipt.status === 'published'
                  ? 'success'
                  : receipt.status === 'error'
                    ? 'destructive'
                    : 'muted'
              }
              title={receipt.reason ?? undefined}
            >
              {receipt.status}
            </Badge>
          );
        },
      },
      {
        id: 'error',
        header: '',
        cell: ({ row: { original: job } }) =>
          job.error ? (
            <span className="line-clamp-1 max-w-64 text-destructive" title={job.error}>
              {job.error}
            </span>
          ) : null,
      },
    ],
    [jobs, sets],
  );

  const table = useReactTable({
    data: jobs,
    columns,
    getRowId: (job) => job.id,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const selected = jobs.filter((job) => rowSelection[job.id]);
  const downloadable = selected.flatMap((job) => job.outputs);
  const finished = jobs.filter((job) => job.status === 'finished').length;
  const inFlight = jobs.filter(
    (job) => job.status !== 'finished' && job.status !== 'failed',
  ).length;
  const open = openId ? (jobs.find((job) => job.id === openId) ?? null) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          Renders for this brand, from here and from the canvas.
          {pushed ? '' : ' Live updates unavailable — refreshing on a timer.'}
        </p>
        <div className="ml-auto flex items-center gap-1.5">
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
        groupHeader={`${jobs.length} render${jobs.length === 1 ? '' : 's'} • ${finished} finished • ${inFlight} in flight`}
        onRowClick={(job) => setOpenId(job.id)}
        empty={loaded ? 'No renders yet. Set some up on the Render tab.' : 'Loading…'}
      />
      {hasMore ? (
        <div className="flex justify-center">
          <Button type="button" size="sm" variant="outline" onClick={() => void loadMore()}>
            Load older renders
          </Button>
        </div>
      ) : null}
      <Sheet open={open !== null} onOpenChange={(next) => (next ? undefined : setOpenId(null))}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle>{open.templateName}</SheetTitle>
                <SheetDescription>
                  Requested {formatRelativeTime(open.createdAt)}
                  {open.environment ? ` · ${open.environment}` : ''}
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                <RenderJobCard job={open} onRefresh={() => void refreshOne(open.id)} />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
