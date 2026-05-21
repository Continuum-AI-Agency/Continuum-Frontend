"use client";

import React from "react";
import { Heading, Text } from "@radix-ui/themes";
import { CreativeLibrarySidebar } from "@/components/creative-assets/CreativeLibrarySidebar";
import { BrandSwitcherMenu } from "@/components/navigation/BrandSwitcherMenu";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  buildAiStudioStorageKey,
  plannerAiStudioHandoffSchema,
  type PlannerAiStudioHandoff,
} from "@/lib/organic/ai-studio-bridge";
import {
  SurfaceTourTrigger,
  useReadyAfterPaint,
} from "@/components/onboarding/v2/tour/SurfaceTourTrigger";
import { TOUR_AI_CANVAS } from "@/components/onboarding/v2/tour/config";
import { ReplayWalkthroughButton } from "@/components/onboarding/v2/tour/ReplayWalkthroughButton";
import { useSeedTourNodes } from "./useSeedTourNodes";

const StudioCanvas = dynamic(
  () => import("@/StudioCanvas/components/StudioCanvas").then((mod) => mod.StudioCanvas),
  { ssr: false },
);

type AIStudioClientProps = {
  brandProfileId: string;
  brandName: string;
};

function readOrganicPlannerSeedContext(draftId: string): PlannerAiStudioHandoff | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(buildAiStudioStorageKey(draftId));
  if (!raw) return null;

  try {
    const parsed = plannerAiStudioHandoffSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export default function AIStudioClient({
  brandProfileId,
  brandName,
}: AIStudioClientProps) {
  const searchParams = useSearchParams();
  const source = searchParams.get("source");
  const draftId = searchParams.get("draftId");
  const [organicPlannerSeed, setOrganicPlannerSeed] = React.useState<PlannerAiStudioHandoff | null>(null);

  const seedingSettled = useSeedTourNodes();
  const tourReady = useReadyAfterPaint(seedingSettled);

  React.useEffect(() => {
    if (source !== "organic-planner" || !draftId) {
      setOrganicPlannerSeed(null);
      return;
    }

    setOrganicPlannerSeed(readOrganicPlannerSeedContext(draftId));
  }, [draftId, source]);

  return (
    <div className="fixed inset-x-0 top-0 h-screen h-[100dvh] md:left-[var(--app-sidebar-width,3.5rem)] isolate flex flex-col overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(59,130,246,0.15),transparent_35%),radial-gradient(circle_at_88%_12%,rgba(59,130,246,0.12),transparent_32%),linear-gradient(180deg,rgba(10,12,24,0.95) 0%,rgba(10,12,24,0.98) 50%,rgba(7,9,18,1) 100%)]" />

      <main
        className="relative z-[1] flex min-h-0 flex-1 flex-col"
        style={{
          gap: "var(--app-shell-gap-compact)",
          padding: "var(--app-shell-pad-block-compact) var(--app-shell-pad-inline-compact)",
        }}
      >
        <div data-tour-id="studio-canvas" className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-3">
            <Heading size="7" className="text-white">AI Studio</Heading>
            <Text color="gray">Build flows for {brandName}</Text>
          </div>
          <div className="flex items-center gap-3">
            <ReplayWalkthroughButton
              tourName={TOUR_AI_CANVAS}
              className="text-white/60 hover:bg-white/10 hover:text-white"
            />
            <BrandSwitcherMenu />
          </div>
        </div>

        <div className="flex-1 min-h-0 w-full overflow-hidden rounded-xl border border-white/10 shadow-2xl">
          <div className="h-full w-full">
            <StudioCanvas
              brandProfileId={brandProfileId}
              organicPlannerSeed={organicPlannerSeed}
            />
          </div>
        </div>
      </main>

      <CreativeLibrarySidebar brandProfileId={brandProfileId} />
      <SurfaceTourTrigger tourName={TOUR_AI_CANVAS} ready={tourReady} />
    </div>
  );
}
