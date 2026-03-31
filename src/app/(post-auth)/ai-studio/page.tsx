import { Suspense } from "react";
import { redirect } from "next/navigation";

import AIStudioClient from "./AIStudioClient";
import { TierAccessRedirect } from "@/components/ui/TierAccessRedirect";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";

// force-dynamic: reads user session cookies and brand tier via getActiveBrandContext()
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function AIStudioSkeleton() {
  return (
    <div className="fixed inset-x-0 top-0 flex h-screen h-[100dvh] items-center justify-center bg-slate-950 text-white md:left-[var(--app-sidebar-width,5.5rem)]">
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-6 py-4 shadow-xl">
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

  // AIStudioClient uses dynamic({ ssr: false }) for StudioCanvas internally,
  // so ClientOnly is redundant — Suspense handles the loading state.
  return (
    <Suspense fallback={<AIStudioSkeleton />}>
      <AIStudioClient brandProfileId={activeBrandId} brandName={brandName} />
    </Suspense>
  );
}
