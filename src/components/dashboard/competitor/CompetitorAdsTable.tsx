"use client";

import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import type { TimelineEntry } from "@continuum/contracts";
import { useAdTimeline } from "@/lib/api/competitorSpy";
import { adStatusBadge, formatRelativeDay } from "@/lib/competitor-spy/competitor-spy-rows";
import { InsightDataTable, type InsightColumn } from "@/components/dashboard/datatable/InsightDataTable";
import { InsightActionsDropdown, InsightContextActions } from "@/components/dashboard/briefing/insightActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CompetitorSpyLink } from "./CompetitorSpyLink";

function compactDays(firstSeenAt: string, lastSeenAt: string): string {
  const first = Date.parse(firstSeenAt);
  const last = Date.parse(lastSeenAt);
  if (Number.isNaN(first) || Number.isNaN(last)) return "-";
  const days = Math.max(0, Math.round((last - first) / 86_400_000));
  return days === 1 ? "1d" : `${days}d`;
}

function formatMetadataDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDeliveryWindow(start: string | null | undefined, stop: string | null | undefined): string {
  const startLabel = formatMetadataDate(start);
  const stopLabel = formatMetadataDate(stop);
  if (startLabel !== "-" && stopLabel !== "-") return `${startLabel} to ${stopLabel}`;
  if (startLabel !== "-") return `${startLabel} onward`;
  if (stopLabel !== "-") return `Until ${stopLabel}`;
  return "-";
}

function formatList(values: string[] | undefined): string {
  const items = (values ?? []).filter(Boolean);
  return items.length > 0 ? items.join(", ") : "-";
}

function formatObservedLive(row: TimelineEntry): string {
  const days = row.publicMetadata?.observedActiveDays;
  return typeof days === "number" ? `${days}d` : compactDays(row.firstSeenAt, row.lastSeenAt);
}

function MetadataItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-xs text-foreground">{value ?? "-"}</p>
    </div>
  );
}

function StatusPill({ badge }: { badge: ReturnType<typeof adStatusBadge> }) {
  const variant = badge.tone === "new" ? "success" : badge.tone === "paused" ? "destructive" : "secondary";
  return (
    <Badge variant={variant} className="text-2xs">
      {badge.label}
    </Badge>
  );
}

