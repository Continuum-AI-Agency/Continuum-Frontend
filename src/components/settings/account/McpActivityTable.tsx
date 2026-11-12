'use client';

import {
  type McpToolCall,
  type McpToolCallStatus,
  type McpToolCallsResponse,
  mcpToolCallsResponseSchema,
} from '@continuum/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { http } from '@/lib/api/http';

const PAGE_SIZE = 50;

type StatusFilter = 'all' | McpToolCallStatus;

function getStatusStyles(tUi: ReturnType<typeof useTranslations<'settings'>>) {
  return {
    ok: {
      label: tUi('m_7a85f4764b'),
      className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    },
    error: {
      label: tUi('m_11f9578d05'),
      className: 'bg-red-500/15 text-red-600 dark:text-red-400',
    },
    denied: {
      label: tUi('m_304e06a569'),
      className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    },
    rate_limited: {
      label: tUi('m_877bb49e5f'),
      className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    },
    cancelled: {
      label: tUi('m_8761d26fb8'),
      className: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
    },
  };
}

function formatTimestamp(value: string, locale: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString(locale);
}

function formatDuration(ms: number | null, locale: string): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: ms >= 1000 ? 'second' : 'millisecond',
    unitDisplay: 'short',
    minimumFractionDigits: ms >= 1000 ? 1 : 0,
    maximumFractionDigits: ms >= 1000 ? 1 : 0,
  }).format(ms >= 1000 ? ms / 1000 : Math.round(ms));
}

function buildPath(cursor: string | null, status: StatusFilter, tool: string): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) params.set('before', cursor);
  if (status !== 'all') params.set('status', status);
  if (tool) params.set('tool', tool);
  return `/mcp/tool-calls?${params.toString()}`;
}

export function McpActivityTable() {
  const uiLocale = useLocale();

  const tUi = useTranslations('settings');

  const STATUS_STYLE = getStatusStyles(tUi);

  const [status, setStatus] = React.useState<StatusFilter>('all');
  const [toolFilter, setToolFilter] = React.useState('');
  const deferredToolFilter = React.useDeferredValue(toolFilter.trim());
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'created_at', desc: true }]);

  const query = useInfiniteQuery({
    queryKey: ['mcp-tool-calls', status, deferredToolFilter],
    queryFn: ({ pageParam }) =>
      http.request<McpToolCallsResponse>({
        path: buildPath(pageParam, status, deferredToolFilter),
        schema: mcpToolCallsResponseSchema,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  });

  const rows = React.useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  const columns = React.useMemo<ColumnDef<McpToolCall>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: ({ column }) => <SortHeader column={column} label={tUi('m_769bb19e61')} />,
        cell: ({ row }) => (
          <span className="font-data text-xs tabular-nums text-muted-foreground">
            {formatTimestamp(row.original.created_at, uiLocale)}
          </span>
        ),
        sortingFn: 'datetime',
      },
      {
        accessorKey: 'email',
        header: tUi('m_9f8a2389a2'),
        cell: ({ row }) => (
          <span className="text-xs text-foreground">{row.original.email ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'client_name',
        header: tUi('m_016ad99e5a'),
        cell: ({ row }) => (
          <span className="text-xs text-foreground">
            {row.original.client_name ?? row.original.client_id ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'tool',
        header: tUi('tableTool'),
        cell: ({ row }) => (
          <span className="font-data text-xs text-foreground">
            {row.original.tool ?? row.original.event_name}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: tUi('m_bae7d5be70'),
        cell: ({ row }) => {
          const style = STATUS_STYLE[row.original.status];
          return (
            <Badge
              variant="outline"
              className={`gap-1 border-transparent text-2xs ${style.className}`}
            >
              {style.label}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'duration_ms',
        header: ({ column }) => <SortHeader column={column} label={tUi('m_1370004da7')} />,
        cell: ({ row }) => (
          <span className="font-data text-xs tabular-nums text-muted-foreground">
            {formatDuration(row.original.duration_ms, uiLocale)}
          </span>
        ),
        sortingFn: 'basic',
      },
      {
        accessorKey: 'error_code',
        header: tUi('m_7f2f6a15cf'),
        cell: ({ row }) => (
          <span className="font-data text-xs text-muted-foreground">
            {row.original.error_code ?? '—'}
          </span>
        ),
      },
    ],
    [tUi, uiLocale],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={toolFilter}
          onChange={(e) => setToolFilter(e.target.value)}
          placeholder={tUi('m_9f1d7c6dc5')}
          className="h-8 max-w-[14rem] text-xs"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="h-8 w-[10rem] text-xs">
            <SelectValue placeholder={tUi('m_6405179d24')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tUi('m_6405179d24')}</SelectItem>
            <SelectItem value="ok">{tUi('statusOk')}</SelectItem>
            <SelectItem value="error">{tUi('m_7f2f6a15cf')}</SelectItem>
            <SelectItem value="denied">{tUi('m_63b16bd41e')}</SelectItem>
            <SelectItem value="rate_limited">{tUi('m_9f0d69d178')}</SelectItem>
            <SelectItem value="cancelled">{tUi('m_a1bf92eff4')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border">
        <div className="max-h-[min(560px,calc(100vh-21rem))] overflow-y-auto overscroll-contain">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-[var(--glass-bg)] backdrop-blur-xl">
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead key={header.id} className="text-2xs uppercase tracking-wider">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                <LoadingRows columns={columns.length} />
              ) : query.isError ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    {tUi('m_4a27499b03')}{' '}
                    <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
                      {tUi('m_9f5cd8a2e8')}
                    </Button>
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    {tUi('m_19456dd220')}
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? tUi('m_33ce417454') : tUi('m_dfe60ca92e')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function LoadingRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, rowIdx) => (
        <TableRow key={rowIdx}>
          {Array.from({ length: columns }).map((__, colIdx) => (
            <TableCell key={colIdx}>
              <Skeleton className="h-4 w-full max-w-[8rem] bg-muted/70" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function SortHeader({
  column,
  label,
}: {
  column: { toggleSorting: (asc?: boolean) => void; getIsSorted: () => false | 'asc' | 'desc' };
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 h-7 px-2 text-2xs uppercase tracking-wider text-muted-foreground"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );
}
