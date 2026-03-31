"use client"

import * as React from "react"
import { Fragment } from "react"
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
import { DragHandleHorizontalIcon } from "@radix-ui/react-icons"
import { ArrowUpDown, ChevronDown, Filter, MoreHorizontal } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { Trend } from "@/lib/organic/trends"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"

interface TrendsDataTableProps {
  data: Trend[]
  selectedTrendIds: string[]
  onToggleTrend: (id: string) => void
  activePlatforms: OrganicPlatformKey[]
  showMomentumFilter?: boolean
  allowDrag?: boolean
  allowSelect?: boolean
  allowActions?: boolean
}

const momentumStyles: Record<Trend["momentum"], string> = {
  rising: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  stable: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  cooling: "bg-amber-500/10 text-amber-500 border-amber-500/20",
}

const PLATFORM_SHORT: Record<string, string> = {
  instagram: "IG",
  linkedin: "LI",
  facebook: "FB",
  tiktok: "TK",
  youtube: "YT",
  twitter: "TW",
  x: "X",
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
}: TrendsDataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [momentumFilter, setMomentumFilter] = React.useState<string>("all")
  const [expandedId, setExpandedId] = React.useState<string | undefined>(undefined)

  const filteredData = React.useMemo(() => {
    if (momentumFilter === "all") return data
    return data.filter((item) => item.momentum === momentumFilter)
  }, [data, momentumFilter])

  const columns = React.useMemo<ColumnDef<Trend>[]>(() => {
    const cols: ColumnDef<Trend>[] = []

    if (allowDrag) {
      cols.push({
        id: "drag",
        header: () => <span className="sr-only">Drag</span>,
        size: 40,
        cell: ({ row }) => {
          const trend = row.original
          const handleDragStart = (e: React.DragEvent) => {
            const seedType = trend.tags.includes("question")
              ? "question"
              : trend.tags.includes("event")
                ? "event"
                : "trend"
            e.dataTransfer.setData(
              "application/json",
              JSON.stringify({ type: seedType, trendId: trend.id, title: trend.title })
            )
            e.dataTransfer.effectAllowed = "copy"
          }
          return (
            <div
              draggable
              onDragStart={handleDragStart}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <DragHandleHorizontalIcon className="text-muted-foreground opacity-50" />
            </div>
          )
        },
      })
    }

    if (allowSelect) {
      cols.push({
        id: "select",
        header: () => <span className="sr-only">Select</span>,
        size: 40,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedTrendIds.includes(row.original.id)}
              onCheckedChange={() => onToggleTrend(row.original.id)}
              aria-label="Select row"
            />
          </div>
        ),
      })
    }

    cols.push(
      {
        accessorKey: "title",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-7 text-[10px] uppercase"
            onClick={(e) => {
              e.stopPropagation()
              column.toggleSorting(column.getIsSorted() === "asc")
            }}
          >
            Trend
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium text-sm truncate" title={row.getValue("title")}>
              {row.getValue("title")}
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
            <Badge
              variant="outline"
              className={cn("text-[9px] uppercase px-1.5 py-0", momentumStyles[momentum])}
            >
              {momentum}
            </Badge>
          )
        },
      },
      {
        id: "platforms",
        header: "Platforms",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-0.5">
            {row.original.platforms.map((p) => (
              <Badge
                key={p}
                variant="secondary"
                className={cn(
                  "text-[8px] px-1 py-0 min-w-[18px] text-center",
                  activePlatforms.includes(p as OrganicPlatformKey)
                    ? "bg-brand-primary/20 text-brand-primary border-brand-primary/20"
                    : "opacity-40"
                )}
              >
                {PLATFORM_SHORT[p] ?? p.slice(0, 2).toUpperCase()}
              </Badge>
            ))}
          </div>
        ),
      }
    )

    if (allowActions) {
      cols.push({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        size: 50,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-6 w-6 p-0" aria-label="Row actions">
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
                <DropdownMenuItem
                  className="text-xs"
                  onClick={() => onToggleTrend(row.original.id)}
                >
                  {selectedTrendIds.includes(row.original.id) ? "Remove from plan" : "Add to plan"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive text-xs">Ignore</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      })
    }

    cols.push({
      id: "expand",
      header: () => <span className="sr-only">Expand</span>,
      size: 40,
      cell: ({ row }) => (
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            expandedId === row.id && "rotate-180"
          )}
        />
      ),
    })

    return cols.filter((col) => {
      if (col.id === "momentum" || ("accessorKey" in col && col.accessorKey === "momentum")) {
        return showMomentumFilter
      }
      return true
    })
  }, [
    selectedTrendIds,
    onToggleTrend,
    activePlatforms,
    showMomentumFilter,
    allowDrag,
    allowSelect,
    allowActions,
    expandedId,
  ])

  const table = useReactTable({
    data: filteredData,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { sorting, columnFilters },
  })

  return (
    <div className="flex flex-col h-full space-y-2">
      <div className="flex items-center gap-2 px-1 shrink-0">
        <Input
          placeholder="Filter trends…"
          value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
          onChange={(event) => table.getColumn("title")?.setFilterValue(event.target.value)}
          className="h-7 text-[11px] bg-muted/50 border-border/60 flex-1"
        />
        {showMomentumFilter && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[9px] uppercase font-semibold"
              >
                <Filter className="mr-1 h-3 w-3" />
                {momentumFilter === "all" ? "All" : momentumFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {["all", "rising", "stable", "cooling"].map((value) => (
                <DropdownMenuItem
                  key={value}
                  className="text-xs capitalize"
                  onClick={() => setMomentumFilter(value)}
                >
                  {value === "all" ? "All momentum" : value}
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
                      className="text-[10px] uppercase tracking-wider font-bold px-3 h-8"
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
                        selectedTrendIds.includes(row.original.id) ? "selected" : undefined
                      }
                      onClick={() =>
                        setExpandedId((prev) => (prev === row.id ? undefined : row.id))
                      }
                      className="cursor-pointer"
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
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                Summary
                              </span>
                              <p className="text-xs leading-relaxed">
                                {row.original.summary}
                              </p>
                            </div>
                            {row.original.tags.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                  Tags
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {row.original.tags.map((tag) => (
                                    <Badge
                                      key={tag}
                                      variant="secondary"
                                      className="text-[9px] px-1.5 py-0"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
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
                    No trends found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
