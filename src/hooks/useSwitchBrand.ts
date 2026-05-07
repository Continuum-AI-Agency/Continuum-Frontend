"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";
import * as storeRegistry from "@/lib/storage/storeRegistry";

export type SwitchBrandOutcome = {
  switched: boolean;
  prevBrandId: string;
  redirected: boolean;
};

export function useSwitchBrand() {
  const { selectBrand } = useActiveBrandContext();
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
        // teardown handlers swallow internally; this is belt-and-suspenders.
      }

      const onboarding = pathname?.startsWith("/onboarding") ?? false;
      if (onboarding) {
        router.push("/");
      }

      try {
        storeRegistry.purge(result.prevBrandId);
      } catch {
        // purge handlers swallow internally.
      }

      return { switched: true, prevBrandId: result.prevBrandId, redirected: onboarding };
    },
    [selectBrand, router, pathname]
  );
}
