"use client";

import * as React from "react";
import { MagnifyingGlassIcon, ReloadIcon } from "@radix-ui/react-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDCOActionLogs } from "@/hooks/useDCOActionLogs";
import type { ActionLog, ActionStatus, ScopeType } from "@/lib/types/dco";
import { cn } from "@/lib/utils";

type DCOActionAlertsBoxProps = {
  brandId: string;
  metaAccountId?: string;
  campaignId?: string;
  className?: string;
  onRefresh?: () => void;
};

type SortMode = "newest" | "oldest" | "severity" | "action";
type StatusFilter = "all" | ActionStatus;
type ScopeFilter = "all" | ScopeType;
type QuickView = "all" | "attention" | "pending" | "successful" | "campaign" | "adset";

const STATUS_ORDER: Record<ActionStatus, number> = {
  FAILED: 0,
  PENDING: 1,
  REJECTED: 2,
  APPROVED: 3,
  SUCCESS: 4,
  EXECUTED: 5,
};

const QUICK_VIEW_LABEL: Record<QuickView, string> = {
  all: "All events",
  attention: "Needs attention",
  pending: "Pending",
  successful: "Successful",
  campaign: "Campaign scope",
  adset: "Ad set scope",
};

const CREATIVE_SWITCH_ACTION_TYPES = new Set<ActionLog["actionType"]>([
  "SWITCH_CREATIVE",
  "CREATIVE_SWITCH_EXTERNAL",
]);

const CREATIVE_SWAP_BEFORE_KEYS = [
  "original_creative_url",
  "before_creative_url",
  "previous_creative_url",
  "old_creative_url",
  "originalCreativeUrl",
  "beforeCreativeUrl",
];

const CREATIVE_SWAP_AFTER_KEYS = [
  "new_creative_url",
  "after_creative_url",
  "replacement_creative_url",
  "updated_creative_url",
  "newCreativeUrl",
  "afterCreativeUrl",
];

