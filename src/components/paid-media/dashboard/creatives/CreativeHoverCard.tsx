"use client";

import * as React from "react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { ActionLog } from "@/lib/types/dco";
import { cn } from "@/lib/utils";

import { CreativeSheetSummary } from "./CreativeSheetSummary";
import { summarizeCreativeRotations } from "./useCreativeRotations";
import type { RotationEvent } from "./types";

type CreativeHoverCardAd = {
  id: string;
  name: string;
  adSetName?: string | null;
  status?: string | null;
  creative?: {
    id: string;
    title?: string | null;
    body?: string | null;
    imageUrl?: string | null;
    thumbnailUrl?: string | null;
  } | null;
};

type CreativeHoverCardProps = {
  ad: CreativeHoverCardAd;
  logs: ActionLog[];
  onOpenDetail: (focusLogId?: string) => void;
  children: React.ReactNode;
};

function ThumbTile({ url, label }: { url: string | null; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground">
      <div className="relative h-12 w-12 overflow-hidden rounded bg-muted/50">
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-[9px]">N/A</div>
        )}
      </div>
      <span>{label}</span>
    </div>
  );
}

function HoverCardBody({ ad, logs, onOpenDetail }: Omit<CreativeHoverCardProps, "children">) {
  const summary = React.useMemo(
    () => summarizeCreativeRotations({ adId: ad.id, logs, currentCreative: ad.creative ?? null }),
    [ad.id, ad.creative, logs]
  );
  const { latestSwap, rotations } = summary;
  const imageUrl = ad.creative?.imageUrl ?? ad.creative?.thumbnailUrl ?? null;
  const title = ad.creative?.title ?? ad.name;

  return (
    <div className="flex flex-col gap-3">
      <CreativeSheetSummary
        ad={{
          name: title,
          imageUrl,
          adSetName: ad.adSetName ?? null,
          status: ad.status ?? null,
        }}
        latestSwap={latestSwap}
        rotationCount={rotations.length}
      />

      {latestSwap ? <SwapReason swap={latestSwap} /> : <NoSwapState />}

      <button
        type="button"
        onClick={() => onOpenDetail(latestSwap?.id)}
        className={cn(
          "inline-flex w-full items-center justify-center rounded-md border border-border/70 bg-background px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors",
          "hover:bg-muted/40"
        )}
      >
        {latestSwap ? "View full history →" : "Open details →"}
      </button>
    </div>
  );
}

function SwapReason({ swap }: { swap: RotationEvent }) {
  const reason = swap.decisionNote ?? swap.error ?? "No reason recorded.";
  return (
    <div className="rounded-md border border-border/70 bg-muted/30 p-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Why it changed
      </div>
      <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-foreground">{reason}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <ThumbTile url={swap.beforeUrl} label="Before" />
        <span className="text-muted-foreground" aria-hidden>
          →
        </span>
        <ThumbTile url={swap.afterUrl} label="After" />
      </div>
    </div>
  );
}

function NoSwapState() {
  return (
    <div className="rounded-md border border-dashed border-border/70 bg-muted/20 p-2 text-[11px] text-muted-foreground">
      No DCO actions in this window.
    </div>
  );
}

export function CreativeHoverCard({ ad, logs, onOpenDetail, children }: CreativeHoverCardProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <HoverCard openDelay={250} closeDelay={120} open={open} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 p-3">
        {open ? <HoverCardBody ad={ad} logs={logs} onOpenDetail={onOpenDetail} /> : null}
      </HoverCardContent>
    </HoverCard>
  );
}
