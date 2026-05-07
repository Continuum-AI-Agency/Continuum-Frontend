"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { getItem, setItem } from "@/lib/storage/brandScopedStorage";

const WARMING_UP_BASE_KEY = "organic.notice.warmingUpDismissed";

type Props = {
  brandId: string;
  insightsError: string | null;
  showNoTrendsMessage: boolean;
};

export function OrganicNoticeBridge({ brandId, insightsError, showNoTrendsMessage }: Props) {
  const { show } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!insightsError) return;
    show({
      title: "Trend intelligence unavailable",
      description: insightsError,
      variant: "error",
      durationMs: Infinity,
      dedupeKey: `organic-insights-error:${brandId}`,
      action: {
        label: "Retry",
        onClick: () => router.refresh(),
      },
    });
  }, [brandId, insightsError, router, show]);

  useEffect(() => {
    if (insightsError) return;
    if (!showNoTrendsMessage) return;
    if (!brandId) return;
    const dismissed = getItem(WARMING_UP_BASE_KEY, brandId) === "1";
    if (dismissed) return;
    setItem(WARMING_UP_BASE_KEY, brandId, "1");
    show({
      title: "Trend coverage warming up",
      description:
        "You can publish normally now and add trend-driven posts as signals arrive.",
      variant: "warning",
      durationMs: 6000,
      dedupeKey: `organic-no-trends:${brandId}`,
    });
  }, [brandId, insightsError, showNoTrendsMessage, show]);

  return null;
}