type CreativeSwapUrls = {
  before: string;
  after: string;
};

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimestamp(isoString: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function summarizeAction(log: ActionLog): string {
  if (log.error) return log.error;
  if (log.decisionNote) return log.decisionNote;

  const payloadEntries = Object.entries(log.paramsChanged ?? {});
  if (payloadEntries.length > 0) {
    const [firstKey, firstValue] = payloadEntries[0];
    return `${firstKey}: ${String(firstValue)}`;
  }

  return `${log.actionType} applied on ${log.scopeType.toLowerCase()} scope`;
}

function badgeVariantForStatus(status: ActionStatus): "destructive" | "secondary" | "outline" {
  if (status === "FAILED" || status === "REJECTED") return "destructive";
  if (status === "PENDING") return "outline";
  return "secondary";
}

function readSwapUrlFromRecord(
  record: Record<string, unknown> | null | undefined,
  keys: string[]
): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function extractCreativeSwapUrls(log: ActionLog): CreativeSwapUrls | null {
  if (!CREATIVE_SWITCH_ACTION_TYPES.has(log.actionType)) return null;

  const payloads: Array<Record<string, unknown> | null | undefined> = [
    log.actionPayload,
    log.paramsChanged,
    log.result,
  ];

  for (const payload of payloads) {
    const before = readSwapUrlFromRecord(payload, CREATIVE_SWAP_BEFORE_KEYS);
    const after = readSwapUrlFromRecord(payload, CREATIVE_SWAP_AFTER_KEYS);
    if (before && after) {
      return { before, after };
    }
  }

  return null;
}

function matchesQuickView(log: ActionLog, view: QuickView): boolean {
  if (view === "all") return true;
  if (view === "attention") return log.status === "FAILED" || log.status === "PENDING" || log.status === "REJECTED";
  if (view === "pending") return log.status === "PENDING";
  if (view === "successful") return log.status === "SUCCESS" || log.status === "APPROVED" || log.status === "EXECUTED";
  if (view === "campaign") return log.scopeType === "CAMPAIGN";
  if (view === "adset") return log.scopeType === "ADSET" || log.scopeType === "AD";
  return true;
}

export function DCOActionAlertsBox({
  brandId,
  metaAccountId,
  campaignId,
  className,
  onRefresh,
}: DCOActionAlertsBoxProps) {
  const [search, setSearch] = React.useState("");
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [sortMode, setSortMode] = React.useState<SortMode>("newest");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [scopeFilter, setScopeFilter] = React.useState<ScopeFilter>("all");
  const [quickView, setQuickView] = React.useState<QuickView>("all");

  const {
    logs,
    isLoading,
    error,
    pagination,
    setFilters,
    refresh,
    goToPage,
  } = useDCOActionLogs({
    brandId,
    metaAccountId,
    initialPageSize: 80,
    initialDateRangeDays: 14,
  });

  React.useEffect(() => {
    setFilters({
      metaAccountId,
      campaignId,
    });
  }, [campaignId, metaAccountId, setFilters]);

  const filteredLogs = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const base = logs.filter((log) => {
      if (!matchesQuickView(log, quickView)) return false;
      if (statusFilter !== "all" && log.status !== statusFilter) return false;
      if (scopeFilter !== "all" && log.scopeType !== scopeFilter) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        log.actionType,
        log.status,
        log.scopeType,
        log.metaCampaignId ?? "",
        log.metaAdsetId ?? "",
        log.decisionNote ?? "",
        log.error ?? "",
        summarizeAction(log),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    return base.sort((left, right) => {
      if (sortMode === "newest") {
        return new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
      }
      if (sortMode === "oldest") {
        return new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime();
      }
      if (sortMode === "action") {
        return left.actionType.localeCompare(right.actionType);
      }

      const severityGap = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      if (severityGap !== 0) return severityGap;
      return new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
    });
  }, [logs, quickView, scopeFilter, search, sortMode, statusFilter]);

  const commandRows = React.useMemo(() => filteredLogs.slice(0, 8), [filteredLogs]);

  const contextLabel = campaignId
    ? "Campaign context"
    : metaAccountId
      ? "Account context"
      : "Brand context";

  const handleRefresh = React.useCallback(() => {
    refresh();
    onRefresh?.();
  }, [onRefresh, refresh]);

  return (
    <div className={cn("grid h-[min(72vh,680px)] min-h-0 gap-3 lg:grid-cols-[220px_minmax(0,1fr)]", className)}>
      <aside className="rounded-md border border-border/70 bg-muted/10 p-2">
        <div className="px-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Menu</div>
          <p className="mt-1 text-[11px] text-muted-foreground">{contextLabel}</p>
        </div>

        <div className="mt-2 space-y-1">
          {(Object.keys(QUICK_VIEW_LABEL) as QuickView[]).map((view) => (
            <button
              key={`alerts-quick-view-${view}`}
              type="button"
              onClick={() => setQuickView(view)}
              className={cn(
                "w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                quickView === view
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {QUICK_VIEW_LABEL[view]}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2 border-t border-border/70 pt-2">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="SUCCESS">Success</SelectItem>
              <SelectItem value="EXECUTED">Executed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as ScopeFilter)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scope</SelectItem>
              <SelectItem value="GLOBAL">Global</SelectItem>
              <SelectItem value="ACCOUNT">Account</SelectItem>
              <SelectItem value="CAMPAIGN">Campaign</SelectItem>
              <SelectItem value="ADSET">Ad Set</SelectItem>
              <SelectItem value="AD">Ad</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="severity">Severity</SelectItem>
              <SelectItem value="action">Action type</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </aside>

      <section className="flex min-h-0 flex-col rounded-md border border-border/70 bg-background">
        <div className="space-y-2 border-b border-border/70 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Automation Alerts Console</div>
              <p className="text-xs text-muted-foreground">
                {pagination.totalCount} total events · {filteredLogs.length} visible
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleRefresh}
              disabled={isLoading}
              aria-label="Refresh alerts"
            >
              <ReloadIcon className={cn("h-4 w-4", isLoading ? "animate-spin" : undefined)} />
            </Button>
          </div>

          <Command className="rounded-md border border-border/70 bg-muted/5">
            <CommandInput
              value={search}
              onValueChange={setSearch}
              onFocus={() => setCommandOpen(true)}
              onBlur={() => setCommandOpen(false)}
              placeholder="Command search: action, campaign, ad set, status..."
            />
            {commandOpen ? (
              <CommandList className="max-h-[140px]" onMouseDown={(event) => event.preventDefault()}>
                <CommandGroup heading="Quick commands">
                  <CommandItem onSelect={() => setStatusFilter("FAILED")}>Show failed only</CommandItem>
                  <CommandItem onSelect={() => setStatusFilter("PENDING")}>Show pending only</CommandItem>
                  <CommandItem onSelect={() => setQuickView("campaign")}>Limit to campaign scope</CommandItem>
                  <CommandItem onSelect={() => setQuickView("adset")}>Limit to ad set scope</CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Matching actions">
                  {commandRows.map((log) => (
                    <CommandItem
                      key={`alert-command-${log.id}`}
                      onSelect={() => setSearch(`${log.actionType} ${log.metaCampaignId ?? ""}`)}
                    >
                      <MagnifyingGlassIcon className="h-3.5 w-3.5" />
                      <span className="truncate">{log.actionType}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{log.status}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandEmpty>No matching commands.</CommandEmpty>
              </CommandList>
            ) : null}
          </Command>
        </div>

        <div className="flex-1 min-h-0">
          {error ? (
            <div className="m-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 8 }).map((_, idx) => (
                <Skeleton key={`alert-skeleton-${idx}`} className="h-10 w-full bg-muted/70" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex h-full min-h-[220px] items-center justify-center p-4 text-sm text-muted-foreground">
              No alerts for this filter set.
            </div>
          ) : (
            <ScrollArea className="h-full">
              <Table className="text-xs">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-[130px]">Time</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="w-[170px]">Action</TableHead>
                    <TableHead className="w-[110px]">Scope</TableHead>
                    <TableHead className="w-[200px]">Entity</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const creativeSwapUrls = extractCreativeSwapUrls(log);
                    const hoverDetail = creativeSwapUrls
                      ? `Before: ${creativeSwapUrls.before}\nAfter: ${creativeSwapUrls.after}`
                      : undefined;

                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-[11px] text-muted-foreground">
                          <div>{formatTimestamp(log.occurredAt)}</div>
                          <div>{formatRelativeTime(log.occurredAt)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={badgeVariantForStatus(log.status)}>{log.status}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{log.actionType}</TableCell>
                        <TableCell>{log.scopeType}</TableCell>
                        <TableCell className="text-muted-foreground">
                          <div>Campaign: {log.metaCampaignId ?? "--"}</div>
                          <div>Ad set: {log.metaAdsetId ?? "--"}</div>
                        </TableCell>
                        <TableCell className="max-w-[360px] whitespace-normal text-foreground" title={hoverDetail}>
                          <div>{summarizeAction(log)}</div>
                          {creativeSwapUrls ? (
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              Hover to view before/after creative URLs
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/70 px-2.5 py-2 text-xs">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => goToPage(Math.max(1, pagination.page - 1))}
            disabled={!pagination.hasPrevPage || isLoading}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {pagination.page} / {pagination.totalPages || 1}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => goToPage(Math.min(Math.max(1, pagination.totalPages), pagination.page + 1))}
            disabled={!pagination.hasNextPage || isLoading}
          >
            Next
          </Button>
        </div>
      </section>
    </div>
  );
}
