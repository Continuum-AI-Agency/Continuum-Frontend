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
import { DragHandleHorizontalIcon, LightningBoltIcon, ChevronDownIcon, DotIcon } from "@radix-ui/react-icons"
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
}

const momentumStyles: Record<Trend["momentum"], string> = {
  rising: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  stable: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  cooling: "bg-amber-500/10 text-amber-500 border-amber-500/20",
}

const platformLabel = (platform: OrganicPlatformKey) =>
  platform === "linkedin" ? "LinkedIn" : platform === "tiktok" ? "TikTok" : platform[0]?.toUpperCase() + platform.slice(1);

export function TrendsDataTable({
  data,
  selectedTrendIds,
  onToggleTrend,
  activePlatforms,
}: TrendsDataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [momentumFilter, setMomentumFilter] = React.useState<string>("all")

  const filteredData = React.useMemo(() => {
    if (momentumFilter === "all") return data;
    return data.filter(item => item.momentum === momentumFilter);
  }, [data, momentumFilter]);

  const columns = React.useMemo<ColumnDef<Trend>[]>(() => [
    {
      id: "drag",
      header: "",
      cell: ({ row }) => {
        const trend = row.original;
        const handleDragStart = (e: React.DragEvent) => {
          const isQuestion = trend.tags.includes("question");
          e.dataTransfer.setData("application/json", JSON.stringify({ 
            type: isQuestion ? "question" : "trend", 
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
      header: "Select",
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
          className="-ml-3"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Topic
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="max-w-[200px]">
          <div className="font-medium text-primary truncate" title={row.getValue("title")}>
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
      header: "Momentum",
      cell: ({ row }) => {
        const momentum = row.getValue("momentum") as Trend["momentum"]
        return (
          <Badge variant="outline" className={cn("text-[10px] uppercase px-1.5 py-0", momentumStyles[momentum])}>
            {momentum}
          </Badge>
        )
      },
    },
    {
      id: "platforms",
      header: "Platforms",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.platforms.map((p) => (
            <Badge 
              key={p} 
              variant="secondary" 
              className={cn(
                "text-[9px] px-1 py-0",
                activePlatforms.includes(p) ? "bg-brand-primary/20 text-brand-primary border-brand-primary/20" : "opacity-50"
              )}
            >
              {p === "instagram" ? "IG" : p === "linkedin" ? "LI" : p.slice(0, 2).toUpperCase()}
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
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onToggleTrend(row.original.id)}>
              {selectedTrendIds.includes(row.original.id) ? "Remove from plan" : "Add to plan"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">Ignore</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [selectedTrendIds, onToggleTrend, activePlatforms])

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
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Filter topics..."
          value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("title")?.setFilterValue(event.target.value)
          }
          className="h-8 text-xs bg-surface/50 border-subtle flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase font-semibold border-subtle">
              <Filter className="mr-2 h-3 w-3" />
              {momentumFilter === "all" ? "All" : momentumFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setMomentumFilter("all")}>All Momentum</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMomentumFilter("rising")}>Rising</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMomentumFilter("stable")}>Stable</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMomentumFilter("cooling")}>Cooling</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="rounded-md border border-subtle bg-surface/30 overflow-hidden">
        <Table>
          <TableHeader className="bg-surface/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-8 text-[10px] uppercase tracking-wider font-semibold py-0">
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
                  className={cn(
                    "h-12 hover:bg-surface/50 transition-colors",
                    selectedTrendIds.includes(row.original.id) && "bg-brand-primary/5"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-1 px-3">
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
                  className="h-24 text-center text-xs text-secondary"
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
