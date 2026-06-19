"use client";

import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import type { CompetitorOrganicPost } from "@continuum/contracts";
import { useInstagramPosts } from "@/lib/api/competitorSpy";
import { formatRelativeDay } from "@/lib/competitor-spy/competitor-spy-rows";
import { InsightDataTable, type InsightColumn } from "@/components/dashboard/datatable/InsightDataTable";
import { LeaderboardThumbnail } from "@/components/dashboard/briefing/LeaderboardThumbnail";
import { InsightActionsDropdown, InsightContextActions } from "@/components/dashboard/briefing/insightActions";
import { CompetitorSpyLink } from "./CompetitorSpyLink";

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

// What the watched competitors are posting organically — a dense, sortable view
// of their recent top posts. Reuses the live Business Discovery feed from the
// Brand Spy subsystem; the full workspace is one click away.
export function CompetitorOrganicTable({ brandId }: { brandId: string }) {
  const { data, isLoading, isError } = useInstagramPosts({ brandId, limit: 8 });
  const rows = useMemo(() => data ?? [], [data]);

  const columns = useMemo<InsightColumn<CompetitorOrganicPost>[]>(
    () => [
      {
        id: "competitor",
        header: "Competitor",
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate text-sm text-foreground">{row.competitorName}</p>
            <p className="truncate text-[11px] text-muted-foreground">@{row.instagramUsername}</p>
          </div>
        ),
      },
      {
        id: "post",
        header: "Post",
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-3">
            {row.post.coverUrl ? (
              <LeaderboardThumbnail
                src={row.post.coverUrl}
                alt={row.competitorName}
                fallbackSeed={row.competitorName}
              />
            ) : null}
            <p className="min-w-0 truncate text-[13px] text-muted-foreground">
              {row.post.caption?.trim() || "—"}
            </p>
          </div>
        ),
      },
      {
        id: "likes",
        header: "Likes",
        align: "right",
        sortValue: (row) => row.post.likeCount ?? 0,
        cell: (row) => (typeof row.post.likeCount === "number" ? formatCompact(row.post.likeCount) : "—"),
      },
      {
        id: "posted",
        header: "Posted",
        align: "right",
        sortValue: (row) => Date.parse(row.post.timestamp ?? "") || 0,
        cell: (row) => formatRelativeDay(row.post.timestamp, Date.now()) || "—",
      },
    ],
    [],
  );

  return (
    <InsightDataTable
      title="Competitor organic"
      headerAction={<CompetitorSpyLink />}
      rows={rows}
      columns={columns}
      getRowId={(row) => `${row.competitorId}:${row.post.id}`}
      defaultSort={{ columnId: "likes", direction: "desc" }}
      isLoading={isLoading}
      emptyState={
        isError
          ? "Competitor posts are unavailable right now."
          : "No competitor posts yet — tag competitors in Brand Spy."
      }
      contextMenu={(row) => <InsightContextActions permalink={row.post.permalink} />}
      rowActions={(row) => <InsightActionsDropdown permalink={row.post.permalink} />}
      expandedContent={(row) => (
        <div className="flex flex-col gap-2 text-[11px] leading-relaxed">
          {row.post.caption ? <p className="text-foreground">{row.post.caption}</p> : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums text-muted-foreground">
            {typeof row.post.commentsCount === "number" ? <span>{row.post.commentsCount} comments</span> : null}
            {typeof row.post.likeCount === "number" ? <span>{row.post.likeCount} likes</span> : null}
          </div>
          <a
            href={row.post.permalink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3" />
            Open on Instagram
          </a>
        </div>
      )}
    />
  );
}
