import { Suspense } from "react";
import { redirect } from "next/navigation";

import AIStudioClient from "./AIStudioClient";
import { TierAccessRedirect } from "@/components/ui/TierAccessRedirect";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { resolveInitialCanvasRoomId } from "@/lib/ai-studio/canvas-room.server";

export const runtime = "nodejs";

function AIStudioSkeleton() {
  return (
    <div className="fixed inset-x-0 top-0 flex h-dvh items-center justify-center bg-slate-950 text-white md:left-[var(--app-sidebar-width,5.5rem)]">
      <div className="rounded-lg border border-white/10 bg-slate-900/70 px-6 py-4">
        Loading AI Studio...
      </div>
    </div>
  );
}

export default async function AIStudioPage() {
  const { activeBrandId, brandSummaries, activeBrandTier } = await getActiveBrandContext();

  if (!activeBrandId) {
    redirect("/onboarding");
  }

  if (activeBrandTier === 0) {
    return (
      <TierAccessRedirect description="AI Studio is a paid feature. Please contact an Administrator." />
    );
  }

  const brandName =
    brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? "Untitled brand";

  // Guarantee a workspace exists before the canvas mounts so realtime connects on
  // first paint (no perpetual "Connecting…" spinner) and the MCP co-pilot can target
  // the same live room the user lands in.
  const initialRoomId = await resolveInitialCanvasRoomId(activeBrandId);

  // AIStudioClient uses dynamic({ ssr: false }) for StudioCanvas internally,
  // so ClientOnly is redundant — Suspense handles the loading state.
  return (
    <Suspense fallback={<AIStudioSkeleton />}>
      <AIStudioClient
        brandProfileId={activeBrandId}
        brandName={brandName}
        initialRoomId={initialRoomId}
      />
    </Suspense>
  );
}
