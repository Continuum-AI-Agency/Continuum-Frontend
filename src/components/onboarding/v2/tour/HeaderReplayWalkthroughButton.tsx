"use client";

import { usePathname } from "next/navigation";
import { ReplayWalkthroughButton } from "./ReplayWalkthroughButton";
import {
  TOUR_DASHBOARD,
  TOUR_AI_CANVAS,
  TOUR_ORGANIC,
  TOUR_PAID_MEDIA,
  type TourName,
} from "./config";

// Each tour surface maps to a route prefix. The header shows the replay
// control for whichever surface the user is currently on.
const SURFACE_TOURS: ReadonlyArray<{ prefix: string; tour: TourName }> = [
  { prefix: "/dashboard", tour: TOUR_DASHBOARD },
  { prefix: "/ai-studio", tour: TOUR_AI_CANVAS },
  { prefix: "/organic", tour: TOUR_ORGANIC },
  { prefix: "/scale", tour: TOUR_PAID_MEDIA },
];

/**
 * Route-aware replay control for the global app header — renders the tiny
 * replay button for the current tour surface, or nothing on other routes.
 */
export function HeaderReplayWalkthroughButton() {
  const pathname = usePathname();
  const match = SURFACE_TOURS.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!match) return null;

  return <ReplayWalkthroughButton tourName={match.tour} />;
}
