"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type BrandInsightsTableRow = {
  id: string;
  title: string;
  subtitle?: string;
  secondaryValue?: string;
  platforms?: string[];
  tags?: string[];
  details?: Array<{
    label: string;
    value?: string;
  }>;
};

type BrandInsightsDataTableProps = {
  rows: BrandInsightsTableRow[];
  emptyTitle: string;
  emptyDescription: string;
  countLabel: string;
  searchPlaceholder: string;
  secondaryHeaderLabel?: string;
  isLoading?: boolean;
  density?: "default" | "compact";
  scrollWithinSection?: boolean;
};

function normalizePlatform(platform: string) {
  const normalized = platform.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "ig" || normalized === "instagram") return "instagram";
  if (normalized === "fb" || normalized === "facebook") return "facebook";
  if (normalized === "li" || normalized === "linkedin") return "linkedin";
  if (normalized === "yt" || normalized === "youtube") return "youtube";
  if (normalized === "x" || normalized === "twitter") return "x";
  if (normalized === "tt" || normalized === "tiktok") return "tiktok";
  if (normalized === "reddit_basic") return "reddit";
  return normalized;
}

function formatPlatformLabel(platform: string) {
  const normalized = normalizePlatform(platform);
  if (!normalized) return platform;
  if (normalized === "instagram") return "Instagram";
  if (normalized === "facebook") return "Facebook";
  if (normalized === "linkedin") return "LinkedIn";
  if (normalized === "youtube") return "YouTube";
  if (normalized === "x") return "X";
  if (normalized === "tiktok") return "TikTok";
  if (normalized === "reddit") return "Reddit";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getPlatformBadgeClass(platform: string) {
  const normalized = normalizePlatform(platform);
  if (normalized === "instagram") return "border-pink-500/40 bg-pink-500/10 text-pink-700 dark:text-pink-300";
  if (normalized === "facebook") return "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  if (normalized === "linkedin") return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  if (normalized === "youtube") return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
  if (normalized === "x") return "border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";
  if (normalized === "tiktok") return "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
  if (normalized === "reddit") return "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  return "border-border bg-muted/60 text-muted-foreground";
}

function RowSkeleton({ density = "default" }: Pick<BrandInsightsDataTableProps, "density">) {
  const compact = density === "compact";
  return (
    <TableRow>
      <TableCell className={cn(compact ? "py-2" : "py-3")}>
        <div className="space-y-1">
          <Skeleton className={cn(compact ? "h-3.5 w-3/5" : "h-4 w-2/3")} />
          <Skeleton className={cn(compact ? "h-3 w-4/5" : "h-3.5 w-5/6")} />
        </div>
      </TableCell>
      <TableCell className={cn(compact ? "py-2" : "py-3")}>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </TableCell>
    </TableRow>
  );
}

type SortKey = "title" | "secondary";
type SortDir = "asc" | "desc";

export function BrandInsightsDataTable({
  rows,
  emptyTitle,
  emptyDescription,
  countLabel,
  searchPlaceholder,
  secondaryHeaderLabel = "Date",
  isLoading = false,
  density = "default",
  scrollWithinSection = false,
}: BrandInsightsDataTableProps) {
  const [query, setQuery] = useState("");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const compact = density === "compact";

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const filteredRows = useMemo(() => {
    if (!query.trim()) return rows;
    const normalizedQuery = query.toLowerCase();
    return rows.filter((row) =>
      [
        row.title,
        row.subtitle,
        row.secondaryValue,
        ...(row.platforms ?? []),
        ...(row.tags ?? []),
        ...(row.details?.map((detail) => detail.value) ?? []),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    );
  }, [rows, query]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const valA = sortKey === "title" ? (a.title ?? "") : (a.secondaryValue ?? "");
      const valB = sortKey === "title" ? (b.title ?? "") : (b.secondaryValue ?? "");
      const cmp = valA.localeCompare(valB);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortKey, sortDir]);

  useEffect(() => {
    if (!expandedRowId) return;
    if (!sortedRows.some((row) => row.id === expandedRowId)) {
      setExpandedRowId(null);
    }
  }, [expandedRowId, sortedRows]);

  const rowPaddingClass = compact ? "py-2" : "py-3";

  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-[var(--app-shell-gap)]")}>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className={cn("text-muted-foreground pointer-events-none absolute left-2.5 h-4 w-4", compact ? "top-1.5" : "top-2.5")} />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            inputSize={compact ? "sm" : "md"}
            className={cn("pl-8", compact && "h-7 text-xs")}
            aria-label={searchPlaceholder}
          />
        </div>
        <Badge variant="outline" className={cn("px-3 text-xs font-semibold", compact ? "h-7" : "h-9")}>
          {filteredRows.length} {countLabel}
        </Badge>
      </div>

      <div className="bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
        <div className={cn("min-h-0 flex-1 overflow-y-auto", scrollWithinSection && "max-h-[70vh]")}>
          {isLoading ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn("px-4 text-xs font-semibold tracking-wide", compact ? "py-1.5" : "py-2")}>Content</TableHead>
                  <TableHead className={cn("px-4 text-xs font-semibold tracking-wide", compact ? "py-1.5" : "py-2")}>{secondaryHeaderLabel}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: compact ? 4 : 6 }).map((_, index) => (
                  <RowSkeleton key={`skeleton-row-${index}`} density={density} />
                ))}
              </TableBody>
            </Table>
          ) : sortedRows.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm font-medium">{emptyTitle}</p>
              <p className="text-muted-foreground max-w-lg text-sm">{emptyDescription}</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-card sticky top-0 z-10">
                <TableRow>
                  <TableHead className={cn("px-4 text-xs font-semibold tracking-wide", compact ? "py-1.5" : "py-2")}>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      onClick={() => handleSort("title")}
                    >
                      Content
                      {sortKey === "title" ? (
                        sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead className={cn("px-4 text-xs font-semibold tracking-wide", compact ? "py-1.5" : "py-2")}>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      onClick={() => handleSort("secondary")}
                    >
                      {secondaryHeaderLabel}
                      {sortKey === "secondary" ? (
                        sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row) => {
                  const isExpanded = expandedRowId === row.id;
                  const normalizedPlatforms = Array.from(
                    new Set(
                      (row.platforms ?? [])
                        .map(normalizePlatform)
                        .filter(Boolean)
                    )
                  );

                  return (
                    <Fragment key={row.id}>
                      <TableRow data-state={isExpanded ? "selected" : undefined}>
                        <TableCell className={cn("px-4 align-top", rowPaddingClass)}>
                          <button
                            type="button"
                            className="group flex w-full items-start justify-between gap-2 text-left"
                            onClick={() => setExpandedRowId((current) => (current === row.id ? null : row.id))}
                            aria-expanded={isExpanded}
                            aria-controls={`brand-insights-row-details-${row.id}`}
                          >
                            <span className="min-w-0">
                              <span className={cn("block truncate font-medium", compact ? "text-xs" : "text-sm")}>{row.title}</span>
                              {row.subtitle ? (
                                <span className="text-muted-foreground mt-0.5 block line-clamp-2 text-xs leading-5">
                                  {row.subtitle}
                                </span>
                              ) : null}
                            </span>
                            <ChevronDown
                              className={cn(
                                "text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform duration-200",
                                isExpanded && "rotate-180"
                              )}
                            />
                          </button>
                        </TableCell>
                        <TableCell className={cn("px-4 align-top", rowPaddingClass)}>
                          <div className="space-y-1.5">
                            <p className="text-foreground text-xs font-semibold">{row.secondaryValue ?? "—"}</p>
                            {normalizedPlatforms.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {normalizedPlatforms.map((platform) => (
                                  <Badge
                                    key={`${row.id}-platform-${platform}`}
                                    variant="outline"
                                    className={cn("truncate font-medium", getPlatformBadgeClass(platform))}
                                  >
                                    {formatPlatformLabel(platform)}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded ? (
                        <TableRow id={`brand-insights-row-details-${row.id}`} className="animate-in fade-in-0 duration-150 bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={2} className="px-4 pb-4">
                            {row.details?.some((detail) => Boolean(detail.value?.trim())) ? (
                              <dl className="grid gap-2 sm:grid-cols-2">
                                {row.details
                                  .filter((detail) => Boolean(detail.value?.trim()))
                                  .map((detail) => (
                                    <div key={`${row.id}-${detail.label}`} className="rounded-md border bg-background p-3">
                                      <dt className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                                        {detail.label}
                                      </dt>
                                      <dd className="mt-1 text-sm leading-6">{detail.value}</dd>
                                    </div>
                                  ))}
                              </dl>
                            ) : (
                              <p className="text-muted-foreground text-sm">No additional details for this item.</p>
                            )}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
