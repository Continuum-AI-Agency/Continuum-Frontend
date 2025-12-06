"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, useTransition } from "react";
import type { BrandSummary } from "@/components/DashboardLayoutShell";
import { switchActiveBrandAction } from "@/app/(post-auth)/settings/actions";
import { switchBrand } from "@/lib/brands/switch-brand";
import { useToast } from "@/components/ui/ToastProvider";
import { useSession } from "@/hooks/useSession";

type ActiveBrandContextValue = {
  activeBrandId: string;
  brandSummaries: BrandSummary[];
  isSwitching: boolean;
  selectBrand: (brandId: string) => Promise<void>;
  updateBrandName: (brandId: string, name: string) => void;
};

const ActiveBrandContext = createContext<ActiveBrandContextValue | null>(null);

type ActiveBrandProviderProps = {
  activeBrandId: string;
  brandSummaries: BrandSummary[];
  children: React.ReactNode;
};

export function ActiveBrandProvider({
  activeBrandId,
  brandSummaries,
  children,
}: ActiveBrandProviderProps) {
  const [selectedBrandId, setSelectedBrandId] = useState(activeBrandId);
  const [summaries, setSummaries] = useState<BrandSummary[]>(brandSummaries);
  const [isSwitching, startTransition] = useTransition();
  const { show } = useToast();
  const { user } = useSession();

  // Keep local selection in sync with auth metadata updates (e.g., other tab).
  useEffect(() => {
    const metadata = user?.user_metadata as { onboarding?: { activeBrandId?: string } } | undefined;
    const metadataId = metadata?.onboarding?.activeBrandId;
    if (metadataId && metadataId !== selectedBrandId) {
      setSelectedBrandId(metadataId);
    }
  }, [user, selectedBrandId]);

  // Sync when server-provided brand changes (e.g., navigation).
  useEffect(() => {
    setSelectedBrandId(activeBrandId);
    setSummaries(brandSummaries);
  }, [activeBrandId, brandSummaries]);

  const updateBrandName = React.useCallback((brandId: string, name: string) => {
    setSummaries(prev =>
      prev.map(brand => (brand.id === brandId ? { ...brand, name } : brand))
    );
  }, []);

  const selectBrand = React.useCallback(
    async (brandId: string) =>
      new Promise<void>(resolve => {
        startTransition(async () => {
          const previous = selectedBrandId;
          setSelectedBrandId(brandId); // optimistic label change
          try {
            const switched = await switchBrand({
              targetBrandId: brandId,
              activeBrandId: activeBrandId,
              switchAction: switchActiveBrandAction,
            });
            if (!switched) {
              setSelectedBrandId(previous);
            }
          } catch (error) {
            setSelectedBrandId(previous);
            show({
              title: "Switch failed",
              description: error instanceof Error ? error.message : "Unable to switch brand.",
              variant: "error",
            });
          } finally {
            resolve();
          }
        });
      }),
    [activeBrandId, selectedBrandId, show]
  );

  const value = useMemo<ActiveBrandContextValue>(
    () => ({
      activeBrandId: selectedBrandId,
      brandSummaries: summaries,
      isSwitching,
      selectBrand,
      updateBrandName,
    }),
    [isSwitching, selectBrand, selectedBrandId, summaries, updateBrandName]
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
