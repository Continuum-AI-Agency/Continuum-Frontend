import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { CompetitorSpyClient } from "@/components/competitor-spy/CompetitorSpyClient";

export const metadata: Metadata = {
  title: "Competitor Spy | Continuum AI",
  description: "Track competitors' paid ad creatives and how they evolve over time.",
};

export default async function CompetitorSpyPage() {
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect("/onboarding");
  }

  return (
    <div className="h-[calc(100dvh-4.25rem)] min-h-[var(--workspace-min-height,600px)] w-full overflow-hidden">
      <CompetitorSpyClient brandId={activeBrandId} />
    </div>
  );
}
