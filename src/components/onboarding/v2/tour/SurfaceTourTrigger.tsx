"use client";

import { useEffect, useState } from "react";
import { useFirstRunTour } from "./useFirstRunTour";
import type { TourName } from "./config";

/**
 * Returns true one animation frame after `condition` first becomes true, so
 * tour targets have been mounted AND painted before the spotlight positions.
 */
export function useReadyAfterPaint(condition: boolean): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!condition) {
      setReady(false);
      return;
    }
    const handle = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(handle);
  }, [condition]);

  return ready;
}

/**
 * Drop-in, null-rendering trigger for a per-surface walkthrough. The hosting
 * surface owns `ready` — pass true once that surface's tour targets exist.
 */
export function SurfaceTourTrigger({
  tourName,
  ready,
}: {
  tourName: TourName;
  ready: boolean;
}) {
  useFirstRunTour({ tourName, ready });
  return null;
}
