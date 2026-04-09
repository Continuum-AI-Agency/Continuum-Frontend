"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  generateBrandInsights,
  isTerminalBrandInsightsStatus,
  subscribeToBrandInsightsJob,
} from "@/lib/api/brandInsights.client";

export function useBrandInsightsRefresh(brandId: string) {
  const [isFetching, setIsFetching] = useState(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (!brandId) return;
    setIsFetching(true);
    try {
      const result = await generateBrandInsights({ brandId });
      if (result.status === "processing" && result.generationId) {
        const generationId = result.generationId;
        await new Promise<void>((resolve) => {
          const stop = subscribeToBrandInsightsJob({
            generationId,
            streamChannel: result.stream?.channel,
            fallbackPollUrl: result.fallbackPollUrl,
            onStatus: (next) => {
              if (isTerminalBrandInsightsStatus(next.status)) {
                stop();
                resolve();
              }
            },
            onError: () => {
              stop();
              resolve();
            },
          });
        });
      }
    } catch {
      // Best-effort only.
    } finally {
      setIsFetching(false);
      router.refresh();
    }
  }, [brandId, router]);

  return { refresh, isFetching };
}
