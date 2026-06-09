"use client";

import * as React from "react";
import { PlayIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ActionLog } from "@/lib/types/dco";
import { cn } from "@/lib/utils";

import { CreativeHoverCard } from "./CreativeHoverCard";
import { nearestAspectLabel } from "./filterAndSortCreatives";
import type { CreativeAd, OpenCreativeDetail } from "./types";

type CreativeTileProps = {
  ad: CreativeAd;
  isSelected: boolean;
  disabled: boolean;
  metricLabel: string;
  metricValue: string;
  logs: ActionLog[];
  adSetName: string | null;
  onToggleSelect: (adId: string) => void;
  onOpenDetail: (detail: OpenCreativeDetail) => void;
};

export function CreativeTile({
  ad,
  isSelected,
  disabled,
  metricLabel,
  metricValue,
  logs,
  adSetName,
  onToggleSelect,
  onOpenDetail,
}: CreativeTileProps) {
  const [ratio, setRatio] = React.useState<string | null>(null);
  const imageUrl = ad.creative?.thumbnailUrl || ad.creative?.imageUrl || null;
  const title = ad.creative?.title || ad.name || "Untitled ad";
  const isVideo = ad.creative?.format === "video" || Boolean(ad.creative?.videoId);

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    const label = nearestAspectLabel(naturalWidth, naturalHeight);
    if (label) setRatio(label);
  };

  return (
    <CreativeHoverCard
      ad={{
        id: ad.id,
        name: ad.name,
        adSetName,
        status: ad.effectiveStatus ?? ad.status ?? null,
        creative: ad.creative ?? null,
      }}
      logs={logs}
      onOpenDetail={(focusLogId) => onOpenDetail({ adId: ad.id, focusLogId })}
    >
      <button
        type="button"
        onClick={() => onToggleSelect(ad.id)}
        disabled={disabled}
        aria-pressed={isSelected}
        aria-label={`${isSelected ? "Deselect" : "Select"} ad ${title}`}
        className={cn(
          "group/tile flex w-full cursor-pointer flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          isSelected
            ? "border-primary/60 ring-1 ring-primary/40"
            : "border-border/70 hover:bg-muted/40",
          disabled && "cursor-not-allowed opacity-55"
        )}
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted/50">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Meta creative URLs are dynamic CDN hosts, not static at build time
            <img
              src={imageUrl}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-200 motion-safe:group-hover/tile:scale-105"
              loading="lazy"
              onLoad={handleImageLoad}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
              No preview
            </div>
          )}

          <div className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1">
            {isVideo ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                <PlayIcon className="h-2.5 w-2.5 fill-current" aria-hidden />
                Video
              </span>
            ) : null}
            {ratio ? (
              <span className="rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                {ratio}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-1 p-2">
          <span className="line-clamp-1 text-xs font-medium">{title}</span>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] text-muted-foreground">
              {metricLabel} · {metricValue}
            </span>
            <Badge variant={isSelected ? "default" : "secondary"} className="shrink-0 text-[10px]">
              {isSelected ? "Selected" : "Select"}
            </Badge>
          </div>
        </div>
      </button>
    </CreativeHoverCard>
  );
}
