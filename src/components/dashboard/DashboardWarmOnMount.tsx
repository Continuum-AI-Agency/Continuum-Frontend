"use client";

import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const LEASE_TTL_MS = 10 * 60 * 1000;

function leaseKey(brandId: string): string {
  return `continuum:warm-lease:b:${brandId}`;
}

function shouldWarm(brandId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(leaseKey(brandId));
    if (!raw) return true;
    const stampedAt = Number(raw);
    return !Number.isFinite(stampedAt) || Date.now() - stampedAt > LEASE_TTL_MS;
  } catch {
    return true;
  }
}

function takeLease(brandId: string): void {
  try {
    window.sessionStorage.setItem(leaseKey(brandId), String(Date.now()));
  } catch {
    // Best-effort; a private-mode storage failure just means we may warm again.
  }
}

// Renders nothing. On a cold first dashboard load (no warmed insights yet) it
// fires a single fire-and-forget warm so the next visit shows fresh data. A
// sessionStorage lease prevents re-firing across remounts/tabs within the TTL.
// Covers both first login and the immediate post-onboarding dashboard (cold).
export function DashboardWarmOnMount({ brandId, isCold }: { brandId: string; isCold: boolean }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!isCold || firedRef.current || !brandId) return;
    if (!shouldWarm(brandId)) return;
    firedRef.current = true;
    takeLease(brandId);
    const supabase = createSupabaseBrowserClient();
    void supabase.functions
      .invoke("warm-brand-now", { method: "POST", body: { brandId } })
      .catch(() => {
        // Best-effort warm; the dashboard still loads live data meanwhile.
      });
  }, [brandId, isCold]);

  return null;
}
