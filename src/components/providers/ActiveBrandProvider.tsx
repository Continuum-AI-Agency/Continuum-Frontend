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
  const [isSwitching, startTransition] = useTransition();
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

  useEffect(() => {
    const metadata = user?.user_metadata as { onboarding?: { activeBrandId?: string } } | undefined;
    const metadataId = metadata?.onboarding?.activeBrandId;
    if (metadataId && metadataId !== selectedBrandId) {
      setSelectedBrandId(metadataId);
    }
  }, [user, selectedBrandId]);

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
          setSelectedBrandId(brandId); 
          try {
            const switched = await switchBrand({
              targetBrandId: brandId,
              activeBrandId: activeBrandId,
              switchAction: switchActiveBrandAction,
              refresh: () => router.refresh(),
            });
            if (!switched) {
              setSelectedBrandId(previous);
            }
          } catch (error) {
            setSelectedBrandId(previous);
            showToast({
              title: "Switch failed",
              description: error instanceof Error ? error.message : "Unable to switch brand.",
              variant: "error",
            });
          } finally {
            resolve();
          }
        });
      }),
    [activeBrandId, selectedBrandId, showToast]
  );

  const value = useMemo<ActiveBrandContextValue>(
    () => ({
      activeBrandId: selectedBrandId,
      brandSummaries: summaries,
      isSwitching,
      selectBrand,
      updateBrandName,
      user,
    }),
    [isSwitching, selectBrand, selectedBrandId, summaries, updateBrandName, user]
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
