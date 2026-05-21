"use client";

import * as React from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ActionLog } from "@/lib/types/dco";

import { CreativeRotationList } from "./CreativeRotationList";
import { CreativeSheetSummary } from "./CreativeSheetSummary";
import { summarizeCreativeRotations } from "./useCreativeRotations";

type CreativeRotationSheetAd = {
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
} | null;

type CreativeRotationSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ad: CreativeRotationSheetAd;
  logs: ActionLog[];
  focusLogId?: string;
};

export function CreativeRotationSheet({
  open,
  onOpenChange,
  ad,
  logs,
  focusLogId,
}: CreativeRotationSheetProps) {
  const summary = React.useMemo(
    () =>
      summarizeCreativeRotations({
        adId: ad?.id ?? null,
        logs,
        currentCreative: ad?.creative ?? null,
      }),
    [ad?.id, ad?.creative, logs]
  );

  const reversed = React.useMemo(() => [...summary.rotations].reverse(), [summary.rotations]);

  const focusedId = focusLogId ?? summary.latestSwap?.id ?? null;
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open || !focusedId) return;
    const node = scrollRef.current?.querySelector<HTMLElement>(
      `[data-rotation-id="${focusedId}"]`
    );
    if (node) node.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open, focusedId]);

  const adSummary = ad
    ? {
        name: ad.creative?.title ?? ad.name,
        imageUrl: ad.creative?.imageUrl ?? ad.creative?.thumbnailUrl ?? null,
        adSetName: ad.adSetName ?? null,
        status: ad.status ?? null,
      }
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-full w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60 p-4">
          <SheetTitle className="text-sm">Creative rotation history</SheetTitle>
          <SheetDescription className="text-[12px]">
            DCO actions for this ad in the current time window.
          </SheetDescription>
          {adSummary ? (
            <div className="mt-3">
              <CreativeSheetSummary
                ad={adSummary}
                latestSwap={summary.latestSwap}
                rotationCount={summary.rotations.length}
              />
            </div>
          ) : null}
        </SheetHeader>

        <ScrollArea className="flex-1">
          <CreativeRotationList
            rotations={reversed}
            focusedId={focusedId}
            scrollRef={scrollRef}
            className="p-4"
          />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
