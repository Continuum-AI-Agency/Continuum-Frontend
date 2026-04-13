"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, useTransition } from "react";
import type { BrandSummary } from "@/components/DashboardLayoutShell";
import { switchActiveBrandAction } from "@/app/(post-auth)/settings/actions";
import { switchBrand } from "@/lib/brands/switch-brand";
import { useToastContext, type ToastOptions } from "@/components/ui/ToastProvider";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

type ActiveBrandContextValue = {
  activeBrandId: string;
  brandSummaries: BrandSummary[];
  isSwitching: boolean;
  switchingToBrandId: string | null;
  selectBrand: (brandId: string) => Promise<void>;
  updateBrandName: (brandId: string, name: string) => void;
  user: User | null;
};

const ActiveBrandContext = createContext<ActiveBrandContextValue | null>(null);

type ActiveBrandProviderProps = {
  activeBrandId: string;
  brandSummaries: BrandSummary[];
  user: User | null;
  children: React.ReactNode;
};

export function ActiveBrandProvider({
  activeBrandId,
  brandSummaries,
  user: initialUser,
  children,
}: ActiveBrandProviderProps) {
  const [selectedBrandId, setSelectedBrandId] = useState(activeBrandId);
  const [summaries, setSummaries] = useState<BrandSummary[]>(brandSummaries);
  const [switchingToBrandId, setSwitchingToBrandId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const toast = useToastContext();
  const { user: sessionUser } = useSession();
  const router = useRouter();

  const user = sessionUser || initialUser;

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

  // Cross-tab sync: when auth metadata changes in another tab, update local state.
  // Skipped while a local switch is in progress to prevent race-condition reversions.
  //
  // Guard: compare metadataId against the server-confirmed activeBrandId, not the
  // optimistic selectedBrandId. The auth metadata update runs via after() — it fires
  // after the response is sent — so when setSwitchingToBrandId(null) fires in the
  // finally block, the metadata still points to the old brand. Without this guard,
  // the effect sees (metadataId="brand-a") !== (selectedBrandId="brand-b") and
  // reverts the optimistic switch. Metadata that echoes the server value is not a
  // cross-tab change; skip it.
  useEffect(() => {
    if (switchingToBrandId) return;
    const metadata = user?.user_metadata as { onboarding?: { activeBrandId?: string } } | undefined;
    const metadataId = metadata?.onboarding?.activeBrandId;
    if (
      metadataId &&
      metadataId !== selectedBrandId &&
      metadataId !== activeBrandId &&
      summaries.some((brand) => brand.id === metadataId && !brand.isPending)
    ) {
      setSelectedBrandId(metadataId);
    }
  }, [user, selectedBrandId, summaries, switchingToBrandId, activeBrandId]);

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

  const updateBrandName = React.useCallback((brandId: string, name: string) => {
    setSummaries(prev =>
      prev.map(brand => (brand.id === brandId ? { ...brand, name } : brand))
    );
  }, []);

  const stateRef = React.useRef({ activeBrandId, selectedBrandId, router, showToast });
  stateRef.current = { activeBrandId, selectedBrandId, router, showToast };

  // Tracks the most recent switch request ID so a newer click discards an older in-flight switch.
  const switchRequestRef = React.useRef<string | null>(null);

  const selectBrand = React.useCallback(
    async (brandId: string) =>
      new Promise<void>(resolve => {
        const requestId = `${brandId}-${Date.now()}`;
        switchRequestRef.current = requestId;
        setSwitchingToBrandId(brandId);

        startTransition(async () => {
          const { activeBrandId: currentActive, selectedBrandId: previous, router: r, showToast: st } = stateRef.current;
          setSelectedBrandId(brandId);
          try {
            const switched = await switchBrand({
              targetBrandId: brandId,
              activeBrandId: currentActive,
              switchAction: switchActiveBrandAction,
              refresh: () => r.refresh(),
            });

            // A newer switch started — discard this result
            if (switchRequestRef.current !== requestId) {
              resolve();
              return;
            }

            if (!switched) {
              setSelectedBrandId(previous);
            }
          } catch (error) {
            if (switchRequestRef.current === requestId) {
              setSelectedBrandId(previous);
              st({
                title: "Switch failed",
                description: error instanceof Error ? error.message : "Unable to switch brand.",
                variant: "error",
              });
            }
          } finally {
            if (switchRequestRef.current === requestId) {
              setSwitchingToBrandId(null);
            }
            resolve();
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
      isSwitching,
      switchingToBrandId,
      selectBrand,
      updateBrandName,
      user,
    }),
    [isSwitching, switchingToBrandId, selectBrand, selectedBrandId, summaries, updateBrandName, user]
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
