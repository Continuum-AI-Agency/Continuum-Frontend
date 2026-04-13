"use client";

import { cn } from "@/lib/utils";

type BlockSkeletonProps = { className?: string };

export function BlockSkeleton({ className }: BlockSkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg border border-border/40 bg-muted/30 p-4",
        className,
      )}
    >
      <div className="mb-3 h-4 w-1/3 rounded bg-muted/60" />
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-muted/40" />
        <div className="h-3 w-2/3 rounded bg-muted/40" />
      </div>
    </div>
  );
}
