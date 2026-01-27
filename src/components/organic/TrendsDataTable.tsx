"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table"
import { DragHandleHorizontalIcon, LightningBoltIcon, DotIcon } from "@radix-ui/react-icons"
import { ArrowUpDown, MoreHorizontal, ChevronDown, Filter } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Trend } from "@/lib/organic/trends"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"

interface TrendsDataTableProps {
  data: Trend[]
  selectedTrendIds: string[]
  onToggleTrend: (id: string) => void
  activePlatforms: OrganicPlatformKey[]
  showMomentumFilter?: boolean
}

const momentumStyles: Record<Trend["momentum"], string> = {
  rising: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  stable: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  cooling: "bg-amber-500/10 text-amber-500 border-amber-500/20",
}

export function TrendsDataTable({
  data,
  selectedTrendIds,
  onToggleTrend,
  activePlatforms,
  showMomentumFilter = true,
}: TrendsDataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [momentumFilter, setMomentumFilter] = React.useState<string>("all")

  const filteredData = React.useMemo(() => {
    if (momentumFilter === "all") return data;
    return data.filter(item => item.momentum === momentumFilter);
  }, [data, momentumFilter]);

  const columns = React.useMemo<ColumnDef<Trend>[]>(() => {
    const baseColumns: ColumnDef<Trend>[] = [
      {
        id: "drag",
        header: "",
        cell: ({ row }) => {
          const trend = row.original;
          const handleDragStart = (e: React.DragEvent) => {
            const seedType = trend.tags.includes("question")
              ? "question"
              : trend.tags.includes("event")
              ? "event"
              : "trend";
            e.dataTransfer.setData("application/json", JSON.stringify({ 
              type: seedType, 
              trendId: trend.id,
              title: trend.title 
            }));
            e.dataTransfer.effectAllowed = "copy";
          };

          return (
            <div 
              draggable 
              onDragStart={handleDragStart}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-surface rounded transition-colors"
            >
              <DragHandleHorizontalIcon className="text-secondary opacity-50" />
            </div>
          )
        },
      },
      {
        id: "select",
        header: "Sel",
        cell: ({ row }) => (
          <Checkbox
            checked={selectedTrendIds.includes(row.original.id)}
            onCheckedChange={() => onToggleTrend(row.original.id)}
            aria-label="Select row"
          />
        ),
      },
      {
        accessorKey: "title",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-7 text-[10px] uppercase"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Topic
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="max-w-[180px]">
            <div className="font-medium text-primary truncate text-xs" title={row.getValue("title")}>
              {row.getValue("title")}
            </div>
            <div className="text-[10px] text-secondary truncate" title={row.original.summary}>
              {row.original.summary}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "momentum",
        header: "Mom",
        cell: ({ row }) => {
          const momentum = row.getValue("momentum") as Trend["momentum"]
          return (
            <Badge variant="outline" className={cn("text-[9px] uppercase px-1 py-0", momentumStyles[momentum])}>
              {momentum.slice(0, 3)}
            </Badge>
          )
        },
      },
      {
        id: "platforms",
        header: "Plat",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-0.5">
            {row.original.platforms.map((p) => (
              <Badge 
                key={p} 
                variant="secondary" 
                className={cn(
                  "text-[8px] px-0.5 py-0 min-w-[16px] text-center",
                  activePlatforms.includes(p as OrganicPlatformKey) ? "bg-brand-primary/20 text-brand-primary border-brand-primary/20" : "opacity-50"
                )}
              >
                {p === "instagram" ? "IG" : p === "linkedin" ? "LI" : p.slice(0, 1).toUpperCase()}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-6 w-6 p-0">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
              <DropdownMenuItem className="text-xs" onClick={() => onToggleTrend(row.original.id)}>
                {selectedTrendIds.includes(row.original.id) ? "Remove from plan" : "Add to plan"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive text-xs">Ignore</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ];

    return baseColumns.filter(col => {
      if (col.id === "momentum" || (col as any).accessorKey === "momentum") return showMomentumFilter;
      return true;
    });
  }, [selectedTrendIds, onToggleTrend, activePlatforms, showMomentumFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Input
          placeholder="Filter..."
          value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("title")?.setFilterValue(event.target.value)
          }
          className="h-7 text-[11px] bg-surface/50 border-subtle flex-1"
        />
        {showMomentumFilter && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2 text-[9px] uppercase font-semibold border-subtle">
                <Filter className="mr-1 h-3 w-3" />
                {momentumFilter === "all" ? "All" : momentumFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-xs" onClick={() => setMomentumFilter("all")}>All</DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => setMomentumFilter("rising")}>Rising</DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => setMomentumFilter("stable")}>Stable</DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => setMomentumFilter("cooling")}>Cooling</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="rounded border border-subtle bg-surface/20 overflow-hidden">
        <Table>
          <TableHeader className="bg-surface/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent h-8">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-8 text-[9px] uppercase tracking-wider font-bold py-0 px-2">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={selectedTrendIds.includes(row.original.id) && "selected"}
                  draggable
                  onDragStart={(e) => {
                    const trend = row.original;
                    const isQuestion = trend.tags.includes("question");
                    e.dataTransfer.setData("application/json", JSON.stringify({ 
                      type: isQuestion ? "question" : "trend", 
                      trendId: trend.id,
                      title: trend.title 
                    }));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className={cn(
                    "h-10 hover:bg-surface/40 transition-colors border-subtle/50 cursor-grab active:cursor-grabbing",
                    selectedTrendIds.includes(row.original.id) && "bg-brand-primary/10"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell 
                      key={cell.id} 
                      className={cn(
                        "py-1 px-2 border-subtle/50",
                        cell.column.id === "drag" ? "w-8" : ""
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-16 text-center text-[10px] text-secondary"
                >
                  No insights found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
