"use client";

import { cn } from "@/lib/utils";

import type { RotationEvent } from "./types";

type CreativeRotationListProps = {
  rotations: RotationEvent[];
  focusedId?: string | null;
  className?: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
};

function formatOccurredAt(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ThumbTile({ url, label }: { url: string | null; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-xs text-muted-foreground">
      <div className="relative h-20 w-20 overflow-hidden rounded bg-muted/40">
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-2xs">URL unavailable</div>
        )}
      </div>
      <span>{label}</span>
    </div>
  );
}

function RotationRow({ event, isFocused }: { event: RotationEvent; isFocused: boolean }) {
  const reason = event.decisionNote ?? event.error ?? "No reason recorded.";
  const product = event.replacement ?? event.outgoing;

  return (
    <div
      data-rotation-id={event.id}
      data-focused={isFocused ? "true" : undefined}
      className={cn(
        "rounded-lg border border-border/70 bg-background p-3 transition-colors",
        isFocused && "border-primary/60 ring-1 ring-primary/40"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {event.actionType.replace(/_/g, " ").toLowerCase()}
        </span>
        <span className="text-xs text-muted-foreground">{formatOccurredAt(event.occurredAt)}</span>
      </div>

      <p className="mt-2 text-sm leading-snug text-foreground">{reason}</p>

      <div className="mt-3 flex items-center gap-3">
        <ThumbTile url={event.beforeUrl} label="Before" />
        <span className="text-muted-foreground" aria-hidden>
          →
        </span>
        <ThumbTile url={event.afterUrl} label="After" />
        {product ? (
          <div className="min-w-0 flex-1 rounded border border-border/60 bg-muted/30 p-2">
            <div className="text-2xs uppercase tracking-wide text-muted-foreground">
              {event.replacement ? "Replacement product" : "Outgoing product"}
            </div>
            <div className="mt-0.5 truncate text-sm font-medium">{product.name}</div>
            <div className="truncate text-xs text-muted-foreground">{product.brand}</div>
            {product.reason ? (
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {product.reason}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CreativeRotationList({
  rotations,
  focusedId,
  className,
  scrollRef,
}: CreativeRotationListProps) {
  if (rotations.length === 0) {
    return (
      <div
        ref={scrollRef}
        className={cn(
          "rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-center text-sm text-muted-foreground",
          className
        )}
      >
        No DCO rotations recorded for this ad in the selected window.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className={cn("flex flex-col gap-2", className)}>
      {rotations.map((event) => (
        <RotationRow key={event.id} event={event} isFocused={focusedId === event.id} />
      ))}
    </div>
  );
}
