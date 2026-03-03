"use client";

import * as React from "react";
import { MagnifyingGlassIcon, ReloadIcon } from "@radix-ui/react-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDCOActionLogs } from "@/hooks/useDCOActionLogs";
import type { ActionLog, ActionStatus } from "@/lib/types/dco";
import { cn } from "@/lib/utils";

type DCOActionAlertsBoxProps = {
  brandId: string;
  metaAccountId?: string;
  campaignId?: string;
};

type SortMode = "newest" | "oldest" | "severity" | "action";
type StatusFilter = "all" | ActionStatus;

const STATUS_ORDER: Record<ActionStatus, number> = {
  FAILED: 0,
  PENDING: 1,
  APPROVED: 2,
  SUCCESS: 3,
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

function statusTone(status: ActionStatus): string {
  if (status === "FAILED") return "border-l-rose-500 bg-rose-500/5";
  if (status === "PENDING") return "border-l-amber-500 bg-amber-500/5";
  if (status === "APPROVED") return "border-l-sky-500 bg-sky-500/5";
  return "border-l-emerald-500 bg-emerald-500/5";
}

export function DCOActionAlertsBox({ brandId, metaAccountId, campaignId }: DCOActionAlertsBoxProps) {
  const [search, setSearch] = React.useState("");
  const [sortMode, setSortMode] = React.useState<SortMode>("newest");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");

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
    initialPageSize: 30,
    initialDateRangeDays: 7,
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
      if (statusFilter !== "all" && log.status !== statusFilter) return false;
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
  }, [logs, search, sortMode, statusFilter]);

  const contextLabel = campaignId
    ? "Campaign context"
    : metaAccountId
      ? "Account context"
      : "Brand context";

  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="space-y-2 border-b border-border/70 bg-muted/20 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Automation Alerts</CardTitle>
            <p className="text-xs text-muted-foreground">
              {contextLabel} · {pagination.totalCount} total events
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={refresh}
            disabled={isLoading}
            aria-label="Refresh alerts"
          >
            <ReloadIcon className={cn("h-4 w-4", isLoading ? "animate-spin" : undefined)} />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-[180px] flex-1">
            <MagnifyingGlassIcon className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search alerts..."
              className="h-8 pl-7 text-xs"
              aria-label="Search action alerts"
            />
          </div>

          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="SUCCESS">Success</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
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
      </CardHeader>

      <CardContent className="p-3">
        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton key={`alert-skeleton-${idx}`} className="h-14 w-full bg-muted/70" />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
            No alerts for this context.
          </div>
        ) : (
          <div className="max-h-[240px] space-y-2 overflow-auto pr-1">
            {filteredLogs.map((log) => (
              <div key={log.id} className={cn("rounded-md border border-border/70 border-l-4 px-3 py-2", statusTone(log.status))}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={log.status === "FAILED" ? "destructive" : "secondary"}>{log.status}</Badge>
                  <span className="text-xs font-medium">{log.actionType}</span>
                  <span className="text-[11px] text-muted-foreground">{formatRelativeTime(log.occurredAt)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-foreground">{summarizeAction(log)}</p>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Scope: {log.scopeType} · Campaign: {log.metaCampaignId ?? "--"}
                </div>
              </div>
            ))}
          </div>
        )}

        {pagination.totalPages > 1 ? (
          <div className="mt-2 flex items-center justify-between text-xs">
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
              Page {pagination.page} / {pagination.totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => goToPage(Math.min(pagination.totalPages, pagination.page + 1))}
              disabled={!pagination.hasNextPage || isLoading}
            >
              Next
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
