"use client";

import { useEffect, useRef } from "react";
import { useNextStep } from "nextstepjs";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";
import { isTourSeen, markTourSeen } from "./seenFlags";
import type { TourName } from "./config";

type UseFirstRunTourArgs = {
  tourName: TourName;
  // The surface owns this: true once the tour's target elements are mounted
  // and painted. Gating on it prevents the spotlight landing on nothing.
  ready: boolean;
};

/**
 * Auto-starts a per-surface walkthrough the first time a user visits that
 * surface for the active brand. Marks the seen-flag before starting so a
 * React 19 StrictMode double-invoke (or any re-render) can only fire once.
 */
export function useFirstRunTour({ tourName, ready }: UseFirstRunTourArgs): void {
  const { activeBrandId } = useActiveBrandContext();
  const { startNextStep, currentTour } = useNextStep();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!ready || !activeBrandId) return;
    if (currentTour) return;
    if (isTourSeen(tourName, activeBrandId)) return;

    firedRef.current = true;
    markTourSeen(tourName, activeBrandId);
    startNextStep(tourName);
  }, [ready, activeBrandId, currentTour, tourName, startNextStep]);
}
