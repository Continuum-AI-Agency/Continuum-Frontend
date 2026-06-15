"use client";

import * as React from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowUpDown } from "lucide-react";
import {
  mcpToolCallsResponseSchema,
  type McpToolCall,
  type McpToolCallStatus,
  type McpToolCallsResponse,
} from "@continuum/contracts";
import { http } from "@/lib/api/http";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 50;

type StatusFilter = "all" | McpToolCallStatus;

const STATUS_STYLE: Record<McpToolCallStatus, { label: string; className: string }> = {
  ok: { label: "ok", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  error: { label: "error", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  denied: { label: "denied", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  rate_limited: {
    label: "rate limited",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
};

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

function buildPath(cursor: string | null, status: StatusFilter): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) params.set("before", cursor);
  if (status !== "all") params.set("status", status);
  return `/mcp/tool-calls?${params.toString()}`;
}

export function McpActivityTable() {
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [toolFilter, setToolFilter] = React.useState("");
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "created_at", desc: true }]);

  const query = useInfiniteQuery({
    queryKey: ["mcp-tool-calls", status],
    queryFn: ({ pageParam }) =>
      http.request<McpToolCallsResponse>({
        path: buildPath(pageParam, status),
        schema: mcpToolCallsResponseSchema,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  });

  const allRows = React.useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const rows = React.useMemo(() => {
    const needle = toolFilter.trim().toLowerCase();
    if (!needle) return allRows;
    return allRows.filter((r) => r.tool.toLowerCase().includes(needle));
  }, [allRows, toolFilter]);

  const columns = React.useMemo<ColumnDef<McpToolCall>[]>(
    () => [
      {
        accessorKey: "created_at",
        header: ({ column }) => <SortHeader column={column} label="When" />,
        cell: ({ row }) => (
          <span className="font-data text-xs tabular-nums text-muted-foreground">
            {formatTimestamp(row.original.created_at)}
          </span>
        ),
        sortingFn: "datetime",
      },
      {
        accessorKey: "email",
        header: "User",
        cell: ({ row }) => (
          <span className="text-xs text-foreground">{row.original.email ?? "—"}</span>
        ),
      },
      {
        accessorKey: "client_name",
        header: "MCP client",
        cell: ({ row }) => (
          <span className="text-xs text-foreground">
            {row.original.client_name ?? row.original.client_id ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "tool",
        header: "Tool",
        cell: ({ row }) => (
          <span className="font-data text-xs text-foreground">{row.original.tool}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const style = STATUS_STYLE[row.original.status];
          return (
            <Badge variant="outline" className={`gap-1 border-transparent text-[10px] ${style.className}`}>
              {style.label}
            </Badge>
          );
        },
      },
      {
        accessorKey: "duration_ms",
        header: ({ column }) => <SortHeader column={column} label="Duration" />,
        cell: ({ row }) => (
          <span className="font-data text-xs tabular-nums text-muted-foreground">
            {formatDuration(row.original.duration_ms)}
          </span>
        ),
        sortingFn: "basic",
      },
      {
        accessorKey: "error_code",
        header: "Error",
        cell: ({ row }) => (
          <span className="font-data text-xs text-muted-foreground">
            {row.original.error_code ?? "—"}
          </span>
        ),
      },
    ],
    [],
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
          placeholder="Filter by tool…"
          className="h-8 max-w-[14rem] text-xs"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="h-8 w-[10rem] text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
            <SelectItem value="rate_limited">Rate limited</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} className="text-[10px] uppercase tracking-wider">
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
                <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                  Could not load activity.{" "}
                  <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
                    Retry
                  </Button>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                  No tool calls yet.
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

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
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
  column: { toggleSorting: (asc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 h-7 px-2 text-[10px] uppercase tracking-wider text-muted-foreground"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );
}
