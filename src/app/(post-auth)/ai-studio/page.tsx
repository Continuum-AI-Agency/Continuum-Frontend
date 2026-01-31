import { redirect } from "next/navigation";

import AIStudioClient from "./AIStudioClient";
import { ClientOnly } from "@/components/ui/ClientOnly";
import { listPromptTemplatesAction } from "./actions";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AIStudioPage() {
  const { activeBrandId, brandSummaries, activeBrandTier } = await getActiveBrandContext();

  if (!activeBrandId) {
    redirect("/onboarding");
  }

  // Permission gate: allow only tiers 1,2,3; tier 0 (or missing) is blocked.
  if (activeBrandTier === 0) {
    // Redirect back to dashboard with a clear message.
    const msg = encodeURIComponent("Access Restricted: AI Studio is a paid feature. Please contact an Administrator.");
    redirect(`/dashboard?error=${msg}`);
  }

  const brandName =
    brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? "Untitled brand";

  const promptTemplates = await listPromptTemplatesAction({
    brandProfileId: activeBrandId,
  });

  return (
    <ClientOnly
      fallback={
        <div className="fixed inset-x-0 top-0 h-screen h-[100dvh] md:left-[var(--app-sidebar-width,88px)] flex items-center justify-center bg-slate-950 text-white">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-6 py-4 shadow-xl">
            Loading AI Studio…
          </div>
        </div>
      }
    >
      <AIStudioClient
        brandProfileId={activeBrandId}
        brandName={brandName}
        promptTemplates={promptTemplates}
      />
    </ClientOnly>
  );
}