export function CompetitorAdsTable({ brandId }: { brandId: string }) {
  const { data, isLoading, isError } = useAdTimeline({
    brandId,
    limit: 12,
    sort: "first_seen_at",
    dir: "desc",
  });
  const rows = useMemo(() => data ?? [], [data]);
  const now = Date.now();

  const columns = useMemo<InsightColumn<TimelineEntry>[]>(
    () => [
      {
        id: "competitor",
        header: "Competitor",
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate text-sm text-foreground">{row.competitorName}</p>
            <p className="truncate text-xs text-muted-foreground">{row.sourceAdId}</p>
          </div>
        ),
      },
      {
        id: "copy",
        header: "Ad copy",
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">{row.body?.trim() || "No primary text"}</p>
            {row.analysis?.primaryTheme ? (
              <p className="truncate text-xs text-muted-foreground">{row.analysis.primaryTheme}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "platforms",
        header: "Platforms",
        sortValue: (row) => row.platforms.length,
        cell: (row) => (
          <div className="flex max-w-36 flex-wrap justify-end gap-1">
            {row.platforms.length > 0 ? (
              row.platforms.slice(0, 2).map((platform) => (
                <Badge
                  key={`${row.snapshotId}-${platform}`}
                  variant="outline"
                  className="border-border/70 px-2 py-0 text-2xs font-normal text-muted-foreground"
                >
                  {platform}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
            {row.platforms.length > 2 ? (
              <Badge variant="secondary" className="px-2 py-0 text-2xs font-normal">
                +{row.platforms.length - 2}
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        align: "right",
        sortValue: (row) => (adStatusBadge(row.status, row.firstSeenAt, now).tone === "new" ? 2 : row.status === "active" ? 1 : 0),
        cell: (row) => {
          const badge = adStatusBadge(row.status, row.firstSeenAt, now);
          return <StatusPill badge={badge} />;
        },
      },
      {
        id: "firstSeen",
        header: "First seen",
        align: "right",
        sortValue: (row) => Date.parse(row.firstSeenAt) || 0,
        cell: (row) => formatRelativeDay(row.firstSeenAt, now) || "-",
      },
      {
        id: "duration",
        header: "Live",
        align: "right",
        sortValue: (row) => Date.parse(row.lastSeenAt) - Date.parse(row.firstSeenAt),
        cell: (row) => compactDays(row.firstSeenAt, row.lastSeenAt),
      },
    ],
    [now],
  );

  return (
    <InsightDataTable
      title="Competitor ads"
      headerAction={<CompetitorSpyLink href="/competitor-spy?tab=paid" />}
      rows={rows}
      columns={columns}
      getRowId={(row) => row.snapshotId}
      defaultSort={{ columnId: "firstSeen", direction: "desc" }}
      isLoading={isLoading}
      emptyState={
        isError
          ? "Competitor ads are unavailable right now."
          : "No paid competitor ads yet - tag competitors with a resolved Meta Page in Brand Spy."
      }
      contextMenu={(row) => <InsightContextActions permalink={row.snapshotUrl ?? undefined} />}
      rowActions={(row) => <InsightActionsDropdown permalink={row.snapshotUrl ?? undefined} />}
      expandedContent={(row) => (
        <div className="flex flex-col gap-2 text-xs leading-relaxed">
          {row.body ? <p className="text-foreground">{row.body}</p> : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums text-muted-foreground">
            {row.cta ? <span>CTA {row.cta}</span> : null}
            {row.analysis?.hookArchetype ? <span>{row.analysis.hookArchetype.replace(/_/g, " ")}</span> : null}
            {row.platforms.length > 0 ? <span>{row.platforms.join(", ")}</span> : null}
          </div>
          <Card className="rounded-md border-border bg-muted/25 py-0 shadow-none">
            <CardContent className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetadataItem label="Meta page" value={row.publicMetadata?.pageName ?? "-"} />
              <MetadataItem label="Library ID" value={row.publicMetadata?.sourceAdId ?? row.sourceAdId} />
              <MetadataItem label="Created" value={formatMetadataDate(row.publicMetadata?.creationTime)} />
              <MetadataItem
                label="Delivery"
                value={formatDeliveryWindow(
                  row.publicMetadata?.deliveryStart ?? row.deliveryStart,
                  row.publicMetadata?.deliveryStop ?? row.deliveryStop,
                )}
              />
              <MetadataItem label="First seen" value={formatMetadataDate(row.firstSeenAt)} />
              <MetadataItem label="Last seen" value={formatMetadataDate(row.lastSeenAt)} />
              <MetadataItem label="Fetched" value={formatMetadataDate(row.publicMetadata?.fetchedAt)} />
              <MetadataItem label="Observed live" value={formatObservedLive(row)} />
              <MetadataItem label="Platforms" value={formatList(row.publicMetadata?.platforms ?? row.platforms)} />
              <MetadataItem label="Languages" value={formatList(row.publicMetadata?.languages)} />
              <MetadataItem label="Link title" value={row.publicMetadata?.linkTitle ?? "-"} />
              <MetadataItem label="Link caption" value={row.publicMetadata?.linkCaption ?? "-"} />
            </CardContent>
          </Card>
          {row.snapshotUrl ? (
            <Button asChild variant="ghost" size="xs" className="w-fit px-0 text-muted-foreground hover:text-foreground">
              <a href={row.snapshotUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3" />
                Open in Meta Ad Library
              </a>
            </Button>
          ) : null}
        </div>
      )}
    />
  );
}
