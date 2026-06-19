"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { revalidateBrandInsightsAction } from "@/lib/dashboard/actions";
import {
  WARM_LEASE_LONG_MS,
  WARM_LEASE_SHORT_MS,
  isWarmLeaseOpen,
  warmLeaseExpiry,
  warmLeaseKey,
} from "@/lib/dashboard/warm-lease";

function readLease(brandId: string): string | null {
  try {
    return window.sessionStorage.getItem(warmLeaseKey(brandId));
  } catch {
    return null;
  }
}

function writeLease(brandId: string, ttlMs: number): void {
  try {
    window.sessionStorage.setItem(warmLeaseKey(brandId), warmLeaseExpiry(Date.now(), ttlMs));
  } catch {
    // Best-effort; a private-mode storage failure just means we may warm again.
  }
}

function queryKeyMentionsBrand(queryKey: unknown, brandId: string): boolean {
  return Array.isArray(queryKey) && queryKey.some((part) => part === brandId);
}

// On dashboard entry this fires a single, lease-bounded warm so the brand's
// organic + paid + trend data is (re)populated, then refreshes the current
// session once it completes. Firing is gated only by the lease — not by the
// view or a coldness signal — so landing on the paid view warms too, and a
// brand whose trends never populate does not refire every short window. The
// "Syncing brand context" indicator only shows on a cold dashboard, where
// there is nothing else to look at; a warm dashboard re-warms silently.
export function DashboardWarmOnMount({ brandId, isCold }: { brandId: string; isCold: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const routerRef = useRef(router);
  routerRef.current = router;
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  const firedRef = useRef(false);
  const [warming, setWarming] = useState(false);

  // Fire once per brand on mount; router/queryClient are read through refs so a
  // benign identity change does not re-run (and abort) an in-flight warm.
  useEffect(() => {
    if (firedRef.current || !brandId || typeof window === "undefined") return;
    if (!isWarmLeaseOpen(readLease(brandId), Date.now())) return;
    firedRef.current = true;
    writeLease(brandId, WARM_LEASE_SHORT_MS);
    setWarming(true);
    let active = true;

    const supabase = createSupabaseBrowserClient();
    supabase.functions
      .invoke("warm-brand-now", { method: "POST", body: { brandId } })
      .then(async ({ error }) => {
        if (error) return;
        writeLease(brandId, WARM_LEASE_LONG_MS);
        await revalidateBrandInsightsAction(brandId).catch(() => {});
        queryClientRef.current.invalidateQueries({
          predicate: (query) => queryKeyMentionsBrand(query.queryKey, brandId),
        });
        if (active) routerRef.current.refresh();
      })
      .catch(() => {
        // Best-effort warm; the dashboard still loads live data meanwhile.
      })
      .finally(() => {
        if (active) setWarming(false);
      });

    return () => {
      active = false;
    };
  }, [brandId]);

  if (!warming || !isCold) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2">
      <span className="size-1.5 shrink-0 rounded-full bg-primary live-pulse" aria-hidden="true" />
      <span className="text-[11px] font-medium text-muted-foreground">
        Syncing brand context…
      </span>
    </div>
  );
}
