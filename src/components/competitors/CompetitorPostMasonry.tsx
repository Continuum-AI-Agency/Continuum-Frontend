"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { CompetitorPostHoverTile } from "./CompetitorPostHoverTile";
import { competitorPostViewKey, type CompetitorPostView } from "./competitorPostView";

const SKELETON_HEIGHTS = ["h-28", "h-40", "h-32", "h-44", "h-28", "h-36", "h-40", "h-32"];

export function CompetitorPostMasonry({
  views,
  isLoading,
  isError,
  emptyText,
  errorText = "Competitor posts are unavailable right now.",
  columnsClassName = "columns-2 sm:columns-3",
  renderActions,
}: {
  views: CompetitorPostView[];
  isLoading?: boolean;
  isError?: boolean;
  emptyText: string;
  errorText?: string;
  columnsClassName?: string;
  renderActions?: (view: CompetitorPostView) => ReactNode;
}) {
  if (isLoading) {
    return (
      <div className={cn("gap-2", columnsClassName)}>
        {SKELETON_HEIGHTS.map((height, index) => (
          <div
            key={index}
            className={cn("mb-2 w-full animate-pulse break-inside-avoid rounded-lg bg-muted/70", height)}
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{errorText}</p>;
  }

  if (views.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/70 p-8 text-center">
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className={cn("gap-2", columnsClassName)}>
      {views.map((view) => (
        <div key={competitorPostViewKey(view)} className="mb-2 break-inside-avoid">
          <CompetitorPostHoverTile view={view} actions={renderActions?.(view)} />
        </div>
      ))}
    </div>
  );
}
