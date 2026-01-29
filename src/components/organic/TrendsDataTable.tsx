"use client"

import * as React from "react"
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type ColumnFiltersState, type SortingState } from "@tanstack/react-table"
import * as Accordion from "@radix-ui/react-accordion"
import { DragHandleHorizontalIcon, ChevronDownIcon } from "@radix-ui/react-icons"
import { ArrowUpDown, MoreHorizontal, Filter } from "lucide-react"
import { motion } from "framer-motion"

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
  allowDrag?: boolean
  allowSelect?: boolean
  allowActions?: boolean
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
  allowDrag = false,
  allowSelect = false,
  allowActions = false,
}: TrendsDataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [momentumFilter, setMomentumFilter] = React.useState<string>("all")
  const [columnSizing, setColumnSizing] = React.useState({})
  const [expandedId, setExpandedId] = React.useState<string | undefined>(undefined)

  const filteredData = React.useMemo(() => {
    if (momentumFilter === "all") return data;
    return data.filter(item => item.momentum === momentumFilter);
  }, [data, momentumFilter]);

  const columns = React.useMemo<ColumnDef<Trend>[]>(() => {
    const baseColumns: ColumnDef<Trend>[] = [];

    if (allowDrag) {
      baseColumns.push({
        id: "drag",
        header: "",
        size: 40,
        minSize: 40,
        maxSize: 40,
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
              onClick={(e) => e.stopPropagation()}
            >
              <DragHandleHorizontalIcon className="text-secondary opacity-50" />
            </div>
          )
        },
      });
    }

    if (allowSelect) {
      baseColumns.push({
        id: "select",
        header: "Sel",
        size: 40,
        minSize: 40,
        cell: ({ row }) => (
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

    baseColumns.push(
      {
        accessorKey: "title",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-7 text-[10px] uppercase"
            onClick={(e) => {
              e.stopPropagation();
              column.toggleSorting(column.getIsSorted() === "asc");
            }}
          >
            Topic
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        size: 350,
        minSize: 150,
        cell: ({ row }) => (
          <div className="py-1 min-w-0 flex-1">
            <div className="font-medium text-primary truncate text-xs" title={row.getValue("title")}>
              {row.getValue("title")}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "momentum",
        header: "Mom",
        size: 80,
        minSize: 60,
        cell: ({ row }) => {
          const momentum = row.getValue("momentum") as Trend["momentum"]
          return (
            <div className="hidden sm:block">
              <Badge variant="outline" className={cn("text-[9px] uppercase px-1 py-0", momentumStyles[momentum])}>
                {momentum.slice(0, 3)}
              </Badge>
            </div>
          )
        },
      },
      {
        id: "platforms",
        header: "Plat",
        size: 100,
        minSize: 80,
        cell: ({ row }) => (
          <div className="hidden md:flex flex-wrap gap-0.5">
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
      }
    );

    if (allowActions) {
      baseColumns.push({
        id: "actions",
        header: "Act",
        size: 50,
        minSize: 50,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
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
          </div>
        ),
      });
    }

    baseColumns.push({
      id: "expand",
      header: "",
      size: 40,
      minSize: 40,
      cell: () => (
        <ChevronDownIcon className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180 opacity-50" />
      ),
    });

    return baseColumns.filter(col => {
      if (col.id === "momentum" || (col as any).accessorKey === "momentum") return showMomentumFilter;
      return true;
    });
  }, [selectedTrendIds, onToggleTrend, activePlatforms, showMomentumFilter, allowDrag, allowSelect, allowActions]);

  const table = useReactTable({
    data: filteredData,
    columns,
    columnResizeMode: "onChange",
    onColumnSizingChange: setColumnSizing,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      columnSizing,
    },
  })

  return (
    <div className="flex flex-col h-full space-y-2">
      <div className="flex items-center gap-2 px-1 shrink-0">
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

      <div className="flex-1 min-h-0 rounded border border-subtle bg-surface/20 overflow-hidden flex flex-col">
        <div className="bg-surface/40 border-b border-subtle shrink-0">
          <div className="flex h-8 items-center px-2">
            {table.getHeaderGroups()[0].headers.map((header) => (
              <div 
                key={header.id} 
                className={cn(
                  "text-[9px] uppercase tracking-wider font-bold px-2 relative group/header flex items-center",
                  header.id === "momentum" ? "hidden sm:flex" : "",
                  header.id === "platforms" ? "hidden md:flex" : ""
                )}
                style={{ width: header.getSize() }}
              >
                <div className="truncate flex-1">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </div>
                {header.column.getCanResize() && (
                  <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    className={cn(
                      "absolute right-0 top-0 h-full w-1 cursor-col-resize bg-brand-primary/0 group-hover/header:bg-brand-primary/50 transition-colors z-10",
                      header.column.getIsResizing() ? "bg-brand-primary opacity-100" : ""
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <Accordion.Root 
            type="single" 
            collapsible 
            value={expandedId}
            onValueChange={setExpandedId}
            className="divide-y divide-subtle/30"
          >
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <Accordion.Item key={row.id} value={row.id} className="group">
                  <Accordion.Header className="flex items-center min-h-[2.5rem] hover:bg-surface/40 transition-colors">
                    {row.getVisibleCells().map((cell) => {
                      const id = cell.column.id;
                      const isInteractive = ["drag", "select", "actions"].includes(id);
                      const width = cell.column.getSize();
                      
                      if (isInteractive) {
                        return (
                          <div 
                            key={cell.id} 
                            className={cn(
                              "px-2 flex items-center h-full",
                              id === "drag" ? "shrink-0" : "min-w-0"
                            )}
                            style={{ width }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        );
                      }

                      return (
                        <Accordion.Trigger key={cell.id} asChild>
                          <div 
                            className={cn(
                              "px-2 flex items-center h-full min-w-0",
                              id === "momentum" ? "hidden sm:flex" : "",
                              id === "platforms" ? "hidden md:flex" : ""
                            )}
                            style={{ width }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        </Accordion.Trigger>
                      );
                    })}
                  </Accordion.Header>
                  <Accordion.Content className="overflow-hidden bg-surface/10" forceMount asChild>
                    <motion.div
                      initial={false}
                      animate={{ 
                        height: expandedId === row.id ? "auto" : 0,
                        opacity: expandedId === row.id ? 1 : 0
                      }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                      <div className="p-4 space-y-3">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Summary</span>
                          <p className="text-xs text-primary leading-relaxed">
                            {row.original.summary}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Momentum</span>
                            <div className="flex items-center gap-2">
                              <Badge className={cn("text-[10px] px-2 py-0.5", momentumStyles[row.original.momentum])}>
                                {row.original.momentum}
                              </Badge>
                            </div>
                          </div>
                          {row.original.tags.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Tags</span>
                              <div className="flex flex-wrap gap-1">
                                {row.original.tags.map(tag => (
                                  <Badge key={tag} variant="secondary" className="text-[9px] px-1.5 py-0 bg-surface/50">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </Accordion.Content>
                </Accordion.Item>
              ))
            ) : (
              <div className="h-16 flex items-center justify-center text-[10px] text-secondary">
                No insights found.
              </div>
            )}
          </Accordion.Root>
        </div>
      </div>
    </div>
  )
}
