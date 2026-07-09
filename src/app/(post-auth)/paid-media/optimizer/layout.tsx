import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { TierAccessRedirect } from "@/components/ui/TierAccessRedirect";
import { OptimizerProvider } from "@/components/paid-media/optimizer/OptimizerProvider";
import { OptimizerNav } from "@/components/paid-media/optimizer/OptimizerNav";

export const metadata = {
  title: "Budget Optimizer · Paid Media",
};

export default async function OptimizerLayout({ children }: { children: ReactNode }) {
  const { activeBrandId, activeBrandTier } = await getActiveBrandContext();

  if (!activeBrandId) {
    redirect("/onboarding");
  }

  // Permission gate: allow only tiers 1,2,3; tier 0 (or missing) is blocked.
  if (activeBrandTier === 0) {
    return (
      <TierAccessRedirect description="The Budget Optimizer is a paid feature. Please contact an Administrator." />
    );
  }

  return (
    <OptimizerProvider>
      <div className="h-[calc(100dvh-4.25rem)] min-h-[var(--workspace-min-height)] w-full overflow-y-auto">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
          <OptimizerNav />
          {children}
        </div>
      </div>
    </OptimizerProvider>
  );
}
