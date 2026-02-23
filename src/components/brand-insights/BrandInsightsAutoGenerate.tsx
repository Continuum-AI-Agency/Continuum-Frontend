"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { generateBrandInsights, isTerminalBrandInsightsStatus, subscribeToBrandInsightsJob } from "@/lib/api/brandInsights.client";

type BrandInsightsAutoGenerateProps = {
  brandId: string;
  shouldGenerate: boolean;
};

const STORAGE_PREFIX = "continuum:auto-brand-insights";
const COOLDOWN_MS = 15 * 60 * 1000;
function getStorageKey(brandId: string) {
  return `${STORAGE_PREFIX}:${brandId}`;
}

function canTriggerGeneration(brandId: string) {
  try {
    const stored = window.localStorage.getItem(getStorageKey(brandId));
    if (!stored) return true;
    const last = Number(stored);
    if (!Number.isFinite(last)) return true;
    return Date.now() - last > COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markTriggered(brandId: string) {
  try {
    window.localStorage.setItem(getStorageKey(brandId), Date.now().toString());
  } catch {
    // Best-effort only.
  }
}

export function BrandInsightsAutoGenerate({
  brandId,
  shouldGenerate,
}: BrandInsightsAutoGenerateProps) {
  const router = useRouter();
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (!shouldGenerate || hasTriggeredRef.current) {
      return;
    }

    hasTriggeredRef.current = true;
    if (!brandId || !canTriggerGeneration(brandId)) {
      return;
    }

    markTriggered(brandId);
    let cancelled = false;
    let stopTracking: (() => void) | null = null;

    const run = async () => {
      try {
        const result = await generateBrandInsights({ brandId });
        if (result.status === "processing" && result.generationId) {
          const activeGenerationId = result.generationId;
          await new Promise<void>((resolve) => {
            stopTracking = subscribeToBrandInsightsJob({
              generationId: activeGenerationId,
              streamChannel: result.stream?.channel,
              fallbackPollUrl: result.fallbackPollUrl,
              onStatus: (next) => {
                if (isTerminalBrandInsightsStatus(next.status)) {
                  stopTracking?.();
                  stopTracking = null;
                  resolve();
                }
              },
              onError: () => {
                stopTracking?.();
                stopTracking = null;
                resolve();
              },
            });
          });
        }
      } catch {
        // Best-effort only.
      } finally {
        if (!cancelled) {
          router.refresh();
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      stopTracking?.();
      stopTracking = null;
    };
  }, [brandId, shouldGenerate, router]);

  return null;
}
