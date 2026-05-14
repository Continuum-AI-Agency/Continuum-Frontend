"use client";

import { useCallback } from "react";
import { useNextStep } from "nextstepjs";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";
import { clearTourSeen } from "./seenFlags";
import type { TourName } from "./config";

type ReplayWalkthroughButtonProps = {
  tourName: TourName;
  className?: string;
  label?: string;
};

/**
 * Tiny icon-only control that restarts a per-surface walkthrough on demand.
 * Clears the brand-scoped seen-flag first so the first-run trigger stays
 * consistent. Designed to sit inline next to a shell's title in the header.
 */
export function ReplayWalkthroughButton({
  tourName,
  className,
  label = "Replay walkthrough",
}: ReplayWalkthroughButtonProps) {
  const { activeBrandId } = useActiveBrandContext();
  const { startNextStep } = useNextStep();

  const handleReplay = useCallback(() => {
    if (activeBrandId) clearTourSeen(tourName, activeBrandId);
    startNextStep(tourName);
  }, [activeBrandId, tourName, startNextStep]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={handleReplay}
      aria-label={label}
      title={label}
      className={cn("text-muted-foreground hover:text-foreground", className)}
    >
      <RotateCcw className="size-3" />
    </Button>
  );
}
