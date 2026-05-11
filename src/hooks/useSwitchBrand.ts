"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";
import { useToast } from "@/components/ui/ToastProvider";
import * as storeRegistry from "@/lib/storage/storeRegistry";
import { purgeAllForBrand } from "@/lib/storage/brandScopedStorage";

export type SwitchBrandOutcome = {
  switched: boolean;
  prevBrandId: string;
  redirected: boolean;
};

export function useSwitchBrand() {
  const { selectBrand, brandSummaries } = useActiveBrandContext();
  const { show } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(
    async (brandId: string): Promise<SwitchBrandOutcome> => {
      const result = await selectBrand(brandId);

      if (!result.switched) {
        return { switched: false, prevBrandId: result.prevBrandId, redirected: false };
      }

      try {
        storeRegistry.teardown(result.prevBrandId);
      } catch {
        /* swallowed by registry handlers */
      }

      try {
        purgeAllForBrand(result.prevBrandId);
      } catch {
        /* purge failures should never block a switch */
      }

      const onboarding = pathname?.startsWith("/onboarding") ?? false;
      if (onboarding) {
        router.push("/");
      }

      try {
        storeRegistry.purge(result.prevBrandId);
      } catch {
        /* swallowed by registry handlers */
      }

      const next = brandSummaries.find((b) => b.id === brandId);
      if (next) {
        show({
          title: "Switched brand",
          description: `Now viewing ${next.name}.`,
          variant: "success",
        });
      }

      return { switched: true, prevBrandId: result.prevBrandId, redirected: onboarding };
    },
    [selectBrand, router, pathname, show, brandSummaries]
  );
}
