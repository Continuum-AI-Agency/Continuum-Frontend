"use client";

import { cn } from "@/lib/utils";

import type { RotationEvent } from "./types";

type AdSummary = {
  name: string;
  imageUrl: string | null;
  adSetName?: string | null;
  status?: string | null;
};

type CreativeSheetSummaryProps = {
  ad: AdSummary;
  latestSwap: RotationEvent | null;
  rotationCount: number;
  className?: string;
};

function formatOccurredAt(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CreativeSheetSummary({
  ad,
  latestSwap,
  rotationCount,
  className,
}: CreativeSheetSummaryProps) {
  return (
    <div className={cn("flex gap-3", className)}>
      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-muted/50">
        {ad.imageUrl ? (
          <img
            src={ad.imageUrl}
            alt={ad.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-2xs text-muted-foreground">
            No preview
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{ad.name}</div>
        {ad.adSetName ? (
          <div className="truncate text-xs text-muted-foreground">{ad.adSetName}</div>
        ) : null}
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {rotationCount} rotation{rotationCount === 1 ? "" : "s"}
          </span>
          {latestSwap ? (
            <>
              <span aria-hidden>·</span>
              <span>Last: {formatOccurredAt(latestSwap.occurredAt)}</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
