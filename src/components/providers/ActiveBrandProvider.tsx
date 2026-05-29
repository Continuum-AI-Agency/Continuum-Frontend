"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, useTransition } from "react";
import type { BrandPermission, BrandSummary } from "@/components/DashboardLayoutShell";
import { switchBrand } from "@/lib/brands/switch-brand";
import * as storeRegistry from "@/lib/storage/storeRegistry";
import { purgeAllForBrand } from "@/lib/storage/brandScopedStorage";
import { useToastContext, type ToastOptions } from "@/components/ui/ToastProvider";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "next/navigation";
import type { AuthIdentity } from "@/lib/auth/identity";

export type SelectBrandResult = {
  switched: boolean;
  prevBrandId: string;
};

type ActiveBrandContextValue = {
  activeBrandId: string;
  brandSummaries: BrandSummary[];
  permissions: BrandPermission[];
  isSwitching: boolean;
  switchingToBrandId: string | null;
  selectBrand: (brandId: string) => Promise<SelectBrandResult>;
  updateBrandName: (brandId: string, name: string) => void;
  user: AuthIdentity | null;
};

const ActiveBrandContext = createContext<ActiveBrandContextValue | null>(null);

type ActiveBrandProviderProps = {
  activeBrandId: string;
  brandSummaries: BrandSummary[];
  permissions: BrandPermission[];
  user: AuthIdentity | null;
  children: React.ReactNode;
};

export function ActiveBrandProvider({
  activeBrandId,
  brandSummaries,
  permissions,
  user: initialUser,
  children,
}: ActiveBrandProviderProps) {
  const [selectedBrandId, setSelectedBrandId] = useState(activeBrandId);
  const [summaries, setSummaries] = useState<BrandSummary[]>(brandSummaries);
  const [perms, setPerms] = useState<BrandPermission[]>(permissions);
  const [switchingToBrandId, setSwitchingToBrandId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const toast = useToastContext();
  const { user: sessionUser } = useSession();
  const router = useRouter();

  const user = (sessionUser ?? initialUser) as AuthIdentity | null;

  const showToast = React.useCallback(
    (options: ToastOptions) => {
      if (toast) {
        toast.show(options);
        return;
      }

      if (process.env.NODE_ENV !== "production") {
        console.warn("ToastProvider is missing; toast not shown.", options);
      }
    },
    [toast]
  );

  // Sync selectedBrandId only when the server-confirmed activeBrandId changes.
  // Intentionally NOT combined with the summaries effect: router.refresh() always
  // produces a new brandSummaries reference (RSC deserialization), so a combined
  // effect would reset selectedBrandId on every refresh — wiping the optimistic
  // update whenever the server returned stale cached data.
  useEffect(() => {
    setSelectedBrandId(activeBrandId);
  }, [activeBrandId]);

  useEffect(() => {
    setSummaries(brandSummaries);
  }, [brandSummaries]);

  useEffect(() => {
    setPerms(permissions);
  }, [permissions]);

  const updateBrandName = React.useCallback((brandId: string, name: string) => {
    setSummaries(prev =>
      prev.map(brand => (brand.id === brandId ? { ...brand, name } : brand))
    );
  }, []);

  const stateRef = React.useRef({ activeBrandId, selectedBrandId, summaries, router, showToast });
  stateRef.current = { activeBrandId, selectedBrandId, summaries, router, showToast };

  // Tracks the most recent switch request ID so a newer click discards an older in-flight switch.
  const switchRequestRef = React.useRef<string | null>(null);

  // Cross-tab sync. The server-confirmed activeBrandId prop (read from
  // user_brand_preferences) is the single source of truth; we deliberately do NOT
  // poll lagging auth metadata to detect cross-tab changes (the metadata write runs
  // via after() and trails the response, which previously reverted fresh local
  // switches). Instead, a tab that completes a switch broadcasts the new brand id;
  // other tabs adopt it optimistically, tear down brand-scoped stores, and
  // router.refresh() to re-pull authoritative server state.
  const channelRef = React.useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel("continuum:brand");
    } catch {
      return;
    }
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; brandId?: string } | undefined;
      if (!data || data.type !== "brand-switched" || !data.brandId) return;
      const { selectedBrandId: current, summaries: known, router: r } = stateRef.current;
      const nextBrandId = data.brandId;
      if (nextBrandId === current) return;
      if (!known.some((brand) => brand.id === nextBrandId && !brand.isPending)) return;

      setSelectedBrandId(nextBrandId);
      const evt = { prevBrandId: current, nextBrandId, reason: "cross-tab-sync" as const };
      try { storeRegistry.teardown(current, evt); } catch { /* swallowed by registry handlers */ }
      try { purgeAllForBrand(current); } catch { /* never block sync */ }
      try { storeRegistry.purge(current); } catch { /* swallowed by registry handlers */ }
      r.refresh();
    };
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, []);

  const selectBrand = React.useCallback(
    async (brandId: string) =>
      new Promise<SelectBrandResult>(resolve => {
        const requestId = `${brandId}-${Date.now()}`;
        switchRequestRef.current = requestId;
        setSwitchingToBrandId(brandId);

        startTransition(async () => {
          const { activeBrandId: currentActive, selectedBrandId: previous, router: r, showToast: st } = stateRef.current;
          setSelectedBrandId(brandId);
          try {
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("brand:switching", {
                  detail: { prevBrandId: currentActive, nextBrandId: brandId },
                })
              );
            }
            const switched = await switchBrand({
              targetBrandId: brandId,
              activeBrandId: currentActive,
              refresh: () => r.refresh(),
            });

            // A newer switch started — discard this result
            if (switchRequestRef.current !== requestId) {
              resolve({ switched: false, prevBrandId: previous });
              return;
            }

            if (!switched) {
              setSelectedBrandId(previous);
            } else {
              try {
                channelRef.current?.postMessage({ type: "brand-switched", brandId });
              } catch { /* cross-tab notify is best-effort */ }
            }
            resolve({ switched, prevBrandId: previous });
            return;
          } catch (error) {
            if (switchRequestRef.current === requestId) {
              setSelectedBrandId(previous);
              st({
                title: "Switch failed",
                description: error instanceof Error ? error.message : "Unable to switch brand.",
                variant: "error",
              });
            }
            resolve({ switched: false, prevBrandId: previous });
          } finally {
            if (switchRequestRef.current === requestId) {
              setSwitchingToBrandId(null);
            }
          }
        });
      }),
    []
  );

  const isSwitching = switchingToBrandId !== null;

  const value = useMemo<ActiveBrandContextValue>(
    () => ({
      activeBrandId: selectedBrandId,
      brandSummaries: summaries,
      permissions: perms,
      isSwitching,
      switchingToBrandId,
      selectBrand,
      updateBrandName,
      user,
    }),
    [isSwitching, perms, switchingToBrandId, selectBrand, selectedBrandId, summaries, updateBrandName, user]
  );

  return <ActiveBrandContext.Provider value={value}>{children}</ActiveBrandContext.Provider>;
}

export function useActiveBrandContext(): ActiveBrandContextValue {
  const ctx = useContext(ActiveBrandContext);
  if (!ctx) {
    throw new Error("useActiveBrandContext must be used within ActiveBrandProvider");
  }
  return ctx;
}
